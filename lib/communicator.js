const Q = require('q-lite'),
      Logging = require('./logging'),
      ZpiObject = require('./zpiObject'),
      InvalidChecksum = require('./invalidChecksum'),
      debug = require('debug')('cc-znp:communicator'),
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

    /*
    remove pending where argObj is same

    returns true if found
    */ 
    removePending(argObj, resolve = true){
        for(let i = 0; i<this._pending.length; i++){
            // find the pending matching argObj
            const p = this._pending[i]
            if(argObj !== p.argObj) continue

            // remove
            this._pending.splice(i, 1)

            // resolve with a value of null
            if(resolve) p.deferred.resolve(null)

            return true
        }
        return false
    }
    addPending(argObj, deferred, logging = true){
        for(const p of this._pending){
            if(p.argObj === argObj) {
                debug("resending")
                return
            }
            if(argObj.subsys == p.argObj.subsys && argObj.cmd == p.argObj.cmd) throw new Error(`subsys:${argObj.subsys} & cmd:${argObj.cmd} already pending`)
        }
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
        Logging.request.SRSP('%s:%s %s <=> ERROR (Timeout)', data.subsys, data.cmd, Logging.valObjFormat(data.valObj, data.subsys, data.cmd));
    }
    async receive(data){
        let checksumValid = data.fcs === data.csum
        if (data.type === 'SRSP') {
            let pending

            // handle error
            if(data.subsys === 'RES0' && data.cmd === 'error'){
                const subsys = data.payload.typesubsys & 0xF
                const cmd = data.payload.cmd
                const zpi = new ZpiObject(subsys, cmd)
                pending = this.takePending(zpi)
               
                if(!pending){
                    Logging.request.SRSP('%s:%s <unknown> <=> ERROR (RES0-ERROR)', zpi.subsys, zpi.cmd)
                    return
                }
                Logging.request.SRSP('%s:%s %s <=> ERROR (RES0-ERROR)', zpi.subsys, zpi.cmd, Logging.valObjFormat(pending.argObj.valObj, zpi.subsys, zpi.cmd))
                
                pending.deferred.reject('__error__')
                return
            }

            pending = this.takePending(data)
            if(!pending){
                const payload = data.payload ? Logging.valObjFormat(data.payload, data.subsys, data.cmd, true) : '<unknown>'
                Logging.request.SRSP('%s:%s %s <=> ERROR (NO-LISTENERS)', data.subsys, data.cmd, payload)
                if(process.env.NODE_ENV !== 'production'){
                    debug("Listeners: ")
                    let i = 0
                    for(const pending of this._pending){
                        debug(`>> ${++  i}. ${pending.argObj.subsys}:${pending.argObj.cmd}`)
                    }
                }
                return
            }
            
            if(pending.logging){
                Logging.request.SRSP('%s:%s %s <=> %s%s', data.subsys, data.cmd, Logging.valObjFormat(pending.argObj.valObj, data.subsys, data.cmd), Logging.valObjFormat(data.payload, data.subsys, data.cmd, true), checksumValid?"":" (INVALID CHECKSUM)");
            }

            if(checksumValid) pending.deferred.resolve(data.payload)
            else pending.deferred.reject(new InvalidChecksum(data.payload))
        } else if (data.type === 'AREQ') {
            Logging.request.AREQ('<== %s:%s %s%s', data.subsys, data.cmd, Logging.valObjFormat(data.payload, data.subsys, data.cmd, true), checksumValid?"":" (INVALID CHECKSUM)");
        } else {
            Logging.request.Unknown('<== %s:%s %s%s', data.subsys, data.cmd, Logging.valObjFormat(data.payload, data.subsys, data.cmd, true), checksumValid?"":" (INVALID CHECKSUM)");
        }

        if(this._resetting && data.type === 'AREQ' && data.subsys === 'SYS' && data.cmd === 'resetInd') {
            for(const p of this._pending){
                p.deferred.reject('module reset')
            }
            this._pending = []
            const resetting = this._resetting
            this._resetting = null
            resetting.resolve()
        }

        this._emitter.emit(this._eventString(data), {
            subsys: data.subsys,
            ind: data.cmd,
            data: data.payload,
            checksumValid
        });

        return true
    }
    async _sendSREQ (argObj, logging = true, deferred = null) {
        // subsys: String, cmd: String
        let payload = argObj.frame()
        if (!payload) {
            throw new Error('Fail to build frame');
        }

        if(!deferred) deferred = Q.defer()
        this.addPending(argObj, deferred, logging)

        await this.unpi.send('SREQ', argObj.subsysId, argObj.cmdId, payload);
        return await deferred.promise
    }

    async _sendAREQ (argObj, deferred = null) {
        // subsys: String, cmd: String
        var payload = argObj.frame();

        if (!payload) {
            throw new Error('Fail to build frame')
        }

        if (argObj.cmd === 'resetReq' || argObj.cmd === 'systemReset') {
            this._resetting = Q.defer()
        }

        await this.unpi.send('AREQ', argObj.subsysId, argObj.cmdId, payload);

        if(this._resetting){
            try {
                await this._resetting.promise.timeout(30000)
            } catch(ex){
                this._resetting = null
                throw ex
            }
        }
    }

    async send(argObj, logging = true, deferred = null){
        assert(this.unpi, 'unpi must be available')
        assert(argObj.type === 'AREQ' || argObj.type === 'SREQ', `argObj must be of valid type, was ${argObj.type}`)

        if (argObj.type === 'SREQ') {
            return await this._sendSREQ(argObj, logging, deferred);
        }
        
        if(logging){
            Logging.request.AREQ('==> %s:%s %s', argObj.subsys, argObj.cmd, Logging.valObjFormat(argObj.valObj));
        }
        return await this._sendAREQ(argObj, deferred);
    }

    info(){
        return {
            pending: this._pending.length
        }
    }

    clear(){
        for(const p of this._pending){
            // resolve with a value of null
            p.deferred.resolve(null)
        }
        this._pending = []
    }
}

module.exports = Communicator