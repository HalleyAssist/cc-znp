const util = require('util'),
      ZMeta = require('./zmeta'),
      Constants = require('./constants'),
      nvItem = require('./defs/nvItems')

const logging = {}

logging.request = {
    AREQ: require('debug')('cc-znp:AREQ'),
    SREQ: require('debug')('cc-znp:SREQ'),
    SRSP: require('debug')('cc-znp:SRSP'),
    Unknown: require('debug')('cc-znp:Unknown')
}

const nvLookup = {}
for(const k in nvItem){
    nvLookup[nvItem[k]] = k
}
const rtgStatusLookup = {}
for(const k in Constants.NWK.rtgStatus){
    rtgStatusLookup[Constants.NWK.rtgStatus[k]] = k
}

function inspectRaw(value){
    return util.inspect(value, {breakLength: Infinity, compact: true})
}

function afOptions(value){
    this.value = value
}
afOptions.prototype[util.inspect.custom] = function(){
    const ret = []
    
    const afOptions =  Constants.AF.options
    for(let k in afOptions){
        if(this.value & afOptions[k]){
            ret.push(k)
        }
    }
    return `(${ret.join("|")})`
}
function rtgOptions(value){
    this.value = value
}
rtgOptions.prototype[util.inspect.custom] = function(){
    const ret = []
    
    const rtgOptions =  Constants.NWK.rtgOptions
    for(let k in rtgOptions){
        if(this.value & rtgOptions[k]){
            ret.push(k)
        }
    }
    return `(${ret.join("|")})`
}

function enumLookup(id, table){
    this.id = id
    this.table = table
}
enumLookup.prototype[util.inspect.custom] = function(){
    const nvt = this.table[this.id]
    return nvt ? nvt : this.id
}

function srcRtgHops(value, reverse = false){
    this.value = value
    this.reverse = reverse
}
srcRtgHops.prototype[util.inspect.custom] = function(){
    let ret
    if(Array.isArray(this.value)){
        ret = new Array(this.value.length)
        for(let i=0;i<ret.length;i++){
            ret[i] = "0x"+this.value[i].toString(16)
        }
    }else{
        ret = new Array(this.value.length / 2)
        for(let i=0;i<ret.length;i++){
            ret[i] = "0x"+this.value.readUInt16LE(i * 2).toString(16)
        }
    }
    if(this.reverse){
        ret.reverse()
    }
    return "["+ret.join("->")+"]"
}


function nwkAddrs(value){
    this.value = value
}
nwkAddrs.prototype[util.inspect.custom] = function(){
    let ret
    if(Array.isArray(this.value)){
        ret = new Array(this.value.length)
        for(let i=0;i<ret.length;i++){
            ret[i] = "0x"+this.value[i].toString(16)
        }
    }else{
        ret = new Array(this.value.length / 2)
        for(let i=0;i<ret.length;i++){
            ret[i] = "0x"+this.value.readUInt16LE(i * 2).toString(16)
        }
    }
    return "["+ret.join(",")+"]"
}

function formatList(value){
    this.value = value
}
formatList.prototype[util.inspect.custom] = function(){
    const ret = new Array(this.value.length)
    for(let i=0;i<ret.length;i++){
        ret[i] = this.value[i]
    }
    return "["+this.value.join(",")+"]"
}

function formatHex(value){
    this.value = value
}
formatHex.prototype[util.inspect.custom] = function(){
    return "0x"+parseInt(this.value).toString(16)
}

function formatBuffer(value){
    this.value = value
}
formatBuffer.prototype[util.inspect.custom] = function(){
    let value = this.value
    if(value.length === 0) return '<>'
    let nonAscii = false
    for(let i = 0; i<value.length; i++){
        const v = value[i]
        if(v <= 31 || v >= 127){
            nonAscii = true
            break
        }
    }
    if(nonAscii){
        value = inspectRaw(value)
        const m = value.match(/^<Buffer@0x[0-9a-f]+(.*)>$/)
        if(!m) {
            return value
        }
        return `<${m[1].toString().trim()}>`
    }
    const ret = `"${value.toString('ascii')}"`
    if(value.length <= 4){
        return `${ret} (0x${value.toString('hex')})`
    }
    return ret
}


