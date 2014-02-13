var fs = require('fs'),
    url = require('url'),
    http = require('http'),
    pkg  = require('../package'),
    MacroTransform = require('./MacroTransform'),
    LinesTransform = require('./LinesTransform');

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

        return MacroTransform.fromStream(
            {}, fs.createReadStream(urlArg), pathName, fileName);
    } else {
        throw new Error('No such file: ' + urlArg);
    }
}

module.exports = {
    MacroTransform: MacroTransform,
    LinesTransform: LinesTransform,
    readFromUrl: readFromUrl,
    version: pkg.version
};


