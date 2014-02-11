
fs = require 'fs'
assert = require 'assert'
LinesTransform = require '../lib/LinesTransform'

describe 'LinesTransform', ->
  it 'should chunk lines', (done) ->
    l1 = new LinesTransform()
    s1 = fs.createReadStream __filename
    lineCount = 0
    l1.on 'readable', ->
      line = l1.read().toString()
      # console.warn 'Read', line
      lineCount += 1
    .on 'end', ->
      assert.equal lineCount, 18
      done()
    s1.pipe l1
