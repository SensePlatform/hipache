(function () {
    'use strict';

    var IHipDriver = require('./IHipDriver.js'),
        redis = require('redis'),
        // XXX new logging infrastructure not landed yet
        // logger = require('../logger'),
        util = require('util');

    var Redis = function () {
        // Provides slave and master url properties
        IHipDriver.apply(this, arguments);

        this.slave = this.drivers.shift();
        this.master = this.drivers.pop();

        // The principal redis client
        var clientReady = false;
        var client = redis.createClient(this.slave.port || 6379, this.slave.hostname || '127.0.0.1');

        var prefix = '';
        if (this.slave.hash) {
            prefix = this.slave.hash.substr(1);
        }

        var db;
        if (this.slave.path && (db = this.slave.path.substr(1))) {
            client.select(db);
        }
        var password;
        if (this.slave.auth && (password = this.slave.auth.split(':').pop())) {
            client.auth(password);
        }

        client.on('error', function (err) {
            this.emit('error', err);
        }.bind(this));

        client.on('ready', function (err) {
            clientReady = true;
            if (!clientWrite || clientWriteReady) {
                this.emit('ready', err);
            }
        }.bind(this));

        // The optional redis master
        var clientWriteReady = false;

        var clientWrite;

        if (this.master) {
            clientWrite = redis.createClient(this.master.port, this.master.hostname);

            if (this.master.path && (db = this.master.path.substr(1))) {
                clientWrite.select(db);
            }
            if (this.master.auth && (password = this.master.auth.split(':').pop())) {
                clientWrite.auth(password);
            }

            clientWrite.on('error', function (err) {
                this.emit('error', err);
            }.bind(this));

            clientWrite.on('ready', function (err) {
                clientWriteReady = true;
                if (clientReady) {
                    this.emit('ready', err);
                }
            }.bind(this));
        }

        // Redis specific: passiveChecks mechanism
        var passiveCheck = true;

        var monitorActiveChecker = function () {
            client.get('hchecker_ping', function (err, reply) {
                if (passiveCheck !== ((Math.floor(Date.now() / 1000) - reply) > 30)) {
                    if (passiveCheck) {
                        // XXX new logging infrastructure not landed yet
                        // logger.info('Redis', 'Disabling passive checks (active hchecker detected).');
                    } else {
                        // XXX new logging infrastructure not landed yet
                        // logger.info('Redis', 'Enabling passive checks (active hchecker stopped).');
                    }
                    passiveCheck = !passiveCheck;
                }
            });
        };

        var monitorPoller = setInterval(monitorActiveChecker, 30 * 1000);


        Object.defineProperty(this, 'connected', {
            get: function () {
                return client.connected && (!clientWrite || clientWrite.connected);
            }
        });

        this.read = function (hosts, callback) {
            var multi = client.multi();
            var first = hosts[0];
            hosts.forEach(function (host) {
                multi.lrange(prefix + 'frontend:' + host, 0, -1);
            });
            multi.smembers(prefix + 'dead:' + first);
            multi.exec(function (err, data) {
                data[data.length - 1] = data[data.length - 1].map(function (index) {
                    return parseInt(index);
                });
                callback(err, data);
            });
        };

        this.create = function (host, vhost, callback) {
            client.rpush(prefix + 'frontend:' + host, vhost, callback);
        };

        this.add = this.create;

        this.mark = function (frontend, id, url, len, ttl, callback) {
            var frontendKey = prefix + 'dead:' + frontend;
            var multi = (clientWrite ? clientWrite : client).multi();

            // Update the Redis only if passive checks are enabled
            if (passiveCheck) {
                multi.sadd(frontendKey, id);
                multi.expire(frontendKey, ttl);
            }
            // Announce the dead backend on the "dead" channel
            multi.publish('dead', frontend + ';' + url + ';' + id + ';' + len);
            multi.exec(callback);
        };

        this.destructor = function () {
            clearInterval(monitorPoller);
            client.end();
            if (clientWrite) {
                clientWrite.end();
            }
        };
    };

    util.inherits(Redis, IHipDriver);

    module.exports = Redis;

})();