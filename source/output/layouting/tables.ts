import { distributeIntegerCapped } from "apportionium";
import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { extendTextArrayEnd, extendTextArrayStart, textWidth, truncateStringsEnd, truncateStringsStart, truncateTextEnd, truncateTextStart } from "../formatting/textSize.ts";
import { DefaultTruncationMarker } from "./flex.ts";
import { HorizontalLayout, type LineDefinition, type LineElement } from "./horizontalLayout.ts";

//----------------------------------------
// Types & Interfaces
//----------------------------------------

/** Pre-formatted inline content that can be laid out within a table cell. */
export type FormattedCellContent = LineDefinition;
/** A value accepted as table cell content before it is converted to text or formatted layout. */
export type CellContent = FormattedCellContent | string | number | bigint | boolean | object | null | undefined;
/** A mapping from column identifiers to their definitions for entries of type `EntryType`. */
export type TableColumns<EntryType> = Record<string, TableColumnDefinition<EntryType>>;
/** Header labels keyed by string properties of `EntryType`. */
export type TableHeaderData<EntryType> = Partial<Record<Extract<keyof EntryType, string>, string>>;

/** Defines the header and cell behavior for a table column. */
export interface TableColumnDefinition<EntryType>
{
    /** Static header text for this column. */
    header?: string;
    /** Options used when rendering this column's header cell. */
    headerOptions?: TableSectionCellOptions<TableHeaderData<EntryType>>;
    /** Options used when rendering this column's body cells. */
    cellOptions?: TableCellOptions<EntryType>;
    /** Options used when rendering this column's footer cell. */
    footerOptions?: TableSectionCellOptions<Partial<EntryType>>;
}

/** Options shared by header, body, and footer cells. */
export interface TableSectionCellOptions<Data>
{
    /**
     * Produces the content for a cell.
     *
     * @param data The data object for the current section row.
     * @param rowIndex Zero-based row index within the section.
     * @param columnIndex Zero-based index of the column.
     * @param column The resolved table column.
     * @returns Content to render in the cell.
     */
    cell?: (data: Data, rowIndex: number, columnIndex: number, column: TableColumn<any>) => CellContent;
    /** Controls how oversized cell content is truncated. */
    overflow?: TableCellOverflow;
}

/** Options specific to body cells in a table column. */
export interface TableCellOptions<Data> extends TableSectionCellOptions<Data>
{
    /**
     * Sets a fixed content width or flexible width constraints for the column.
     *
     * @example
     * ```ts
     * width: 12 // fixed width
     * ```
     *
     * @example
     * ```ts
     * width: { minContentWidth: 8, maxContentWidth: 24, flexFactor: 2 }
     * ```
     */
    width?: number | TableColumnWidth;
    /** Sets horizontal and vertical cell alignment preferences. */
    align?: TableCellAlignment;
    /**
     * Adds symmetric or side-specific padding around cell content.
     *
     * @example
     * ```ts
     * padding: " "
     * ```
     *
     * @example
     * ```ts
     * padding: { left: " ", right: "  " }
     * ```
     */
    padding?: string | TableCellPadding;
}

/** Flexible width constraints and allocation preferences for a table column. */
export interface TableColumnWidth
{
    /** Minimum content width, in terminal columns. */
    minContentWidth?: number;
    /** Maximum content width, in terminal columns. */
    maxContentWidth?: number;
    /** Relative share used when distributing extra width among flexible columns. */
    flexFactor?: number;
    /** Priority for retaining width when the table must shrink; lower values shrink first. */
    contentImportance?: number;
}

/** Controls the appearance of a rendered table. */
export interface TableFormatting
{
    /** Border preset to use, or `false` to omit borders. */
    border?: TableBorder | false;
    /** Formatting applied to border characters. */
    borderStyle?: FormattingAPI;
}

/** Controls truncation of content that exceeds its cell width. */
export interface TableCellOverflow
{
    /** Defaults to the single-column Unicode ellipsis (`…`). */
    truncate?: string;
}

/** Controls horizontal and vertical alignment for table cell content. */
export interface TableCellAlignment
{
    /** Horizontal content alignment. */
    horizontal?: "left" | "center" | "right";
    /** Vertical content alignment. Reserved for compatible cell layouts. */
    vertical?: "top" | "middle" | "bottom";
}

