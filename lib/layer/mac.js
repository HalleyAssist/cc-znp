var COMMON = require('./common'),
    MAC = require('./defs/mac.json');

MAC = Object.assign(MAC, {
    cmdStatus: COMMON.cmdStatus,
    capabInfoMask: COMMON.capabInfoMask,
    addressMode: COMMON.addressMode,
});

module.exports = MAC;
