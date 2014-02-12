var fs = require('fs'),
    url = require('url'),
    http = require('http'),
    MacroTransform = require('./MacroTransform'),
    LinesTransform = require('./LinesTransform');

function readFromStream(stream, pathName, fileName) {
    var lineStream = new LinesTransform(),
        macroStream = new MacroTransform({
            path: pathName,
            fileName: fileName
        });

    stream.pipe(lineStream);
    lineStream.pipe(macroStream);
    return macroStream;
}

function readFromUrl(urlArg) {
    if (/^http:/i.test(urlArg)) {
        var urlObj = url.parse(urlArg);
        // TODO
        // http.get();
        throw new Error('TODO stream from http');
    } else if (fs.existsSync(urlArg)) {
        var parts = urlArg.split(/\//),
            fileName = parts.pop(),
            pathName = parts.join('/');
        return readFromStream(fs.createReadStream(urlArg), pathName, fileName);
    } else {
        throw new Error('No such file: ' + urlArg);
    }
}

module.exports = {
    MacroTransform: MacroTransform,
    LinesTransform: LinesTransform,
    readFromStream: readFromStream,
    readFromUrl: readFromUrl
};


