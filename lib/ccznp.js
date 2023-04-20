/* jshint node: true */
'use strict';

const assert = require('assert'),
      EventEmitter = require('events').EventEmitter,
      Unpi = require('./unpi'),
      zmeta = require('./zmeta'),
      ZpiObject = require('./zpiObject'),
      Pipeline = require('./pipeline'),
      TxQueue = require('./txqueue'),
      Communicator = require('./communicator'),
      nvItems = require('./defs/nvItems'),
      Q = require('@halleyassist/q-lite'),
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
        this._init = false
        this._mainSubsys = mainSubsys
        this._dataFn = null
    }

    _clearDataFn(){
        if(!this._dataFn) return
        this._communicator.unpi.removeListener('data', this._dataFn)
        this._dataFn = null
    }

    _unpiCreate(){
        return new Unpi(this._sp);
    }

    info() {
        return Object.assign({}, this._communicator.info(), this._txqueue.info())
    }

    async start(drain = true){
        this._init = Q.defer()
        await this._closeOpen()
        const unpi = this._unpiCreate()
        this._communicator = new Communicator(this, unpi)

        const dataFn = data=>this._parseMtIncomingData(data)
        this._clearDataFn()
        this._communicator.unpi.on('data', dataFn);
        this._dataFn = dataFn

        this._pipeline = new Pipeline(this._txqueue, this._communicator, this._mainSubsys)
        //assert(this._pipeline, 'pipeline should exist')
        
        this._init.resolve()
        this._init = true

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
                //not empty
            }
            await Q.delay(50)
        } while(i++ < 3)
        return false
    }

    async ping(){
        if(!this._pipeline) return false
        return await this._pipeline.ping()
    }

    async _parseMtIncomingData(data){
        assert(this._init === true, "should be init if receiving")
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

    async _awaitReady(){
        let c = true
        do {
            if(typeof this._closing === 'object'){
                await this._closing.promise
                continue
            }
            if(typeof this._init === 'object') {
                await this._init.promise
                continue
            }
            c = false
        } while(c)
    }

    async request (subsys, cmd, valObj, logging = true) {
        await this._awaitReady()
        if(!this._init) throw new Error('not init')
        const argObj = new ZpiObject(subsys, cmd, valObj)
        argObj.frame();// precalculate
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
        await this._awaitReady()
        if(typeof this._init === 'object') await this._init.promise
        if(!this._init) {
            debug("already closed")
            return
        }
        debug("closing")
        this._closing = Q.defer()
        try {
            this._clearDataFn()
            this._pipeline.abort()
            await this._txqueue.clear()
            await this._closeOpen()
            this._init = false
        } finally {
            this._closing.resolve()
            this._closing = false
        }
        debug("closed")
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