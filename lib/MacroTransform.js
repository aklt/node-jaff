/*global console, escape, global, unescape*/

var fs = require('fs'),
    vm = require('vm'),
    path = require('path'),
    util = require('util'),
    stream = require('stream'),
    coffee = require('coffee-script'),
    LinesTransform = require('./LinesTransform'),
    ShellTransform = require('./ShellTransform'),
    pack = require('../package');

// TODO Binary files
// TODO Use stderr
// TODO Warn if variable is present but not replaced
// TODO Errors
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
    stream.Transform.call(this, options);

    var that = this;
    options = options || {};
    this.path = options.path || process.cwd();
    this.fileName = options.fileName;
    this.lineNumber = 1;
    this.sandbox = options.sandbox;
    this.parents = options.parents || {};
    if (!this.sandbox) {
        var sandbox = this.sandbox = {
            __expand: options.expand || ['{', '}'],
            __version: options.version,
            __language: 'coffee',
            encodeURI: encodeURI,
            encodeURIComponent: encodeURIComponent,
            escape: escape,
            unescape: unescape,
            parseInt: parseInt,
            require: require,
            JSON: JSON
        };
        for (var method in global) {
            this.sandbox[method] = global[method];
        }
    }
    var sandbox = this.sandbox;
    this.sandbox.__quotes = function (q1, q2) {
        this.sandbox.__expand = [q1, q2];
        return '';
    },
    console.warn("-->Sandbox", this.sandbox);
    this.sandbox.__filename = basename(this.fileName);
    this.sandbox.__dirname = dirname(this.fileName) || process.cwd();
    this.stack = [{id: OUTER}];
    this.context = vm.createContext(this.sandbox);
    return this;
}
util.inherits(MacroTransform, stream.Transform);

MacroTransform.prototype.log  = function (level, data) { 
    console.warn('log [', this.fileName +':'+ this.lineNumber +']', data); 
    console.trace();
    this.emit('log', {
        data: data,
        time: Date.now(),
        file: this.fileName,
        line: this.lineNumber
    });
};

MacroTransform.prototype.runScript = function (script, newContext) {
    var fileName = this.fileName + '-script.jaff';
    try {
        // return vm.runInContext(script, this.context, fileName);
        return vm.runInNewContext(script, this.sandbox, fileName);
    } catch (e) {
        this.log('warn', e);
    }
};


var OUTER   = 'OUTER',
    BEGIN   = 'BEGIN',
    COND    = 'COND',
    INCLUDE = 'INCLUDE',
    FILTER  = 'FILTER',
    RUN     = 'RUN',
    WITH    = 'WITH';

