const util = require('util')

const logging = {}

logging.request = {
    AREQ: require('debug')('cc-znp:AREQ'),
    SREQ: require('debug')('cc-znp:SREQ'),
    SRSP: require('debug')('cc-znp:SRSP')
}



function formatHex(value){
    this.output = "0x"+parseInt(value).toString(16)
}
formatHex.prototype[util.inspect.custom] = function(){
    return this.output
}

function valObjFormat(valObj){
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
    return ret ? ret : valObj
}

logging.valObjFormat = valObjFormat

module.exports = logging