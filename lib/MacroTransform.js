/*global console, escape, unescape*/

var fs = require('fs'),
    vm = require('vm'),
    path = require('path'),
    util = require('util'),
    stream = require('stream'),
    coffee = require('coffee-script'),
    LinesTransform = require('./LinesTransform'),
    ShellTransform = require('./ShellTransform'),
    pack = require('../package');

// TODO pipe from process.stdin if no argument is given
// TODO Test changing quotes
// TODO Resolve these URLs
//      * Allow customized resolving
//
// TODO Binary files
// TODO Run as executable
// TODO Use stderr
// TODO Warn if variable is present but not replaced

function dirname(str) {
    var m = /^(.*?)[^\/]+$/.exec(str);
    return path.resolve(m[1] || '.');
}

function basename(str) {
    var m = /^.*?([^\/]+)$/.exec(str);
    return m[1];
}

function findFileInParentDirs(fileName, dir, cb) {
    (function test(dir) {
        if (dir === '') {
            return cb('ENOENT');
        }
        var pathName = dir + '/' + fileName;
        fs.exists(pathName, function (exists) {
            if (exists) {
                return cb(null, pathName);
            }
            test(dir.replace(/\/[^\/]+$/, ''));
        });
    }(dir));
}


function streamThroughFilter(filter, lines, cb) {

    var filterStream = new ShellTransform(filter),
        lineStream = new LinesTransform();

    filterStream.pipe(lineStream);
    filterStream.write(lines.join(''));
    cb(null, lineStream);
    filterStream.close();
}

function MacroTransform(options) {
    options = options || {};
    this.path = options.path || process.cwd();
    this.fileName = options.fileName;
    stream.Transform.call(this, options);

    this.lineNumber = 1;
    var that = this;
    this.sandbox = {
        __expand: options.expand || ['{', '}'],
        __version: pack.version,
        __quotes: function (q1, q2) {
            this.__expand = [q1, q2];
            that._configure();
        },
        console: console,
        process: process,
        encodeURI: encodeURI,
        encodeURIComponent: encodeURIComponent,
        escape: escape,
        unescape: unescape,
        parseInt: parseInt
    };
    this.stack = [{id: OUTER}];
    this._configure();
    return this;
}
util.inherits(MacroTransform, stream.Transform);

var OUTER   = 'OUTER',
    BEGIN   = 'BEGIN',
    COND    = 'COND',
    INCLUDE = 'INCLUDE',
    FILTER  = 'FILTER',
    RUN     = 'RUN';

