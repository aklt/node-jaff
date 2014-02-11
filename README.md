# Jaff Appends and Filters Files

Jaff is a small macro language that allows conditional filtering of Files through
external programs and Javascript or Coffeescript functions in a way similar to
commandline pipes between programs.  Jaff scripts can be written to cumulatively
apply filters while expanding variables in the text.  Here is an example:

    #begin coffee
    indent = (lines) ->
      return lines.map (line) ->
        return '    ' + line

    folder = "/etc"
    #end

    #if process.env.TEST
    foo
    #else
    bar
    #end

    Contents of the {folder} folder:

    #filter !indent
    #  filter nl
    #    filter grep rc$
    #    run ls -la {folder}
    #    end
    #  end
    #end

Running this will print `foo` if process.env.TEST is defined and `bar`
otherwise. Next it will list the contents of the `/etc` folder, filter out files
ending with `"rc"`, prepend a line number to each line and finally indent these
lines.  The output might look like this:

    $ jaff example 

    bar

    Contents of the /etc folder:

            1      -rw-r--r--   1 root    root      657 Mar 18  2012 bash.bashrc
            2      -rw-r--r--   1 root    root     3095 Jan  9 21:22 drirc
            3      -rw-r--r--   1 root    root      714 Nov  3  2011 inputrc
            4      drwxr-xr-x   2 root    root     4096 Mar  8  2013 lirc
            5      -rw-r--r--   1 root    root     4243 Dec 28 09:18 mail.rc
            6      -rw-r--r--   1 root    root     1347 Dec  9 21:55 quilt.quiltrc
            7      -rw-r--r--   1 root    root     3312 Jul 14  2011 screenrc
            8      -rw-r--r--   1 root    root     1437 Apr 25  2011 slsh.rc

## Invocation

This program takes a single argument:

    $ jaff <filename>

Alternatively a script can be written invoking jaff via the shebang line:

    #!/usr/bin/env jaff

    #begin coffee
    foo = "This is foo"
    #end
    ...

## Keywords

The following keywords are defined: `begin`, `end`, `if`, `elif`, `else`,
`include`, `filter` and `run`.  Keywords appear following a comment at the
beginning of a line.

### `begin <js|coffee>` ... `end`

Start a block of Javascript or Coffeescript code.  Variables and code can be
referenced in variable expansions outside of the `begin` block.

Note that all variable expansions are interpreted as Javascript, even if they
have been defined in a `begin coffee` block.  See section `variable expansion`.

Also note that begin blocks are cumulative meaning that all `begin` blocks will
use the same environment to place functions and variables.

The addition of `begin` blocks containing javascript code was inspired by
[pym](http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.25.400).

### `end`

The `end` keyword ends the nearest `begin`, `if` or `filter` block.  

### `if <condition>`, `elif <condition>`, `else` ... `end`

Evaluate `<condition>` as Javascript.  If it evaluates to a truthy value the
lines immediately following this branch of the conditional up to the next
`else`, `elif` or `end` statement are included in the output.

    #if 'foo' === 'bar'
        Not shown
    #elif 1
        This is shown
    #else
        Not shown
    #end

### `include <filename>`

Attempt to include the file in `<filename>`.  If the file does not exist try
if the file can be found in parent paths up to the root.

* TODO add `include! <filename>` to include raw data?

### `run <command>`

Run the external program in `<command>` almost[1] as if it were invoked on the
command line.

### `filter <command|!function>` ... `end`

Run an external program like the `run` command and pipe the lines until `end`
through this command:

    #filter nl
    One
    Two
    #end

Note that filtering through an external program is subject to shell escape
limitations. [1]

If the `<command>` is prefixed with an exclamation mark, command is taken to be
a function to filter commands through as in the example at the top of this
document.


`[1]` This is not quite correct at the moment because shell expansion is not taken
correctly into account.

## Variable expansions

### `{code}`

Run code as javascript. The code may reference variables and functions declared
in `begin ... end` blocks.  This code may reference variables and functions that 
are globals in node as well as some special variables:

* `__version` The version of jaff
* `__argv`    The arguments passed to the script
* `__quotes`  Change code reference quoting characters

The default quoting of a reference is `{}` but may be changed using the
`__quotes()` function in a `begin` block:

```coffee
__quotes '[[', ']]'

```

