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
or you can normally pass the naked arrays into the terminal functions like
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

# API

## Library Structure

- `consolium` exports the integrated `Terminal` facade and its supporting types.
- `consolium/input` exports raw and decoded input streams, event classes, and
  mouse/modifier enums and types.
- `consolium/output` exports formatting, horizontal and vertical layouts,
  flexible boundaries, and tables.
- `consolium/formatting` exports `Formatting` together with each formatting
  property as a standalone import.

All examples use ES modules. APIs which change terminal state require an
interactive TTY; redirected output and most test runners are not interactive.

## `consolium`

### `new Terminal(options?)`

```ts
import { Terminal } from "consolium";

const terminal = new Terminal({
    color: "auto",
    fallbackSize: { width: 80, height: 24 },
});
```

`options` is a `TerminalOptions` object:

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `output` | `TerminalOutput` | `process.stdout` | Destination used for output, dimensions, TTY detection, and resize events. |
| `input` | `TerminalInputEventSource` | A new `TerminalEventStream` | Decoded event source used by `startInput()`. Useful for adapters and tests. |
| `color` | `"auto" \| "always" \| "never"` | `"auto"` | In `auto` mode ANSI formatting is retained only for a TTY output. |
| `fallbackSize` | `TerminalSize` | `{ width: 80, height: 24 }` | Dimensions used when the output does not expose positive integer `columns` and `rows`. |

`fallbackSize.width` and `fallbackSize.height` must be positive integers.

#### Properties

| Property | Type | Description |
| --- | --- | --- |
| `width` | `number` | Current output width, or the configured fallback width. |
| `height` | `number` | Current output height, or the configured fallback height. |
| `isInteractive` | `boolean` | `true` when `output.isTTY === true`. |
| `isInputActive` | `boolean` | Whether decoded input is currently being forwarded. |

#### `write(line)` and `writeLine(line)`

```ts
import { Terminal } from "consolium";
import { Flex, Formatting } from "consolium/output";

const terminal = new Terminal();

terminal.write("Downloading...");
terminal.writeLine([Formatting.green.bold, "OK", Flex.grow("."), "100%"]);
```

- `line: TerminalLine` — either a string or a structured `LineDefinition`.
- `write()` writes exactly the rendered content and returns `void`.
- `writeLine()` appends `\n` and rejects line-feed or carriage-return characters
  in the supplied line.
- Structured lines are fitted to `terminal.width`. Flexible regions are used
  first; if the line still cannot fit, the end is truncated. If it is still too
  short, spaces are appended.

#### Input events

```ts
import { Terminal } from "consolium";

const terminal = new Terminal();

terminal.on("keyPress", event => {
    if (event.ctrlKey && event.key === "c")
        void terminal.stopInput();
});

terminal.on("mouseDown", event => {
    terminal.writeLine(`button ${event.button} at ${event.column},${event.row}`);
});
```

`on(event, listener)` uses the normal Node `EventEmitter` API. The typed event
names and payloads are:

| Event name | Payload |
| --- | --- |
| `keyPress` | `TerminalKeyboardEvent` |
| `mouseDown` | `TerminalMouseEvent<"mousedown">` |
| `mouseUp` | `TerminalMouseEvent<"mouseup">` |
| `mouseMove` | `TerminalMouseEvent<"mousemove">` |
| `wheel` | `TerminalWheelEvent` |
| `csi` | `CSIEvent` |
| `ss3` | `SS3Event` |

Adding a listener for any event in this table automatically calls
`startInput()`. `startInput(): this` is idempotent, opens the input source, and
forwards its events. `stopInput(): Promise<void>` closes the source, restores
its terminal state, and waits for forwarding to finish. Call and await it as
part of application shutdown.

#### Interactive rendering

```ts
import { Terminal } from "consolium";
import { Formatting, VerticalLayout } from "consolium/output";

const terminal = new Terminal();
const screen = terminal.alternateScreen({ hideCursor: true });

try {
    const layout = new VerticalLayout(["First row", "Second row"], {
        header: [[Formatting.bold, "Consolium"]],
        footer: ["Press Ctrl+C to exit"],
    });

    terminal.writeFrame(layout);
} finally {
    screen[Symbol.dispose]();
}
```

