const Q = require('q-lite'),
      ZpiObject = require('./zpiObject'),
      debug = require('debug')('cc-znp')

class Pipeline {
    constructor(txqueue, communicator, mainSubsys){
        this._txqueue = txqueue
        this._communicator = communicator
        this._mainSubsys = mainSubsys
    }

    async _execute(argObj, logging = true){
        if (argObj.cmd === 'resetReq' || argObj.cmd === 'systemReset') {
            await this._txqueue.clear()
        }

        return await this._communicator.send(argObj, logging)
    }

    async _realign(){
        let value = Math.floor(Math.random() * Math.pow(2,32))
        let argObj = new ZpiObject(this._mainSubsys, "echo", {value})
        const existing = this._communicator.takePending(argObj)
        const e = await this._execute(existing?existing.argObj:argObj)
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
    }

    async execute(argObj, logging = true){
        argObj = await this._txqueue.begin(argObj)
        let ret
        
        try {
            const execution = Q.fcall(()=>this._execute(argObj, logging))
            
            try {
                await execution.timeout(1100)
            } catch(ex){
                if(ex.code != 'ETIMEDOUT') throw ex

                // Perform re-alignment request
                const realignment = this._realign()

                try {
                    await Q.all([execution,realignment]).timeout(3900) //5s total
                    if(Q.isPending(execution)){
                        throw new Error("failed to transmit")
                    }
                }catch(ex){
                    if(ex.code != 'ETIMEDOUT') throw ex
                    this._communicator._logTimeout(argObj)
                    const e = new Error("Fatal Timeout")
                    e.code = "EFATAL"
                    throw e
                }
            }

            ret = await execution
        }catch (ex) {
            if(!this._communicator.removePending(argObj)){
                debug("Unable to find pending")
            }
            this._txqueue.complete(argObj)
            throw ex
        }
        this._txqueue.complete(argObj)
        return ret
    }
}
module.exports = Pipeline