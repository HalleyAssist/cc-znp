const logging = require('./logging'),
      assert = require('assert'),
      Q = require('q-lite')

class TxQueue {
    constructor(maxQueueLength = 100){
        this._queue = []
        this._current = null
        this._maxQueueLength = maxQueueLength
        this._test = Math.random()
    }
    async enqueue(argObj){
        // this promise will contain the request that we will execute
        const deferred = Q.defer()

        logging.request[argObj.type](' [queued] %s:%s %s', argObj.subsys, argObj.cmd, logging.valObjFormat(argObj.valObj, argObj.subsys, argObj.cmd));
        const entry = {
            subsys:argObj.subsys, cmd:argObj.cmd,
            exec: async () => {
                try {
                    assert(!this._current, "If we are forcing this, the spin lock shouldnt be set")
                    this._setCurrent(argObj)
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
            top.abort(`queue too long: ${this._queue.length}, discarded top of queue. Current${this._current?(" started "+this._current.started):"ly doing nothing"}`)
        }
        this._queue.push(entry);

        try {
            return await deferred.promise
        } catch(ex){
            //Rethrow to capture full stack trace, not deferred garbage
            throw new Error(ex.toString())
        }
    }

    _setCurrent(argObj){
        const defer = Q.defer()
        const started = new Date()
        this._current = {argObj, defer, started} 
    }
    
    async begin(argObj){
        //If not currently processing, return immediately
        if (!this._current) {
            this._setCurrent(argObj)
            return argObj
        }

        //Otherwise enqueue and return a promise providing argObj when ready to execute
        return await this.enqueue(argObj)
    }
    isCurrent(argObj) {
        if(this._current && this._current.argObj === argObj) return true
        return false;
    }
    complete(argObj){
        assert(this._current, 'spin lock should still be taken at this point')
        assert(this._current.argObj === argObj, 'spin lock should be for what we are clearing')
        const current = this._current
        this._current = null
        current.defer.resolve()
        if(this._queue.length){
            const top = this._queue.shift()
            top.exec() // can not throw!
        }
    }
    async clear(){
        //Clear all queued jobs
        const queue = this._queue
        this._queue = []
        for(const q of queue){
            q.abort("clearing")
        }

        // Wait on any currently executing job (if executing)
        if(this._current) {
            await (this._current.defer.promise)
        }
        assert(!this._current, "current should be cleared")
    }
    info(){
        return {txqueue: this._queue.length}
    }
}
module.exports = TxQueue