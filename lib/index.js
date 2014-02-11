var fs = require('fs'),
    url = require('url'),
    http = require('http'),
    MacroTransform = require('./MacroTransform'),
    LinesTransform = require('./LinesTransform');

function streamFromUrl(uri) {
    if (/^http:/i.test(uri)) {
        var urlObj = url.parse(uri);
        // TODO
        // http.get();
        throw new Error('TODO stream from http');
    } else if (fs.existsSync(uri)) {
        var parts = uri.split(/\//),
            fileName = parts.pop(),
            pathName = parts.join('/'),
            stream = fs.createReadStream(uri),
            lineStream = new LinesTransform(),
            macroStream = new MacroTransform({
                path: pathName,
                fileName: fileName
            });

        stream.pipe(lineStream);
        lineStream.pipe(macroStream);
        return macroStream;
    } else {
        throw new Error('No such file: ' + uri);
    }
}

module.exports = {
    MacroTransform: MacroTransform,
    LinesTransform: LinesTransform,
    streamFromUrl: streamFromUrl
};