/** Specifies text inserted on either side of cell content. */
export interface TableCellPadding
{
    /** Text inserted before the cell content. */
    left?: string;
    /** Text inserted after the cell content. */
    right?: string;
}

type ParsedCellContent = string | HorizontalLayout;
type TableBorderLine = Record<"left" | "join" | "right", string>;
type CellAccessor = NonNullable<TableSectionCellOptions<any>["cell"]>;
type CellAccessorName = "headerCellAccessor" | "bodyCellAccessor" | "footerCellAccessor";

interface TableBorderOptions
{
    top: TableBorderLine;
    middle: TableBorderLine;
    bottom: TableBorderLine;
    horizontal: string;
    vertical: string;
    style?: FormattingAPI;
}

//----------------------------------------------
// Implementation Logic
//----------------------------------------------

/** Renders typed data as a width-aware text table. */
export class Table<EntryType>
{
    /**
     * Creates a table by inferring columns from the first data entry's enumerable properties.
     *
     * @param data Source rows. Must contain at least one entry.
     * @param formatting Visual formatting options.
     * @returns A table configured with inferred columns and the supplied rows.
     */
    static Auto<EntryType extends object>(data: EntryType[], formatting: TableFormatting = {}): Table<EntryType>
    {
        if (!data.length) throw new Error("Provide at least one data point to infer a schema from.");
        const columnDefinitions = Object.create(null) as Record<string, TableColumnDefinition<EntryType>>;
        const firstEntry = data[0];

        for (const key in firstEntry)
            columnDefinitions[key] = {};

        return new Table<EntryType>(columnDefinitions, formatting, data);
    }

    /** Resolved columns in display order. */
    readonly columns: TableColumn<EntryType>[];

    /** Optional data used to render the header row. */
    headerData?: TableHeaderData<EntryType>;
    /** Data rows rendered in the table body. */
    bodyData: EntryType[];
    /** Optional data used to render the footer row. */
    footerData?: Partial<EntryType>;

    private readonly renderer: TableRenderer;

    /**
     * Creates a table with explicit column definitions.
     *
     * @param columns Definitions keyed by column identifier.
     * @param formatting Visual formatting options.
     * @param data Optional initial body rows.
     * @param footerData Optional data for the footer row.
     */
    constructor(columns: TableColumns<EntryType>, formatting: TableFormatting = {}, data?: EntryType[], footerData?: Partial<EntryType>)
    {
        this.columns = Object.entries(columns).map(([identifier, definition], index) => new TableColumn(index, identifier, definition));
        this.renderer = new TableRenderer(this, formatting);

        this.headerData = this.extractHeaderDataFrom(this.columns);
        this.bodyData = data ?? [];
        this.footerData = footerData;
    }

    /** Width occupied by borders and horizontal padding when every column has zero content width. */
    get emptyWidth(): number
    {
        return this.renderer.border.getRequiredCellSeparatorSpace(this.columns.length) + this.columns.reduce((total, column) => total + column.paddingSize, 0);
    }

    /**
     * Renders the table as terminal-ready text lines.
     *
     * @param preferredOverallTableWidth Target total width, or `-1` to use intrinsic content widths.
     * @returns Rendered lines, including visible border lines.
     *
     * @example
     * table.renderLines() // use intrinsic content widths
     *
     * @example
     * table.renderLines(80) // target an 80-column table
     */
    renderLines(preferredOverallTableWidth: number = -1): string[]
    {
        if (!Number.isInteger(preferredOverallTableWidth) || preferredOverallTableWidth < -1)
            throw new RangeError("The preferred overall table width must be -1 or a non-negative integer.");
        if (this.columns.length === 0)
            return [];

        const columnWidths = new Array<number>(this.columns.length).fill(0);

        let headerCells: ParsedCellContent[] | undefined;
        if (this.headerData)
            headerCells = this.getCellContents([this.headerData], "headerCellAccessor", columnWidths);

        let bodyCells: ParsedCellContent[] | undefined;
        if (this.bodyData.length)
            bodyCells = this.getCellContents(this.bodyData, "bodyCellAccessor", columnWidths);

        let footerCells: ParsedCellContent[] | undefined;
        if (this.footerData)
            footerCells = this.getCellContents([this.footerData], "footerCellAccessor", columnWidths);

        const widths = this.computeAdjustedContentWidths(preferredOverallTableWidth, columnWidths);

        return this.renderer.renderLines(headerCells, bodyCells, footerCells, widths);
    }

