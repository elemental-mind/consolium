//@ts-nocheck
// Concept sketch. This file documents the proposed table API and does not need
// to compile yet. Table cells use the TerminalLine values from formatting.ts;
// ANSI escape sequences never become part of the table model.

import
{
    blue,
    Flex,
    gray,
    green,
    red,
    Table,
    TableBorder,
    type TableColumns,
    type TerminalLine,
    type Truncator,
} from "../../source/consolium.ts";


// CellContent is an alias for TerminalLine. It gives table APIs a cell-specific
// name without introducing another formatting representation or conversion.
type CellContent = TerminalLine;

type TableRenderControl =
    {
        // Defaults to -1, meaning fit the table to its content.
        width?: number;

        // Visible terminal-column offset into an intrinsically wider table.
        // Defaults to 0 and is applied before formatting escapes are emitted.
        horizontalOffset?: number;

        formatting?: boolean;
    };


type FileCopy =
    {
        path: string;
        size: number;
        progress: number;
        state: "pending" | "copying" | "complete" | "failed";
    };

declare const files: readonly FileCopy[];


// Object-shaped column definitions are used with object-shaped rows. Property
// order is column order. Each property contains only that column's config; its
// key also identifies the default value in every row.
const fileColumns = {
    path: {
        header: "File",

        // headerOptions/footerOptions may replace content selection and vertical
        // overflow behavior, but not shared horizontal column geometry.
        headerOptions: {
            // Header callbacks receive only this column's title.
            cell: (title): CellContent => blue.bold`${title}`,
        },

        cellOptions: {
            // value is omitted, so the cell value defaults to row.path.
            width: {
                min: 12,
                max: 60,
                flexFactor: 2,
                contentImportance: 50,
            },
            overflow: { truncate: "..." },

            // Padding values are strings, not counts. padding is shorthand for
            // assigning the same string to padLeft and padRight.
            padding: " ",
        },
    },
    size: {
        header: "Size",

        cellOptions: {
            // value overrides the default row.size lookup. It produces the plain
            // value measured, aligned, padded, and truncated by the table.
            value: file => formatBytes(file.size),
            width: {
                min: 7,
                max: 12,
                contentImportance: 80,
            },
            align: "right",
            padLeft: " ",
            padRight: " ",
        },

        footerOptions: {
            value: footerData => footerData.size === undefined
                ? ""
                : formatBytes(footerData.size),
            overflow: { truncate: "" },
        },
    },
    progress: {
        header: "Progress",
        cellOptions: {
            value: file => `${file.progress}%`,
            width: 10,
            align: "right",
            padding: " ",
        },
    },
    state: {
        header: "State",
        cellOptions: {
            width: { min: 10 },

            // cell receives the complete data point, then its zero-based row and
            // column indices. The callback selects file.state itself and emits
            // formatted CellContent. Supplying cell opts out of automatic padding
            // and alignment. The column's overflow policy still applies.
            cell: (file, rowIndex, columnIndex): CellContent => [
                " ",
                [file.state === "complete" ? green : gray, file.state],
                Flex.grow(" "),
            ],
        },
    },
} satisfies TableColumns<FileCopy>;


// Table owns a mutable data: Row[] property; it does not derive from Array. Its
// first argument is always the column definition, its second is the formatting
// object, and its optional third argument is the initial data. Initial data is
// copied into table.data so the table owns its live row collection.
const fileTable = new Table(fileColumns,
    {
        border: TableBorder.rounded,
        borderStyle: gray,
    },
    files);

// footerData is a single data point rendered through the same columns after the
// body. Missing keys produce empty footer cells. It is mutable and is re-read
// and remeasured on every render just like data.
fileTable.footerData = {
    path: "Total",
    size: files.reduce((total, file) => total + file.size, 0),
};

// data may be omitted when rows will arrive later.
const queuedFiles = new Table(fileColumns, {
    border: false,
});

queuedFiles.data.push(...files);

// With no data, only configured headers and footers render. There is no
// synthetic empty-state row.
queuedFiles.data.splice(0, queuedFiles.data.length);
queuedFiles.render();

// All reads and mutations use data directly. Table deliberately exposes no
// array-like proxy methods of its own.
fileTable.data.length;
fileTable.data.find(file => file.state === "failed");
fileTable.data.forEach(file => logCopyState(file));

fileTable.data.push({
    path: "README.md",
    size: 434,
    progress: 0,
    state: "pending",
});

const completedIndex = fileTable.data.findIndex(file => file.path === "README.md");

fileTable.data.splice(completedIndex, 1, {
    ...fileTable[completedIndex],
    progress: 100,
    state: "complete",
});

fileTable.data.unshift({
    path: "package.json",
    size: 1261,
    progress: 0,
    state: "pending",
});

fileTable.data.shift();
fileTable.data.pop();


// Native array methods retain their ordinary behavior and return types.
const removedFiles: FileCopy[] = fileTable.data.splice(0, 1);
const failedFiles: FileCopy[] = fileTable.data
    .filter(file => file.state === "failed");
const paths: string[] = fileTable.data
    .map(file => file.path);


