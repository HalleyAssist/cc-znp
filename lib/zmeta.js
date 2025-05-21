/* jshint node: true */
'use strict';

var Enum = require('light-enum');

var zpiMeta = require('./defs/zpi_meta.json'),
    zmtDefs = require('./defs/zmt_defs.json');

var zmeta = {
    CmdType: new Enum(zmtDefs.CmdType),
    Subsys: new Enum(zmtDefs.Subsys),
    ParamType: new Enum(zmtDefs.ParamType),
    ErrorCodes: new Enum(zmtDefs.ErrorCodes),
    Commands: {}
}

for(var i in zpiMeta){
    let subsys = zpiMeta[i]
    zmeta.Commands[i] = new Enum(subsys, function(a){return a.cmdId})
}

zmtDefs = null;

zmeta.getSubsystems = function(){
    return Object.keys(zpiMeta)
}

zmeta.get = function (subsys, cmd) {
    var meta = zpiMeta[subsys];
    return meta ? meta[cmd] : undefined;
    // return: {
    //  type,
    //  cmdId,
    //  params:
    //      {
    //          req: [ { name: type }, ... ],
    //          rsp: [ { name: type }, ... ]
    //      }
    // }
}

zmeta.getType = function (subsys, cmd) {
    var meta = this.get(subsys, cmd);

    if (meta)
        meta = this.CmdType.get(meta.type);

    return meta ? meta.key : undefined;     // return: "POLL", "SREQ", "AREQ", "SRSP"
}

zmeta.getParams = function (subsys, cmdName) {
    var meta = zmeta.get(subsys, cmdName);
    return meta ? meta.params : null;
}

zmeta.getReqParams = function (subsys, cmd) {
    var meta = zmeta.getParams(subsys, cmd),
        params = meta ? meta.req : null;    // [ { name: type }, .... ]

    if (!params) return []
    
    return zmeta.cloneParamsWithNewFormat(params);
}


zmeta.getRspParams = function (subsys, cmd) {
    var meta = zmeta.getParams(subsys, cmd),
        params = meta ? meta.rsp : null;    // [ { name: type }, .... ]

    if (!params) return []
    
    return zmeta.cloneParamsWithNewFormat(params);
}

zmeta.cloneParamsWithNewFormat = function (params) {
    var output = [];

    for(let i = 0; i < params.length; i+=2){
        let type = params[i+1]        
        const t = zmeta.ParamType.get(type);   // enum | undefined
        if(t) type = t.key;    // item.type is a string
        output.push({ name: params[i], type });
    }

    return output;
}

module.exports = zmeta