    private getCellContents(data: unknown[], accessor: CellAccessorName, columnWidths: number[]): ParsedCellContent[]
    {
        const cells = new Array(data.length * this.columns.length);

        let cellIndex = 0;
        for (let rowIndex = 0; rowIndex < data.length; rowIndex++)
        {
            const row = data[rowIndex];
            for (let columnIndex = 0; columnIndex < this.columns.length; columnIndex++)
            {
                const column = this.columns[columnIndex];
                const rawCellContent = column[accessor](row, rowIndex, columnIndex, column);
                if (Array.isArray(rawCellContent))
                {
                    const content = new HorizontalLayout(rawCellContent as LineElement[]);
                    cells[cellIndex] = content;
                    columnWidths[columnIndex] = Math.max(columnWidths[columnIndex], content.unformattedWidth);
                }
                else
                {
                    const content = String(rawCellContent ?? "");
                    cells[cellIndex] = content;
                    columnWidths[columnIndex] = Math.max(columnWidths[columnIndex], textWidth(content));
                }

                cellIndex++;
            }
        }

        return cells;
    }

    private computeAdjustedContentWidths(requestedOverallTableWidth: number, rawColumnWidths: number[])
    {
        const clampedWidths = this.columns.map((column, index) =>
            Math.min(column.maximumWidth, Math.max(rawColumnWidths[index], column.minimumWidth)));

        if (requestedOverallTableWidth < 0)
            return clampedWidths;

        const availableWidth = Math.max(0, requestedOverallTableWidth - this.emptyWidth);
        const widthDifference = availableWidth - clampedWidths.reduce((total, width) => total + width, 0);

        if (widthDifference === 0)
            return clampedWidths;

        if (widthDifference > 0)
            this.growFlexibleColumns(clampedWidths, widthDifference);
        else
            this.shrinkFlexibleColumns(clampedWidths, -widthDifference);

        return clampedWidths;
    }

    private growFlexibleColumns(contentWidths: number[], amount: number)
    {
        const { distribution } = distributeIntegerCapped(
            amount,
            this.columns.map(column => column.isFlexible ? column.flexFactor : 0),
            this.columns.map((column, index) => column.isFlexible ? column.maximumWidth - contentWidths[index] : 0),
        );

        for (let i = 0; i < contentWidths.length; i++)
            contentWidths[i] += distribution[i];
    }

    private shrinkFlexibleColumns(contentWidths: number[], amount: number)
    {
        const flexColIndicesGroupedByImportance = new Map<number, number[]>();
        for (let i = 0; i < this.columns.length; i++)
            if (this.columns[i].isFlexible)
                flexColIndicesGroupedByImportance.get(this.columns[i].contentImportance)?.push(i) ??
                    flexColIndicesGroupedByImportance.set(this.columns[i].contentImportance, [i]);

        const sortedImportances = Array.from(flexColIndicesGroupedByImportance.keys()).sort((a, b) => a - b);

        for (const contentImportance of sortedImportances)
        {
            const columnIndices = flexColIndicesGroupedByImportance.get(contentImportance)!;
            if (columnIndices.length === 1)
            {
                const columnIndex = columnIndices[0];
                const shrinkAmount = Math.min(amount, contentWidths[columnIndex] - this.columns[columnIndex].minimumWidth);
                contentWidths[columnIndex] -= shrinkAmount;
                amount -= shrinkAmount;
            }
            else
            {
                const { distribution, undistributedAmount } = distributeIntegerCapped(
                    amount,
                    columnIndices.map(columnIndex => this.columns[columnIndex].flexFactor),
                    columnIndices.map(columnIndex => contentWidths[columnIndex] - this.columns[columnIndex].minimumWidth),
                );

                for (let i = 0; i < columnIndices.length; i++)
                    contentWidths[columnIndices[i]] -= distribution[i];

                amount = undistributedAmount;
            }

            if (amount === 0) break;
        }
    }

    private extractHeaderDataFrom(columns: TableColumn<any>[])
    {
        const headerData = {} as Record<string, any>;
        for (const column of columns)
            headerData[column.identifier] = column.header;

        if (Object.values(headerData).some(header => header !== undefined))
            return headerData as TableHeaderData<EntryType>;
    }
}

