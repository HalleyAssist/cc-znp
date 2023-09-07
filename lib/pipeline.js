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

    async _send(argObj, logging = true, deferred = null){
        return await this._communicator.send(argObj, logging, deferred)
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
                e = await Q.timeout(this._send(argObj), 701)
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
        while(!canceled.status && ++i < 10){
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
        try {
            argObj = await this._txqueue.begin(argObj)
        } catch(ex){
            if(this._txqueue.isCurrent(argObj)) this._txqueue.complete(argObj)
            throw ex
        }

        assert(argObj)

        let ret = DefaultValue

        const sender = async()=>await this._send(argObj, logging, deferred)

        try {
            const execution = sender()
            
            try {
                await cancellationState.promiseWrap(Q.timeout(execution, 2200))
            } catch(ex){
                if(ex instanceof Q.CancellationError) throw new Q.CancellationError(`Aborted while processing ${argObj}`)
                if(ex.code != 'ETIMEDOUT') throw ex

                if(argObj.cmd === 'echo' && argObj.subsys === 'RCN'){
                    this._communicator._logTimeout(argObj)
                    const e = new Error(`Echo Timeout. ${ex.message} while processing ${argObj}`)
                    e.code = "EFATAL"
                    throw e
                }

                debug("Performing re-alignment for %s:%s %s due to: %s", argObj.subsys, argObj.cmd, Logging.valObjFormat(argObj.valObj, argObj.subsys, argObj.cmd), ex.message || ex)
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
                    ret = await cancellationState.promiseWrap(Q.safeAll([Q.timeout(execution, 8800), reAlignedSend]))
                    if(this._communicator.sending) {
                        assert(this._communicator.sending === null, `sending should be null after realignment but was ${this._communicator.sending.subsys}:${this._communicator.sending.cmd}`)
                    }
                }catch(ex){
                    if(ex.code != 'ETIMEDOUT') throw ex
                    this._communicator._logTimeout(argObj)
                    const e = new Error(`Fatal Timeout. ${ex.message} while processing ${argObj}`)
                    e.code = "EFATAL"
                    throw e
                }
            }

            if(ret === DefaultValue) ret = cancellationState.promiseWrap(execution)
        }catch (ex) {
            try {
                if(!this._communicator.removePending(argObj)){
                    debug("Unable to find pending while handling %s", ex)
                }
            } finally {
                this._txqueue.complete(argObj)
            }
            if(ex instanceof Q.CancellationError) throw new Q.CancellationError(`Cancelled while processing ${argObj}`)
            throw ex
        }
        this._txqueue.complete(argObj)
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
            deferred.resolve(ret)
        })
        return deferred.promise
    }
}

Pipeline.prototype.execute = Q.canceller(Pipeline.prototype._execute)

module.exports = Pipeline
