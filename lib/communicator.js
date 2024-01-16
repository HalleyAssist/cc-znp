const Q = require('@halleyassist/q-lite'),
      Logging = require('./logging'),
      ZpiObject = require('./zpiObject'),
      InvalidChecksum = require('./invalidChecksum'),
      debug = require('debug')('cc-znp:communicator'),
      assert = require('assert')

const LoggingUnknown = Logging.request.Unknown,
      LoggingAREQ = Logging.request.AREQ,
      LoggingSRSP = Logging.request.SRSP
      

class Communicator {
    constructor(emitter, unpi){
        assert(unpi, 'unpi must be provided')
        this._pending = []
        this._resetting = null
        this._emitter = emitter
        this.unpi = unpi
    }
    _findPending(data, remove){
        for(let i=0; i<this._pending.length;i++){
            const p = this._pending[i]
            if(data.subsys != p.argObj.subsys || data.cmd != p.argObj.cmd) continue
            if(remove) this._pending.splice(i, 1)
            return p
        }
    }

    takePending(data){
        return this._findPending(data, true)
    }

    findPending(data){
        return this._findPending(data, false)
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
            if(argObj.subsys == p.argObj.subsys && argObj.cmd == p.argObj.cmd && argObj.type == p.argObj.type) throw new Error(`subsys:${argObj.subsys} & cmd:${argObj.cmd} already pending`)
        }
        this._pending.push({
            argObj,
            deferred,
            logging
        })
    }
    _eventString(data){
        if(data.type === 'AREQ') return 'AREQ:' + data.subsys + ':' + data.cmd
        return 'SRSP:' + data.subsys + ':' + data.cmd;
    }
    _logTimeout(data){
        Logging.request.SRSP(`${data.subsys}:${data.cmd} ${Logging.valObjFormat(data.valObj, data.subsys, data.cmd)} <=> ERROR (Timeout)`);
    }
    clear(data){
        if(data.type === 'SRSP') {
            let pending

            if(data.subsys === 'RES0' && data.cmd === 'error'){
                const subsys = data.payload.typesubsys & 0xF
                const cmd = data.payload.cmd
                const zpi = new ZpiObject(subsys, cmd)
                pending = this.takePending(zpi)
            } else {
                pending = this.takePending(data)
            }

            if(pending){
                pending.deferred.reject('__error__')
            }
        }
    }
    async receive(data){
        assert(typeof data === 'object', 'data must be an object')
        assert(typeof data.payload === 'object', 'data.payload must be an object')

        //console.log(data)
        let checksumValid = data.fcs === data.csum
        switch(data.type){
            case 'SRSP': {
                let pending

                // handle error
                if(data.subsys === 'RES0' && data.cmd === 'error'){
                    const subsys = data.payload.typesubsys & 0xF
                    const cmd = data.payload.cmd
                    const zpi = new ZpiObject(subsys, cmd)
                    pending = this.takePending(zpi)
                   
                    if(!pending){
                        if(LoggingSRSP.enabled) LoggingSRSP(`${zpi.subsys}:${zpi.cmd} <unknown> <=> ERROR (RES0-ERROR)`)
                        return
                    }
                    if(LoggingSRSP.enabled) LoggingSRSP(`${zpi.subsys}:${zpi.cmd} ${Logging.valObjFormat(pending.argObj.valObj, zpi.subsys, zpi.cmd)} <=> ERROR (RES0-ERROR)`)
                    
                    pending.deferred.reject('__error__')
                    return
                }
    
                pending = this.takePending(data)
                if(!pending){
                    const payload = data.payload ? Logging.valObjFormat(data.payload, data.subsys, data.cmd, true) : '<unknown>'
                    if(LoggingSRSP.enabled) LoggingSRSP(`${data.subsys}:${data.cmd} ${payload} <=> ERROR (NO-LISTENERS)`)
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
                    if(LoggingSRSP.enabled) LoggingSRSP(`${data.subsys}:${data.cmd} ${Logging.valObjFormat(pending.argObj.valObj, data.subsys, data.cmd)} <=> ${Logging.valObjFormat(data.payload, data.subsys, data.cmd, true)}${checksumValid?"":" (INVALID CHECKSUM)"}`)
                }
    
                if(checksumValid) pending.deferred.resolve(data.payload)
                else pending.deferred.reject(new InvalidChecksum(data.payload))
                break;
            }
            case 'AREQ': {
                if(LoggingAREQ.enabled){
                    LoggingAREQ(`<== ${data.subsys}:${data.cmd} ${Logging.valObjFormat(data.payload, data.subsys, data.cmd, true)}${checksumValid?"":" (INVALID CHECKSUM)"}`);
                }


                if(this._resetting && data.subsys === 'SYS' && data.cmd === 'resetInd') {
                    for(const p of this._pending){
                        p.deferred.reject('module reset')
                    }
                    this._pending = []
                    const resetting = this._resetting
                    this._resetting = null
                    resetting.resolve()
                }
                break;
            }
            default:
                if(LoggingUnknown.enabled){
                    LoggingUnknown(`<== ${data.subsys}:${data.cmd} ${Logging.valObjFormat(data.payload, data.subsys, data.cmd, true)}${checksumValid?"":" (INVALID CHECKSUM)"}`);
                }
        }

        const eventPayload = {
            subsys: data.subsys,
            ind: data.cmd,
            data: data.payload,
            checksumValid
        }
        if(data.type === 'AREQ') {
            this._emitter.emit('AREQ', eventPayload)
        }
        this._emitter.emit(this._eventString(data), eventPayload);

        return true
    }
    
    async __sendSREQ(argObj){
        let payload = argObj.frame()
        if (!payload) {
            throw new Error('Fail to build frame');
        }

        //console.log(['SREQ', argObj.subsysId, argObj.cmdId, payload])
        await this.unpi.send('SREQ', argObj.subsysId, argObj.cmdId, payload);
    }

    async resendArgObj(argObj){
        return await this.__sendSREQ(argObj)
    }

    async _sendSREQ (argObj, deferred, logging = true) {
        // subsys: String, cmd: String

        if(!deferred) deferred = Q.defer()
        this.addPending(argObj, deferred, logging)

        if(argObj.subsys !== 'RCN' || argObj.cmd !== 'echo'){
            // a realignment is OK
            if(this._sending && this._sending !== argObj){
                assert(!this._sending, `cannot send ${argObj.type}:${argObj.subsys}:${argObj.cmd} while sending ${this._sending.type}:${this._sending.subsys}:${this._sending.cmd}`)
            }
            this._sending = argObj
        }

        try {
            await this.__sendSREQ(argObj)
            deferred = await deferred.promise
        } catch(ex) {
            if(this._sending) {
                if(argObj.subsys !== 'RCN' || argObj.cmd !== 'ping'){
                    //console.log({argObj, sending: this._sending})
                    assert(this._sending === argObj, "sending was changed while sending")
                    this._sending = null
                }
            }
            throw ex            
        }

        if(this._sending) {
            if(argObj.subsys !== 'RCN' || argObj.cmd !== 'ping'){
                //console.log({argObj, sending: this._sending})
                assert(this._sending === argObj, "sending was changed while sending")
                this._sending = null
            }
        }

        return deferred
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

    send(argObj, logging = true, deferred = null){
        assert(this.unpi, 'unpi must be available')
        assert(argObj.type === 'AREQ' || argObj.type === 'SREQ', `argObj must be of valid type, was ${argObj.type}`)

        if(!deferred) deferred = Q.defer()

        let ret
        if (argObj.type === 'SREQ') {
            ret = this._sendSREQ(argObj, deferred, logging).catch(deferred.reject)
            let cancelled = null
            deferred.promise.cancel = ret.cancel = ()=>{
                if(cancelled !== null) return cancelled
                cancelled = this.removePending(argObj, false)
                deferred.reject(new Error('cancelled'))
                return cancelled
            }
        }else {
            if(logging && LoggingAREQ.enabled){
                LoggingAREQ(`==> ${argObj.subsys}:${argObj.cmd} ${Logging.valObjFormat(argObj.valObj)}`);
            }
            ret = this._sendAREQ(argObj);
            deferred.promise = ret.cancel = ()=>true
            deferred.resolve(ret)
        }
        return ret
    }

    get sending (){
        return this._sending
    }

    info(){
        return {
            pending: this._pending.length
        }
    }

    clearAll(){
        for(const p of this._pending){
            // resolve with a value of null
            p.deferred.resolve(null)
        }
        this._pending = []
    }
}

module.exports = Communicator