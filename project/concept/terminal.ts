//@ts-nocheck
// Concept sketch. This file documents the proposed terminal API and does not
// need to compile yet. The structure and formatting of TerminalLine are defined
// separately in formatting.ts.

import
{
    blue,
    gray,
    green,
    Terminal,
    type TerminalLine,
    type TerminalSize,
} from "../../source/consolium.ts";


// A Terminal owns all interaction with one output stream. Supplying the stream
// makes dimensions, color capability, TTY detection, and tests refer to the same
// destination. process.stdout is the default when output is omitted.
const terminal = new Terminal({
    output: process.stdout,
    color: "auto",
    fallbackSize: {
        width: 80,
        height: 24,
    },
});

// Dimensions are always usable. For a TTY they reflect its current viewport;
// for a pipe, file, or incomplete test stream they use fallbackSize.
terminal.width;
terminal.height;
terminal.isInteractive;

// write() and writeLine() are the only ordinary output primitives. They accept
// the structured values established in formatting.ts; ANSI serialization and
// color downgrading happen only when Terminal writes to its bound stream.
// writeLine() rejects line-feed or carriage-return characters in any fragment;
// it owns the single newline appended after the supplied TerminalLine.
terminal.write(["Copying ", green.bold`package.json`]);
terminal.writeLine("... complete");

const statusLine: TerminalLine = [blue.bold`terminalium`, " is ", green`ready`,];

terminal.writeLine(statusLine);

// Clearing means clearing the visible viewport, not erasing scrollback or
// resetting the terminal. State-mutating methods require an interactive TTY and
// fail when called for a pipe or file; normal writes continue to work anywhere.
if (terminal.isInteractive)
    terminal.clearViewport();

// Resize events do not redraw automatically. Remove listeners when a long-lived
// Terminal no longer needs them.
terminal.on("resize", ({ width, height }: TerminalSize) =>
{
    terminal.writeLine([gray, `Viewport changed to ${width} x ${height}`]);
});


// Interactive rendering is a separate, explicitly scoped mode. Entering the
// alternate screen optionally hides the cursor. Disposing the screen restores
// the cursor and returns to the original screen, including when the scope exits
// because an exception was thrown.
async function showCopyProgress(files): Promise<void>
{
    if (!terminal.isInteractive)
        return;

    const render = () => terminal.writeFrame(renderCopyProgressFrame(files));

    using screenDisposeHandle = terminal.alternateScreen({ hideCursor: true });
    using renderLoopHandle = setInterval(render, 100);
    terminal.on("resize", render);

    try
    {
        render();
        await copyFiles(files, writeFrame);
    }
    finally
    {
        terminal.off("resize", render);
    }
}

// A frame has a content section and optional header and footer sections, each
// containing one or more formatted terminal lines. Header and footer stay fixed
// to the viewport edges; content occupies the space between them. When content
// exceeds the available terminal height, Terminal truncates the visible portion
// and makes the full section scrollable.
function renderCopyProgressFrame(files): { header?: readonly TerminalLine[]; content: readonly TerminalLine[]; footer?: readonly TerminalLine[]; }
{
    const header: TerminalLine[] = [[blue.bold, "Copying files..."]];

    const content: TerminalLine[] = files
        .map(file => [file.completed ? green : gray, file.name]);

    const footer: TerminalLine[] = [[gray, `${files.completed}/${files.length} complete`]];

    return { header, content, footer };
}

// writeFrame() is exposed directly by Terminal. Before writing, it clears the
// frame previously written through this method, if any. It automatically limits
// content to the height left by header and footer and lets the user scroll any
// overflow. It does not subscribe to resize events or rebuild the supplied
// sections automatically.
terminal.writeFrame({
    header: [[blue.bold, "Interactive view"]],
    content: ["Working..."],
    footer: ["Press Esc to close"],
});

// clearFrame() removes the currently displayed frame and is a no-op when no
// frame is active. Ordinary output written before the frame is left intact.
terminal.clearFrame();
