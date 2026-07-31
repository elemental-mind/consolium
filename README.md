# Consolium

> A toolbox for all your basic terminal needs. Lower level and much lighter than
> full terminal frameworks, but powerful through reduction to the essentials.

Consolium drives a clear separation between the two things you might be
interested in when building for the terminal:

- Inputs:
  - Mouse movements & clicks in browser-style events
  - Keyboard events, including `Ctrl`/`Cmd` and `Alt` keystrokes
- Outputs:
  - Ensuring lines don't wrap
  - Formatting output with colours and text styling
  - Clean rerending through terminal buffer deletion helpers
  - Left- and Right-aligning terminal outputs
  - Table rendering

You can pick and combine these primitives to quickly build well formatted and/or
interactive terminal apps.

```ts
import { Terminal } from "consolium";

const terminal = new Terminal();

terminal.on( "mouseDown", event =>
        terminal.writeLine(`Clicked column ${event.column}, row ${event.row}`));
terminal.on("keyPress", event => 
    if (event.ctrlKey && event.key === "c")
        terminal.writeLine("Interrupted"));
```

```ts
import { Table, TableBorder } from "consolium/output";

const files = new Table(
  {
    path: { header: "File", cellOptions: { padding: " " } },
    status: { header: "Status", cellOptions: { padding: " " } },
  },
  { border: TableBorder.Rounded },
  [
    { path: "README.md", status: "ready" },
  ],
);

console.log(files.renderLines().join("\n"));
// ╭───────────┬────────╮
// │ File      │ Status │
// ├───────────┼────────┤
// │ README.md │ ready  │
// ╰───────────┴────────╯
```

## In a glance

- Import exactly what you need: `consolium/input`, `consolium/output`, or the
  fully integrated `consolium` exposing a convenient `Terminal` class.
- Decode terminal keyboard, mouse, wheel, CSI, and SS3 sequences into
  browser-like event objects.
- Format and lay out content to the current terminal width; render viewport
  frames to its height.
- Use ordinary output for pipes and files, while TTY-only features such as
  alternate screens and resize handling stay explicit.

# Usage

## Installation

Install from npm:

```sh
npm install consolium
```

For Deno, install the npm package through Deno's npm compatibility:

```sh
deno add npm:consolium
```

# Concepts

Before reading the API section, a few concepts help you make sense of the API
surface.

Keep in mind a lot of the following explanations are oversimplified and may not
be factually 100% correct, but will help you form a good enough simplified
mental model of the processes Consolium wraps for you.

## The basics - Processes, streams, terminals, and TTYs

A command-line application is a process with three standard streams:

- **stdin** (standard input) is where the process reads input. In Node.js this
  is `process.stdin`.
- **stdout** (standard output) is where normal results are written. In Node.js
  this is `process.stdout`.
- **stderr** (standard error) is a separate output for diagnostics and errors.
  In Node.js this is `process.stderr`.

The streams do not inherently represent a keyboard or screen - it all depends on
how your process is launched.

### Terminal interactivity

A simplified mental model is: If the user invokes your program directly from the
terminal, it usually means stdin emits the user's keystrokes and stuff you emit
to stdout gets printed on the user's terminal screen. In this case the terminal
would be interactive.

If your program, however, gets invoked by another program normally that program
gets full control over stdin and stdout. A user may never see directly what your
program writes to stdout, unless the calling program decides to expose it to the
user (for example using `stdio: 'inherit'` option in node).

#### Terminals and Terminal emulators

**TTY** originally meant a physical teletypewriter. Back in the day you may have
had a remote computer and a terminal was really just a physical device acting as
relay for your keyboard and the computer's output. You pressed a key - and the
terminal translated this into bytes and sent it over the wire. Inversely if it
received a byte from the computer, it translated this into a screen
representation/character and appended it to the screen.

Today you don't have a physical device anymore, but you rather launch a
"terminal" - or rather a pseudo-terminal, really - basically your shell. And
instead of that remote computer you have your program that receives and sends
bytes. The shell/terminal program however still sits in between the user and
your program.

Now in case your program is launched by a user terminal, this is exposed as
`process.stdin.isTTY` and `process.stdout.isTTY` by node. A TTY connection makes
interaction possible: the process can read individual keys, ask for mouse
reports, discover the viewport size, react to resizes, and move the terminal
cursor.

In Consolium `terminal.isInteractive` gives a runtime independent indication
whether the `Terminal` output is a TTY.

