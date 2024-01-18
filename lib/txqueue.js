const logging = require('./logging'),
      assert = require('assert'),
      Q = require('@halleyassist/q-lite')

class QueueError extends Error {

}

class TxQueue {
    constructor(maxQueueLength = 100){
        this._queue = []
        this._current = null
        this._maxQueueLength = maxQueueLength
        this._test = Math.random()
    }

    describeCurrent(){
        const current = this._current
        if(!current) return "nothing"

        const {argObj, queued} = current

        return `${argObj.subsys}:${argObj.cmd} queued ${new Date(queued)}`
    }

    enqueue(argObj){
        // this promise will contain the request that we will execute
        const deferred = Q.defer()

        const logger = logging.request[argObj.type]
        if(logger.enabled) logger(` [queued] ${argObj.subsys}:${argObj.cmd} ${logging.valObjFormat(argObj.valObj, argObj.subsys, argObj.cmd)}`)
        
        const entry = {
            subsys:argObj.subsys, cmd:argObj.cmd,
            exec: () => {
                // Release begin to allow start
                try {
                    this._setCurrent(argObj)
                }catch(ex){
                    /* Exception of not yet initialized */
                    deferred.reject(new QueueError(ex))
                    return
                }
                
                deferred.resolve(argObj)
            },
            abort: deferred.reject
        }
        if(this._queue.length >= this._maxQueueLength){
            const top = this._queue.shift()
            top.abort(new QueueError(`queue too long: ${this._queue.length}, discarded top of queue. Was doing ${this.describeCurrent()}`))
        }
        this._queue.push(entry);

        return deferred.promise
    }

    _setCurrent(argObj){
        assert(!this._current, "spin lock should not be taken when setting current")

        // defer is used to announce the job is done
        const defer = Q.defer()

        // when queued
        const queued = Date.now()
        this._current = {argObj, defer, queued} 
    }
    
    begin(argObj){
        //If not currently processing, return immediately
        if (!this._current) {
            this._setCurrent(argObj)
            return argObj
        }

        //Otherwise enqueue and return a promise providing argObj when ready to execute
        return this.enqueue(argObj)
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
        
        // announce job is done
        current.defer.resolve()

        // If there is a queued job, start it
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
            await this._current.defer.promise
        }
        assert(!this._current, "current should be cleared")
    }
    info(){
        return {txqueue: this._queue.length}
    }
}

TxQueue.QueueError = QueueError

module.exports = TxQueue