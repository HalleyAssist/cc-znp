/* jshint node: true */
'use strict';

const assert = require('assert'),
      EventEmitter = require('events').EventEmitter,
      Unpi = require('unpi'),
      zmeta = require('./zmeta'),
      ZpiObject = require('./zpiObject'),
      Pipeline = require('./pipeline'),
      TxQueue = require('./txqueue'),
      Communicator = require('./communicator'),
      Q = require('q'),
      InvalidChecksum = require('./invalidChecksum'),
      debug = require('debug')('cc-znp')

const MT = Object.assign({
    CMDTYPE: zmeta.CmdType,
    SUBSYS: zmeta.Subsys
}, zmeta.Commands)


class CcZnp extends EventEmitter {
    constructor(sp, mainSubsys = "RCN"){
        super()
        assert(sp, 'serial port must be provided')
        this.MT = MT
        this._sp = sp
        this._txqueue = new TxQueue()
        this._init = null
        this._mainSubsys = mainSubsys
    }

    async start(){
        this._init = Q.defer()
        await this._closeOpen()

        let starting = false
        if(!this._communicator){
            const unpi = new Unpi({ lenBytes: 1, phy: this._sp });
            this._communicator = new Communicator(this, unpi)
            starting = true
        }

        this._communicator.unpi.on('data', data=>this._parseMtIncomingData(data));

        if(starting){
            this._pipeline = new Pipeline(this._txqueue, this._communicator, this._mainSubsys)
        }
        assert(this._pipeline, 'pipeline should exist')
        
        this._init.resolve()
        this._init = null

        // Drain anything that might be left over from an application crash, and ensure the module starts
        const values = []
        let i = 0
        do {
            const value = Math.floor(Math.random() * Math.pow(2,32))
            values.push(value)
            try {
                const rsp = await this.request(this._mainSubsys, "echo", {value})
                if(rsp.value == value){
                    return true
                }
                if(values.includes(rsp.value)){
                    continue
                }
            } catch(ex){

            }
            await Q.delay(10)
        } while(i++ < 3)
        return false
    }

    async _parseMtIncomingData(data){
        let argObj
        try {    
            argObj = new ZpiObject(data.subsys, data.cmd);
        } catch(ex){
            if(data.fcs !== data.csum){
                throw new InvalidChecksum(null)
            }
            throw ex
        }
        try {    
            data.type = zmeta.CmdType.get(data.type).key;    // make sure data.type will be string
            data.subsys = argObj.subsys;                     // make sure data.subsys will be string
            data.cmd = argObj.cmd;                           // make sure data.cmd will be string
    
            data.payload = await Q.ninvoke(argObj, 'parse', data.type, data.len, data.payload);

            await this._communicator.receive(data)
        } catch(ex){
            this._handleMtError(ex)
        }
    }
    _handleMtError(err){
        debug(err)
    }

    get spinLock() {
        return this._txqueue._spinlock
    }
    set spinLock(value){
        this._txqueue._spinlock = ~~value
    }

    async request (subsys, cmd, valObj, logging = true) {
        if(this._init) await this._init.promise
        const argObj = new ZpiObject(subsys, cmd, valObj)
        return await this._pipeline.execute(argObj, logging)
    }

    async _closeOpen(){
        assert(this._sp, 'serial port should be available')
        await Q.ninvoke(this._sp, 'flush')
        this._sp.removeAllListeners('open');
        this._sp.removeAllListeners('error');
        this._sp.removeAllListeners('close');
        if(this._communicator){
            await this._communicator.clear()
            if(!this._communicator.unpi) return
            this._communicator.unpi.removeAllListeners('data');
        }
    }

    async close(){
        if(this._init) await this._init.promise
        debug("closing")
        await this._txqueue.clear()
        await this._closeOpen()
    }
}

/*********************************/
/*** Create Request Shorthands ***/
/*********************************/
// example: ccznp.sysRequest(), ccznp.zdoRequest()
zmeta.getSubsystems().forEach(function (subsys) {
    const reqMethod = subsys.toLowerCase() + 'Request';
    CcZnp.prototype[reqMethod] = function (cmdId, valObj, callback) {
        return this.request(subsys, cmdId, valObj, callback);
    };
});


module.exports = CcZnp;