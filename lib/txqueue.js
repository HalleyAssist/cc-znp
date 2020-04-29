const logging = require('./logging'),
      assert = require('assert'),
      Q = require('q')

class TxQueue {
    constructor(maxQueueLength = 100){
        this._queue = []
        this._spinlock = null
        this._current = null
        this._maxQueueLength = maxQueueLength
        this._test = Math.random()
    }
    async enqueue(argObj){
        const deferred = Q.defer()

        logging.request[argObj.type](' [queued] %s:%s %s', argObj.subsys, argObj.cmd, logging.valObjFormat(argObj.valObj));
        const entry = {
            subsys:argObj.subsys, cmd:argObj.cmd,
            exec: async () => {
                try {
                    assert(!this._spinlock, "If we are forcing this, the spin lock shouldnt be set")
                    this._current = Q.defer()
                     this._spinlock = argObj
                    deferred.resolve(argObj)
                }catch(ex){
                    /* Exception of not yet initialized */
                    deferred.reject(ex)
                }
            },
            abort: deferred.reject
        }
        if(this._queue.length >= this._maxQueueLength){
            const top = this._queue.shift()
            top.abort("queue too long, discarded top of queue")
        }
        this._queue.push(entry);

        try {
            return await deferred.promise
        } catch(ex){
            //Rethrow to capture full stack trace, not deferred garbage
            throw new Error(ex.toString())
        }
    }
    
    async begin(argObj){
        //If not currently processing, return immediately
        if (!this._spinlock) {
            this._current = Q.defer()
            this._spinlock = argObj
            return argObj
        }

        //Otherwise enqueue and return a promise providing argObj when ready to execute
        return await this.enqueue(argObj)
    }
    complete(argObj){
        assert(this._spinlock, 'spin lock should still be taken at this point')
        assert(this._spinlock === argObj, 'spin lock should be for what we are clearing')
        this._spinlock = null
        const current = this._current
        this._current = null
        current.resolve()
        if(this._queue.length){
            const top = this._queue.shift()
            top.exec() // can not throw!
        }
    }
    failure(argObj){
        assert(this._spinlock, 'spin lock should still be taken at this point')
        assert(this._spinlock === argObj, 'spin lock should be for what we are clearing')
    }
    async clear(){
        //Clear all queued jobs
        const queue = this._queue
        this._queue = []
        for(const q of queue){
            q.abort("clearing")
        }

        // Wait on any currently executing job (if executing)
        if(this._current) await this._current.promise
        assert(!this._spinlock, "spinlock should be cleared")
        assert(!this._current, "current should be cleared")
    }
}
module.exports = TxQueue