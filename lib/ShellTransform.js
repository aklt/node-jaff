
var fs = require('fs'),
    util = require('util'),
    stream = require('stream'),
    child_process = require('child_process'),
    shellQuote = require('shell-quote');

function ShellTransform(commandLine) {
    stream.Transform.call(this, {decodeStrings: false});
    this.bufferData = [];
    this.readable = true;
    this.writable = true;
    this.commandLine = commandLine;

    var command = shellQuote.parse(commandLine);
    this.handle = child_process.spawn(command[0], command.slice(1),
                                      {stdio: 'pipe'});
    var that = this;

    // console.warn('cmd', commandLine, args);

    // console.warn(this.handle.exitCode, this.handle.pid);

    this.handle.on('exit', function (code) {
        // console.warn('handle exit');
        that.readable = that.writable = false;
    });

    this.handle.on('error', function (err) {
        // console.warn('handle error');
        that.emit('error', err);
    });
    this.handle.stdin.on('error', function (err) {
        // console.warn('stdin error', err);
        that.readable = that.writable = false;
        that.emit('error', err);
    });

    this.handle.stdout.on('readable', function () {
        var data = that.handle.stdout.read();
        if (data) {
            data = data.toString();
            that.push(data);
        }
    });

    this.handle.stderr.on('readable', function () {
        var data = that.handle.stderr.read();
        if (data) {
            // console.warn('stderr', data.toString());
        }
    });
    this.handle.stdout.on('error', function (err) {
        // console.warn('stdout error', err);
        that.emit('error', err);
    });

    this.handle.stdout.on('close', function () {
        // console.warn('stdout close');
    });
    this.handle.stdout.on('finish', function () {
        // console.warn('stdout finish');
        that.push(null);
    });
}
util.inherits(ShellTransform, stream.Transform);

ShellTransform.prototype._transform = function (chunk, encoding, cb) {
    // console.warn('ShellTransform _transform');
    if (this.ended) {
        return cb();
    }
    this.handle.stdin.write(chunk, encoding, function (err, data) {
        // console.warn('ShellTransform cb()', err, data);
        cb();
    });
};

ShellTransform.prototype.close = function () {
    this.handle.stdin.end(null);
};

ShellTransform.prototype._flush = function (cb) {
    // console.warn('ShellTransform _flush');
};

module.exports = ShellTransform;

