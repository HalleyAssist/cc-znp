var expect = require('chai').expect,
    CCZnp = require('../index'),
    SerialPort = require('@serialport/stream'),
    MockBinding = require('@serialport/binding-mock'),
    Q = require('q')

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
        await ccznp.start()
    });

    it('ccznp.request(subsys, cmdId, valObj, callback)', function () {
        ccznp._init = true;

        ccznp._spinLock = false;
        expect(function () { ccznp.request({}, 'ping', [], function () {}); }).to.throw('Unrecognized subsystem');
        ccznp._spinLock = false;
        expect(function () { ccznp.request([], 'ping', [], function () {}); }).to.throw('Unrecognized subsystem');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('xxx', 'ping', [], function () {}); }).to.throw('Unrecognized subsystem');
        ccznp._spinLock = false;
        expect(function () { ccznp.request(123, 'ping', [], function () {}); }).to.throw('Unrecognized subsystem');
        ccznp._spinLock = false;
        expect(function () { ccznp.request(false, 'ping', [], function () {}); }).to.throw('Unrecognized subsystem');
        ccznp._spinLock = false;
        expect(function () { ccznp.request(undefined, 'ping', [], function () {}); }).to.throw('Unrecognized subsystem');
        ccznp._spinLock = false;
        expect(function () { ccznp.request(null, 'ping', [], function () {}); }).to.throw('Unrecognized subsystem');

        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', {}, [], function () {}); }).to.throw('Unrecognized command');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', [], [], function () {}); }).to.throw('Unrecognized command');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'xxx', [], function () {}); }).to.throw('Unrecognized command');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 123, [], function () {}); }).to.throw('Unrecognized command');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', false, [], function () {}); }).to.throw('Unrecognized command');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', undefined, [], function () {}); }).to.throw('Unrecognized command');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', null, [], function () {}); }).to.throw('Unrecognized command');

        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', 'xxx', function () {}); }).to.throw('valObj should be an object');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', 123, function () {}); }).to.throw('valObj should be an object');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', false, function () {}); }).to.throw('valObj should be an object');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', undefined, function () {}); }).to.throw('valObj should be an object');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', null, function () {}); }).to.throw('valObj should be an object');

        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', [], {}); }).to.throw('callback should be a function');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', [], []); }).to.throw('callback should be a function');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', [], 'xxx'); }).to.throw('callback should be a function');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', [], 123); }).to.throw('callback should be a function');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', [], false); }).to.throw('callback should be a function');
        ccznp._spinLock = false;
        expect(function () { ccznp.request('SYS', 'ping', [], null); }).to.throw('callback should be a function');
        ccznp._spinLock = false;
    });
});

describe('Functional Check', function () {
    this.timeout(5000);
    it('ccznp.request() - timeout', function (done) {
        ccznp._unpi.send = function () {};
        ccznp.request('SYS', 'ping', {}, function (err, result) {
            if (err.message === 'request timeout')
                done();
        });
    });

    it('ccznp.request()', function (done) {
        var rsp = {status: 0};
        ccznp._communicator.unpi.send = function () {};
        ccznp.request('SYS', 'ping', {}, function (err, result) {
            if (err)
                console.log(err);
            else if (result === rsp && ccznp._spinLock === false) 
                done();
        });
        ccznp.emit('SRSP:SYS:ping', rsp);
    });

    it('event: data', function (done) {
        var data = { sof: 254, len: 5, type: 3, subsys: 1, cmd: 2, payload: new Buffer([0, 1, 2, 3, 4, 0, 0, 0, 0]), fcs: 100, csum: 100 },
            dataEvtFlag = false;

        ccznp.on('data', function (msg) {
            if (msg === data)
                dataEvtFlag = true;
        });
        ccznp.on('SRSP:SYS:version', function (result) {
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

            if (dataEvtFlag && flag)
                done();
        });
        ccznp._communicator.unpi.emit('data', data);
    });

    it('event: AREQ', function (done) {
        var data = { sof: 254, len: 3, type: 2, subsys: 4, cmd: 128, payload: new Buffer([0, 8, 30]), fcs: 100, csum: 100 },
            dataEvtFlag = false;

        ccznp.on('data', function (msg) {
            if (msg === data)
                dataEvtFlag = true;
        });

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

            for (var key in result) {
                if (key !== 'data' && parsedResult[key] !== result[key])
                    flag = false;
            }

            for (var field in result[data]) {
                if ( parsedResult.data[key] !== result.data[key])
                    flag = false;
            }

            if (dataEvtFlag && flag)
                done();
        });

        ccznp._communicator.unpi.emit('data', data);
    });
});