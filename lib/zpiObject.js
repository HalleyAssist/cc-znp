/* jshint node: true */
'use strict';

var zmeta = require('./zmeta'),
    Unpi = require('./unpi'),
    Concentrate = Unpi.Concentrate,
    DChunks = Unpi.DChunks,
    ru = DChunks.Rule;

const OnceParser = {once: true}

const GenericRspRules = []
GenericRspRules.push(ru.uint16('srcaddr'), 6)
GenericRspRules.push(ru.uint8('status'), 6)
GenericRspRules.push(ru.uint16('nwkaddr'), 6)
GenericRspRules.push(ru.uint8('len'), 6)

/*************************************************************************************************/
/*** ZpiObject Class                                                                           ***/
/***   1. Provides command framer (SREQ)                                                       ***/
/***   2. Provides parser (SRSP, AREQ)                                                         ***/
/*************************************************************************************************/
class ZpiObject {
    constructor(subsys, cmd, args) {
        // args is optional, and can be an array or a value-object if given
        var subsystem = zmeta.Subsys.get(subsys),
            command,
            reqParams;

        this.type = undefined;      // string after assigned
        this.args = undefined;      // array after assigned: [ { name, type, value }, ... ]
        this.valObj = args

        if (!subsystem) {
            throw new Error('Unrecognized subsystem ' + subsys + ":" + cmd);
        }

        this.subsystem = subsystem;
        var metaSys = zmeta.Commands[this.subsys]
        if (!metaSys) {
            throw new Error('Unrecognized subsystem ' + subsys + ":" + cmd + " (" + this.subsys + ")");
        }
        command = metaSys.get(cmd);

        if (!command)
            throw new Error('Unrecognized command ' + subsys + ":" + cmd + " (" + this.subsys + ")");

        this.command = command

        this.type = zmeta.getType(this.subsys, this.cmd);

        if (!this.type)
            throw new Error(`Unrecognized type (for ${this.subsys}:${this.cmd})`);

        // if args is given, this is for REQ transmission
        // otherwise, maybe just for parsing RSP packet
        if (args)
            reqParams = zmeta.getReqParams(this.subsys, this.cmd);    // [ { name, type }, ... ]

        if (reqParams) {
            if (Array.isArray(args)) {
                // arg: { name, type } -> { name, type, value }
                reqParams.forEach(function (arg, idx) {
                    arg.value = args[idx];
                });
            } else if (typeof args === 'object') {
                reqParams.forEach(function (arg) {
                    if (args[arg.name] === undefined)
                        throw new Error(`The argument object at-least one missing property ${arg.name}`);

                    arg.value = args[arg.name];
                });
            }

            this.args = reqParams;              // [ { name, type, value }, ... ]
        }

        this._frameCache = null
    }

    get subsys() {
        return this.subsystem.key
    }
    get subsysId() {
        return this.subsystem.value
    }

    get cmd() {
        return this.command.key
    }
    get cmdId() {
        return this.command.value
    }

    toString(){
        let ret = `${this.subsys}:${this.cmd}`
        if(this.args){
            ret += ` (${JSON.stringify(this.args)})`
        }
        return ret
    }

    async parse(type, zBuf) {
        let chunkRules = [],
            rspParams,
            parser

        const metaParams = zmeta.getParams(this.subsys, this.cmd)
        if(!metaParams){
            throw new Error(`Unable to find meta data for ${this.subsys}:${this.cmd}`)
        }

        if (type === 'SRSP' || type === 3)      // SRSP
            rspParams = zmeta.cloneParamsWithNewFormat(metaParams.rsp)
        else if (type === 'AREQ' || type === 2) // AREQ
            rspParams = zmeta.cloneParamsWithNewFormat(metaParams.req)
        else
            throw new Error('Unrecognized type ' + type);


        if (!rspParams) {
            throw new Error('Response parameter definitions not found.');                // [ { name, type }, ... ]
        }

        for (const arg of rspParams) {
            let rule = ru[arg.type];
            if (!rule) {
                throw new Error('Parsing rule for ' + arg.type + ' is not found.');
            }

            rule = rule(arg.name, zBuf.length);
            chunkRules.push(rule);
        }

        if (chunkRules.length === 0) {
            return {};
        }

        parser = (new DChunks()).join(chunkRules).compile(OnceParser);

        let results = parser.process(zBuf)
        if (!results.length) {
            if(zBuf.length == 6 && metaParams.genericRsp){
                parser = (new DChunks()).join(GenericRspRules).compile(OnceParser);
                results = parser.process(zBuf)
            }
            if(!results.length){
                throw new Error(`Expected a single parsed message got ${results.length} from data ${zBuf.toString('hex')}`)
            }
        }
        return results[0]
    }

