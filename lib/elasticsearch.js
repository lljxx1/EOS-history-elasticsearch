const http = require('http');
const fs = require('fs');
const moment = require('moment');

var esHost = 'http://localhost:9200';

BigInt.prototype.toJSON = function() {
    return this.toString();
};

class elasticWriteStream {

    constructor(batchSize, index, type){
        this.batchSize = batchSize;
        this.index = index;
        this.type = type;
        this.batch = [];
        this.hook_ = {};


    }
    

    write(data) {

        if (data.length === 0) {
            return;
        }

        var writes = 0;
        var thisUrl = esHost+'/_bulk'

        var payload = {
            body: '',
            headers: Object.assign({
                'User-Agent': 'elasticdump',
                'Content-Type': 'application/x-ndjson'
            })
        }

        data.forEach(function (elem) {
            var actionMeta = { 
                index: { 
                    _index: elem._index, 
                    _type: elem._type,
                    _id: elem._id
                }
            }
            payload.body += JSON.stringify(actionMeta) + '\n'
            payload.body += JSON.stringify(elem._source ? elem._source : elem) + '\n'
        })

        var response = http.put(thisUrl, payload);
        try {
            var r = JSON.parse(response.body)
            if (r.items !== null && r.items !== undefined) {
                if (r.ok === true) {
                    writes = data.length
                } else {
                    r.items.forEach(function (item) {
                        if (item['index'].status < 400) {
                            writes++
                        } else {
                            console.error(item['index'])
                        }
                    })
                }
            }
        } catch (e) {
            console.log(e)
        }

        this.batch = [];

        var reindex = http.post( esHost +'/_refresh');
        // console.log(reindex);
    }


    // eosio/newaccount
    listent(keyId, handler){
        this.hook_[keyId] = hook_[keyId] || [];
        this.hook_[keyId].push(handler);
    }


    _onActionTrace(raw){
        var trace = raw;
        var self = this;

        if (trace.act && trace.act.name === "onblock") return;

        var actions = [];
        var link_accounts = {};

        var history = {};
        var messages = {};

        function collectMessage(_at) {
            function _c(f) {
                if (self.hook_[f]) {
                    messages[f] = messages[f] || [];
                    messages[f].push(_at);
                }
            }
            _c(_at.act.account);
            _c(_at.act.account + "/" + _at.act.name);
        }

        function excuteAct(at){

            link_accounts[at.receipt.receiver] = 1;
            if(at.act.authorization){
                at.act.authorization.forEach((a) => {
                    link_accounts[a.actor] = 1;
                })
            }

            actions.push(at);
            collectMessage(at);

            at.inline_traces.forEach((_at) => {
                excuteAct(_at, at);
            });
        }

        excuteAct(trace);

        var data = {};

        let block_num = trace.block_num.toString();
        var date = moment.utc(trace.block_time).format('YYYYMMDD');

        data._type = 'history';
        data._index = 'eoshistory_'+date;
        data._id =  trace.trx_id;

        history.accounts = Object.keys(link_accounts);
        history.action_trace = JSON.stringify(raw);
        history.block_num = block_num;
        history.block_time = trace.block_time;
        history.producer = trace.producer;
        history.trx_id = trace.trx_id;

        data._source = history;

        if(this.batch.length > this.batchSize){
            this.write(this.batch);
            console.log('write done');
        }else{
            this.batch.push(data);
        }

        // fs.appendFileSync('./data.logs', JSON.stringify({
        //     link_accounts: link_accounts,
        //     actions: actions,
        //     messages: messages
        // })+"\n");

        console.time("emitter-time");

        // fs.appendFileSync('./dump.logs', JSON.stringify(data)+"\n");
        // if(batch.length > batchSize){
        //     write(batch);
        //     console.log('write done');
        // }else{
        //     batch.push(data);
        // }
    }


    write(trace, _, next) {
        try{
            this._onActionTrace(trace);
        }catch(e){
            console.log('error', e.stack, trace);
        }
    }
}


module.exports = elasticWriteStream;