/* jshint node: true */
'use strict';

var zutils = {};

zutils.isBroadcast = function(nwkAddr){
    if(typeof nwkAddr === 'string'){
        if(nwkAddr.startsWith("0x")) nwkAddr = nwkAddr.substr(0,2)
        nwkAddr = parseInt(nwkAddr, 16)
    }
    return nwkAddr == 0xffff || nwkAddr == 0xfffd
}

zutils.toHexString = function (val, type) {
    var string,
        niplen = parseInt(type.slice(4)) / 4;

    string = val.toString(16);

    while (string.length !== niplen) {
        string = '0' + string;
    }

    return '0x' + string;
};

zutils.toLongAddrString = function (addr) {
    var longAddr;

    if (typeof addr === 'string')
        longAddr = (addr.startsWith('0x') || addr.startsWith('0X')) ? addr.slice(2, addr.length).toLowerCase() : addr.toLowerCase();
    else if (typeof addr === 'number')
        longAddr = addr.toString(16);
    else
        throw new TypeError('Address can only be a number or a string.');

    for (var i = longAddr.length; i < 16; i++) {
        longAddr = '0' + longAddr;
    }

    return '0x' + longAddr;
};

zutils.dotPath = function (path) {
    assert(typeof path === 'string', 'Input path should be a string.')

    path = path.replace(/\//g, '.');  // tranform slash notation into dot notation

    if (path[0] === '.')              // if the first char of topic is '.', take it off
        path = path.slice(1);

    if (path[path.length-1] === '.')  // if the last char of topic is '.', take it off
        path = path.slice(0, path.length - 1);

    return path;
};

zutils.buildPathValuePairs = function (rootPath, obj) {
    var result = {};
    rootPath = zutils.dotPath(rootPath);

    if (obj && typeof obj === 'object') {
        if (rootPath !== undefined && rootPath !== '' && rootPath !== '.' && rootPath !== '/')
            rootPath = rootPath + '.';

        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                var n = obj[key];

                if (n && typeof n === 'object')
                    result = Object.assign(result, zutils.buildPathValuePairs(rootPath + key, n));
                else
                    result[rootPath + key] = n;
            }
        }
    } else {
        result[rootPath] = obj;
    }

    return result;
};

module.exports = zutils;