    _frame(){
        if (!Array.isArray(this.args))  // no args, cannot build frame
            return null;

        let dataBuf = Concentrate();

        for (let i = 0; i < this.args.length; i++) {
            const arg = this.args[i]

            let type = arg.type,
                val = arg.value;

            switch (type) {
                case "_preLenUint8":
                case "_preLenUint16": {
                    type = "u" + type.substr(8)
                    let postData
                    for (let f = i; f < this.args.length; f++) {
                        const a = this.args[f]
                        if (a.type == 'dynbuffer' || a.type == 'listbuffer') {
                            postData = a
                            break;
                        }
                    }
                    if (!postData) {
                        throw new Error("unable to find dynamic data portion")
                    }
                    if (val === undefined) {
                        val = postData.value.length
                    } else if (val != postData.value.length) {
                        throw new Error(`expected preLen ${val} to be equal to ${postData.value.length}`)
                    }
                }
                /* eslint-disable no-fallthrough */
                case 'int16':
                case 'uint8':
                case 'uint16':
                case 'uint32':
                /* eslint-enable no-fallthrough */
                    dataBuf = dataBuf[type](val);
                    break;
                case 'buffer':
                case 'dynbuffer':
                    dataBuf = dataBuf.buffer(Buffer.isBuffer(val) ? val : Buffer.from(val));
                    break;
                case 'longaddr': {    // string '0x00124b00019c2ee9'
                    const msb = parseInt(val.slice(0, 8), 16),
                        lsb = parseInt(val.slice(8), 16);

                    dataBuf = dataBuf.uint32le(lsb).uint32le(msb);
                    break;
                }
                case 'listbuffer': {  // [ 0x0001, 0x0002, 0x0003, ... ]
                    let tempBuf = Buffer.allocUnsafeSlow(val.length * 2)

                    for (let idxbuf = 0; idxbuf < val.length; idxbuf += 1) {
                        tempBuf.writeUInt16LE(val[idxbuf], idxbuf * 2);
                    }
                    dataBuf = dataBuf.buffer(tempBuf);
                    break;
                }
                default:
                    throw new Error('Unknown Data Type');
            }
        }

        return dataBuf.result();
    }

    frame() {
        if(!this._frameCache){
            this._frameCache = this._frame();
        }
        return this._frameCache
    }
}

/*************************************************************************************************/
/*** Add Parsing Rules to DChunks                                                              ***/
/*************************************************************************************************/
var rules = ['buffer8', 'buffer16', 'buffer18', 'buffer32', 'buffer42', 'buffer100',
    '_preLenUint8', '_preLenUint16'];

rules.forEach(function (ruName) {
    ru.clause(ruName, function (name) {
        var needTap = true,
            bufLen;

        if (ruName === '_preLenUint8') {
            this.uint8(name);
        } else if (ruName === '_preLenUint16') {
            this.uint16(name);
        } else {
            needTap = false;
            bufLen = parseInt(ruName.slice(6));
            this.buffer(name, bufLen);
        }

        if (needTap)
            this.tap(function () {
                this.buffer('preLenData', this.vars[name]);
            });
    });
});

ru.clause('longaddr', function (name) {
    this.buffer(name, 8).tap(function () {
        var addrBuf = this.vars[name];
        this.vars[name] = addrBuf2Str(addrBuf);
    });
});

