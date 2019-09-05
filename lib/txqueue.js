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

        logging.request[argObj.type](' [queued] %s:%s, %o', argObj.subsys, argObj.cmd, logging.valObjFormat(argObj.valObj));
        const entry = {
            subsys:argObj.subsys, cmd:argObj.cmd,
            exec: async () => {
                try {
                    assert(!this._spinlock, "If we are forcing this, the spin lock shouldnt be set")
                    const rsp = await this.begin(argObj)
                    deferred.resolve(rsp)
                }catch(ex){
                    /* Exception of not yet initialized */
                    deferred.reject(ex)
                }
            },
            abort: deferred.reject
        }
        if(this._queue.length >= this._maxQueueLength){
            const top = this._queue.shift()
            top.abort("queue too long, discarded")
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
        if (!this._spinlock) {
            this._current = Q.defer()
            this._spinlock = argObj
            return argObj
        }

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
        for(const q of this._queue){
            q.abort("clearing")
        }
        this._queue = []
        await this._current.promise
    }
}
module.exports = TxQueue