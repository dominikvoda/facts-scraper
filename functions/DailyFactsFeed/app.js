var Twitter = require('twitter');
var fs = require("fs");
var Slack = require('slack-node');
var Config = require("./config.json");

var client = new Twitter({
    consumer_key: Config.twitter.consumer_key,
    consumer_secret: Config.twitter.consumer_secret,
    access_token_key: Config.twitter.access_token_key,
    access_token_secret: Config.twitter.access_token_secret
});

function FactsScraper() {
    this.newTweets = [];
    this.newMessages = null;
    this.lastId = 0;
    this.loadDataFromFile = function () {
        if (fs.existsSync(Config.bot.newDataFile)) {
            var data = fs.readFileSync(Config.bot.newDataFile, "UTF-8");
            return JSON.parse(data);
        }
        return false;
    };
    this.isTime = function () {
        var date = new Date();
        if (Config.bot.days.indexOf(date.getDay()) != -1) {
            if (date.getHours() >= Config.bot.timeInterval.from && date.getHours() <= Config.bot.timeInterval.to) {
                return true;
            }
        }
        return false;
    };
    this.createEmptyDataFile = function () {
        var initData = {
            "lastId": 1,
            "messages": []
        };
        this.writeToFile(Config.bot.newDataFile, JSON.stringify(initData));
        this.writeToFile(Config.bot.oldDataFile, "[]");
    };
    this.writeToFile = function (file, data) {
        fs.writeFileSync(file, data);
    };
    this.sendMessage = function (message, successCallback) {
        var slack = new Slack();
        slack.setWebhook(Config.slack.webHookUri);
        slack.webhook({
            channel: Config.slack.channel,
            username: Config.slack.botName,
            text: message
        }, function (err, response) {
            if (!err) {
                successCallback(message);
            }
        });
    };
    this.updateNewData = function () {
        var _this = this;
        this.newTweets.forEach(function (tweet) {
            _this.newMessages.push(tweet);
        });
    };
    this.updateNewDataFile = function (lastId) {
        var newData = {
            "lastId": lastId,
            "messages": this.newMessages
        };
        this.writeToFile(Config.bot.newDataFile, JSON.stringify(newData));
    };
    this.loadDataFromAccount = function (account, lastId, successCallback) {
        var params = {
            screen_name: account,
            since_id: lastId,
            count: 200
        };
        var _this = this;
        client.get('statuses/user_timeline', params, function (error, tweets, response) {
            console.log("Load data since " + lastId);
            if (!error) {
                if (tweets.length > 0) {
                    console.log("Loaded new data [" + tweets.length + "]");
                    var newLastId = tweets[0].id_str;
                    tweets.forEach(function (data) {
                        var tweet = {
                            "id": data.id_str,
                            "date": data.created_at,
                            "message": data.text
                        };
                        _this.newTweets.push(tweet);
                    });
                    _this.loadDataFromAccount(account, newLastId, successCallback);
                }
                else {
                    successCallback(lastId);
                }
            }
        });
    };
    this.sendSomeMessage = function () {
        if(this.newMessages.length > 0){
            var tweet = this.newMessages.pop();
            if(tweet){
                this.sendMessage(tweet.message, function(message){
                    console.log("Message send: " + message)
                });
            }
        }
        else{
            console.log("nejsou zadne nove data");
        }
    };
    this.run = function () {
        if(this.isTime()){
            this.init();

            var _this = this;
            // Config.twitter.accounts.forEach(function (account) {
            //     _this.loadDataFromAccount(account, _this.newData.lastId, function () {
            //     });
            // });
            this.loadDataFromAccount(Config.twitter.accounts[0], _this.lastId, function (lastId) {
                _this.updateNewData();
                _this.sendSomeMessage();
                _this.updateNewDataFile(lastId);
            });

        }
    };
    this.init = function () {
        var newData = this.loadDataFromFile();
        if(!newData){
            this.createEmptyDataFile();
            newData = this.loadDataFromFile();
        }
        this.newMessages = newData.messages;
        this.lastId = newData.lastId;
    }
}


module.exports = new FactsScraper();
