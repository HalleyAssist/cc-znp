const Q = require('q-lite'),
      ZpiObject = require('./zpiObject'),
      debug = require('debug')('cc-znp')

class Pipeline {
    constructor(txqueue, communicator, mainSubsys){
        this._txqueue = txqueue
        this._communicator = communicator
        this._mainSubsys = mainSubsys
        this._abort = Q.defer()
    }

    abort(){
        this._abort.reject("abort")
        this._abort = Q.defer()
    }

    async _execute(argObj, logging = true){
        return await this._communicator.send(argObj, logging)
    }

    async _realign(canceled){
        let value = Math.floor(Math.random() * Math.pow(2,32))

        let i = 0;
        while(!canceled.status && ++i < 10){
            let argObj = new ZpiObject(this._mainSubsys, "echo", {value})
            const existing = this._communicator.takePending(argObj)
            let e 
            try {
                e = await Q(this._execute(existing?existing.argObj:argObj), true, existing ? existing.defer : null).timeout(701)
            } catch(ex){
                if(ex.code !== 'ETIMEDOUT') throw ex
                continue;
            }
            if(existing){
                debug("an existing echo request was found, retrying")
                value = existing.argObj.valObj.value
            }
            if(e === null) {
                //throw new Error("closing or timeout")
                return
            }
            if(e.value != value){
                throw new Error("extreme corruption, or critical error")
            }
            return
        }
    }

    async execute(argObj, logging = true){
        if (argObj.cmd === 'resetReq' || argObj.cmd === 'systemReset') {
            debug(`reseting queue due to ${argObj.cmd}`)
            await this._txqueue.clear()
            //debug(`done resetting queue due to ${argObj.cmd}`)
        }

        try {
            argObj = await this._txqueue.begin(argObj)
        } catch(ex){
            if(this._txqueue.isCurrent(argObj)) this._txqueue.complete(argObj)
            throw ex
        }
        let ret = false
        
        const sender = ()=>Q.fcall(()=>this._execute(argObj, logging))

        try {
            const execution = sender()
            
            try {
                await Promise.race([this._abort.promise, execution.timeout(2200)])
            } catch(ex){
                if(ex.code != 'ETIMEDOUT') throw ex

                if(argObj.cmd === 'echo' && argObj.subsys === 'RCN'){
                    this._communicator._logTimeout(argObj)
                    const e = new Error(`Echo Timeout. ${ex.message} while processing ${argObj}`)
                    e.code = "EFATAL"
                    throw e
                }

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
                    ret = await Q(Q.cancelledRace([this._abort.promise, execution, reAlignedSend])).timeout(8800) //5s total
                }catch(ex){
                    if(ex.code != 'ETIMEDOUT') throw ex
                    this._communicator._logTimeout(argObj)
                    const e = new Error(`Fatal Timeout. ${ex.message} while processing ${argObj}`)
                    e.code = "EFATAL"
                    throw e
                }
            }

            if(ret === false) ret = await Promise.race([this._abort.promise, execution])
        }catch (ex) {
            try {
                if(!this._communicator.removePending(argObj)){
                    debug("Unable to find pending while handling %s", ex)
                }
            } finally {
                this._txqueue.complete(argObj)
            }
            throw ex
        }
        this._txqueue.complete(argObj)
        return ret
    }
}
module.exports = Pipeline