class TableColumn<EntryType>
{
    /** Zero-based display position of the column. */
    readonly index: number;
    /** Key used to read the column's default values from row data. */
    readonly identifier: string;
    /** Optional static header label. */
    readonly header?: string;

    /** Smallest permitted content width. */
    readonly minimumWidth: number;
    /** Largest permitted content width. */
    readonly maximumWidth: number;
    /** Relative share used when distributing available flexible width. */
    readonly flexFactor: number;
    /** Priority used when reducing flexible widths. */
    readonly contentImportance: number;

    /** Callback that resolves header cell content. */
    readonly headerCellAccessor: CellAccessor;
    /** Callback that resolves body cell content. */
    readonly bodyCellAccessor: CellAccessor;
    /** Callback that resolves footer cell content. */
    readonly footerCellAccessor: CellAccessor;

    /** Left and right text padding applied to each rendered cell. */
    readonly padding: Required<TableCellPadding>;
    /** Combined width of the horizontal padding. */
    readonly paddingSize: number;

    /** Horizontal alignment used to render content. */
    readonly alignment: NonNullable<TableCellAlignment["horizontal"]>;
    /** Marker appended or prepended when content is truncated. */
    readonly truncator: string;

    /**
     * Resolves a column definition into its rendering configuration.
     *
     * @param index Zero-based display position.
     * @param identifier Key used to access row data.
     * @param definition User-provided column definition.
     */
    constructor(index: number, identifier: string, definition: TableColumnDefinition<EntryType>)
    {
        this.index = index;
        this.identifier = identifier;
        this.header = definition.header;

        const widthConfiguration = definition.cellOptions?.width;
        this.validateWidthConfiguration(widthConfiguration);

        this.flexFactor = 1;
        this.contentImportance = 0;

        if (widthConfiguration === undefined)
        {
            this.minimumWidth = 0;
            this.maximumWidth = Infinity;
        }
        else if (typeof widthConfiguration === "number")
        {
            this.maximumWidth = this.minimumWidth = widthConfiguration;
        }
        else
        {
            this.minimumWidth = widthConfiguration.minContentWidth ?? 0;
            this.maximumWidth = widthConfiguration.maxContentWidth ?? Infinity;
            this.flexFactor = widthConfiguration.flexFactor ?? 1;
            this.contentImportance = widthConfiguration.contentImportance ?? 0;
        }

        const defaultCell = (data: any) => data[identifier];
        this.headerCellAccessor = definition.headerOptions?.cell ?? defaultCell;
        this.bodyCellAccessor = definition.cellOptions?.cell ?? defaultCell;
        this.footerCellAccessor = definition.footerOptions?.cell ?? defaultCell;

        const padding = definition.cellOptions?.padding ?? "";
        this.padding = typeof padding === "string" ? { left: padding, right: padding } : { left: padding.left ?? "", right: padding.right ?? "" };
        this.paddingSize = this.padding.left.length + this.padding.right.length;

        this.alignment = definition.cellOptions?.align?.horizontal ?? "left";
        this.truncator = definition.cellOptions?.overflow?.truncate ?? DefaultTruncationMarker;
    }

    /** Whether the column can grow or shrink between different content widths. */
    get isFlexible(): boolean
    {
        return this.maximumWidth > this.minimumWidth;
    }

    private validateWidthConfiguration(width: number | TableColumnWidth | undefined)
    {
        if (width === undefined) return;
        const isInvalidWidth = (value: number | undefined) => value !== undefined && (!Number.isInteger(value) || value < 0);

        if (typeof width === "number")
        {
            if (isInvalidWidth(width))
                throw new RangeError("The width must be a non-negative integer.");
            return;
        }

        if (isInvalidWidth(width.minContentWidth))
            throw new RangeError("The minimum width must be a non-negative integer.");
        if (isInvalidWidth(width.maxContentWidth))
            throw new RangeError("The maximum width must be a non-negative integer.");
        if (width.minContentWidth !== undefined && width.maxContentWidth !== undefined && width.minContentWidth > width.maxContentWidth)
            throw new RangeError("The minimum width cannot exceed the maximum width.");
        if (width.flexFactor !== undefined && (!Number.isFinite(width.flexFactor) || width.flexFactor <= 0))
            throw new RangeError("The flex factor must be a positive finite number.");
        if (width.contentImportance !== undefined && !Number.isFinite(width.contentImportance))
            throw new RangeError("The content importance must be finite.");
    }
}

