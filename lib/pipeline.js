const Q = require('q')

class Pipeline {
    constructor(txqueue, communicator){
        this._txqueue = txqueue
        this._communicator = communicator
    }

    async _execute(argobj){
        if (argObj.cmd === 'resetReq' || argObj.cmd === 'systemReset') {
            this._txqueue.clear()
        }

        return await this._communicator.send(argobj)
    }

    async _realign(){
        const value = Math.floor(Math.random() * Math.pow(2,32))
        const argobj = new ZpiObject("ZNP", "echo", {value})
        const e = await this._execute(argobj)
        if(e.value != value){
            throw new Error("extreme corruption, or critical error")
        }
    }

    async execute(argobj){
        argobj = await this._txqueue.begin(argobj)

        try {
            const execution = Q.fcall(()=>this._execute(argobj))
            
            try {
                await execution.timeout(1100)
            } catch(ex){
                if(ex.code != 'ETIMEDOUT') throw ex

                // Perform re-alignment request
                const realignment = this._realign()

                try {
                    await Q.all([execution,realignment]).timeout(3900) //4s total
                    if(Q.isPending(execution)){
                        throw new Error("failed to transmit")
                    }
                }catch(ex){
                    if(ex.code != 'ETIMEDOUT') throw ex
                    const e = new Error("Fatal Timeout")
                    e.code = "EFATAL"
                    throw e
                }
            }

            await this._txqueue.complete(argobj)
            return await execution
        }catch (ex) {
            this._communicator.removePending(argobj)
            await this._txqueue.complete(argobj)
            throw ex
        }
    }
}
module.exports = Pipeline