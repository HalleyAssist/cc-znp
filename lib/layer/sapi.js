var COMMON = require('./common'),
    SAPI = require('./defs/sapi.json');

SAPI = Object.assign(SAPI, {
    cmdStatus: COMMON.cmdStatus
});

module.exports = SAPI;
