const Q = require('q'),
      logging = require('./logging'),
      assert = require('assert')

class Communicator {
    constructor(emitter){
        this._pending = []
        this._resetting = null
        this._emitter = emitter
    }
    findPending(data){
        for(const p of this._pending){
            if(data.subsys != p.argObj.subsys || data.cmd != p.argObj.cmd) continue
            return p
        }
    }
    removePending(argObj){
        for(let i = 0; i<this._pending.length; i++){
            const p = this._pending[i]
            if(argObj != p.argObj) continue
            p.resolve(null)
            this._pending.splice(i, 1)
            return true
        }
        return false
    }
    _eventString(data){
        if(data.type === 'AREQ') return 'AREQ'
        return 'SRSP:' + data.subsys + ':' + data.cmd;
    }
    async receive(data){
        if (data.type === 'SRSP') {
            let pending
            if(data.subsys === 'RES0' && data.cmd === 'error'){
                const subsys = data.typesubsys & 0xF 
                pending = this.findPending({subsys, cmd: data.cmd})
                if(!pending){
                    logging.request.SRSP('<-- %s:%s, ERROR (NO-LISTENERS)', subsys, data.cmd);
                    return
                }
                logging.request.SRSP('<-- %s:%s, ERROR', subsys, data.cmd);
                pending.deferred.reject('__error__')
                return
            }
            pending = this.findPending(data)
            if(!pending){
                logging.request.SRSP('<-- %s:%s, %o (NO LISTENERS)', data.subsys, data.cmd, logging.valObjFormat(data.payload));
                return
            }
            logging.request.SRSP('<-- %s:%s, %o', data.subsys, data.cmd, logging.valObjFormat(data.payload));
            pending.deferred.resolve(data.payload)
        } else if (data.type === 'AREQ') {
            logging.request.AREQ('<-- %s:%s, %o', data.subsys, data.cmd, logging.valObjFormat(data.payload));
        }

        this._emitter.emit(this._eventString(data), {
            subsys: subsys,
            ind: cmd,
            data: result
        });

        if(this._resetting && data.type === 'AREQ' && subsys === 'SYS' && cmd === 'resetInd') {
            for(const p of this._pending){
                p.deferred.reject('module reset')
            }
            this._pending = []
            this._resetting.resolve()
        }
    }
    async _sendSREQ (argObj) {
        // subsys: String, cmd: String
        let payload = argObj.frame()
        if (!payload) {
            throw new Error('Fail to build frame');
        }

        const deferred = Q.defer()
        this._pending.push({
            argObj,
            deferred
        })

        this._unpi.send('SREQ', argObj.subsys, argObj.cmdId, payload);
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

        this._unpi.send('AREQ', argObj.subsys, argObj.cmdId, payload);

        if(this._resetting){
            try {
                await this._resetting.promise.timeout(30000)
            } catch(ex){
                this._resetting = null
                throw ex
            }
        }
    }

    async send(argObj){
        assert(argObj.type === 'AREQ' || argObj.type === 'SREQ')

        logging.request[argObj.type]('--> %s:%s, %o', argObj.subsys, argObj.cmd, logging.valObjFormat(valObj));
        if (argObj.type === 'SREQ') {
            return await this._sendSREQ(argObj);
        }
        return await this._sendAREQ(argObj);
    }
}

module.exports = Communicator