ru.clause('uint8ZdoInd', function (name, bufLen) {
    if (bufLen === 3)
        this.uint16('nwkaddr').uint8(name);
    else if (bufLen === 1)
        this.uint8(name);
});

ru.clause('dynUint16a', function (name, bufLen) {
    this.buffer(name, bufLen).tap(function () {
        var buf = this.vars[name];
        this.vars[name] = bufToArray(buf, 'uint16');
    });
});

ru.clause('devlistbuffer', function (name, bufLen) {
    this.buffer(name, bufLen - 13).tap(function () {
        this.vars[name] = bufToArray(this.vars[name], 'uint16');
    });
});

ru.clause('nwklistbuffer', function (name, bufLen) {
    this.buffer(name, bufLen - 6).tap(function () {
        var buf = this.vars[name],
            list = [],
            listcount,
            getList,
            start = 0,
            end,
            len,
            i;

        if (name === 'networklist') {
            listcount = this.vars.networklistcount;
            end = len = 12;
            getList = networkList;
        } else if (name === 'neighborlqilist') {
            listcount = this.vars.neighborlqilistcount;
            end = len = 22;
            getList = neighborLqiList;
        } else if (name === 'routingtablelist') {
            listcount = this.vars.routingtablelistcount;
            end = len = 5;
            getList = routingTableList;
        } else if (name === 'energylist') {
            listcount = this.vars.energylistlistcount;
            end = len = 1;
            getList = energyList;
        } else {
            listcount = this.vars.bindingtablelistcount;
            this.vars[name] = bindTableList(buf, listcount);
            return;
        }

        for (i = 0; i < listcount; i += 1) {
            list.push(getList(buf.slice(start, end)));
            start = start + len;
            end = end + len;
        }

        this.vars[name] = list;
    });
});

ru.clause('zdomsgcb', function (name, bufLen) {
    this.buffer(name, bufLen - 9);
});

ru.clause('preLenList', function (name) {
    this.uint8(name).tap(function () {
        this.buffer('preLenData', 2 * (this.vars[name]));
    });
});

ru.clause('preLenBeaconlist', function (name) {
    this.uint8(name).tap(function () {
        this.buffer('preLenData', 21 * (this.vars[name])).tap(function () {
            var buf = this.vars.preLenData,
                list = [],
                len = 21,
                start = 0,
                end = 21,
                i;

            for (i = 0; i < this.vars[name]; i += 1) {
                list.push(beaconList(buf.slice(start, end)));
                start = start + len;
                end = end + len;
            }

            this.vars.preLenData = list;
        });
    });
});

ru.clause('dynbuffer', function (name) {
    this.tap(function () {
        this.vars[name] = this.vars.preLenData;
        delete this.vars.preLenData;
    });
});

function networkList(buf) {
    var item = {},
        i = 0;

    item.neightborPanId = buf.readUInt16LE(i);
    i += (2 + 6);
    item.logicalChannel = buf.readUInt8(i);
    i += 1;
    item.stackProfile = buf.readUInt8(i) & 0x0F;
    item.zigbeeVersion = (buf.readUInt8(i) & 0xF0) >> 4;
    i += 1;
    item.beaconOrder = buf.readUInt8(i) & 0x0F;
    item.superFrameOrder = (buf.readUInt8(i) & 0xF0) >> 4;
    i += 1;
    item.permitJoin = buf.readUInt8(i);
    i += 1;

    return item;
}

function neighborLqiList(buf) {
    var item = {},
        i = 0;

    item.extPandId = addrBuf2Str(buf.slice(0, 8));
    i += 8;
    item.extAddr = addrBuf2Str(buf.slice(8, 16));
    i += 8;
    item.nwkAddr = buf.readUInt16LE(i);
    i += 2;
    item.deviceType = buf.readUInt8(i) & 0x03;
    item.rxOnWhenIdle = (buf.readUInt8(i) & 0x0C) >> 2;
    item.relationship = (buf.readUInt8(i) & 0x70) >> 4;
    i += 1;
    item.permitJoin = buf.readUInt8(i) & 0x03;
    i += 1;
    item.depth = buf.readUInt8(i);
    i += 1;
    item.lqi = buf.readUInt8(i);
    i += 1;

    return item;
}