class TableRenderer
{
    /** Border implementation used for all rendered rows. */
    public border: TableBorder;

    private table: Table<any>;

    /**
     * Creates a renderer for a table and its formatting configuration.
     *
     * @param table Table whose data and columns are rendered.
     * @param formatting Visual formatting options.
     */
    constructor(table: Table<any>, formatting: TableFormatting)
    {
        this.table = table;

        const border = formatting.border === false ? TableBorder.None : formatting.border ?? TableBorder.Sharp;
        this.border = border.withStyle(formatting.borderStyle);
    }

    /**
     * Renders parsed header, body, and footer cells using the supplied content widths.
     *
     * @param headerCells Optional parsed header cells.
     * @param bodyCells Optional parsed body cells.
     * @param footerCells Optional parsed footer cells.
     * @param widths Content widths for each column.
     * @returns Rendered table lines.
     */
    renderLines(headerCells: ParsedCellContent[] | undefined, bodyCells: ParsedCellContent[] | undefined, footerCells: ParsedCellContent[] | undefined, widths: number[])
    {
        const columns = this.table.columns;
        const columnCount = columns.length;
        const rows = [];
        const dataRowCount = this.table.bodyData.length;

        const adjustedColumnTruncators = columns.map((column, index) => column.truncator.slice(0, widths[index]));

        if (this.border.isVisible)
            rows.push(this.border.renderHorizontalLine("top", columns, widths)!);

        if (headerCells)
            rows.push(this.renderSimpleRow(headerCells, widths, adjustedColumnTruncators));

        const renderHeaderSeparator = headerCells && (bodyCells || footerCells) && this.border.isVisible;
        if (renderHeaderSeparator)
            rows.push(this.border.renderHorizontalLine("middle", columns, widths)!);

        if (bodyCells)
        {
            //We use this in order to not allocate an array for every row
            const lineRenderRegister = new Array<string>(columnCount);
            for (let rowIndex = 0, cellOffset = 0; rowIndex < dataRowCount; rowIndex++)
            {
                for (let columnIndex = 0; columnIndex < columnCount; columnIndex++, cellOffset++)
                {
                    const column = columns[columnIndex];
                    lineRenderRegister[columnIndex] = this.renderCell(bodyCells[cellOffset], widths[columnIndex], column.padding, column.alignment, adjustedColumnTruncators[columnIndex]);
                }

                rows.push(this.border.renderCellsWithCellSeparators(lineRenderRegister));
            }
        }

        const renderFooterSeparator = footerCells && bodyCells && this.border.isVisible;
        if (renderFooterSeparator)
            rows.push(this.border.renderHorizontalLine("middle", columns, widths)!);

        if (footerCells)
            rows.push(this.renderSimpleRow(footerCells, widths, adjustedColumnTruncators));

        if (this.border.isVisible)
            rows.push(this.border.renderHorizontalLine("bottom", columns, widths)!);

        return rows;
    }

    private renderSimpleRow(contents: ParsedCellContent[], widths: number[], truncators: string[])
    {
        const renderedCells = this.table.columns.map((column, index) => this.renderCell(contents[index], widths[index], column.padding, column.alignment, truncators[index]));

        return this.border.renderCellsWithCellSeparators(renderedCells);
    }

    private renderCell(cell: ParsedCellContent, width: number, padding: Required<TableCellPadding>, alignment: TableCellAlignment["horizontal"], truncator: string)
    {
        let content: string;

        if (typeof cell === "string")
        {
            content = cell;
            let contentSize = textWidth(content);

            if (contentSize > width)
            {
                const visibleTruncator = truncateTextEnd(truncator, textWidth(truncator), width);
                const retainedContentWidth = width - textWidth(visibleTruncator);
                content = alignment === "right"
                    ? truncateTextStart(content, contentSize, retainedContentWidth, visibleTruncator)
                    : truncateTextEnd(content, contentSize, retainedContentWidth, visibleTruncator);
            }
            else if (contentSize < width)
            {
                const remainingWidth = width - contentSize;
                if (alignment === "right")
                    content = " ".repeat(remainingWidth) + content;
                else if (alignment === "center")
                {
                    const leftWidth = Math.ceil(remainingWidth / 2);
                    content = " ".repeat(leftWidth) + content + " ".repeat(remainingWidth - leftWidth);
                }
                else
                    content += " ".repeat(remainingWidth);
            }
        }
        else if (cell instanceof HorizontalLayout)
        {
            if (alignment === "right")
                content = cell.computeString(width, { truncate: truncateStringsStart, fill: extendTextArrayStart, truncator });
            else
                content = cell.computeString(width, { truncate: truncateStringsEnd, fill: extendTextArrayEnd, truncator });
        }
        else
            throw new Error("Could not recognize parsed cell format!");

        return padding.left + content + padding.right;
    }
}

