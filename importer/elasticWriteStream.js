const elastic = require('./elastic');
const crypto = require('crypto');
var Stream = require('stream');
const moment = require('moment');

function md5(str){
    return crypto.createHash('md5').update(str).digest('hex');
}

function elasticWriteStream(batchSize, index, type){
    var batch = [];
    // write data
    async function write(){
        var client = await elastic.getClient();
        var body = [];
        if(!batch.length){
            return;
        }

        batch.forEach((elem) => {
            // var hash = md5(JSON.stringify(piece));
            body.push({ 
                index: { 
                    _index: elem._index, 
                    _type: elem._type,
                    _id: elem._id
                }
            })
            body.push(elem._source);
        })

        batch = [];
        try{
            var setResults = await client.bulk({
                body: body
            })
            // console.log('results', setResults)
        }catch(e){
            throw e;
            // console.log(e, body);
        }
    }


    // var batch = [];
    var writable = Stream.Writable({
        objectMode: true,
        highWaterMark: 1000,
        write: function(line, _, next) {
            // console.log('line', line);
            if(batch.length > batchSize){
                (async () => {
                    await write();
                    console.log('write done');
                    process.nextTick(next);
                })();
            }else{
                batch.push(line);
                // console.log('line', batch.length)
                process.nextTick(next)
            }
            return true;
        }
    })

    writable.on('finish', () => {
        (async () => {
            await write();
            console.log('finish done');
        })();
    })

    return writable;
}


module.exports = elasticWriteStream;