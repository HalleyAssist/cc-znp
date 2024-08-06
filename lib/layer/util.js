var COMMON = require('./common'),
    UTIL = require('./defs/util.json');

UTIL = Object.assign(UTIL, {
    cmdStatus: COMMON.cmdStatus,
    devStates: COMMON.devStates,
    addressMode: COMMON.addressMode
});

module.exports = UTIL;