| Method | Parameters and behavior |
| --- | --- |
| `writeFrame(frame): void` | `frame` is `readonly TerminalLine[] \| VerticalLayout`. Clears the previous frame, selects exactly the visible lines for `height`, renders every line to `width`, and remembers the rendered height for the next update. |
| `clearFrame(): void` | Clears the area occupied by the last frame. It does nothing before a frame has been written. |
| `clearViewport(): void` | Clears the terminal viewport, moves the cursor home, and resets frame tracking. |
| `alternateScreen(options?): Disposable` | Enters the alternate screen. `hideCursor?: boolean` also hides the cursor. Disposing restores the cursor and primary screen; disposal is idempotent. |
| `onResize(listener): Disposable` | Calls `listener({ width, height })` on output resize events. Dispose the returned object to unsubscribe. |

These methods require `isInteractive === true` (except a no-op
`clearFrame()`). `onResize()` additionally requires the output to implement
`on("resize", listener)`.

`Disposable` has one method, `[Symbol.dispose](): void`, so modern TypeScript
can also manage these resources with `using`.

```ts
using screen = terminal.alternateScreen({ hideCursor: true });
using resizeSubscription = terminal.onResize(() => terminal.writeFrame(layout));
```

## `consolium/input`

Both input streams implement this lifecycle:

```ts
interface TerminalStream<T> extends AsyncIterable<T> {
    readonly isOpen: boolean;
    open(): this;
    close(): Promise<void>;
}
```

Opening is idempotent. Iterating a closed stream throws. Closing is idempotent,
ends pending reads, and restores terminal state. A stream supports only one
active reader.

### `TerminalEventStream`

`TerminalEventStream` enables raw input and mouse reporting, then decodes input
into `TerminalInputEvent` objects. `TerminalEventStream.isSupported` reports
whether both stdin and stdout are interactive TTYs.

```ts
import { TerminalEventStream } from "consolium/input";

const events = new TerminalEventStream().open();

try {
    for await (const event of events) {
        if (event.type === "keypress")
            console.log(event.key, event.ctrlKey);

        if (event.type === "keypress" && event.key === "Escape")
            break;
    }
} finally {
    await events.close();
}
```

- `read(): Promise<TerminalInputEvent | undefined>` consumes one event, or
  returns `undefined` when the stream is closed or ends.
- `[Symbol.asyncIterator]()` consumes events until the stream ends. Leaving the
  loop closes the underlying input stream.
- Recognized escape sequences become keyboard, mouse, or wheel events.
  Unrecognized but valid control sequences remain `CSIEvent` or `SS3Event`.

### `TerminalInputStream`

This lower-level stream yields decoded Unicode characters without interpreting
escape sequences. Opening it enables raw input and mouse reporting.

```ts
import { TerminalInputStream } from "consolium/input";

const input = new TerminalInputStream().open();

try {
    const next = await input.peek(); // does not consume the character
    const same = await input.read(); // consumes it
} finally {
    await input.close();
}
```

- `TerminalInputStream.isSupported: boolean` checks stdin/stdout TTY support.
- `hasBufferedInput: boolean` indicates whether a character is available
  synchronously.
- `peek(): string | Promise<string | undefined> | undefined` returns the next
  character without consuming it.
- `read(): string | Promise<string | undefined> | undefined` consumes the next
  character.

### Event objects

Every event has `altKey`, `ctrlKey`, and `shiftKey` booleans.

| Event | Important properties |
| --- | --- |
| `TerminalKeyboardEvent` | `type: "keypress"`, `key: string` |
| `TerminalMouseEvent` | `type`, `button`, `buttons`, zero-based `column` and `row`, plus `leftMouseButton`, `middleMouseButton`, and `rightMouseButton` convenience booleans |
| `TerminalWheelEvent` | Mouse properties plus `deltaX` and `deltaY`; negative values mean left/up and positive values mean right/down |
| `CSIEvent` | `type: "csi"`, final `instruction`, numeric `parameters`, `intermediates`, and `namespaceMarker` |
| `SS3Event` | `type: "ss3"`, final `instruction` |

