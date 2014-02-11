var util = require('util'),
    stream = require('stream');

function LinesTransform() {
    stream.Transform.call(this, {decodeStrings: false});
    this.line = '';
}
util.inherits(LinesTransform, stream.Transform);

LinesTransform.prototype._transform = function (chunk, encoding, cb) {
    if (typeof chunk !== 'string') {
        chunk = chunk.toString();
    }
    var lines = chunk.split(/\r\n|\n/);
    if (lines.length === 1) {
        this.line += lines[0];
        return cb();
    }
    if (this.line.length > 0) {
        lines[0] = this.line + lines.shift();
        this.line = '';
    }
    for (var i = 0; i < lines.length - 1; i += 1) {
        var emit = lines[i];
        this.push(emit + '\n');
    }
    cb();
};

LinesTransform.prototype._flush = function (cb) {
    // console.warn('LinesTransform flush');
    if (this.line.length > 0) {
        this.push(this.line);
        this.line = '';
    }
    cb();
};

module.exports = LinesTransform;
