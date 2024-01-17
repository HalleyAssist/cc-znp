const Q = require('@halleyassist/q-lite'),
      ZpiObject = require('./zpiObject'),
      TxQueue = require('cc-znp/lib/txqueue'),
      debug = require('debug')('cc-znp'),
      assert = require('assert')

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

    async __execute(cancellationState, argObj, deferred, logging = true){
        // reset the queue if we are resetting the system
        if (argObj.cmd === 'resetReq' || argObj.cmd === 'systemReset') {
            debug(`reseting queue due to ${argObj.cmd}`)
            await this._txqueue.clear()
        }

        // tell the queue we are starting
        argObj = await this._txqueue.begin(argObj)

        assert(argObj)

        let ret
        try {
            let execution = this._communicator.send(argObj, logging, deferred)
            
            try {
                // this will cancel the execution promise
                cancellationState.promiseWrap(Q.timeout(execution, 2200)).catch(()=>{})

                // wait for the command to complete via cancellation if timeout
                // but order of rejection event processing is important
                // so don't await the above promise
                execution = await execution
            } catch(ex){
                if(ex instanceof Q.CancellationError) throw new Q.CancellationError(`Aborted while processing ${argObj}`)
                throw ex
            }

            ret = cancellationState.promiseWrap(execution)
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

    async _execute(cancellationState, argObj, logging = true){
        const innerDeferred = Q.defer()
        let ret = this.__execute(cancellationState, argObj, innerDeferred, logging)
        this._current.add(ret)
        ret.cancel = ()=>cancellationState.cancel()

        const handleDone = (r)=>{
            this._current.delete(ret)
            this._txqueue.complete(argObj)
            return r
        }

        // return a promise that will be resolved when the command is complete
        let r = ret.then(handleDone, (ex)=>{
            if(!(ex instanceof TxQueue.QueueError)) {
                handleDone(null)
            }
            throw ex
        })
        return await r
    }
}

Pipeline.prototype.execute = Q.canceller(Pipeline.prototype._execute)

module.exports = Pipeline
