var COMMON = require('./common'),
    SYS = require('./defs/sys.json');

SYS = Object.assign(SYS, {
    cmdStatus: COMMON.cmdStatus,
});

module.exports = SYS;