Consolium allows `write()` and `writeLine()` for any output, but requires an
interactive TTY for screen-changing operations such as `writeFrame()`,
`clearViewport()`, `alternateScreen()`, and `onResize()`. Terminal input
requires both stdin and stdout to be TTYs: stdin carries the reported events,
while stdout carries the control sequences that enable and disable mouse
reporting.

## Input: from bytes to events

So we now have this shell/terminal/TTY that sits in this line of command:

```text
                           +->  stdin-> +
user <-> OS <-> terminal --+            +--  your process     
                           + <-stdout <-+
```

The terminal process basically now needs to handle and translate the bytes your
program outputs into something on the screen and communicate that to the OS, at
the same time it needs to translate OS events from the user into bytes to send
to stdin.

At the same time your process has a little control over the terminal (how it
renders text for example, or how it handles inputs, or what events it sends) -
given that it is interactive. The terminal and your process thus need a layer of
metacommunication to discern from normal bytes that should be input to the
program or output for the screen. This normally happens through **escape
sequences**: short messages beginning with the Escape byte (`ESC`, hexadecimal
`0x1B`) and then followed by certain byte patterns or sequences. For example,
pressing an arrow key commonly sends several bytes even though it feels like one
input action. Or changing the output colour of text sends an escape byte and
another few bytes specifying colour etc.

One thing that your process can also control for example is, _when_ keyboard
events get reported by the terminal. The terminal normally starts in **canonical
mode**, or "cooked", mode. The terminal driver collects user keypresses,
dissects them into special commands and normal keys and _buffers them until
Enter is pressed_. Interactive apps, however, use **raw mode**, which makes
input available immediately and leaves handling of keys such as `Ctrl+C` to your
process. This is important to understand as `TerminalEventStream.open()` enables
raw mode; `close()` restores normal input behavior. Always close the stream when
an app exits so the shell is not left with raw, non-echoing input.

### A small CSI primer - a class of escape sequences

Many terminal commands use a **Control Sequence Introducer**, abbreviated
**CSI**. Its general shape is:

```text
ESC [ <marker> <parameters> <intermediates> <command byte>
```

`ESC [` starts the sequence. It may be followed by a private marker such as `<`,
`=`, `>`, or `?`; Consolium exposes this as `namespaceMarker`. Numeric parameter
fields come next and are normally separated by semicolons. Optional intermediate
bytes can further qualify a command. The final byte, often a letter or `~`,
identifies the instruction and ends the sequence.

It is useful to imagine a CSI sequence as a namespaced function call: the marker
selects a command family, the final byte selects an operation in that family,
and the parameters are its arguments. This is only a mental model - the terminal
interprets the complete byte sequence as a protocol command, not as an actual
function call.

For example:

```text
ESC [ 31 m             m(31) => set the foreground colour to red
ESC [ 2 J              J(2) => erase the whole display
ESC [ < 0 ; 13 ; 5 M   <.M(0, 13, 5) => report a left-button press at column 13, row 5
```

The last example contains the namespace marker `<`, followed by the parameters
`0`, `13`, and `5`, separated by semicolons, and the final instruction `M`. So
it can be inerpreted as ' in the namespace denoted by < call the function
denoted by M with 0, 13, 5'. Consolium interprets this for you as
`< = mouse events` and `M = mouseDown` and then offsets the coordinates to
zero-based position and reports: `{ column: 12, row: 4 }`.

CSI is used in both directions. An app writes sequences such as `ESC [ 2 J` to
stdout for the terminal to execute, while the terminal writes sequences for keys
and mouse actions to the app's stdin. **SS3** is a smaller related family
starting with `ESC O`; terminals commonly use it for keys such as F1–F4, Home,
End, and arrow keys.

Consolium parses these bytes into higher-level events wherever it recognizes
them. Plain and modified keys become `keypress` events. Mouse input becomes
`mousedown`, `mouseup`, `mousemove`, or `wheel` events with modifier keys,
button state, coordinates, and wheel deltas. Unrecognized CSI and SS3 sequences
remain available as `csi` and `ss3` events, including their instruction and
parameters, so an app can implement additional terminal protocols itself.

For example, an otherwise unrecognized `ESC [ > 1 ; 2 z` sequence becomes a
`CSIEvent` with fields equivalent to:

```ts
{
    type: "csi",
    namespaceMarker: ">",
    parameters: [1, 2],
    intermediates: "",
    instruction: "z",
}
```

Mouse reporting is opt-in: terminals do not normally send every pointer movement
to shell programs. Opening `TerminalEventStream` writes the xterm escape/control
sequences that enable SGR mouse reporting and closing it disables those modes
again. When using the integrated `Terminal`, adding an input listener starts
this lifecycle automatically; `stopInput()` closes it explicitly.

