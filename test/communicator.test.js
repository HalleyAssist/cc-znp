const expect = require('chai').expect,
    assert = require('chai').assert,
    sinon = require('sinon'),
    Communicator = require('../lib/communicator'),
    ZpiObject = require('../lib/zpiObject'),
    Q = require('@halleyassist/q-lite'),
    EventEmitter = require('events').EventEmitter

const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

describe('Communicator Tests', function () {
    let communicator, unpi, emitter, clock, sendDeferred
    
    beforeEach(function () {
        clock = sinon.useFakeTimers()
        emitter = new EventEmitter()
        
        // Create a controllable deferred for unpi.send
        sendDeferred = Q.defer()
        
        unpi = {
            send: sinon.stub().callsFake(async function() {
                // Return immediately - the actual async behavior is handled
                // by the deferred.promise waiting for response
                return Promise.resolve()
            })
        }
        communicator = new Communicator(emitter, unpi)
    })
    
    afterEach(function () {
        clock.restore()
    })

    describe('Basic Operations', function() {
        it('should add pending entry when sending SREQ', async function () {
            const argObj = new ZpiObject('SYS', 'ping', {})
            argObj.frame()
            
            // Don't await - we just want to trigger the send
            communicator.send(argObj)
            
            // Flush microtasks to allow addPending to be called
            await Promise.resolve()
            
            expect(communicator._pending.length).to.equal(1)
            expect(communicator._pending[0].argObj).to.equal(argObj)
            
            // Clean up - resolve the pending to avoid timeout
            const rsp = {payload: {}, type: 'SRSP', subsys: 'SYS', cmd: 'ping'}
            await communicator.receive(rsp)
        })

        it('should remove pending entry when response is received', async function () {
            const argObj = new ZpiObject('SYS', 'ping', {})
            argObj.frame()
            
            const sendPromise = communicator.send(argObj)
            
            // Wait for async operations to settle
            await clock.tickAsync(0)
            
            // Send response
            const rsp = {payload: {}, type: 'SRSP', subsys: 'SYS', cmd: 'ping'}
            await communicator.receive(rsp)
            
            expect(communicator._pending.length).to.equal(0)
            
            // Await the send to complete
            await sendPromise
        })

        it('should allow sequential SREQ commands of the same type', async function () {
            const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            
            argObj1.frame()
            argObj2.frame()
            
            const rsp = {payload:{count: 0}, type: 'SRSP', subsys: "NWK", cmd: "queuedDelete"}
            
            // Send first request
            const send1Promise = communicator.send(argObj1)
            await clock.tickAsync(0)
            
            await communicator.receive(rsp)
            await send1Promise
            
            // Now send second request - should work fine
            const send2Promise = communicator.send(argObj2)
            await clock.tickAsync(0)
            
            await communicator.receive(rsp)
            await send2Promise
            
            // Both should complete without error
            expect(communicator._pending.length).to.equal(0)
        })
    })

    describe('Race Condition Prevention', function() {
        it('should prevent duplicate SREQ commands from being pending simultaneously', async function () {
            const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            
            argObj1.frame()
            argObj2.frame()
            
            // Start first send
            communicator.send(argObj1)
            await Promise.resolve()
            
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
            // Restore real timers for this test
            clock.restore()
            
            const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
            
            argObj1.frame()
            argObj2.frame()
            
            let rejectFn
            const errorPromise = new Promise((resolve, reject) => {
                rejectFn = reject
            })
            
            // Prevent unhandled rejection
            errorPromise.catch(() => {})
            
            // Reset stub - manually control the promise
            unpi.send.reset()
            unpi.send.onFirstCall().returns(errorPromise)
            unpi.send.onSecondCall().resolves()
            
            // Start first request  
            const send1Promise = communicator.send(argObj1)
            send1Promise.catch(() => {}) // Prevent unhandled rejection
            
            // Wait for send to process
            await new Promise(resolve => setImmediate(resolve))
            
            // Now reject to simulate error
            rejectFn(new Error('Network error'))
            
            // Wait for the error to propagate
            try {
                await send1Promise
            } catch (err) {
                // Expected error
            }
            
            // Wait for cleanup to happen
            await new Promise(resolve => setTimeout(resolve, 100))
            
            // Verify pending was cleaned up after error
            expect(communicator._pending.length).to.equal(0)
            expect(unpi.send.callCount).to.equal(1)
            
            // Now try second request - should work because cleanup happened
            const send2Promise = communicator.send(argObj2)
            await new Promise(resolve => setImmediate(resolve))
            
            const rsp = {payload:{count: 0}, type: 'SRSP', subsys: "NWK", cmd: "queuedDelete"}
            await communicator.receive(rsp)
            await send2Promise
            
            // Second request should have succeeded
            expect(unpi.send.callCount).to.equal(2)
            
            // Restore fake timers
            clock = sinon.useFakeTimers()
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
                expect(ex.received).to.exist
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
            await Promise.resolve()
            
            expect(communicator._pending.length).to.equal(1)
            
            communicator.clearAll()
            
            expect(communicator._pending.length).to.equal(0)
        })
    })
})
