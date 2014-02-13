/*global console, describe, it*/

var utils = require('./utils'),
    scripts = __dirname + '/scripts/',
    child_process = require('child_process'),
    assert = require('assert');

console.warn('Scripts', scripts);

describe('stdin', function () {
    it('can be piped through', function (done) {
        child_process.exec('echo foo | ./bin/jaff',
            function (err, stdout, stderr) {
                if (err) {
                    return done(err);
                }
                assert.equal('foo\n', stdout);
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
});

describe('script errors', function () {
    it('recursive includes error', function (done) {
        utils.diffWithExpected(scripts + 'include-recursive', '',
            function (err) {
                assert.ok(
                    err.message.indexOf('Cannot circularly include') > 0);
                done();
            });
    });
});

function runScriptTest(scriptName) {
    it(scriptName + ' passes', function (done) {
        utils.diffWithExpected(scripts + scriptName,
            scripts + scriptName + '.expected',
            function (err, diffs) {
            if (err) {
                return done(err);
            }
            done();
        });
    });
}