/** Defines the characters and formatting used to surround and separate table cells. */
export class TableBorder
{
    /** A borderless table style. */
    static readonly None: TableBorder = new TableBorder();
    /** A rectangular border style using square corners. */
    static readonly Sharp: TableBorder = new TableBorder({
        top: { left: "┌", join: "┬", right: "┐" },
        middle: { left: "├", join: "┼", right: "┤" },
        bottom: { left: "└", join: "┴", right: "┘" },
        horizontal: "─",
        vertical: "│",
    });
    /** A rectangular border style using rounded outer corners. */
    static readonly Rounded: TableBorder = new TableBorder({
        top: { left: "╭", join: "┬", right: "╮" },
        middle: { left: "├", join: "┼", right: "┤" },
        bottom: { left: "╰", join: "┴", right: "╯" },
        horizontal: "─",
        vertical: "│",
    });

    /** Formatting applied to all border characters. */
    readonly style: FormattingSettings;
    /** Whether this border emits visible separator and outline characters. */
    readonly isVisible: boolean;
    private readonly definition?: TableBorderOptions;

    private constructor(borderCharacters?: TableBorderOptions)
    {
        this.definition = borderCharacters;
        this.isVisible = this.definition !== undefined;
        this.style = borderCharacters?.style as FormattingSettings ?? FormattingSettings.None;
    }

    /**
     * Returns this border with the supplied formatting, preserving its characters.
     *
     * @param style Formatting to apply; `undefined` leaves this border unchanged.
     * @returns A styled border, or this instance when styling cannot be applied.
     *
     * @example
     * ```ts
     * TableBorder.Sharp.withStyle(FormattingSettings.None);
     * TableBorder.Sharp.withStyle(undefined);
     * ```
     */
    withStyle(style: FormattingAPI | undefined): TableBorder
    {
        if (!style || !this.definition) return this;

        return new TableBorder({
            ...this.definition,
            style,
        });
    }

    /**
     * Gets the width consumed by vertical borders between and around cells.
     *
     * @param columnCount Number of columns in the table.
     * @returns Required separator width in terminal columns.
     */
    getRequiredCellSeparatorSpace(columnCount: number): number
    {
        return this.isVisible && columnCount > 0 ? columnCount + 1 : 0;
    }

    /**
     * Joins rendered cells, adding and formatting vertical separators when visible.
     *
     * @param cells Rendered cell strings in display order.
     * @returns The complete rendered row.
     */
    renderCellsWithCellSeparators(cells: string[]): string
    {
        if (!this.isVisible) return cells.join("");
        const verticalBorder = this.style.format(this.definition!.vertical);
        return verticalBorder + cells.join(verticalBorder) + verticalBorder;
    }

    /**
     * Renders one horizontal border line for the supplied column widths.
     *
     * @param position Border line to render.
     * @param columns Resolved table columns.
     * @param contentWidths Content width for each column.
     * @returns The formatted border line, or `undefined` when no line is visible.
     *
     * @example
     * ```ts
     * border.renderHorizontalLine("top", columns, widths)
     * ```
     *
     * @example
     * ```ts
     * border.renderHorizontalLine("middle", columns, widths)
     * ```
     *
     * @example
     * ```ts
     * border.renderHorizontalLine("bottom", columns, widths)
     * ```
     */
    renderHorizontalLine(position: "top" | "middle" | "bottom", columns: TableColumn<any>[], contentWidths: number[]): string | undefined
    {
        if (!this.isVisible || columns.length === 0) return undefined;

        const line = this.definition![position];
        const fragments = [line.left];
        for (const column of columns)
            fragments.push(this.definition!.horizontal.repeat(column.paddingSize + contentWidths[column.index]), line.join);

        fragments[fragments.length - 1] = line.right;

        return this.style.format(fragments.join(""));
    }
}