`MouseButton` identifies the button which changed (`None`, `Left`, `Middle`, or
`Right`). `MouseButtonFlag` is a bit flag used by `buttons`; combine or test its
`Left`, `Middle`, and `Right` members to inspect the currently held buttons.
`ModifierKeyFlag` provides the corresponding `Shift`, `Alt`, and `Ctrl` flags.

## `consolium/output`

### Formatting

`Formatting` is a fluent, immutable-at-the-root collection of ANSI styles.
Named foreground colors are `black`, `red`, `green`, `yellow`, `blue`,
`magenta`, `cyan`, `white`, and `gray`; prefix the capitalized name with `bg`
for a background color. Styles are `bold`, `dimmed`, `italic`, `underlined`,
`blinking`, `inverted`, `hidden`, and `strikethrough`.

```ts
import { Formatting } from "consolium/output";

const statusLine = [
    Formatting.green.bold,
    "success ",
    [Formatting.fg`#8A2BE2`.underlined, "with nested formatting"],
];
```

Use the `fg` and `bg` tagged templates for three- or six-digit hexadecimal RGB
colors. Invalid hex colors throw a `TypeError`. A formatting value belongs in
the first position of a formatting frame; nested frames inherit the parent's
settings and override only the styles they specify.

The `consolium/formatting` entry point also exports every named color and style
directly:

```ts
import { bold, green, fg } from "consolium/formatting";

const lines = [[green.bold, "OK"], [fg`#09F`, "custom blue"], [bold, "note"]];
```

### `HorizontalLayout`

```ts
import { Flex, Formatting, HorizontalLayout } from "consolium/output";

const layout = new HorizontalLayout([
    [Formatting.bold, "build"],
    Flex.shrinkLeft({ preserve: 4, contentImportance: 1 }),
    "packages/application/index.ts",
    Flex.grow({ filler: ".", fillPriority: 1 }),
    "done",
]);

console.log(layout.unformattedWidth);
console.log(layout.computeString(40));
```

`new HorizontalLayout(lineDefinition)` parses a `LineDefinition`, which is an
array of strings, nested formatting frames, and `Flex` boundaries.

- `unformattedWidth: number` is the visible column width before flex changes;
  ANSI escape sequences are not counted.
- `computeString(targetWidth, force?): string` renders at the target width.
  `targetWidth` must be non-negative. Flex ranges grow or shrink according to
  their priorities and factors.
- Without `force`, the result may remain wider or narrower than `targetWidth`
  when flex boundaries cannot absorb the full difference.
- `force` supplies `truncate` and `fill` handlers and may specify `truncator`
  and `filler` strings. It forces any remaining difference after flex layout.
  Most callers should let `Terminal.write()` provide these defaults.

### `Flex`

A boundary can affect content on either side and can be chained:

```ts
["left", Flex.shrinkLeft().grow(" ").shrinkRight(), "right"]
```

| Method | Description |
| --- | --- |
| `Flex.shrinkLeft(value?)` | Allows content before the boundary to truncate at its end. |
| `Flex.grow(value?)` | Inserts flexible filler at the boundary. |
| `Flex.shrinkRight(value?)` | Allows content after the boundary to truncate at its start. |

Each method is also available on the returned boundary for chaining.

Shrink methods accept a marker string, a custom truncation handler, or:

```ts
interface FlexShrinkConfiguration {
    truncator: string | ((fragments: string[], shrinkLength: number) => string[]);
    preserve?: number;           // default 3, including the marker
    contentImportance?: number;  // default 0; higher shrinks later
    flexFactor?: number;         // default 1; relative shrink share
}
```

A custom handler receives fragments split at formatting boundaries and must
return the same number of fragments. `preserve` sets the minimum visible width
of the range, including a string marker.

`grow()` accepts a filler string, a `(targetLength) => string` function, or:

```ts
interface FlexGrowConfiguration {
    filler: string | ((targetLength: number) => string);
    fillPriority?: number; // default 0; higher grows first
    max?: number;          // default Infinity
    flexFactor?: number;   // default 1; relative growth share
}
```

### `VerticalLayout`

```ts
import { VerticalLayout } from "consolium/output";

const layout = new VerticalLayout(items, {
    header: ["Items"],
    footer: ["↑/↓ scroll"],
    scrollOffset: 0,
});

