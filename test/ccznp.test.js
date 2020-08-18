var expect = require('chai').expect,
    assert = require('chai').assert,
    CCZnp = require('../index'),
    SerialPort = require('@serialport/stream'),
    MockBinding = require('@serialport/binding-mock'),
    ZpiObject = require('../lib/zpiObject'),
    Q = require('q-lite')

var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

SerialPort.Binding = MockBinding

var ccznp

describe('Signature Check', function () {
    before('ccznp.init(spCfg[, callback])', async function () {
        const p = MockBinding.createPort('/dev/ROBOT', { echo: true, record: true  })
        const port = new SerialPort('/dev/ROBOT')
        //await Q.ninvoke(port, 'open')
        await Q.delay(10)
        while(port.opening){
            await Q.delay(10)
        }
        ccznp = new CCZnp(port);
        await ccznp.start(false)
    });

    it('ccznp.request(subsys, cmdId, valObj, callback)', async function () {
        ccznp._init = true;

        function request(...args){
            return Q.fcall(async function () { return ccznp.request(...args) })
        }

        ccznp.spinLock = false;
        await expect(request({}, 'ping', [], function () {})).to.eventually.be.rejectedWith(/Unrecognized subsystem/);
        ccznp.spinLock = false;
        await expect(request([], 'ping', [], function () {})).to.eventually.be.rejectedWith(/Unrecognized subsystem/);
        ccznp.spinLock = false;
        await expect(request('xxx', 'ping', [], function () {})).to.eventually.be.rejectedWith(/Unrecognized subsystem/);
        ccznp.spinLock = false;
        await expect(request(123, 'ping', [], function () {})).to.eventually.be.rejectedWith(/Unrecognized subsystem/);
        ccznp.spinLock = false;
        await expect(request(false, 'ping', [], function () {})).to.eventually.be.rejectedWith(/Unrecognized subsystem/);
        ccznp.spinLock = false;
        await expect(request(undefined, 'ping', [], function () {})).to.eventually.be.rejectedWith(/Unrecognized subsystem/);
        ccznp.spinLock = false;
        await expect(request(null, 'ping', [], function () {})).to.eventually.be.rejectedWith(/Unrecognized subsystem/);

        ccznp.spinLock = false;
        await expect(request('SYS', {}, [], function () {})).to.eventually.be.rejectedWith(/Unrecognized command/);
        ccznp.spinLock = false;
        await expect(request('SYS', [], [], function () {})).to.eventually.be.rejectedWith(/Unrecognized command/);
        ccznp.spinLock = false;
        await expect(request('SYS', 'xxx', [], function () {})).to.eventually.be.rejectedWith(/Unrecognized command/);
        ccznp.spinLock = false;
        await expect(request('SYS', 123, [], function () {})).to.eventually.be.rejectedWith(/Unrecognized command/);
        ccznp.spinLock = false;
        await expect(request('SYS', false, [], function () {})).to.eventually.be.rejectedWith(/Unrecognized command/);
        ccznp.spinLock = false;
        await expect(request('SYS', undefined, [], function () {})).to.eventually.be.rejectedWith(/Unrecognized command/);
        ccznp.spinLock = false;
        await expect(request('SYS', null, [], function () {})).to.eventually.be.rejectedWith(/Unrecognized command/);
/*
        ccznp.spinLock = false;
        await expect(request('SYS', 'ping', 'xxx', function () {})).to.eventually.be.rejectedWith('valObj should be an object');
        ccznp.spinLock = false;
        await expect(request('SYS', 'ping', 123, function () {})).to.eventually.be.rejectedWith('valObj should be an object');
        ccznp.spinLock = false;
        await expect(request('SYS', 'ping', false, function () {})).to.eventually.be.rejectedWith('valObj should be an object');
        ccznp.spinLock = false;
        await expect(request('SYS', 'ping', undefined, function () {})).to.eventually.be.rejectedWith('valObj should be an object');
        ccznp.spinLock = false;
        await expect(request('SYS', 'ping', null, function () {})).to.eventually.be.rejectedWith('valObj should be an object');
*/
    });
});

describe('Functional Check', function () {
    let mockEndpoint
    before(function () {
        mockEndpoint = MockBinding.createPort('/dev/ROBOT', { echo: true, record: true  })
    });
    this.timeout(2000);
    it('basic operation', async function(){
        const port = new SerialPort('/dev/ROBOT')
        //await Q.ninvoke(port, 'open')
        await Q.delay(10)
        while(port.opening){
            await Q.delay(10)
        }
        ccznp = new CCZnp(port);
        await ccznp.start(false)
        let found = false
        ccznp.on('AREQ', d=>found = true)
        await port.binding.emitData(new Buffer([ 0xfe, 0x00, 0x46, 0x00, 0x46 ]))
        await Q.delay(10)
        expect(found).to.be.true
        found = false
        await ccznp.close()
        await port.binding.emitData(new Buffer([ 0xfe, 0x00, 0x46, 0x00, 0x46 ]))
        await Q.delay(10)
        expect(found).to.be.false

        await ccznp.start(false)
    })
    it('ccznp.request() - timeout', async function () {
        this.timeout(7000)
        ccznp._communicator.unpi.send = function () {};
        await expect(ccznp.request('SYS', 'ping', {})).to.eventually.be.rejectedWith(/Timeout/);
        expect(ccznp.spinLock == true).to.be.false
    });

    it('ccznp.request()', async function () {
        var rsp = {payload:{status: 0}, type: 'SRSP', subsys: "SYS", cmd: "ping"};
        ccznp._communicator.unpi.send = function () {};
        let result = ccznp.request('SYS', 'ping', {});
        await Q.delay(1)
        await ccznp._communicator.receive(rsp);
        result = await result
        assert(!ccznp.spinLock, "spinlock should be reset")
        assert(result == rsp.payload)
    });

    it('event: data', async function () {
        var data = { sof: 254, len: 9, type: 3, subsys: 1, cmd: 2, payload: Buffer.from([0, 1, 2, 3, 4, 0, 0, 0, 0]), fcs: 100, csum: 100 }

        const zpi = new ZpiObject(1, 2)
        const payload = await zpi.parse(data.type, data.payload);
        zpi.valObj = payload
        const deferred = Q.defer()
        ccznp._communicator.addPending(zpi, deferred)
        const parseResult = await ccznp._parseMtIncomingData(data);
        expect(parseResult).to.be.true
        const result = await deferred.promise
        var flag = true,
            parsedResult = {
                transportrev: 0,
                product: 1,
                majorrel: 2,
                minorrel: 3,
                maintrel: 4,
                revision: 0
            };

        for (var key in result) {
            if (parsedResult[key] !== result[key])
                flag = false;
        }

        assert(flag)
    });

    it('event: AREQ', function (done) {
        var data = { sof: 254, len: 3, type: 2, subsys: 4, cmd: 128, payload: Buffer.from([0, 8, 30]), fcs: 100, csum: 100 }
        ccznp.on('AREQ', function (result) {
            var flag = true,
                parsedResult = {
                subsys: 'AF',
                ind: 'dataConfirm',
                data: {
                    status: 0,
                    endpoint: 8,
                    transid: 30
                }
            };

            for (var key in parsedResult) {
                if (key !== 'data' && parsedResult[key] !== result[key])
                    flag = false;
            }

            for (var field in parsedResult.data) {
                if ( parsedResult.data[key] !== result.data[key])
                    flag = false;
            }

            if (flag)
                done();
        });

        ccznp._communicator.unpi.emit('data', data);
    });
});