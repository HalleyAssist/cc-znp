var chai = require('chai'),
    expect = chai.expect,
    chaiAsPromised = require("chai-as-promised"),
    Q = require("@halleyassist/q-lite"),
    Unpi = require('../lib/unpi');  // unpi module


chai.use(chaiAsPromised);

describe('Arguments Testing', function() {
    var unpi = new Unpi()

    describe('#.send', function() {
        it('should be a function', function () {
            expect(unpi.send).to.be.instanceOf(Function);
        });

        describe('#Argument Type', function() {
            it('should throw if type is not a string or a number', async () => {
                await expect(Q.fcall(function () { return unpi.send(undefined, 1, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send(null, 1, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send([], 1, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send({}, 1, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send(NaN, 1, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send(true, 1, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send(function () {}, 1, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
            });

            it('should throw if type is not a string or a number', async () => {
                await expect(Q.fcall(function () { return unpi.send('AREQ', undefined, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', null, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', [], 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', {}, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', NaN, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', true, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', function () {}, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
            });

            it('should throw if cmdId is not a number', async () => {
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, '0', new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, undefined, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, null, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, NaN, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, [], new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, {}, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, true, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, function () {}, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(TypeError);
            });

            it('should throw if payload is given but not a buffer', async () => {
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 6, function () {}); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, 0); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, '0'); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, null); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, NaN); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, []); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, {}); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, true); })).to.eventually.be.rejectedWith(TypeError);
            });
        });

        describe('#Invalid argument - undefined', function() {
            it('should throw if bad cmdType', async () => {
                await expect(Q.fcall(function () { return unpi.send('AREQx', 1, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(Error);
                await expect(Q.fcall(function () { return unpi.send(100, 1, 0, new Buffer([ 0 ])); })).to.eventually.be.rejectedWith(Error);
            });
        });

        describe('#Valid argument', function() {
            it('should not throw if everthing is ok', async () => {
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, new Buffer([ 0 ])); })).not.to.eventually.be.rejectedWith(Error);
                await expect(Q.fcall(function () { return unpi.send('SRSP', 1, 0, new Buffer([ 0 ])); })).not.to.eventually.be.rejectedWith(Error);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, new Buffer([ 0, 1, 2, 3, 4 ])); })).not.to.eventually.be.rejectedWith(Error);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, new Buffer([ 1, 2, 3, 0 ])); })).not.to.eventually.be.rejectedWith(Error);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, new Buffer([ 0 ])); })).not.to.eventually.be.rejectedWith(Error);
                await expect(Q.fcall(function () { return unpi.send('AREQ', 1, 0, new Buffer([ 10, 20, 30 ])); })).not.to.eventually.be.rejectedWith(Error);
            });
        });

    });

    describe('#.receive', function() {
        describe('#.Argument type is not a buffer', function() {
            it('should throw if buf is not a buffer', async () => {
                await expect(Q.fcall(function () { return unpi.receive([]); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.receive({}); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.receive('xxx'); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.receive(true); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.receive(new Date()); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.receive(NaN); })).to.eventually.be.rejectedWith(TypeError);
                await expect(Q.fcall(function () { return unpi.receive(function () {}); })).to.eventually.be.rejectedWith(TypeError);
            });

            it('should not throw if buf is undefined', async () => {
                await expect(Q.fcall(function () { return unpi.receive(); })).not.to.eventually.be.rejectedWith(Error);
                await expect(Q.fcall(function () { return unpi.receive(undefined); })).not.to.eventually.be.rejectedWith(Error);
            });

            it('should not throw if buf is null', async () => {
                await expect(Q.fcall(function () { return unpi.receive(null); })).not.to.eventually.be.rejectedWith(Error);
            });
        });
    });
});

describe('Functional Testing', function() {
    var unpi = new Unpi();
    var sapiStartReqBuf = new Buffer([ 0xfe, 0x00, 0x26, 0x00, 0x26 ]),
        sapiStartRspBuf = new Buffer([ 0xfe, 0x00, 0x66, 0x00, 0x66 ]);

    describe('#.send', function() {
        describe('#.compiled buffer', function() {
            it('should equal to a buffer as expected sapiStartReqBuf', async () => {
                expect(await unpi.send('SREQ', 6, 0, new Buffer(0))).to.deep.equal(sapiStartReqBuf);
            });

            it('should equal to a buffer as expected sapiStartReqBuf + payload', async () => {
                expect(await unpi.send('SREQ', 6, 0, new Buffer([ 0, 1, 2 ]))).to.deep.equal(new Buffer([ 0xfe, 0x03, 0x26, 0x00, 0x00, 0x01, 0x02, 0x26 ]));
            });

            it('should equal to a buffer as expected sapiStartRspBuf', async () => {
                expect(await unpi.send('SRSP', 6, 0, new Buffer(0))).to.deep.equal(sapiStartRspBuf);
            });
        });
    });

    describe('#.receive', function() {
        describe('#.parse buffer', function() {
            it('should equal to a parsed result as expected sapiStartReqBuf', function (done) {
                unpi.once('data', function (data) {
                    expect(data).to.deep.equal({
                      cmd: 0, csum: 38, fcs: 38, len: 0,
                      payload: new Buffer(0),
                      sof: 254, subsys: 6, type: 1
                    });
                    done();
                });
                unpi.receive(sapiStartReqBuf);
            });

            it('should equal to a parsed result as expected sapiStartRspBuf', function (done) {
                unpi.once('data', function (data) {
                    expect(data).to.deep.equal({
                      cmd: 0, csum: 102, fcs: 102, len: 0,
                      payload: new Buffer(0),
                      sof: 254, subsys: 6, type: 3
                    });
                    done();
                });
                unpi.receive(sapiStartRspBuf);
            });

            it('should equal to a parsed result as expected sapiStartReqBuf + payload', function (done) {
                unpi.once('data', function (data) {
                    expect(data).to.deep.equal({
                      cmd: 0, csum: 38, fcs: 38, len: 3,
                      payload: new Buffer([ 0x00, 0x01, 0x02 ]),
                      sof: 254, subsys: 6, type: 1
                    });
                    done();
                });
                unpi.receive(new Buffer([ 0xfe, 0x03, 0x26, 0x00, 0x00, 0x01, 0x02, 0x26 ]));
            });

            it('should equal to a parsed result as expected sapiStartReqBuf + payload', function (done) {
                unpi.once('data', function (data) {
                    expect(data).to.deep.equal({
                      cmd: 0, csum: 102, fcs: 102, len: 3,
                      payload: new Buffer([ 0x00, 0x01, 0x02 ]),
                      sof: 254, subsys: 6, type: 3
                    });
                    done();
                });
                unpi.receive(new Buffer([ 0xfe, 0x03, 0x66, 0x00, 0x00, 0x01, 0x02, 0x66 ]));
            });
        });
    });
});

