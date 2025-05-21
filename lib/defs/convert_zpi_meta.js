const meta = require('./zpi_meta.json');


function convert(params) {
    const r = []
    for(const p of params) {
        r.push(...p)
    }
    return r
}

for(const s in meta) {
    const subsys = meta[s];
    for(const c in subsys) {
        const cmd = subsys[c];
        if(cmd.params) {
            if(cmd.params.req) {
                cmd.params.req = convert(cmd.params.req);
            }
            if(cmd.params.rsp) {
                cmd.params.rsp = convert(cmd.params.rsp);
            }
        }
    }
}

console.log(JSON.stringify(meta, null, 2));