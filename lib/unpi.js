// 'use strict';

const EventEmitter = require('events'),
      Concentrate = require('concentrate'),
      DChunks = require('dissolve-chunks'),
      Q = require("@halleyassist/q-lite"),
      assert = require('assert'),
      debug = require('debug')('gw:unpi')

const cmdType = {
    "POLL": 0,
    "SREQ": 1,
    "AREQ": 2,
    "SRSP": 3,
    "RES0": 4,
    "RES1": 5,
    "RES2": 6,
    "RES3": 7
};

const EmptyBuffer = Buffer.alloc(0)

/*************************************************************************************************/
/*** TI Unified NPI Packet Format                                                              ***/
/***     SOF(1) + Length(2/1) + Type/Sub(1) + Cmd(1) + Payload(N) + FCS(1)                     ***/
/*************************************************************************************************/
class Unpi extends EventEmitter {
    constructor(phy = null) {
        super()

        this._parsedPreBuf = Buffer.alloc(3)

        if (phy) {
            this._boundData = this._parseData.bind(this)
            phy.on('data', this._boundData)
            this.phy = phy
        }

        this._preBuf = Buffer.allocUnsafe(512);
        this._preBuf[0] = 0xFE;
        this._preBuf[1] = 0xED;
        
        this._previous = null
    }

    _parseData(msg){
        if(this._previous){
            msg = Buffer.concat([this._previous, msg])
        }
        try {
            while(msg.length > 2){
                while(msg[0] !== 0xFE && msg[1] !== 0xED){
                    msg = msg.slice(1)
                    if(msg.length < 2) {
                        debug("No SOF found in incorrect bytes")
                        if(msg[0] !== 0xFE) {
                            msg = null
                        }
                        return
                    }
                }

                if(msg.length < 3) {
                    return
                }

                const len = msg[2]

                // incomplete fragment, wait for more data
                if((len + 6) > msg.length) {
                    return
                }

                const result = {
                    len,
                    type: msg[3] >> 5,
                    subsys: msg[3] & 0x1F,
                    cmd: msg[4],
                    payload: msg.slice(5, len + 5),
                    fcs: msg[len + 5],
                    csum: null // to be calculated
                }

                const cmd0 = (result.type << 5) | result.subsys

                this._parsedPreBuf[0] = result.len
                this._parsedPreBuf[1] = cmd0
                this._parsedPreBuf[2] = result.cmd
                
                result.csum = checksum(this._parsedPreBuf, result.payload);

                this.emit('data', result);
                msg = msg.slice(result.len + 6)
            }
        } finally {
            if(msg !== null && msg.length === 0) {
                msg = null
            }
            this._previous = msg
        }
    }
}

Unpi.DChunks = DChunks;
Unpi.Concentrate = Concentrate;

/*
let unpiCapture = []
setTimeout(function(){
    const fs = require('fs')
    fs.writeFileSync("/tmp/dump.json", JSON.stringify(unpiCapture))
}, 60000)
*/

Unpi.prototype.send = async function (type, subsys, cmdId, payload) {
    assert(!this.sending, "Already sending")
    let packet
    this.sending = true
    try {
        assert (typeof type === 'string' || typeof type === 'number', 'Argument type should be a string or a number.')
        assert (typeof type !== 'number' || !isNaN(type), 'Argument type cannot be NaN.')

        if (typeof subsys !== 'number')
            throw new TypeError('Argument subsys should be a number.');
        else if (typeof subsys === 'number' && isNaN(subsys))
            throw new TypeError('Argument subsys cannot be NaN.');

        if (typeof cmdId !== 'number' || isNaN(cmdId))
            throw new TypeError('Command id should be a number.');

        if (payload !== undefined && !Buffer.isBuffer(payload))
            throw new TypeError('Payload should be a buffer.');

        type = getCmdTypeString(type);

        if (type === undefined || subsys === undefined)
            throw new Error('Invalid command type or subsystem.');

        /*
        unpiCapture.push({
            method: 'send',
            data: {
                type, subsys, cmdId, payload: [...payload]
            }
        })
        */

        type = cmdType[type];
        payload = payload || EmptyBuffer

        const cmd0 = ((type << 5) & 0xE0) | (subsys & 0x1F)

        this._preBuf[2] = payload.length
        this._preBuf[3] = cmd0
        this._preBuf[4] = cmdId
        payload.copy(this._preBuf, 5);

        const fcs = checksum(this._preBuf.slice(2, payload.length+5));
        this._preBuf[payload.length+5] = fcs;
        packet = this._preBuf.slice(0, payload.length+6);

        let eFn
        if(this.phy){        
            const deferred = Q.defer()
            eFn = deferred.reject
            this.phy.once('error', eFn)
            try {
                this.phy.write(packet, null, err=>{
                    if(err) {
                        deferred.reject(err)
                        return
                    }
                    
                    this.phy.drain((err)=>{
                        if(err) deferred.reject(err)
                        deferred.resolve()
                    })
                })
                

                await deferred.promise
            } finally {
                this.phy.removeListener('error', eFn)
            }
        }

        this.emit('flushed', { type , subsys, cmdId });
    } catch(ex) {
        this.sending = false
        throw ex
    }
    this.sending = false
    return packet;
};

Unpi.prototype.receive = function (buf) {
    if (buf === undefined || buf === null)
        buf = EmptyBuffer;

    if (!Buffer.isBuffer(buf))
        throw new TypeError('buf should be a Buffer.');

    this._boundData(buf)

    return this;
};

Unpi.prototype.close = function(){
    if(this.phy){
        this.phy.removeListener('data', this._boundData)
    }
}

function checksum(buf1, buf2) {
    let fcs = 0, i

    for (i = 0; i < buf1.length; i++) {
        fcs ^= buf1[i];
    }

    if (buf2 === undefined) return fcs
    
    for (i = 0; i < buf2.length; i++) {
        fcs ^= buf2[i];
    }

    return fcs;
}

function getCmdTypeString(cmdtype) {
    var cmdTypeString;

    if (typeof cmdtype === 'number') {
        for (const k in cmdType) {
            if (cmdType[k] !== undefined && cmdType[k] === cmdtype) {
                cmdTypeString = k;
                break;
            }
        }
    } else if (typeof cmdtype === 'string') {
        if (cmdType[cmdtype] !== undefined)
            cmdTypeString = cmdtype;
    }
    return cmdTypeString;
}

module.exports = Unpi;
