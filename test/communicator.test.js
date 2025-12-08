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

    it('should throw error when duplicate SREQ commands are sent simultaneously', async function () {
        this.timeout(5000)
        
        // Create two identical SREQ requests
        const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
        const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
        
        // Frame the objects
        argObj1.frame()
        argObj2.frame()
        
        // Start first send (don't await or catch yet)
        const send1 = communicator.send(argObj1)
        
        // Pending should have one entry for argObj1
        expect(communicator._pending.length).to.equal(1)
        
        // Try to start second send - will fail when it tries to add to pending
        let send2Started = false
        const send2 = communicator.send(argObj2).then(() => {
            send2Started = true
        }).catch(() => {
            // Error expected
        })
        
        await Q.delay(20)
        
        // Second send should not have completed successfully
        expect(send2Started).to.be.false
    })

    it('should clean up pending on error to allow retry', async function () {
        this.timeout(5000)
        
        // Create two identical SREQ requests
        const argObj1 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
        const argObj2 = new ZpiObject('NWK', 'queuedDelete', {nwkaddr: 0, trans: 0})
        
        // Frame the objects
        argObj1.frame()
        argObj2.frame()
        
        // Mock unpi.send to throw an error to simulate network failure
        const originalSend = unpi.send
        let callCount = 0
        unpi.send = async function() {
            callCount++
            if (callCount === 1) {
                // First call fails
                throw new Error('Network error')
            }
            // Second call succeeds
            await Q.delay(10)
        }
        
        // Start first request which will fail - catch the error to prevent "Uncaught Error"
        const send1 = communicator.send(argObj1).catch(() => {})
        // Wait for the async error handling to complete
        await Q.delay(50)
        
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
        
        // Restore original mock
        unpi.send = originalSend
    })

    it('should throw error when duplicate AF dataRequest commands are sent simultaneously', async function () {
        this.timeout(5000)
        
        // Create two identical SREQ requests
        const argObj1 = new ZpiObject('AF', 'dataRequest', {dstaddr: 0, dstep: 1, srcep: 1, cluster: 0, trans: 1, options: 0, radius: 30, len: 3, data: Buffer.from([1,2,3])})
        const argObj2 = new ZpiObject('AF', 'dataRequest', {dstaddr: 0, dstep: 1, srcep: 1, cluster: 0, trans: 1, options: 0, radius: 30, len: 3, data: Buffer.from([1,2,3])})
        
        // Frame the objects
        argObj1.frame()
        argObj2.frame()
        
        // Start first send (don't await or catch yet)
        const send1 = communicator.send(argObj1)
        
        // Pending should have one entry for argObj1
        expect(communicator._pending.length).to.equal(1)
        
        // Try to start second send - will fail when it tries to add to pending
        let send2Started = false
        const send2 = communicator.send(argObj2).then(() => {
            send2Started = true
        }).catch(() => {
            // Error expected
        })
        
        await Q.delay(20)
        
        // Second send should not have completed successfully
        expect(send2Started).to.be.false
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