layout.scrollBy(1);
const visibleLines = layout.computeLines(terminalHeight);
```

`content`, `header`, and `footer` are readonly arrays of `TerminalLine`.
`scrollOffset` is normalized to a non-negative integer and may be read or set.
`scrollBy(amount): this` adjusts it. `computeLines(height)` clamps the offset,
keeps the footer at the bottom, keeps as much header as fits, slices the content,
and fills unused content rows with empty lines. It returns exactly `height`
lines for non-negative integer heights.

### `Table`

```ts
import { Formatting, Table, TableBorder } from "consolium/output";

type PackageRow = { name: string; version: string; downloads: number };

const table = new Table<PackageRow>({
    name: {
        header: "Package",
        cellOptions: {
            width: { minContentWidth: 8, flexFactor: 2 },
            padding: { left: " ", right: " " },
        },
    },
    version: {
        header: "Version",
        cellOptions: { width: 10, align: { horizontal: "center" } },
    },
    downloads: {
        header: "Downloads",
        cellOptions: {
            width: { minContentWidth: 6, maxContentWidth: 12 },
            align: { horizontal: "right" },
            cell: row => row.downloads.toLocaleString(),
        },
    },
}, {
    border: TableBorder.Rounded,
    borderStyle: Formatting.gray,
});

table.bodyData = [
    { name: "consolium", version: "0.1.0", downloads: 1234 },
];

for (const line of table.renderLines(60))
    console.log(line);
```

#### Construction and rendering

```ts
new Table<EntryType>(columns, formatting?, data?, footerData?)
Table.Auto(data, formatting?)
table.renderLines(preferredOverallTableWidth?)
```

| Parameter | Description |
| --- | --- |
| `columns` | Record whose keys identify columns and normally select the same property from each row. Object insertion order determines display order. |
| `formatting` | `{ border?: TableBorder \| false; borderStyle?: FormattingAPI }`. The default border is `TableBorder.Sharp`; `false` is equivalent to `TableBorder.None`. |
| `data` | Initial body rows; defaults to `[]`. Rows remain available as mutable `bodyData`. |
| `footerData` | Optional partial row rendered after the body. It remains available as `footerData`. |
| `preferredOverallTableWidth` | `-1` (the default) sizes from content. A non-negative integer requests an overall width; flexible columns absorb as much of the difference as their limits permit. |

`Table.Auto(data, formatting?)` infers one column per enumerable property of
the first row and requires at least one row. `renderLines()` returns the table as
physical strings. `emptyWidth` reports border/separator and padding width before
cell content is added.

#### Column definitions

Each column may contain:

| Property | Description |
| --- | --- |
| `header` | Header label. A header row is rendered when at least one column defines one. |
| `headerOptions` | Overrides `cell` and `overflow` for the header. |
| `cellOptions` | Controls body access, width, alignment, padding, and overflow. |
| `footerOptions` | Overrides `cell` and `overflow` for the footer. |

A `cell(data, rowIndex, columnIndex, column)` callback returns `CellContent`.
Without one, the column identifier is used to read the row. Arrays are treated
as structured `LineDefinition` values; other values are converted with
`String(value ?? "")`.

`cellOptions` supports:

| Property | Type and behavior |
| --- | --- |
| `width` | A non-negative integer fixes the content width. An object may set `minContentWidth` (default `0`), `maxContentWidth` (default unbounded), `flexFactor` (default `1`), and `contentImportance` (default `0`; higher-priority content shrinks later). |
| `align.horizontal` | `"left"`, `"center"`, or `"right"`; default `"left"`. |
| `align.vertical` | Reserved for vertically sized cells. |
| `padding` | One string for both sides, or `{ left?: string; right?: string }`. Padding is outside the configured content width. |
| `overflow.truncate` | Marker used when content is wider than its column; defaults to `…`. |

#### Borders

Choose `TableBorder.Sharp`, `TableBorder.Rounded`, or `TableBorder.None`.
`border.withStyle(formatting)` returns a border using the supplied ANSI style;
the predefined singleton is not modified. Supplying `formatting.borderStyle`
to the table is the convenient equivalent.

# License

MIT