MacroTransform.prototype._transform = function (line, buffer, cb) {
    var that = this,
        context = this.stack[this.stack.length - 1],
        action, lang, m, data, i;

    if (!context) {
        return cb(new Error('Too many end tags'));
    }

    var pushTo = context.lines;

    line = line.toString();
    this.lineNumber += 1;

    // console.warn(util.inspect(this.stack, false, 100, true));

    m = /^(#|\/\/)\s*(begin|elif|else|end|filter|if|include|run|with|do)\s*(.*)/
      .exec(line);

    if (m) {
        this.sandbox.__language = m[1] === '#' ? 'coffee' : 'js';
        if (m[2]) {
            return this['____action____' + m[2]](m[3], cb);
        }
    }

    if (context.id === BEGIN) {
        pushTo.push(line);
    } else if (context.id === FILTER) {
        data = this._eval(line).split(/\r\n|\n/g);
        data.pop();
        for (i = 0; i < data.length; i += 1) {
            pushTo.push(data[i] + '\n');
        }
    } else if (context.id === WITH) {
        // console.warn(context);
        if (context.atDo) {
            pushTo = getPushTo(this);
        }
        data = this._eval(line).split(/\r\n|\n/g);
        data.pop();
        for (i = 0; i < data.length; i += 1) {
            pushTo.push(data[i] + '\n');
        }
    } else if (context.id !== COND || (context.live && context.cond)) {
        this.push(this._eval(line));
    }
    cb();
};

MacroTransform.prototype._flush = function (cb) {
    var top = this.stack[this.stack.length - 1];
    if (top.id !== OUTER) {
        return cb(new Error('Expected end for ' + top.id));
    }
};

function stringifyEval(result) {
    var resultType = typeof result;
    if (resultType === 'object') {
        result = util.inspect(result, false, Number.MAX_VALUE);
    } else if (resultType !== 'undefined' && resultType !== 'string') {
        result = result.toString();
    }
    return result;
}

MacroTransform.prototype.expandMultiCharQuotes = function (code, begin, end) {
    var it = code,
        beginLen = begin.length,
        endLen = end.length,
        index = it.indexOf(begin);

    if (index < 0) return code;

    var result = [];

    do {
        console.warn("Begin", result);
        result.push(it.slice(0, index));
        it = it.slice(index + beginLen);
        index = it.indexOf(end);
        if (index < 0) {
            return result.join('') + it;
        }
        var content = it.slice(0, index);
        it = it.slice(index + endLen);
        console.warn("-->Content", content);
        var value = this.runScript(content);
        if (typeof value === 'undefined') {
            this.log('warn', 'No result for ' + content);
            value = content;
        } else if (Array.isArray(value)) {
            value = value.map(stringifyEval).join('\n');
        } else {
            value = stringifyEval(value);
        }
        console.warn("-->Value", value);
        result.push(value);
    } while ((index = it.indexOf(begin)) > -1);
    if (it.length > 0) result.push(it);
    return result.join('');
};

MacroTransform.prototype._configure = function () {
    var begin = this.sandbox.__expand[0],
        end = this.sandbox.__expand[1];

        begin = escapeRegExp(begin);
        end = escapeRegExp(end);
        this.rxExpand = new RegExp(begin + '([^' + begin + end + ']+)' + end, 'g');
};

MacroTransform.prototype._eval = function (line) {
    var that = this;
    return this.expandMultiCharQuotes(line, this.sandbox.__expand[0],
                                            this.sandbox.__expand[1]);
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
        this.sandbox.__language = (obj.arg  === 'coffee') ? 'coffee' : 'js';
        var script = obj.lines.join('');
        if (this.sandbox.__language === 'coffee') {
            script = coffee.compile(script, {bare: true});
        }
        var result = that.runScript(script);
        cb();
    } else if (obj.id === FILTER) {

        if (!obj.live) {
            return cb();
        }

        if (obj.cmd[0] === '!') {
            var filter = obj.cmd.slice(1);
            if (!this.sandbox[filter]) {
            console.warn(this.context); 
                return cb(new Error('No such function: ' + filter));
            }
            this.sandbox.$tmp = obj.lines;
            var data = that.runScript(filter + '($tmp);', true);
            delete this.sandbox.$tmp;
            if (Array.isArray(data)) {
                data = data.join('');
            }
            getPushTo(this).push(data);
            return cb();
        }

        streamThroughFilter(obj.cmd, obj.lines, function (err, filterStream) {
            if (err) {
                return cb(err);
            }
            filterStream.on('readable', function () {
                var data = filterStream.read();
                getPushTo(that).push(data.toString());
            }).on('finish', cb)
              .on('error', cb);
        });
    } else {
        cb();
    }
};

MacroTransform.prototype.____action____if = function (arg, cb) {
    var obj = this.stack[this.stack.length - 1];
    var cond = !!this.runScript(arg);
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
        if (this.runScript(arg)) {
            obj.cond = true;
        }
    }
    cb();
};

function clone(obj) {
    var result = {};
    for (var prop in obj) {
        result[prop] = obj[prop];
    }
    return result;
}

MacroTransform.prototype.streamFromFile = function (url, raw, cb) {
    if (raw) {
        var lineStream = new LinesTransform();
        return cb(null, fs.createReadStream(url).pipe(lineStream));
    }
    var that = this,
        fileName = basename(url),
        dirName = dirname(url),
        parents = clone(this.parents);

    findFileInParentDirs(fileName, dirName, function (err, filePath) {
        if (err) {
            return cb(err);
        }
        parents[that.fileName] = 1;
        var stream = fs.createReadStream(filePath),
            macroStream = MacroTransform.fromStream(
                that.sandbox, stream, dirName, filePath, parents);

        cb(null, macroStream);
    });
};

