var expect = require('chai').expect,
    Chance = require('chance'),
    chance = new Chance();

var Unpi = require('unpi'),
    DChunks = Unpi.DChunks,
    ru = DChunks.Rule;

var zmeta = require('../lib/zmeta'),
    ZpiObject = require('../lib/zpiObject');

ru.clause('listbuffer', function (name) {
    this.buffer(name, 2 * 3).tap(function () {
        this.vars[name] = bufToArray(this.vars[name]);
    });
});

describe('#.frame', async function () {
    for(const subsysObj of zmeta.Subsys.enums){
        let Subsys = subsysObj.key;

        if (Subsys === 'RES0' || Subsys === 'NWK') continue;

        for(const zpiObject of zmeta.Commands[Subsys].enums){
            let cmd = zpiObject.key,
            argObj,
            reqParams,
            payload,
            args = {};

            argObj = new ZpiObject(Subsys, cmd);
            argObj.parser = parser;

            if (argObj.type === 'SREQ') {
                reqParams = zmeta.getReqParams(Subsys, cmd);

                let preLen
                reqParams.forEach(function (arg) {
                    arg.value = randomArgForFrame(arg.type);
                    if(arg.type === 'dynbuffer' || arg.type === 'listbuffer'){
                        preLen = arg.value.length
                    }
                    args[arg.name] = arg.value;
                });
                if(preLen !== undefined){    
                    reqParams.forEach(function (arg) {
                        if(arg.type.startsWith('_preLen')){
                            args[arg.name] = preLen;
                        }
                    })
                }

                argObj.args = [...reqParams];

                it(argObj.cmd + ' framer check', async () => {
                    payload = argObj.frame();
                    const result = await argObj.parser(payload)
                    expect(argObj.args).to.eql(reqParams);
                    expect(result).to.eql(args);
                });
            }
        }
    }
});

function randomArgForFrame(type) {
    var testBuf,
        testArr,
        k;

    switch (type) {
        case 'uint8':
            return chance.integer({min: 0, max: 255});
        case 'uint16':
            return chance.integer({min: 0, max: 65535});
        case 'uint32':
            return chance.integer({min: 0, max: 4294967295});
        case 'buffer':
        case 'dynbuffer':
            testBuf = Buffer.alloc(6);
            for (k = 0; k < 6; k += 1) {
                testBuf[k] = chance.integer({min: 0, max: 255});
            }
            return testBuf;
        case 'longaddr':
            return '00124b00019c2ee9';
        case 'listbuffer':
            testArr = [];
            for (k = 0; k < 3; k += 1) {
                testArr[k] = '0x' + chance.integer({min: 0, max: 65535}).toString(16);
            }
            return testArr;
        default:
            break;
    }

    return;
}

async function parser(zBuf) {
    let chunkRules = [],
        err,
        rspParams,
        parser;

    rspParams = zmeta.getReqParams(this.subsys, this.cmd);

    if (rspParams) {    // [ { name, type }, ... ]
        rspParams.forEach(function (arg) {
            var rule = ru[arg.type];
            if (rule) {
                rule = rule(arg.name, 6);
                chunkRules.push(rule);
            } else {
                err = new Error('Parsing rule for ' + arg.type + ' is not found.');
            }
        });
    } else {
        err = new Error('Response parameter definitions not found.');
    }

    if (!err) {
        if (chunkRules.length === 0) {
            return {};
        }

        parser = (new DChunks()).join(chunkRules).compile();
    }

    if (!parser)    // error occurs, no parser created
        throw err
    else {
        for(const result of await parser.process(zBuf)){
            return result
        }
    }
}

function bufToArray(buf) {
    var nipArr = [],
        i;

    for (i = 0; i < buf.length; i += 2) {
        nipArr.push('0x' + buf.readUInt16LE(i).toString(16));
    }

    return nipArr;
}
