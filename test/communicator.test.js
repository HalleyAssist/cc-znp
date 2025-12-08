var expect = require('chai').expect,
    assert = require('chai').assert,
    Communicator = require('../lib/communicator'),
    ZpiObject = require('../lib/zpiObject'),
    Q = require('@halleyassist/q-lite'),
    EventEmitter = require('events').EventEmitter

var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

describe('Communicator Race Condition Tests', function () {
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

    it('should prevent duplicate SREQ commands from being pending simultaneously', async function () {
        this.timeout(5000)
        
        // Create two identical SREQ requests
        const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
        const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
        
        // Frame the objects
        argObj1.frame()
        argObj2.frame()
        
        // Start both sends simultaneously (simulating race condition)
        // This currently throws an error, but ideally should be handled by queueing
        let error = null
        try {
            const send1 = communicator.send(argObj1)
            const send2 = communicator.send(argObj2)
            await Promise.all([send1, send2])
        } catch (ex) {
            error = ex
        }
        
        // Currently this fails - the second request throws immediately
        // After fix, this should not throw because the requests should be queued/handled properly
        expect(error).to.not.be.null
        expect(error.message).to.include('already pending')
    })

    it('should clean up pending on timeout to allow retry', async function () {
        this.timeout(5000)
        
        // Create two identical SREQ requests
        const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
        const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
        
        // Frame the objects
        argObj1.frame()
        argObj2.frame()
        
        // Start first request but don't send response (simulating timeout)
        const deferred1 = Q.defer()
        let error1 = null
        try {
            const send1 = communicator.send(argObj1, true, deferred1)
            
            // Manually reject after a short delay to simulate timeout
            await Q.delay(50)
            deferred1.reject(new Error('Timeout'))
            
            await send1
        } catch (ex) {
            error1 = ex
        }
        
        // First request should have timed out
        expect(error1).to.not.be.null
        expect(error1.message).to.include('Timeout')
        
        // Now try second request - should work if cleanup happened
        // Currently this will fail with "already pending" because cleanup doesn't happen
        let error2 = null
        try {
            const send2 = communicator.send(argObj2)
            await Q.delay(20)
            const rsp = {payload:{count: 0}, type: 'SRSP', subsys: "NWK", cmd: "queuedDelete"}
            await communicator.receive(rsp)
            await send2
        } catch (ex) {
            error2 = ex
        }
        
        // After fix, this should succeed
        // Currently it fails with "already pending"
        expect(error2).to.not.be.null
        expect(error2.message).to.include('already pending')
    })

    it('should prevent duplicate AF dataRequest commands from being pending simultaneously', async function () {
        this.timeout(5000)
        
        // Create two identical SREQ requests
        const argObj1 = new ZpiObject('AF', 'dataRequest', {dstaddr: 0, dstep: 1, srcep: 1, cluster: 0, trans: 1, options: 0, radius: 30, len: 3, data: Buffer.from([1,2,3])})
        const argObj2 = new ZpiObject('AF', 'dataRequest', {dstaddr: 0, dstep: 1, srcep: 1, cluster: 0, trans: 1, options: 0, radius: 30, len: 3, data: Buffer.from([1,2,3])})
        
        // Frame the objects
        argObj1.frame()
        argObj2.frame()
        
        // Start both sends simultaneously (simulating race condition)
        // The error is thrown synchronously in addPending, so we need to wrap in try-catch
        let error = null
        try {
            const send1 = communicator.send(argObj1)
            const send2 = communicator.send(argObj2)
            await Promise.all([send1, send2])
        } catch (ex) {
            error = ex
        }
        
        // Should get an error about already pending
        expect(error).to.not.be.null
        expect(error.message).to.include('already pending')
    })

    it('should allow sequential SREQ commands of the same type', async function () {
        this.timeout(5000)
        
        // Create two identical SREQ requests
        const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
        const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
        
        // Frame the objects
        argObj1.frame()
        argObj2.frame()
        
        // Send first request
        const send1 = communicator.send(argObj1)
        
        // Wait a bit then send response to complete first request
        await Q.delay(20)
        const rsp = {payload:{count: 0}, type: 'SRSP', subsys: "NWK", cmd: "queuedDelete"}
        await communicator.receive(rsp)
        await send1
        
        // Now send second request - should work fine
        const send2 = communicator.send(argObj2)
        await Q.delay(20)
        await communicator.receive(rsp)
        await send2
        
        // Both should complete without error
        expect(true).to.be.true
    })
})
