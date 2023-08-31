// 'use strict';

const EventEmitter = require('events'),
      Concentrate = require('concentrate'),
      DChunks = require('dissolve-chunks'),
      Q = require("@halleyassist/q-lite"),
      assert = require('assert'),
      debug = require('debug')('cc-znp:unpi')

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

const EmptyBuffer = Buffer.allocUnsafe(0)
const PreBuf = Buffer.allocUnsafe(4);
const ParsedPreBuf = Buffer.allocUnsafe(3);

/*************************************************************************************************/
/*** TI Unified NPI Packet Format                                                              ***/
/***     SOF(1) + Length(2/1) + Type/Sub(1) + Cmd(1) + Payload(N) + FCS(1)                     ***/
/*************************************************************************************************/
class Unpi extends EventEmitter {
    constructor(phy = null) {
        super()

        this._parsedPreBuf = ParsedPreBuf

        if (phy) {
            this._boundData = this._parseData.bind(this)
            phy.on('data', this._boundData)
            this.phy = phy
        }

        this._preBuf = PreBuf;
        this._preBuf[0] = 0xFE;
        this._preBufData = this._preBuf.subarray(1)
    }

    _parseData(msg){
        if(this._previous){
            msg = Buffer.concat([this._previous, msg])
        }
        while(msg.length){
            let sof = msg[0]
            if(sof != 0xFE) {
                debug("SOF not found, skipping until we find it")
                do {
                    msg = msg.slice(1)
                    sof = msg[0]
                } while (sof != 0xFE && msg.length)
            }

            if(sof != 0xFE) {
                debug("SOF not found at all, discarding")
                this._previous = null
                return
            }

            const len = msg[1]

            // incomplete fragment, wait for more data
            if((len + 5) > msg.length) {
                this._previous = msg
                return
            }

            const result = {
                sof,
                len,
                type: msg[2] >> 5,
                subsys: msg[2] & 0x1F,
                cmd: msg[3],
                payload: msg.slice(4, len + 4),
                fcs: msg[len + 4],
                csum: null // to be calculated
            }

            const cmd0 = (result.type << 5) | result.subsys

            this._parsedPreBuf.writeUInt8(result.len, 0);
            this._parsedPreBuf.writeUInt8(cmd0, 1);
            this._parsedPreBuf.writeUInt8(result.cmd, 2);
            
            result.csum = checksum(this._parsedPreBuf, result.payload);

            /*const data = Object.assign({}, result)
            data.payload = [...data.payload]
            unpiCapture.push({
                method: 'receive',
                data
            })*/

            this.emit('data', result);
            msg = msg.slice(result.len + 5)
        }

        this._previous = null
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

        this._preBuf.writeUInt8(payload.length, 1);
        this._preBuf.writeUInt8(cmd0, 2);
        this._preBuf.writeUInt8(cmdId, 3);

        const fcs = checksum(this._preBufData, payload);

        // Allocate a new buffer to hold the packet
        packet = Buffer.allocUnsafeSlow(payload.length + this._preBuf.length + 1);
        this._preBuf.copy(packet, 0);
        payload.copy(packet, this._preBuf.length);
        packet[packet.length - 1] = fcs
        
        let eFn
        if(this.phy){        
            const deferred = [Q.defer()]
            eFn = e=>{
                for(var d in deferred){
                    d.reject(e)
                }
            }
            this.phy.on('error', eFn)
            try {
                const writeResult = this.phy.write(packet, null, err=>{
                    if(err) {
                        deferred[0].reject(err)
                        return
                    }

                    this.phy.drain((err)=>{
                        if(err) deferred[0].reject(err)
                        deferred[0].resolve()
                    })
                })
                if(writeResult === false){
                    deferred[1] = Q.defer()
                    this.phy.once('drain', err=>{
                        if(err) deferred[1].reject(err)
                        deferred[1].resolve()
                    })
                    await (deferred[1].promise.timeout(1100))
                }

                await deferred[0].promise.timeout(1150)
            } finally {
                this.phy.removeListener('error', eFn)
            }
        }

        this.emit('flushed', { type , subsys, cmdId });
    } finally {
        this.sending = false
    }
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
