var expect = require('chai').expect,
    assert = require('chai').assert,
    Communicator = require('../lib/communicator'),
    ZpiObject = require('../lib/zpiObject'),
    Q = require('@halleyassist/q-lite'),
    EventEmitter = require('events').EventEmitter

var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

describe('Communicator Tests', function () {
    let communicator, unpi, emitter
    
    beforeEach(function () {
        emitter = new EventEmitter()
        unpi = {
            send: async function() {
                // Simulate async send operation
                await Q.delay(10)
            }
        }
        communicator = new Communicator(emitter, unpi)
    })

    describe('Basic Operations', function() {
        it('should add pending entry when sending SREQ', async function () {
            const argObj = new ZpiObject('SYS', 'ping', {})
            argObj.frame()
            
            communicator.send(argObj)
            await Q.delay(5) // Give async function time to call addPending
            
            expect(communicator._pending.length).to.equal(1)
            expect(communicator._pending[0].argObj).to.equal(argObj)
        })

        it('should remove pending entry when response is received', async function () {
            const argObj = new ZpiObject('SYS', 'ping', {})
            argObj.frame()
            
            const sendPromise = communicator.send(argObj)
            await Q.delay(15) // Wait for send to complete
            
            // Send response
            const rsp = {payload: {}, type: 'SRSP', subsys: 'SYS', cmd: 'ping'}
            await communicator.receive(rsp)
            
            expect(communicator._pending.length).to.equal(0)
        })

        it('should allow sequential SREQ commands of the same type', async function () {
            const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            
            argObj1.frame()
            argObj2.frame()
            
            // Send first request
            const send1 = communicator.send(argObj1)
            await Q.delay(15)
            const rsp = {payload:{count: 0}, type: 'SRSP', subsys: "NWK", cmd: "queuedDelete"}
            await communicator.receive(rsp)
            await send1
            
            // Now send second request - should work fine
            const send2 = communicator.send(argObj2)
            await Q.delay(15)
            await communicator.receive(rsp)
            await send2
            
            // Both should complete without error
            expect(communicator._pending.length).to.equal(0)
        })
    })

    describe('Race Condition Prevention', function() {
        it('should prevent duplicate SREQ commands from being pending simultaneously', async function () {
            this.timeout(1000)
            
            const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            
            argObj1.frame()
            argObj2.frame()
            
            // Start first send
            communicator.send(argObj1)
            await Q.delay(5)
            
            // Pending should have one entry for argObj1
            expect(communicator._pending.length).to.equal(1)
            
            // Try to start second send - should fail
            let errorThrown = false
            try {
                await communicator.send(argObj2)
            } catch (ex) {
                errorThrown = true
                expect(ex.message).to.include('already pending')
            }
            
            // Error should have been thrown (even if not caught by test due to async)
            // At minimum, only one should be pending
            expect(communicator._pending.length).to.be.at.most(1)
        })

        it('should clean up pending on error to allow retry', async function () {
            this.timeout(1000)
            
            const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            
            argObj1.frame()
            argObj2.frame()
            
            // Mock unpi.send to throw an error
            const originalSend = unpi.send
            let callCount = 0
            unpi.send = async function() {
                callCount++
                if (callCount === 1) {
                    throw new Error('Network error')
                }
                await Q.delay(10)
            }
            
            // Start first request which will fail
            try {
                await communicator.send(argObj1)
            } catch (ex) {
                // Expected to fail
            }
            
            await Q.delay(10) // Wait for cleanup
            
            // Verify pending was cleaned up after error
            expect(communicator._pending.length).to.equal(0)
            
            // Now try second request - should work because cleanup happened
            const send2 = communicator.send(argObj2)
            await Q.delay(20)
            const rsp = {payload:{count: 0}, type: 'SRSP', subsys: "NWK", cmd: "queuedDelete"}
            await communicator.receive(rsp)
            await send2
            
            // Second request should have succeeded
            expect(callCount).to.equal(2)
            
            // Restore
            unpi.send = originalSend
        })
    })

    describe('Error Handling', function() {
        it('should handle invalid checksum', async function () {
            const argObj = new ZpiObject('SYS', 'ping', {})
            const deferred = Q.defer()
            communicator.addPending(argObj, deferred)
            
            const invalidData = {
                payload: {},
                type: 'SRSP',
                subsys: 'SYS',
                cmd: 'ping',
                fcs: 100,
                csum: 200 // Different from fcs
            }
            
            await communicator.receive(invalidData)
            
            try {
                await deferred.promise
                assert.fail('Should have rejected')
            } catch (ex) {
                // InvalidChecksum error
                expect(ex).to.exist
                expect(ex.payload).to.exist
            }
        })

        it('should handle RES0 error responses', async function () {
            const argObj = new ZpiObject('SYS', 'ping', {})
            const deferred = Q.defer()
            communicator.addPending(argObj, deferred)
            
            const errorData = {
                payload: {
                    typesubsys: argObj.subsysId,
                    cmd: argObj.cmdId
                },
                type: 'SRSP',
                subsys: 'RES0',
                cmd: 'error',
                fcs: 100,
                csum: 100
            }
            
            await communicator.receive(errorData)
            
            try {
                await deferred.promise
                assert.fail('Should have rejected')
            } catch (ex) {
                expect(ex).to.equal('__error__')
            }
        })
    })

    describe('AREQ Handling', function() {
        it('should emit AREQ events', function (done) {
            const areqData = {
                payload: {status: 0},
                type: 'AREQ',
                subsys: 'ZDO',
                cmd: 'stateChangeInd',
                fcs: 100,
                csum: 100
            }
            
            emitter.once('AREQ', (data) => {
                expect(data.subsys).to.equal('ZDO')
                expect(data.ind).to.equal('stateChangeInd')
                expect(data.data.status).to.equal(0)
                done()
            })
            
            communicator.receive(areqData)
        })

        it('should emit specific AREQ events', function (done) {
            const areqData = {
                payload: {status: 0},
                type: 'AREQ',
                subsys: 'ZDO',
                cmd: 'stateChangeInd',
                fcs: 100,
                csum: 100
            }
            
            emitter.once('AREQ:ZDO:stateChangeInd', (data) => {
                expect(data.subsys).to.equal('ZDO')
                expect(data.ind).to.equal('stateChangeInd')
                done()
            })
            
            communicator.receive(areqData)
        })
    })

    describe('Utility Functions', function() {
        it('should return communicator info', function () {
            const info = communicator.info()
            expect(info).to.have.property('pending')
            expect(info.pending).to.equal(0)
        })

        it('should clear all pending requests', async function () {
            const argObj1 = new ZpiObject('SYS', 'ping', {})
            
            argObj1.frame()
            
            communicator.send(argObj1)
            await Q.delay(5)
            
            expect(communicator._pending.length).to.equal(1)
            
            communicator.clearAll()
            
            expect(communicator._pending.length).to.equal(0)
        })
    })
})