// Rendering belongs to the table, not Terminal. Both methods accept an optional
// control object so width and formatting can be selected independently.
//
// width defaults to -1, meaning fit to content: use the smallest width needed
// to display measured content within the configured column maxima. formatting
// defaults to true.
const tableText: string = fileTable.render();
const explicitlyFitToContent: string = fileTable.render({ width: -1 });
const tableAtEightyColumns: string = fileTable.render({ width: 80 });
const plainTableText: string = fileTable.render({ formatting: false });
const plainAtEightyColumns: TableRenderControl = {
    width: 80,
    formatting: false,
};

const constrainedPlainTable: string = fileTable.render(plainAtEightyColumns);

// If borders, padding, and minimum column widths cannot fit, Table lays out at
// its minimum width and clips the final output to the requested visible width.
// horizontalOffset selects another terminal-column window of that wider table.
const horizontallyScrolled: string = fileTable.render({
    width: 40,
    horizontalOffset: 20,
});

// render() joins physical lines with "\n" and does not append a trailing
// newline. renderLines() performs the same layout but returns the physical lines
// separately; none of the returned strings contain CR or LF characters. With
// formatting enabled, every string reopens required styles and resets them at
// its end. Wrapped rows can therefore be sliced or reordered without ANSI state
// leaking between physical lines.
const formattedLines: string[] = fileTable.renderLines({ width: 80 });
const intrinsicPlainLines: string[] = fileTable.renderLines({
    formatting: false,
});

// Output is controlled by the caller. A stream's current width and formatting
// capability can be forwarded without making Table depend on that stream.
process.stdout.write(fileTable.render({
    width: process.stdout.columns,
    formatting: Boolean(process.stdout.isTTY),
}) + "\n");


// Positional definitions are the equivalent API for positional row data. The
// definition at index n reads row[n] by default. This keeps quick tables terse
// and avoids inventing keys which the supplied data does not have.
type PackageRow = readonly [
    name: string,
    version: string,
    status: "local" | "dependency",
];

const packages = new Table<PackageRow>([
    {
        header: "Package",
        cellOptions: {
            width: { min: 10 },
            padRight: "  ",
        },
    },
    {
        header: "Version",
        cellOptions: {
            padRight: "  ",
        },
    },
    {
        header: "Status",
        cellOptions: {
            cell: row => row[2] === "local"
                ? green`local`
                : gray`dependency`,
        },
    },
], {
    border: false,
}, [
    ["consolium", "0.1.0", "local"],
    ["unitium", "0.8.6", "dependency"],
]);

packages.render({ formatting: false });


// With no column definitions, Table.auto() derives positional columns from array
// rows or keyed columns from object rows. Derived columns use content width and
// inferred default value formatting, but create no headers or footers. Object
// keys use first-seen property order; missing values become empty cells and later
// new keys add columns.
const automaticTable = Table.auto([
    { package: "consolium", version: "0.1.0", private: false },
    { package: "unitium", version: "0.8.6", private: false },
], {
    border: TableBorder.light,
});

automaticTable.render();


// value and cell within an options object are alternative callbacks. Both receive
// the complete data point followed by its zero-based row and column indices.
// value selects or computes a plain value for automatic cell layout; cell selects
// its data and returns complete CellContent. If neither exists, object definitions
// select by key and positional definitions select by index. headerOptions
// callbacks receive only the column title; footerOptions callbacks receive
// table.footerData followed by row index 0 and the column index.
const pathTruncator: Truncator = (path, targetWidth) =>
    truncatePathFromMiddle(path, targetWidth);

const detailedFileColumns = {
    path: {
        header: "File",
        cellOptions: {
            width: { min: 10, flexFactor: 3 },
            cell: file =>
            {
                const normalizedPath = normalizePath(file.path);

                return [
                    " ",
                    [gray.underlined, normalizedPath],
                    Flex
                        .shrinkLeft({
                            truncator: pathTruncator,
                            preserve: 8,
                            contentImportance: 50,
                        })
                        .grow(" "),
                ];
            },
        },
    },
    progress: {
        header: "Done",
        cellOptions: {
            value: file => `${file.progress}%`,
            width: 8,
            align: "right",
            padding: " ",
        },
    },
} satisfies TableColumns<FileCopy>;

const detailedFileTable = new Table(detailedFileColumns, {
    border: TableBorder.light,
}, files);

detailedFileTable.render({ width: 100, formatting: true });


// Wrapping proposal
//
// CellContent remains exactly one logical TerminalLine. Wrapping is an overflow
// policy applied by Table after it allocates the column width; it does not add a
// second, multi-line cell-content type to the public formatting model.
type Diagnostic =
    {
        location: string;
        message: string;
        severity: "info" | "warning" | "error";
    };

declare const diagnostics: readonly Diagnostic[];