MacroTransform.prototype.____action____include = function (arg, cb) {
    var that = this,
        obj = this.stack[this.stack.length - 1];

    if (obj.id === COND && !obj.cond) {
        return cb();
    }

    var raw = arg[0] === '!';
    if (raw) arg = arg.slice(1);

    var fileUrl = this.path + '/' + this._eval(arg);

    if (this.parents[fileUrl]) {
        return cb(new Error('Cannot circularly include ' + fileUrl));
    }

    this.streamFromFile(fileUrl, raw, function (err, macroStream) {
        if (err) {
            return cb(err);
        }
        macroStream.on('readable', function () {
            getPushTo(that).push(macroStream.read());
        }).on('error', cb)
          .on('finish', cb)
          .on('close', cb);
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

function getPushTo(that) {
    for (var i = that.stack.length - 1; i > -1; i -= 1) {
        var id = that.stack[i].id;
        if (id === FILTER || (id === WITH && !that.stack[i].atDo)) {
            return that.stack[i].lines;
        }
    }
    return that;
}

MacroTransform.prototype.____action____run = function (command, cb) {
    var obj = this.stack[this.stack.length - 1];
    if (obj.id === COND && !obj.cond) {
        return cb();
    }

    command = this._eval(command);
    var that = this,
        filterStream = new ShellTransform(command),
        lineStream = new LinesTransform();

    filterStream.pipe(lineStream);
    filterStream.close();
    lineStream.on('readable', function () {
        var data = lineStream.read();
        if (data) {
            getPushTo(this).push(data.toString());
        }
    });
    lineStream.on('end', cb)
              .on('error', cb);
};

MacroTransform.prototype.____action____with = function (variableName, cb) {
    var that = this,
        obj = this.stack[this.stack.length - 1];

    var live = true;
    if (obj.id === COND) {
        live = obj.cond;
    }

    variableName = variableName.trim();
    var variableType = 'array';
    if (/\.$/.test(variableName)) {
        variableType = 'object';
        variableName = variableName.replace(/\.$/, '');
    }

    this.sandbox[variableName] = variableType === 'object' ? {} : [];

    this.stack.push({
        id: WITH,
        variable: variableName,
        type: variableType,
        live: live,
        lines: []
    });
    cb();
};

MacroTransform.prototype.____action____do = function (empty, cb) {
    var that = this,
        obj = this.stack[this.stack.length - 1];

    if (obj.id !== WITH) {
        return cb(new Error('Expected WITH before DO'));
    }

    var result,
        lines = obj.lines;

    if (obj.type === 'array') {
        result = lines;
    } else {
        var last;
        result = {};
        var propLines = [];
        for (var i = 0; i < lines.length; i += 1) {
            var line = lines[i],
                prop = /^\.(\w+)\s*=\s*(.*)/.exec(line),
                name, value;

            if (!prop) {
                propLines.push(line.replace(/\n|\r\n/, ''));
                continue;
            }

            if (last) {
                if (propLines.length === 1) result[last] = propLines[0];
                else result[last] = propLines;
            }

            name = prop[1],
            value = prop[2];

            if (value[0] === '"') value = value.slice(1).replace(/"$/m, '');
            else value = value.trim();

            propLines = value ? [value] : [];
            last = name;
        }
        if (propLines.length === 1) result[last] = propLines[0];
        else result[last] = propLines;
    }
    this.sandbox[obj.variable] = result;
    obj.atDo = true;
    cb();
};

function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

MacroTransform.fromStream = function (mt, stream, pathName, fileName, parents) {
    var lineStream = new LinesTransform(),
        macroStream = new MacroTransform({
            path: pathName,
            fileName: fileName,
            sandbox: mt.sandbox,
            parents: parents
        });

    stream.pipe(lineStream);
    lineStream.pipe(macroStream);
    return macroStream;
};

module.exports = MacroTransform;
