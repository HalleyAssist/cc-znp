const util = require('util'),
      ZMeta = require('./zmeta'),
      Constants = require('./constants'),
      nvItem = require('./defs/nvItems')

const logging = {}

logging.request = {
    AREQ: require('debug')('cc-znp:AREQ'),
    SREQ: require('debug')('cc-znp:SREQ'),
    SRSP: require('debug')('cc-znp:SRSP')
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
    const ret = `\"${value.toString('ascii')}\"`
    if(value.length <= 4){
        return `${ret} (0x${value.toString('hex')})`
    }
    return ret
}

const afMap = {}
const hexFields = ['dstaddr','srcaddr','nwkaddrofinterest','nwkaddr',"parentaddr"]
function valObjFormat(valObj, subsys, cmd, isRsp = false){
    var ret = undefined
    if(subsys === "AF"){
        if(cmd === 'dataRequest'){
            if(valObj.options){
                ret = ret?ret:Object.assign({}, valObj)
                ret.options = new afOptions(valObj.options);
            }
            if(valObj.trans){
                ret = ret?ret:Object.assign({}, valObj)
                if(process.env.NODE_ENV !== 'production'){
                    afMap[valObj.trans] = ret
                }
            }
        }
        if(process.env.NODE_ENV !== 'production'){
            if(cmd === 'dataConfirm' && valObj.trans && afMap[valObj.trans]){
                ret = ret?ret:Object.assign({}, valObj)
                ret._ref = afMap[valObj.trans]
                delete afMap[valObj.trans]
            }
        }
    } else if(subsys === "NWK"){
        if(cmd === 'rtg'){
            ret = ret?ret:Object.assign({}, valObj)
            if(valObj.options){
                ret.options = new rtgOptions(valObj.options);
            }
            ret.rtstatus = new enumLookup(valObj.rtstatus, rtgStatusLookup)
        }
    }
    if(subsys === 'SYS' && valObj.id){
        if(cmd === 'osalNvRead' || cmd === 'osalNvWrite' || cmd === 'osalNvReadExt' || cmd === 'osalNvWriteExt'){
            ret = ret?ret:Object.assign({}, valObj)
            ret.id = new enumLookup(valObj.id, nvLookup)
        }
    }
    for(const field of hexFields){
        const v = valObj[field]
        if(v){
            ret = ret?ret:Object.assign({}, valObj)
            ret[field] = new formatHex(v)
        }
    }
    for(let i in valObj){
        const v = valObj[i]
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
    
    return inspectRaw(ret)
}

logging.valObjFormat = valObjFormat

module.exports = logging
