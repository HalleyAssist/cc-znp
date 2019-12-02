class InvalidChecksum extends Error {
    constructor(received){
        super("Invalid Checksum.")
        this.received = received
    }
}
module.exports = InvalidChecksum