MacroTransform.prototype._transform = function (line, buffer, cb) {
    var that = this,
        context = this.stack[this.stack.length - 1],
        action, lang, m;

    line = line.toString();
    this.lineNumber += 1;

    // console.warn(util.inspect(this.stack, false, 100, true));

    m = /^(#|\/\/)\s*(begin|elif|else|end|filter|if|include|run)\s*(.*)/
      .exec(line);

    if (m) {
        this.sandbox.__language = m[1] === '#' ? 'coffee' : 'js';
        if (m[2]) {
            return this['____action____' + m[2]](m[3], cb);
        }
    }

    if (!context) {
        return cb(new Error('Too many end tags'));
    }

    if (context.id === BEGIN) {
        context.lines.push(line);
    } else if (context.id === FILTER) {
        context.lines.push(this._eval(line));
    } else if (context.id !== COND || (context.live && context.cond)) {
        this.push(this._eval(line));
    }
    cb();
};

MacroTransform.prototype._flush = function (line, buffer, cb) {
    var top = this.stack[this.stack.length - 1];
    if (top.id !== OUTER) {
        return cb(new Error('Expected end for ' + top.id));
    }
};


MacroTransform.prototype._eval = function (line) {
    var that = this;
    return line.replace(this.rxExpand, function ($0, script) {
        return vm.createScript(script).runInNewContext(that.sandbox);
    });
};

MacroTransform.prototype.____action____begin = function (arg, cb) {
    this.stack.push({
        id: BEGIN,
        arg: arg,
        start: this.lineNumber,
        lines: []
    });
    cb();
};

MacroTransform.prototype.____action____end = function (arg, cb) {
    var that = this,
        obj = this.stack.pop();

    obj.end = this.lineNumber;
    if (obj.id === BEGIN) {
        var script = obj.lines.join('');
        if (this.sandbox.__language === 'coffee') {
            script = coffee.compile(script, {bare: true});
        }
        vm.createScript(script).runInNewContext(this.sandbox);
        cb();
    } else if (obj.id === FILTER) {

        if (!obj.live) {
            return cb();
        }

        if (obj.cmd[0] === '!') {
            var filter = obj.cmd.slice(1);
            if (!this.sandbox[filter]) {
                return cb(new Error('No such function: ' + filter));
            }
            this.sandbox.$tmp = obj.lines;
            var data = vm.createScript(filter + '($tmp);').runInNewContext(this.sandbox);
            delete this.sandbox.$tmp;
            if (Array.isArray(data)) {
                data = data.join('');
            }
            this.push(data);
            return cb();
        }

        streamThroughFilter(obj.cmd, obj.lines, function (err, filterStream) {
            if (err) {
                return cb(err);
            }
            filterStream.on('readable', function () {
                var data = filterStream.read();
                for (var i = that.stack.length - 1; i > -1; i -= 1) {
                    if (that.stack[i].id === FILTER) {
                        return that.stack[i].lines.push(data.toString());
                    }
                }
                that.push(data);
            }).on('finish', function () {
                cb();
            }).on('error', function (err) {
                cb(err);
            });
        });
    } else {
        cb();
    }
};

MacroTransform.prototype.____action____if = function (arg, cb) {
    var obj = this.stack[this.stack.length - 1];
    var cond = !!vm.createScript(arg).runInNewContext(this.sandbox);
    var live = true;
    if (obj.id === COND) {
        live = obj.cond;
    }
    this.stack.push({
        id: COND,
        arg: arg,
        cond: cond,
        live: live,
        start: this.lineNumber
    });
    cb();
};

MacroTransform.prototype.____action____else = function (arg, cb) {
    var obj = this.stack[this.stack.length - 1];
    if (obj.id !== COND) {
        return cb(new Error('Unexpected else at line ' + this.lineNumber));
    }
    if (obj.cond) {
        obj.cond = false;
        obj.live = false;
    } else {
        obj.cond = true;
    }
    cb();
};

MacroTransform.prototype.____action____elif = function (arg, cb) {
    var obj = this.stack[this.stack.length - 1];
    if (obj.id !== COND) {
        return cb(new Error('Unexpected elif at line ' + this.lineNumber));
    }
    if (obj.cond) {
        obj.live = false;
    } else {
        obj.arg = arg;
        var cond = !!vm.createScript(arg).runInNewContext(this.sandbox);
        if (cond) {
            obj.cond = true;
        }
    }
    cb();
};

MacroTransform.prototype.streamFromFile = function (url, cb) {
    var that = this,
        fileName = basename(url),
        dirName = dirname(url);

    findFileInParentDirs(fileName, dirName, function (err, filePath) {
        if (err) {
            return cb(err);
        }
        var stream = fs.createReadStream(filePath),
            macroStream = MacroTransform.fromStream(
                that.sandbox, stream, dirName, filePath);
        cb(null, macroStream);
    });
};


var included = {};

MacroTransform.prototype.____action____include = function (arg, cb) {
    var that = this,
        obj = this.stack[this.stack.length - 1];

    if (obj.id === COND && !obj.cond) {
        return cb();
    }

    var fileUrl = this.path + '/' + this._eval(arg);
    if (included[this.fileName] === fileUrl) {
        return cb(new Error('Cannot circularly include ' + fileUrl));
    }

    included[this.fileName] = fileUrl;

    this.streamFromFile(fileUrl, function (err, macroStream) {
        if (err) {
            return cb(err);
        }
        macroStream.on('readable', function () {
            that.push(macroStream.read());
        }).on('finish', function () {
            cb();
        }).on('error', function (err) {
            cb(err);
        });
    });
};

MacroTransform.prototype.____action____filter = function (arg, cb) {
    var that = this,
        obj = this.stack[this.stack.length - 1];

    var live = true;
    if (obj.id === COND) {
        live = obj.cond;
    }

    this.stack.push({
        id: FILTER,
        cmd: this._eval(arg),
        live: live,
        lines: []
    });
    cb();
};

MacroTransform.prototype.____action____run = function (command, cb) {
    var obj = this.stack[this.stack.length - 1];
    if (obj.id === COND && !obj.cond) {
        return cb();
    }

    command = this._eval(command);
    var that = this,
        pushTo = this,
        filterStream = new ShellTransform(command),
        lineStream = new LinesTransform();

    for (var i = that.stack.length - 1; i > -1; i -= 1) {
        if (that.stack[i].id === FILTER) {
            pushTo = that.stack[i].lines;
            break;
        }
    }

    filterStream.pipe(lineStream);
    filterStream.close();
    lineStream.on('readable', function () {
        var data = lineStream.read();
        if (data) {
            pushTo.push(data.toString());
        }
    });
    lineStream.on('end', cb);
    lineStream.on('error', cb);
};

function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

MacroTransform.prototype._configure = function () {
    var begin = escapeRegExp(this.sandbox.__expand[0]),
        end = escapeRegExp(this.sandbox.__expand[1]);
    this.rxExpand = new RegExp(begin + '(.+)' + end, 'g');
};

MacroTransform.fromStream = function (mt, stream, pathName, fileName) {
    var lineStream = new LinesTransform(),
        macroStream = new MacroTransform({
            path: pathName,
            fileName: fileName,
            sandbox: mt.sandbox
        });

    stream.pipe(lineStream);
    lineStream.pipe(macroStream);
    return macroStream;
};


module.exports = MacroTransform;
