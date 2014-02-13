/*global console*/
var fs = require('fs'),
    util = require('util'),
    path = require('path'),
    cp = require('child_process'),
    diff = require('diff'),
    bin = path.normalize(__dirname + '/../bin/jaff');

console.warn('Running', bin);

function diffWithExpected(inFile, expectedFile, cb) {
    var cmd = bin + ' ' + inFile;
    cp.exec(cmd, function (err, stdout, stderr) {
        if (err) {
            return cb(err);
        }
        fs.readFile(expectedFile, function (err, expectedData) {
            if (err) {
                return cb(err);
            }
            var d1 = diff.diffLines(stdout.toString(),
                                    expectedData.toString());
            //
            var hadDiff = '';
            d1.forEach(function (part) {
                if (part.added) {
                    hadDiff = true;
                    util.puts('Added', part.value);
                } else if (part.removed) {
                    hadDiff = true;
                    util.puts('Removed', part.value);
                }
            });
            cb(hadDiff, d1);
        });
    });
}

module.exports.diffWithExpected = diffWithExpected;
