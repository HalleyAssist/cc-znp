const util = require('util'),
      ZMeta = require('./zmeta')

const logging = {}

logging.request = {
    AREQ: require('debug')('cc-znp:AREQ'),
    SREQ: require('debug')('cc-znp:SREQ'),
    SRSP: require('debug')('cc-znp:SRSP')
}

function inspectRaw(value){
    return util.inspect(value, {breakLength: Infinity, compact: true})
}

function formatHex(value){
    this.value = value
}
formatHex.prototype[util.inspect.custom] = function(){
    return "0x"+parseInt(this.object).toString(16)
}

function formatBuffer(value){
    this.value = value
}
formatBuffer.prototype[util.inspect.custom] = function(){
    let value = this.value
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

function valObjFormat(valObj, isRsp = false){
    var ret = undefined
    if(valObj.dstaddr){
        ret = ret?ret:Object.assign({}, valObj)
        ret.dstaddr = new formatHex(valObj.dstaddr)
    }
    if(valObj.srcaddr){
        ret = ret?ret:Object.assign({}, valObj)
        ret.srcaddr = new formatHex(valObj.srcaddr)
    }
    if(valObj.nwkaddr){
        ret = ret?ret:Object.assign({}, valObj)
        ret.nwkaddr = new formatHex(valObj.nwkaddr)
    }
    if(valObj.nwkaddrofinterest){
        ret = ret?ret:Object.assign({}, valObj)
        ret.nwkaddrofinterest = new formatHex(valObj.nwkaddrofinterest)
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