## Output

A terminal is a grid of rows and columns visible on screen - and a backbuffer
for text that is already offscreen. Writing beyond the rightmost column wraps
onto the next row, so a logical JavaScript string is not necessarily one
physical terminal line. This matters.

### Cursors and the Scrollbuffer

A terminal also has a cursor: The place where text is inserted. This cursor is
constrained to the visible coordinates of your terminal - it can not operate on
the scrollbuffer that is off-screen. That scrollbuffer is what you see when you
scroll up in a longer running terminal session and normally contains important
results of previous commands the user executed - and clearing it should be
avoided for ergonomics.

Now if you want to have an interactive progress bar for example and update it,
you have two choices:

- render the whole frame again (like, write all the lines again, but with the
  updated bar)
- move the cursor to the progress bar and overwrite it with the new state of the
  progress bar in insert mode

In case you choose the first option, that means your scrollbuffer gets filled
very quickly - and if the user scrolls up in your terminal he is going to see
every frame you ever rendered. This might also mean the user loses previous
output of earlier invoked commands as the scrollbuffer is not infinite and
evicted on a FIFO basis.

The second option is thus the better one, but equally tedious as you need to
keep track of where your progress bar really starts - considering line
overflows, user scroll position etc. It's error prone and often leads to broken
rendering output.

Modern terminals provide options for clearing from a cursor position on. You
move the cursor to a certain column and then clear everything after that column
and row. Consolium uses this strategy. In order to reliably delete a whole
rendered frame, we need to keep track of written lines, however - including line
wraps etc. This is why Consolium offers a `Terminal.writeFrame()` function that
handles bookkeeping for frames it writes. Use `writeLine()` for ordinary
single-line output.

#### Alternate screen

As the scrollbuffer problem is common, terminals usually provide an **alternate
screen buffer**. Interactive programs can render in the terminal's alternate
screen buffer, leaving the user's scrollback untouched.
`terminal.alternateScreen()` enters that buffer and returns a disposable which
restores the original screen when disposed; pass `{ hideCursor: true }` for a
full-screen UI. `clearViewport()` clears the visible screen and homes the
cursor, while `clearFrame()` removes the most recently written frame so it can
be replaced. These operations require a TTY.

### Text width

One thing to keep in mind when rendering in the terminal is that visible width
is not necessarily `string.length`. ANSI formatting is zero-width, combining
marks take no additional columns, and emoji commonly occupy two. So even though
you may have a terminal width of 70 columns and a string with 70 visible chars,
of which 10 are emojis, all of a sudden your string is actually 80 columns wide
and overflows the terminal line.

That's why Consolium exposes text width functions and layouts measure grapheme
display width so truncation, padding, and table columns fit the requested
terminal width.

### Formatting

Your process can control how text is displayed. You can set foreground and
background colours plus styles such as bold, dimmed, italic, underlined,
blinking, inverted, hidden, and strikethrough.

The magic lies in communicating your rendering preference to the terminal - and
you guessed it - this happens through escape sequences. ANSI SGR sequences to be
more exact. Consolium abstracts these sequences for you through a `Formatting`
that describes those styles with a fluent API, including named colours such as
`Formatting.green.bold` and custom colours such as `` Formatting.bg`#CC00FE` ``.
`Terminal` emits colour when its `color` option is `"always"`, or `"auto"` on a
TTY; use `"never"` for plain output.

#### Formatting contexts

To apply a formatting to a certain string of text, wrap that text in an array
and make the first element of the array a formatting instruction/set based on
the fluent formatting API of Consolium:

```ts
import { bgBlack, green } from "consolium/formatting";

const formattedText = [green.bold, "passed"];
```

Every named colour, background colour, and text style is exported from
`consolium/formatting`. You can also import the complete module with
`import * as formatting from "consolium/formatting"`.

Formatting can be nested - preserving unset properties of the parent context.
The following would render everything on a black background, but "build: " in
white and "passed" as bold & green:

```ts
const st = [white.bgBlack, "build: ", [green.bold, "passed"]];
```

Whenever you pass such a line to any Consolium `write()` or `writeLine()` or any
other output function the formatting will be applied to the visible output.

### Terminal Line Layouts & Flex

Sometimes you might want to output certain content on exactly one line - and
formatted in a special way - irrespective of the width of the content itself.
Consolium helps with `HorizontalLayout` and `Flex` in that case.

