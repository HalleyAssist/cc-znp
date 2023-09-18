const Q = require('@halleyassist/q-lite'),
      ZpiObject = require('./zpiObject'),
      Logging = require('./logging'),
      debug = require('debug')('cc-znp'),
      assert = require('assert')

const DefaultValue = Symbol("default")

class Pipeline {
    constructor(txqueue, communicator, mainSubsys){
        this._txqueue = txqueue
        this._communicator = communicator
        this._mainSubsys = mainSubsys
        this._current = new Set()
    }

    abort(){
        for(const c of this._current){
            c.cancel()
        }
    }
    
    async ping(value = null){
        if(!value) value = Math.floor(Math.random() * Math.pow(2,32))
        let argObj = new ZpiObject(this._mainSubsys, "echo", {value})
        const existing = this._communicator.findPending(argObj)
        
        let e 
        try {
            argObj.frame();// precalculate
            if(existing){
                debug("an existing echo request was found, retrying")
                value = existing.argObj.valObj.value

                await this._communicator.resendArgObj(existing.argObj)
                e = await Q.timeout(existing.deferred.promise, 1000)
            }else{
                e = await Q.timeout(this._communicator.send(argObj), 701)
            }
        }catch(ex){
            if(ex.code !== 'ETIMEDOUT') throw ex
            return false
        }

        if(e === null) {
            //throw new Error("closing or timeout")
            return
        }
        if(e.value != value){
            throw new Error("extreme corruption, or critical error")
        }

        return true
    }

    async _realign(canceled){
        let value = Math.floor(Math.random() * Math.pow(2,32))

        let i = 0;
        while(!canceled.status && ++i <= 3){
            if(await this.ping(value)) return
        }
    }

    async __execute(cancellationState, argObj, deferred, logging = true){
        // reset the queue if we are resetting the system
        if (argObj.cmd === 'resetReq' || argObj.cmd === 'systemReset') {
            debug(`reseting queue due to ${argObj.cmd}`)
            await this._txqueue.clear()
        }

        // tell the queue we are starting
        argObj = await this._txqueue.begin(argObj)

        assert(argObj)

        let ret = DefaultValue

        const sender = ()=>this._communicator.send(argObj, logging, deferred)

        let execution
        try {
            execution = sender()
            
            try {
                await cancellationState.promiseWrap(Q.timeout(execution.catch(()=>{}), 2200))
            } catch(ex){
                if(ex instanceof Q.CancellationError) throw new Q.CancellationError(`Aborted while processing ${argObj}`)
                if(ex.code != 'ETIMEDOUT') throw ex

                if(argObj.cmd === 'echo' && argObj.subsys === 'RCN'){
                    this._communicator._logTimeout(argObj)
                    const e = new Error(`Echo Timeout. ${ex.message} while processing ${argObj}`)
                    e.code = "EFATAL"
                    throw e
                }

                debug(`Performing re-alignment for ${argObj.subsys}:${argObj.cmd} ${Logging.valObjFormat(argObj.valObj, argObj.subsys, argObj.cmd)} due to: ${ex.message || ex}`)
                // Perform re-alignment request
                let canceled = {status:false}
                const realignment = this._realign(canceled)

                try {
                    const reAlignedSend = realignment.then(()=>{
                        if(canceled.status) return
                        this._communicator.removePending(argObj, false)
                        return sender()
                    })
                    reAlignedSend.cancel = ()=>{canceled.status=true}
                    ret = await cancellationState.promiseWrap(Q.cancelledRace([Q.timeout(execution.catch(()=>{}), 8800), reAlignedSend], false))
                    if(this._communicator.sending) {
                        assert(this._communicator.sending === null, `sending should be null after realignment but was ${this._communicator.sending.subsys}:${this._communicator.sending.cmd}`)
                    }
                }catch(ex){
                    console.log({ex})
                    if(ex.code != 'ETIMEDOUT') throw ex
                    this._communicator._logTimeout(argObj)
                    const e = new Error(`Fatal Timeout. ${ex.message} while processing ${argObj}`)
                    e.code = "EFATAL"
                    throw e
                }
            }

            if(ret === DefaultValue) ret = cancellationState.promiseWrap(execution)
        }catch (ex) {
            // this is added by communicator send
            if(deferred.promise.cancel && !deferred.promise.cancel()){
                debug("Unable to find pending while handling " + ex)
            }
            if(ex instanceof Q.CancellationError) throw new Q.CancellationError(`Cancelled while processing ${argObj}`)
            throw ex
        }
        return ret
    }

    _execute(cancellationState, argObj, logging = true){
        const innerDeferred = Q.defer()
        const ret = this.__execute(cancellationState, argObj, innerDeferred, logging)
        this._current.add(ret)

        // return a promise that will be resolved when the command is complete
        const deferred = Q.defer()
        ret.finally(()=>{
            this._current.delete(ret)
            this._txqueue.complete(argObj)
            deferred.resolve(ret)
        })
        return deferred.promise
    }
}

Pipeline.prototype.execute = Q.canceller(Pipeline.prototype._execute)

module.exports = Pipeline
