var zpiMeta = require('./lib/defs/zpi_meta.json')

function process(params){
    var output = []
    for(var i in params){
        var p = params[i]
        output.push([Object.keys(p)[0], Object.values(p)[0]])
    }
    return output
}

for(var i in zpiMeta){
    let subsys = zpiMeta[i]
    for(let cmdName in subsys){
        let cmd = subsys[cmdName]
        if(cmd.params.req) cmd.params.req = process(cmd.params.req)
        if(cmd.params.rsp) cmd.params.rsp = process(cmd.params.rsp)
    }
}

console.log(JSON.stringify(zpiMeta))