function energyList(buf) {
    return buf.readUInt8()
}

function routingTableList(buf) {
    var item = {},
        i = 0;

    item.destNwkAddr = buf.readUInt16LE(i);
    i += 2;
    item.routeStatus = buf[i] & 0x07;
    item.memoryConstrained = !!(buf[i] & 0x8);
    item.mto = !!(buf[i] & 0x10);
    item.routeRecordRequired = !!(buf[i] & 0x20);

    i += 1;
    item.nextHopNwkAddr = buf.readUInt16LE(i);
    i += 2;

    return item;
}

function bindTableList(buf, listcount) {
    var itemObj,
        list = [],
        len = 21,
        start = 0,
        end = len,
        i;

    function getList(buf) {
        var itemObj = {
            item: {},
            thisItemLen: 0
        },
            itemLen = 21,
            item = {},
            i = 0;

        item.srcAddr = addrBuf2Str(buf.slice(0, 8));
        i += 8;
        item.srcEp = buf.readUInt8(i);
        i += 1;
        item.clusterId = buf.readUInt16LE(i);
        i += 2;
        item.dstAddrMode = buf.readUInt8(i);
        i += 1;
        item.dstAddr = addrBuf2Str(buf.slice(12, 20));
        i += 8;

        if (item.dstAddrMode === 3) {  // 'Addr64Bit'
            item.dstEp = buf.readUInt8(i);
            i += 1;
        } else {
            itemLen = itemLen - 1;
        }

        itemObj.thisItemLen = itemLen;
        itemObj.item = item;
        return itemObj;
    }

    for (i = 0; i < listcount; i += 1) {
        itemObj = getList(buf.slice(start, end));
        list.push(itemObj.item);

        start = start + itemObj.thisItemLen;
        if (i === listcount - 2) {  // for the last item, we don't know the length of bytes
            end = buf.length;       // so, assign 'end' by the buf length to avoid memory leak.
        } else {
            end = start + len;      // for each item, take 21 bytes from buf to parse
        }
    }

    return list;
}

function beaconList(buf) {
    var item = {},
        i = 0;

    item.srcAddr = buf.readUInt16LE(i);
    i += 2;
    item.padId = buf.readUInt16LE(i);
    i += 2;
    item.logicalChannel = buf.readUInt8(i);
    i += 1;
    item.permitJoin = buf.readUInt8(i);
    i += 1;
    item.routerCapacity = buf.readUInt8(i);
    i += 1;
    item.deviceCapacity = buf.readUInt8(i);
    i += 1;
    item.protocolVersion = buf.readUInt8(i);
    i += 1;
    item.stackProfile = buf.readUInt8(i);
    i += 1;
    item.lqi = buf.readUInt8(i);
    i += 1;
    item.depth = buf.readUInt8(i);
    i += 1;
    item.updateId = buf.readUInt8(i);
    i += 1;
    item.extPandId = addrBuf2Str(buf.slice(13));
    i += 8;

    return item;
}

function addrBuf2Str(buf) {
    var bufLen = buf.length,
        val,
        strChunk = '';

    for (var i = 0; i < bufLen; i += 1) {
        val = buf.readUInt8(bufLen - i - 1);
        if (val <= 15) {
            strChunk += '0' + val.toString(16);
        } else {
            strChunk += val.toString(16);
        }
    }

    return strChunk;
}

function bufToArray(buf, nip) {
    var i,
        nipArr = [];
    if (nip === 'uint8') {
        for (i = 0; i < buf.length; i += 1) {
            nipArr.push(buf.readUInt8(i));
        }
    } else if (nip === 'uint16') {
        for (i = 0; i < buf.length; i += 2) {
            nipArr.push(buf.readUInt16LE(i));
        }
    }
    return nipArr;
}

module.exports = ZpiObject;
