fs = require 'fs'
ShellTransform = require '../lib/ShellTransform'

describe 'Basic test', ->
  it.skip 'can be used as a shell pipe', (done) ->
    s1 = fs.createReadStream __filename
    t1 = new ShellTransform 'base64'
    t2 = new ShellTransform 'base64 -d'
    p1 = s1.pipe(t1).pipe(t2).pipe process.stdout
    process.stdout.on 'end', ->
      done()

