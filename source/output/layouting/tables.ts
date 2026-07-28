import { distributeIntegerCapped } from "apportionium";
import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { extendTextArrayEnd, extendTextArrayStart, textWidth, truncateStringsEnd, truncateStringsStart, truncateTextEnd, truncateTextStart } from "../formatting/textSize.ts";
import { DefaultTruncationMarker } from "./flex.ts";
import { HorizontalLayout, type LineDefinition, type LineElement } from "./horizontalLayout.ts";

//----------------------------------------
// Types & Interfaces
//----------------------------------------

export type FormattedCellContent = LineDefinition;
export type CellContent = FormattedCellContent | string | number | bigint | boolean | object | null | undefined;
export type TableColumns<EntryType> = Record<string, TableColumnDefinition<EntryType>>;
export type TableHeaderData<EntryType> = Partial<Record<Extract<keyof EntryType, string>, string>>;

export interface TableColumnDefinition<EntryType>
{
    header?: string;
    headerOptions?: TableSectionCellOptions<TableHeaderData<EntryType>>;
    cellOptions?: TableCellOptions<EntryType>;
    footerOptions?: TableSectionCellOptions<Partial<EntryType>>;
}

export interface TableSectionCellOptions<Data>
{
    cell?: (data: Data, rowIndex: number, columnIndex: number, column: TableColumn<any>) => CellContent;
    overflow?: TableCellOverflow;
}

export interface TableCellOptions<Data> extends TableSectionCellOptions<Data>
{
    width?: number | TableColumnWidth;
    align?: TableCellAlignment;
    padding?: string | TableCellPadding;
}

export interface TableColumnWidth
{
    minContentWidth?: number;
    maxContentWidth?: number;
    flexFactor?: number;
    contentImportance?: number;
}

export interface TableFormatting
{
    border?: TableBorder | false;
    borderStyle?: FormattingAPI;
}

export interface TableCellOverflow
{
    /** Defaults to the single-column Unicode ellipsis (`…`). */
    truncate?: string;
}

export interface TableCellAlignment
{
    horizontal?: "left" | "center" | "right";
    vertical?: "top" | "middle" | "bottom";
}

export interface TableCellPadding
{
    left?: string;
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

export class Table<EntryType>
{
    static Auto<EntryType extends object>(data: EntryType[], formatting: TableFormatting = {}): Table<EntryType>
    {
        if (!data.length) throw new Error("Provide at least one data point to infer a schema from.");
        const columnDefinitions = Object.create(null) as Record<string, TableColumnDefinition<EntryType>>;
        const firstEntry = data[0];

        for (const key in firstEntry)
            columnDefinitions[key] = {};

        return new Table<EntryType>(columnDefinitions, formatting, data);
    }

    readonly columns: TableColumn<EntryType>[];

    headerData?: TableHeaderData<EntryType>;
    bodyData: EntryType[];
    footerData?: Partial<EntryType>;

    private readonly renderer: TableRenderer;

    constructor(columns: TableColumns<EntryType>, formatting: TableFormatting = {}, data?: EntryType[], footerData?: Partial<EntryType>)
    {
        this.columns = Object.entries(columns).map(([identifier, definition], index) => new TableColumn(index, identifier, definition));
        this.renderer = new TableRenderer(this, formatting);

        this.headerData = this.extractHeaderDataFrom(this.columns);
        this.bodyData = data ?? [];
        this.footerData = footerData;
    }

    get emptyWidth()
    {
        return this.renderer.border.getRequiredCellSeparatorSpace(this.columns.length) + this.columns.reduce((total, column) => total + column.paddingSize, 0);
    }

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
    readonly index: number;
    readonly identifier: string;
    readonly header?: string;

    readonly minimumWidth: number;
    readonly maximumWidth: number;
    readonly flexFactor: number;
    readonly contentImportance: number;

    readonly headerCellAccessor: CellAccessor;
    readonly bodyCellAccessor: CellAccessor;
    readonly footerCellAccessor: CellAccessor;

    readonly padding: Required<TableCellPadding>;
    readonly paddingSize: number;

    readonly alignment: NonNullable<TableCellAlignment["horizontal"]>;
    readonly truncator: string;

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

    get isFlexible()
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
    public border: TableBorder;

    private table: Table<any>;

    constructor(table: Table<any>, formatting: TableFormatting)
    {
        this.table = table;

        const border = formatting.border === false ? TableBorder.None : formatting.border ?? TableBorder.Sharp;
        this.border = border.withStyle(formatting.borderStyle);
    }

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

export class TableBorder
{
    static readonly None = new TableBorder();
    static readonly Sharp = new TableBorder({
        top: { left: "┌", join: "┬", right: "┐" },
        middle: { left: "├", join: "┼", right: "┤" },
        bottom: { left: "└", join: "┴", right: "┘" },
        horizontal: "─",
        vertical: "│",
    });
    static readonly Rounded = new TableBorder({
        top: { left: "╭", join: "┬", right: "╮" },
        middle: { left: "├", join: "┼", right: "┤" },
        bottom: { left: "╰", join: "┴", right: "╯" },
        horizontal: "─",
        vertical: "│",
    });

    readonly style: FormattingSettings;
    readonly isVisible: boolean;
    private readonly definition?: TableBorderOptions;

    private constructor(borderCharacters?: TableBorderOptions)
    {
        this.definition = borderCharacters;
        this.isVisible = this.definition !== undefined;
        this.style = borderCharacters?.style as FormattingSettings ?? FormattingSettings.None;
    }

    withStyle(style: FormattingAPI | undefined)
    {
        if (!style || !this.definition) return this;

        return new TableBorder({
            ...this.definition,
            style,
        });
    }

    getRequiredCellSeparatorSpace(columnCount: number)
    {
        return this.isVisible && columnCount > 0 ? columnCount + 1 : 0;
    }

    renderCellsWithCellSeparators(cells: string[])
    {
        if (!this.isVisible) return cells.join("");
        const verticalBorder = this.style.format(this.definition!.vertical);
        return verticalBorder + cells.join(verticalBorder) + verticalBorder;
    }

    renderHorizontalLine(position: "top" | "middle" | "bottom", columns: TableColumn<any>[], contentWidths: number[])
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