The model is a simple one. You can chop your content up in different regions by
introducing a Flex boundary definition. By using `Flex`'s fluent API you can
then define the behaviour of regions touching that boundary.

`Flex.grow()` introduces a growing region at the site of the boundary in case
the requested width of the line is greater than the intrinsic content width. You
can use this for example to switch between right and left aligned text.
`Flex.shrinkLeft()` truncates the preceding region and `Flex.shrinkRight()`
truncates the following region in case the intrinsic content is longer than the
requested width. Each of these functions' options can control priority, relative
share, maximum growth, and preserved content.

Create a `HorizontalLayout` and use its functions to generate a final string -
or you can normally pass the nested arrays into the terminal functions like
`writeLine()` and it automatically renders it to the terminal width:

```ts
const statusLine = ["consolium", Flex.grow(), "ready"];
const rendered = new HorizontalLayout(statusLine).computeString(20);
// "consolium      ready"
terminal.writeLine(["consolium", Flex.grow(), "ready"]);
// ...
// |>consolium          ready<|
// ...
```

These Flex boundaries are freely combinable with formatting and act
independently of the formatting contexts - so in the following example the first
region includes "normal " and "left aligned" and the other region contains
"right aligned":

```ts
terminal.writeLine(
  [bgGray, "normal ", [green, "left aligned", Flex.grow(), "right aligned"]],
);
// "normal green left aligned         green right aligned"
```

### Terminal Frame Layouts & scrolling

As you sometimes need to provide long lists of outputs, but also want to have
static information on screen, Consolium provides a `VerticalLayout` that selects
the physical lines visible in a frame of a given height. Its `header` stays
anchored at the top and its `footer` at the bottom; the remaining rows form a
scrollable content viewport.

Short content is padded with blank rows, keeping the footer anchored to the
bottom. If fixed sections exceed the viewport, the footer takes precedence and
the available rows show the start of the header.

Set `scrollOffset` or call `scrollBy()` to move through content, then pass the
layout to `terminal.writeFrame(layout)`. Wiring up the scroll events etc. is
deliberately left to your program and does not happen automatically.

## Library Structure

- Import `Terminal` from `consolium` for the integrated facade - if you want a
  full convenient package to build upon. It owns an output stream, exposes its
  current `width` and `height`, renders structured lines at the available width,
  and can re-emit decoded input events.

- Input-only: Import `consolium/input`. `TerminalEventStream` is an async stream
  of decoded events and manages raw mode and mouse reporting while open.

- Output-only: Import `consolium/output`. Read on in the output concepts to get
  a better understanding of the model this library follows.

# API

## `consolium`

`Terminal` is the main facade. Construct it with optional `output`, `input`,
`color`, and `fallbackSize` options. Its key members are:

- `width`, `height`, and `isInteractive` report usable dimensions and TTY
  status.
- `write(line)` and `writeLine(line)` emit plain or structured lines; colors
  follow the `color` option (`"auto"`, `"always"`, or `"never"`).
- `startInput()` and `stopInput()` control input forwarding. Event listeners for
  `keyPress`, `mouseDown`, `mouseUp`, `mouseMove`, `wheel`, `csi`, and `ss3`
  start it automatically.
- `writeFrame(frame)`, `clearFrame()`, `clearViewport()`, `alternateScreen()`,
  and `onResize()` support interactive rendering.

## `consolium/input`

`TerminalEventStream` asynchronously yields `TerminalKeyboardEvent`,
`TerminalMouseEvent`, `TerminalWheelEvent`, plus raw `CSIEvent` and `SS3Event`
for sequences without a higher-level mapping. Events use browser-familiar
properties including `type`, `key`, `altKey`, `ctrlKey`, `shiftKey`, `button`,
`buttons`, `column`, `row`, `deltaX`, and `deltaY` where applicable.

`TerminalInputStream` is the lower-level async stream of raw characters. Both
streams provide `open()`, `close()`, and `isOpen`.

## `consolium/output`

- `Formatting` supplies fluent ANSI styles such as `Formatting.green.bold`,
  `Formatting.bg\`#123456\``, and`Formatting.fg\`#ABC\``.
- `HorizontalLayout` computes a styled line for a target width. `Flex` supplies
  flexible grow and shrink boundaries.
- `VerticalLayout` selects visible content for a target height with fixed header
  and footer sections.
- `Table` renders object-based data with width, alignment, padding, truncation,
  and flexible-column controls. `TableBorder.Sharp`, `TableBorder.Rounded`, and
  `TableBorder.None` select borders; call `table.renderLines(width)` to produce
  physical lines.

# License

MIT
