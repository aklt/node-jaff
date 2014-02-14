/*global console, describe, it*/

var fs = require('fs'),
    path = require('path'),
    scripts = __dirname + '/scripts/',
    child_process = require('child_process'),
    expect = require('unexpected'),
    bin = path.normalize(__dirname + '/../bin/jaff');

console.warn('Running', bin, 'on', scripts);

describe('stdin', function () {
    it('can be piped through', function (done) {
        child_process.exec('echo foo | ./bin/jaff',
            function (err, stdout, stderr) {
                if (err) {
                    return done(err);
                }
                expect(stdout, 'to equal', 'foo\n');
                done();
            });
    });
});

describe('Running scripts', function () {
    runScriptTest('if-else-false');
    runScriptTest('if-else-true');
    runScriptTest('if-elif-else');
    runScriptTest('if-else-nest-false');
    runScriptTest('if-else-nest-true');
    runScriptTest('if-else-include');
    runScriptTest('begin-if-else-include');
    runScriptTest('languages-internals');
    runScriptTest('include-paths');
    runScriptTest('filter-must-shell-escape');
    runScriptTest('require-and-globals');
    runScriptTest('change-expand-quotes');
    runScriptTest('with');
    runScriptTest('with-filter');
    runScriptTest('with-filter-bash');
});

describe('script errors', function () {
    it('recursive includes error', function (done) {
        compareJaffWithExpected(scripts + 'include-recursive', '', function (err) {
            expect(err, 'not to be null');
            done();
        });
    });
});

function runScriptTest(scriptName) {
    it(scriptName + ' passes', function (done) {
        compareJaffWithExpected(scripts + scriptName,
            scripts + scriptName + '.expected',
            done);
    });
}

function compareJaffWithExpected(inFile, expectedFile, cb) {
    var cmd = bin + ' ' + inFile;
    child_process.exec(cmd, function (err, stdout, stderr) {
        if (err) {
            return cb(err);
        }
        fs.readFile(expectedFile, function (err, expectedData) {
            expect(err, 'to be null');
            expect(stdout.toString(), 'to equal', expectedData.toString());
            cb();
        });
    });
}
