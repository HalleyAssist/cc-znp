const Q = require('q'),
      Logging = require('./logging'),
      ZpiObject = require('./zpiObject'),
      assert = require('assert')

class Communicator {
    constructor(emitter, unpi){
        assert(unpi, 'unpi must be provided')
        this._pending = []
        this._resetting = null
        this._emitter = emitter
        this.unpi = unpi
    }
    takePending(data){
        for(let i=0; i<this._pending.length;i++){
            const p = this._pending[i]
            if(data.subsys != p.argObj.subsys || data.cmd != p.argObj.cmd) continue
            this._pending.splice(i, 1)
            return p
        }
    }
    removePending(argObj){
        for(let i = 0; i<this._pending.length; i++){
            const p = this._pending[i]
            if(argObj != p.argObj) continue
            p.deferred.resolve(null)
            this._pending.splice(i, 1)
            return true
        }
        return false
    }
    addPending(argObj, deferred, logging = true){
        this._pending.push({
            argObj,
            deferred,
            logging
        })
    }
    _eventString(data){
        if(data.type === 'AREQ') return 'AREQ'
        return 'SRSP:' + data.subsys + ':' + data.cmd;
    }
    _logTimeout(data){
        Logging.request.SRSP('%s:%s %s <=> ERROR (Timeout)', data.subsys, data.cmd, Logging.valObjFormat(data.valObj));
    }
    async receive(data){
        if (data.type === 'SRSP') {
            let pending
            if(data.subsys === 'RES0' && data.cmd === 'error'){
                const subsys = data.payload.typesubsys & 0xF
                const cmd = data.payload.cmd
                const zpi = new ZpiObject(subsys, cmd)
                pending = this.takePending(zpi)
               
                if(!pending){
                    Logging.request.SRSP('%s:%s <unknown> <=> ERROR (NO-LISTENERS)', zpi.subsys, zpi.cmd)
                    return
                }
                Logging.request.SRSP('%s:%s %s <=> ERROR (NO-LISTENERS)', zpi.subsys, zpi.cmd, Logging.valObjFormat(pending.argObj.valObj))
                
                pending.deferred.reject('__error__')
                return
            }
            pending = this.takePending(data)
            if(!pending){
                Logging.request.SRSP('%s:%s <unknown> <=> ERROR (NO-LISTENERS)', data.subsys, data.cmd)
                return
            }
            
            if(pending.logging){
                Logging.request.SRSP('%s:%s %s <=> %s', data.subsys, data.cmd, Logging.valObjFormat(pending.argObj.valObj), Logging.valObjFormat(data.payload, true));
            }

            pending.deferred.resolve(data.payload)
        } else if (data.type === 'AREQ') {
            Logging.request.AREQ('<== %s:%s %s', data.subsys, data.cmd, Logging.valObjFormat(data.payload, true));
        }

        this._emitter.emit(this._eventString(data), {
            subsys: data.subsys,
            ind: data.cmd,
            data: data.payload
        });

        if(this._resetting && data.type === 'AREQ' && data.subsys === 'SYS' && data.cmd === 'resetInd') {
            for(const p of this._pending){
                p.deferred.reject('module reset')
            }
            this._pending = []
            this._resetting.resolve()
        }
    }
    async _sendSREQ (argObj, logging = true) {
        // subsys: String, cmd: String
        let payload = argObj.frame()
        if (!payload) {
            throw new Error('Fail to build frame');
        }

        const deferred = Q.defer()
        this.addPending(argObj, deferred, logging)

        this.unpi.send('SREQ', argObj.subsys, argObj.cmdId, payload);
        return await deferred.promise
    }

    async _sendAREQ (argObj) {
        // subsys: String, cmd: String
        var payload = argObj.frame();

        if (!payload) {
            throw new Error('Fail to build frame')
        }

        if (argObj.cmd === 'resetReq' || argObj.cmd === 'systemReset') {
            this._resetting = Q.defer()
        }

        this.unpi.send('AREQ', argObj.subsys, argObj.cmdId, payload);

        if(this._resetting){
            try {
                await this._resetting.promise.timeout(30000)
            } catch(ex){
                this._resetting = null
                throw ex
            }
        }
    }

    async send(argObj, logging = true){
        assert(this.unpi, 'unpi must be available')
        assert(argObj.type === 'AREQ' || argObj.type === 'SREQ', `argObj must be of valid type, was ${argObj.type}`)

        if (argObj.type === 'SREQ') {
            return await this._sendSREQ(argObj, logging);
        }
        
        if(logging){
            Logging.request.AREQ('==> %s:%s %s', argObj.subsys, argObj.cmd, Logging.valObjFormat(argObj.valObj));
        }
        return await this._sendAREQ(argObj);
    }
}

module.exports = Communicator