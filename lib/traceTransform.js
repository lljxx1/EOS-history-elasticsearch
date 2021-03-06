var stream = require('stream'),
    moment = require('moment'),
    fs = require('fs');

function TraceTransform(){

    var transformer = new stream.Transform({ 
        objectMode: true,
        highWaterMark: 1000
    });

    var self = transformer;

    transformer.hook_ = {};
    transformer.use = (obj) => {
        for(var type in obj){
            self.onAction(type, obj[type]);
        }
    }

    transformer.onAction = (keyId, handler) => {
        self.hook_[keyId] = self.hook_[keyId] || [];
        self.hook_[keyId].push(handler);
    }

    transformer._transform = function (trace, encoding, done) {
        var self = this;
        // console.log('_transform', trace)
        try{
            trace = JSON.parse(trace);
        }catch(e){

        }

        if(!trace.receipt){
            done();
            return;
        }

        if(trace.receipt.status == "hard_fail"){
            done();
            return;
        }

        if (trace.act && trace.act.name === "onblock"){
            done();
            return;
        } 

        var actions = [];
        var messages = {};

        function collectMessage(_at) {
            function _c(f) {
                // console.log('collect', f);
                if (self.hook_[f]) {
                    messages[f] = messages[f] || [];
                    messages[f].push(_at);
                }
            }
            _c(_at.act.account);
            _c(_at.act.account + "/" + _at.act.name);
        }

        function excuteAct(at){

            var link_accounts = {};
            var history = {};

            if(at.act && at.act.hex_data){
                // remove hex_data too large
                delete at.act.hex_data;
            }

            link_accounts[at.receipt.receiver] = 1;

            if(at.act.authorization){
                at.act.authorization.forEach((a) => {
                    link_accounts[a.actor] = 1;
                })
            }

            // actions.push(at);

            var data = {};

            let block_num = trace.block_num.toString();
            var date = moment.utc(trace.block_time).format('YYYYMMDD');
    
            data._type = 'history';
            data._index = 'eoshistory_'+date;
            data._id =  at.receipt.global_sequence;

            var action_trace = Object.assign({}, at);

            delete action_trace.inline_traces;

            history.actors = Object.keys(link_accounts);
            history.action_trace = JSON.stringify(action_trace);
            
            history.account = action_trace.act.account;
            history.action = action_trace.act.name;

            history.block_num = parseInt(block_num);
            history.block_time = trace.block_time;

            history.producer = trace.producer;
            history.trx_id = trace.trx_id;
            history.global_sequence = at.receipt.global_sequence;

            data._source = history;

            // console.log(data)
            self.push(data);
            
            collectMessage(at);
            at.inline_traces.forEach((_at) => {
                excuteAct(_at, at);
            });
        }

        try{
            excuteAct(trace);
            // console.log('messages', messages,  self.hook_);
            // trigger trace
            for (var f in messages) {
                var ats = messages[f];
                var hooks = self.hook_[f];
                if (hooks) hooks.forEach((hook) => hook(ats, self, trace));
            }
        }catch(e){
            console.log(e);
        }
        done()
    }



    return transformer;
}


module.exports = TraceTransform;