function formatRaw(value){
    this.value = value
}
formatRaw.prototype[util.inspect.custom] = function(){
    return this.value
}

const afMap = []

const hexFields = ['dstaddr','srcaddr','nwkaddrofinterest','nwkaddr',"parentaddr"]
function valObjFormat(valObj, subsys, cmd, isRsp = false){
    var ret = undefined
    if(subsys === "AF"){
        if(cmd === 'dataRequest' || cmd === 'dataRequestSrcRtg'){
            if(valObj.options){
                ret = ret?ret:Object.assign({}, valObj)
                ret.options = new afOptions(valObj.options);
            }
            if(valObj.trans){
                ret = ret?ret:Object.assign({}, valObj)
            }
            if(cmd === 'dataRequestSrcRtg' && !isRsp){
                ret = ret?ret:Object.assign({}, valObj)
                ret.relaylist = new srcRtgHops(valObj.relaylist, true)
                delete ret.relaycount
            }
        }
        if(process.env.NODE_ENV !== 'production'){
            if(cmd === 'dataConfirm' && valObj.trans){
                const afReq = afMap[valObj.trans % 64]
                if(afReq.id == valObj.trans){
                    ret = ret?ret:Object.assign({}, valObj)
                    ret._ref = new formatRaw(afReq.str)
                    delete afMap[valObj.trans % 64]
                }
            }
        }
    } else if(subsys === "NWK"){
        if(cmd === 'rtg' && isRsp){
            ret = ret?ret:Object.assign({}, valObj)
            ret.options = new rtgOptions(valObj.options);
            ret.nextHop = new formatHex(valObj.nextHop)
            ret.rtstatus = new enumLookup(valObj.rtstatus, rtgStatusLookup)
        } else if(cmd === 'pollInd' && isRsp){
            ret = ret?ret:Object.assign({}, valObj)
            ret.nwkaddrs = new nwkAddrs(valObj.nwkaddrs)
        }
    } else if(subsys === 'ZDO'){
        if(cmd === 'srcRtgInd'){
            ret = ret?ret:Object.assign({}, valObj)
            ret.relaylist = new srcRtgHops(valObj.relaylist)
            delete ret.relaycount
        } else if(cmd === 'activeEpRsp'){
            ret = ret?ret:Object.assign({}, valObj)
            ret.activeeplist = new formatList(valObj.activeeplist)
            delete ret.activeepcount
        }
    }
    if(subsys === 'SYS' && valObj.id){
        if(cmd === 'osalNvRead' || cmd === 'osalNvWrite' || cmd === 'osalNvReadExt' || cmd === 'osalNvWriteExt'){
            ret = ret?ret:Object.assign({}, valObj)
            ret.id = new enumLookup(valObj.id, nvLookup)
        }
    }
    
    for(const field of hexFields){
        const v = (ret || valObj)[field]
        if(v){
            ret = ret?ret:Object.assign({}, valObj)
            ret[field] = new formatHex(v)
        }
    }

    for(let i in valObj){
        const v = (ret || valObj)[i]
        if(Buffer.isBuffer(v)){
            ret = ret?ret:Object.assign({}, valObj)
            ret[i] = new formatBuffer(v)
        }
    }

    if(isRsp && valObj.status !== undefined){
        const statusStr = ZMeta.ErrorCodes.get(valObj.status)
        if(statusStr){
            ret = ret?ret:Object.assign({}, valObj)
            delete ret.status
            if(Object.keys(ret).length === 0){
                return statusStr.key
            }
            return statusStr.key + ' ' + inspectRaw(ret)
        }
    }
    
    if(!ret) ret = valObj
    
    ret = inspectRaw(ret)

    // for _ref in dataConfirm
    if(process.env.NODE_ENV !== 'production'){ 
        if(subsys === "AF" && (cmd === 'dataRequest' || cmd === 'dataRequestSrcRtg')){
            afMap[valObj.trans%64] = {str: ret, id: valObj.trans}
        }
    }

    return ret
}

logging.valObjFormat = valObjFormat

module.exports = logging