const diagnosticTable = new Table({
    location: {
        header: "Location",
        cellOptions: {
            width: { min: 12, max: 30 },
            overflow: { truncate: "..." },
            verticalAlign: "top",
            padding: " ",
        },
    },
    message: {
        header: "Message",
        cellOptions: {
            width: { min: 20, max: 80 },

            // word prefers whitespace boundaries. A word wider than the available
            // cell width falls back to column-safe character wrapping so the table
            // can never exceed its allocated width.
            overflow: {
                // Defaults are wrap: "none", maxLines: 1, and truncate: "".
                wrap: "word", // "none" | "word" | "character"
                maxLines: 3,

                // When maxLines hides a remainder, the final physical line is
                // truncated with this marker using the ordinary Truncator rules.
                truncate: "...",
            },
            verticalAlign: "top", // "top" | "middle" | "bottom"
            padding: " ",
        },
    },
    severity: {
        header: "Severity",
        cellOptions: {
            width: { min: 10 },
            verticalAlign: "middle",
            cell: diagnostic => diagnostic.severity === "error"
                ? red.bold`error`
                : diagnostic.severity === "warning"
                    ? gray`warning`
                    : blue`info`,
        },
    },
} satisfies TableColumns<Diagnostic>, {
    border: TableBorder.light,
}, diagnostics);

diagnosticTable.render({ width: 80 });
diagnosticTable.renderLines({ width: 80, formatting: false });


// renderLines() already gives callers self-contained units for ordinary vertical
// scrolling. If fixed headers and footers are needed, one renderSections() call
// is preferable to separate renderHead/renderBody/renderFooter calls: all three
// sections are guaranteed to share the same measured column widths.
const renderedSections: {
    head: string[];
    body: string[];
    footer: string[];
} = diagnosticTable.renderSections({ width: 80, formatting: true });

const verticalOffset = 20;
const viewportHeight = 10;
const visibleBody = renderedSections.body
    .slice(verticalOffset, verticalOffset + viewportHeight);

const composedViewport = [
    ...renderedSections.head,
    ...visibleBody,
    ...renderedSections.footer,
].join("\n");


// Proposed initial rules:
//
// - Object definitions use their property key for value by default; positional
//   definitions use their array index.
// - cellOptions value/cell callbacks receive (dataPoint, rowIndex, columnIndex).
//   footerOptions callbacks receive the same arguments for footerData.
//   headerOptions callbacks receive only that column's title. value returns a
//   plain value and cell returns CellContent; one options object cannot use both.
// - Table owns data: Row[] and exposes no array proxy methods. All collection
//   operations go through table.data. Headers, footerData, and every current body
//   row are remeasured on every render.
// - footerData is an optional Partial<Row>. It produces one footer row; missing
//   keys become empty footer cells. With no body rows, only configured headers
//   and an available footerData row (plus borders/separators) are rendered.
// - Each header is its column's title. Headers and footer cells participate in
//   preferred-width measurement alongside body cells.
// - cellOptions is the complete body-cell configuration and owns the column's
//   shared horizontal geometry. headerOptions and footerOptions may define their
//   own value/cell callbacks and override overflow or verticalAlign.
// - Header/footer cells inherit width, align, padding, padLeft, and padRight from
//   cellOptions. They do not inherit its value or cell callback: header content
//   defaults to the configured header value and footer content defaults to the
//   corresponding value in footerData.
// - headerOptions and footerOptions cannot define width, align, padding, padLeft,
//   padRight, flexFactor, contentImportance, or anything else that would give a
//   section different horizontal column geometry.
// - padding assigns both sides. padLeft and padRight override either side. Each
//   is inserted once on every physical cell line and its visible width reduces
//   the cell content box.
// - A custom cell owns padding and alignment, but still renders inside the width
//   allocated to its column. The configured overflow policy applies afterwards.
// - An omitted width means content width, a number means exact width, and an
//   object means flex sizing. Flex columns shrink to min in ascending
//   contentImportance order; flexFactor shares shrinkage between equal peers.
//   Content and exact widths do not flex.
// - Wrapping turns a logical cell into physical lines. A row's height is the
//   greatest physical line count among its cells; verticalAlign places shorter
//   cells within that height. Borders and padding repeat on every physical line.
// - Overflow defaults to { wrap: "none", maxLines: 1, truncate: "" }. Wrapping
//   and visible truncation markers are therefore both opt-in.
// - Flex elements are incompatible with wrapping. If a header, footer, or body
//   cell contains Flex while its resolved section options have wrap other than
//   "none", rendering throws TableLayoutError. Use Flex for a single physical
//   line or wrapping without Flex for a multi-line cell.
// - If the requested width is below the table's minimum layout width, the table
//   is clipped to exactly that many visible terminal columns. horizontalOffset
//   selects the clipped window and is also measured in visible terminal columns.
// - With formatting enabled, each physical string emitted by renderLines() or
//   renderSections() restores and resets its own styles. Wrapped cell styles are
//   therefore repeated for every physical line.
// - Explicit cell newlines, spans, interactive selection, sorting, and paging
//   remain outside the first table API.
// - render() and renderLines() accept { width?, formatting? }. Width defaults to
//   -1 (fit to content) and formatting defaults to true.


declare function formatBytes(bytes: number): string;
declare function logCopyState(file: FileCopy): void;
declare function normalizePath(path: string): string;
declare function truncatePathFromMiddle(path: string, width: number): string;
