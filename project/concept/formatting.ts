//@ts-nocheck
// Concept sketch. This file documents the proposed line-formatting API and does
// not need to compile yet.

import
{
    blue,
    columnWidth,
    fitColumns,
    Flex,
    gray,
    green,
    red,
    sliceColumns,
    sliceColumnsFromEnd,
    TerminalRenderer,
    yellow,
    type TerminalLine,
    type Truncator,
} from "../../source/consolium.ts";

const terminal = new TerminalRenderer();

// A line can be a string. Lines never contain newline characters; line
// separation belongs to writeLine(), tables, and the frame renderer.
terminal.writeLine("A plain terminal line");

// An array concatenates fragments. Keeping fragments separate lets the renderer
// measure and lay them out without parsing one already-concatenated string.
terminal.writeLine(["Copied ", "12", " files"]);

// A tagged style creates a self-contained styled leaf. Its style ends with the
// tagged template and does not affect later siblings.
terminal.writeLine(["Status: ", green.bold`complete`, " in 2.4 seconds"]);

// An array whose first element is a styler creates a style scope. Nested scopes
// inherit unspecified properties, override the properties they set, and restore
// the outer style when they end.
terminal.writeLine([
    "Unformatted, then ", [blue.bgRed, "formatted, then with ", [red.bold, "embedded formatting"], " and in blue with a red background again"], " and finally unformatted"
]);

// Style scopes work with runtime strings as well as literals. The renderer owns
// ANSI serialization, so filePath itself contains no formatting sequences.
const filePath = "C:\\Code\\terminalium\\source\\output\\formatting.ts";

terminal.writeLine(["Source: ", [gray.underlined, filePath]]);

// A custom truncator receives the unformatted shrink-context text and its exact
// target width. It must return one line with exactly targetWidth visible terminal
// columns. The surrounding style scope is applied again after truncation.
const pathTruncator: Truncator = (
    unformattedPath: string,
    targetWidth: number,
): string =>
{
    const marker = "...";

    if (targetWidth <= columnWidth(marker))
        return sliceColumns(marker, 0, targetWidth);

    const tailWidth = targetWidth - columnWidth(marker);
    const tail = sliceColumnsFromEnd(unformattedPath, tailWidth);

    // fitColumns protects the callback contract when wide Unicode characters
    // make the selected tail narrower than the requested terminal width.
    return fitColumns(marker + tail, targetWidth);
};


// A Flex boundary separates two shrink contexts. Its emitted fragment is a
// growth context. Here the space grows to consume the remaining line width,
// producing ordinary left/right alignment.
terminal.writeLine(["terminalium", Flex.grow(" "), green.bold`ready`]);


// Growth contexts can have minimum and maximum widths. The fill fragment is
// repeated (and column-safely clipped if necessary) to fulfill the allocated
// width. This makes bounded leaders possible without a separate utility.
terminal.writeLine([
    "Formatting",
    Flex.grow(".", {
        min: 3,
        max: 20,
        contentImportance: 0,
        flexFactor: 1,
    }),
    "42%",
]);


// contentImportance replaces a generic "priority": higher values are preserved
// longer when width is scarce. flexFactor divides shrinkage or growth among
// candidates with equal contentImportance. preserve is always measured in
// visible terminal columns, not UTF-16 code units or grapheme count.
terminal.writeLine([
    "Copying files...",
    Flex
        .shrinkLeft({
            truncator: "...",
            preserve: 10,
            contentImportance: 100,
            flexFactor: 1,
        })
        .grow(" ", {
            min: 1,
            contentImportance: 0,
            flexFactor: 1,
        })
        .shrinkRight({
            truncator: pathTruncator,
            preserve: 12,
            contentImportance: 50,
            flexFactor: 1,
        }),
    [gray.underlined, filePath],
]);


// Multiple boundaries produce multiple shrink and growth contexts. The three
// content sections here are repository, branch, and path. The two boundary
// outputs are independently bounded growth contexts.
//
// The repository has greater contentImportance, so branch and path shrink first.
// Branch and path have equal importance; their 2:1 flex factors assign twice as
// much of the required shrinkage to branch, until a preserve limit is reached.
const repository = "elemental-mind/terminalium";
const branch = "feature/rework-terminal-output-formatting";

const repositoryStatusLine: TerminalLine = [
    [blue.bold, repository],

    Flex
        .shrinkLeft({
            truncator: "...",
            preserve: 12,
            contentImportance: 100,
            flexFactor: 1,
        })
        .grow(" ", {
            min: 1,
            max: 4,
            contentImportance: 0,
            flexFactor: 1,
        })
        .shrinkRight({
            truncator: "...",
            preserve: 8,
            contentImportance: 50,
            flexFactor: 2,
        }),

    [yellow, branch],

    Flex
        .grow(" ", {
            min: 1,
            max: 12,
            contentImportance: 0,
            flexFactor: 2,
        })
        .shrinkRight({
            truncator: pathTruncator,
            preserve: 12,
            contentImportance: 50,
            flexFactor: 1,
        }),

    [gray.underlined, filePath],
];

terminal.writeLine(repositoryStatusLine);


// The full motivating example combines plain fragments, inheritable styling,
// two-sided shrinking, a growing separator, and a custom path truncator. The
// value remains structured until writeLine renders it for the terminal's current
// width; callers do not need to invoke format() first.
const terminalLine: TerminalLine = [
    "Unformatted, then ", [
        blue.bgRed, "formatted, then with ", [
            red.bold, "embedded formatting"],
        " and in blue with a red background again",
    ],

    Flex
        .shrinkLeft({
            truncator: "...",
            preserve: 10,
            contentImportance: 100,
            flexFactor: 1,
        })
        .grow(" ", {
            min: 1,
            contentImportance: 0,
            flexFactor: 1,
        })
        .shrinkRight({
            truncator: pathTruncator,
            preserve: 10,
            contentImportance: 50,
            flexFactor: 1,
        }),

    [gray.underlined, filePath],
];

terminal.writeLine(terminalLine);


// The same TerminalLine values can be stored in frame sections. renderFrame()
// supplies its width to the line formatter when it eventually emits each line.
const header: TerminalLine[] = [
    [blue.bold, "Copy operation"],
];

const content: TerminalLine[] = [
    terminalLine,
    repositoryStatusLine,
];

const footer: TerminalLine[] = [
    [gray, "Press Esc to cancel"],
];

terminal.renderFrame(header, content, footer);
