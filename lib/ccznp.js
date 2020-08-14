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
      nvItems = require('./defs/nvItems'),
      Q = require('q-lite'),
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
        this._dataFn = null
    }

    _clearDataFn(){
        if(!this._dataFn) return
        this._communicator.unpi.removeListeners('data', this._dataFn)
        this._dataFn = null
    }

    async start(drain = true){
        this._init = Q.defer()
        await this._closeOpen()

        let starting = false
        if(!this._communicator){
            const unpi = new Unpi({ lenBytes: 1, phy: this._sp });
            this._communicator = new Communicator(this, unpi)
            starting = true
        }

        const dataFn = data=>this._parseMtIncomingData(data)
        this._clearDataFn()
        this._communicator.unpi.on('data', dataFn);
        this._dataFn = dataFn

        if(starting){
            this._pipeline = new Pipeline(this._txqueue, this._communicator, this._mainSubsys)
        }
        assert(this._pipeline, 'pipeline should exist')
        
        this._init.resolve()
        this._init = null

        if(!drain){
            return true
        }

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
                    this._communicator.takePending({cmd: "echo", subsys: this._mainSubsys})
                    continue
                }
            } catch(ex){

            }
            await Q.delay(50)
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
            assert(data.len === data.payload.length)
            data.type = zmeta.CmdType.get(data.type).key;    // make sure data.type will be string
            data.subsys = argObj.subsys;                     // make sure data.subsys will be string
            data.cmd = argObj.cmd;                           // make sure data.cmd will be string
    
            data.payload = await argObj.parse(data.type, data.payload);

            return await this._communicator.receive(data)
        } catch(ex){
            debug(`Error while parsing ${argObj} (len:${data.len}), error: ${ex}`)
            return false
        }
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
            if(this._communicator.unpi) {
                this._clearDataFn()
                this._communicator.unpi.close()
            }
            await this._communicator.clear()
        }
    }

    async close(){
        if(this._init) await this._init.promise
        debug("closing")
        this._clearDataFn()
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

CcZnp.constants = require('./constants')
CcZnp.utils = require('./utils')
CcZnp.nvItems = nvItems

module.exports = CcZnp;