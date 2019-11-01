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
      debug = require('debug')('cc-znp')

const MT = Object.assign({
    CMDTYPE: zmeta.CmdType,
    SUBSYS: zmeta.Subsys
}, zmeta.Commands)


class CcZnp extends EventEmitter {
    constructor(sp){
        super()
        assert(sp, 'serial port must be provided')
        this.MT = MT
        this._sp = sp
        this._txqueue = new TxQueue()
        this._init = null
    }

    async start(){
        this._init = Q.defer()
        await this._closeOpen()

        if(!this._communicator){
            const unpi = new Unpi({ lenBytes: 1, phy: this._sp });
            this._communicator = new Communicator(this, unpi)
            this._pipeline = new Pipeline(this._txqueue, this._communicator)
        }
        assert(this._pipeline, 'pipeline should exist')

        this._communicator.unpi.on('data', data=>this._parseMtIncomingData(data));
        this._communicator.unpi.on('error', err=>this._handleMtError(err));
        this._init.resolve()
        this._init = null
    }

    async _parseMtIncomingData(data){
        try {
            if (data.fcs !== data.csum)
                throw new Error('Invalid ZNP checksum');
    
            let argObj = new ZpiObject(data.subsys, data.cmd);
            data.type = zmeta.CmdType.get(data.type).key;    // make sure data.type will be string
            data.subsys = argObj.subsys;                     // make sure data.subsys will be string
            data.cmd = argObj.cmd;                           // make sure data.cmd will be string
    
            data.payload = await Q.ninvoke(argObj, 'parse', data.type, data.len, data.payload);

            this._communicator.receive(data)
        } catch(ex){
            this._handleMtError(ex)
        }
    }
    _handleMtError(err){
        debug(err)
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
            this._communicator.unpi.removeAllListeners('error');
        }
    }

    async close(){
        if(this._init) await this._init.promise
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