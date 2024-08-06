var COMMON = require('./common'),
    ZDO = require('./defs/zdo.json');

ZDO = Object.assign(ZDO, {
    cmdStatus: COMMON.cmdStatus,
    capabInfoMask: COMMON.capabInfoMask,
    devStates: COMMON.devStates,
});

module.exports = ZDO;
