const Q = require('q')

class Pipeline {
    constructor(txqueue, communicator){
        this._txqueue = txqueue
        this._communicator = communicator
    }

    async _execute(argObj){
        if (argObj.cmd === 'resetReq' || argObj.cmd === 'systemReset') {
            this._txqueue.clear()
        }

        return await this._communicator.send(argObj)
    }

    async _realign(){
        const value = Math.floor(Math.random() * Math.pow(2,32))
        const argObj = new ZpiObject("ZNP", "echo", {value})
        const e = await this._execute(argObj)
        if(e.value != value){
            throw new Error("extreme corruption, or critical error")
        }
    }

    async execute(argObj){
        argObj = await this._txqueue.begin(argObj)

        try {
            const execution = Q.fcall(()=>this._execute(argObj))
            
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

            await this._txqueue.complete(argObj)
            return await execution
        }catch (ex) {
            this._communicator.removePending(argObj)
            await this._txqueue.complete(argObj)
            throw ex
        }
    }
}
module.exports = Pipeline