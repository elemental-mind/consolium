import { distributeIntegerCapped } from "apportionium";
import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { Flex } from "./flex.ts";
import { HorizontalLayout, type FormattingFrame, type LineDefinition, type LineElement } from "./horizontalLayout.ts";


//----------------------------------------
// Types & Interfaces
//----------------------------------------

export type FormattedCellContent = LineDefinition;
export type CellContent = FormattedCellContent | string | number | bigint | boolean | object | null | undefined;

type ParsedCellContent = string | HorizontalLayout;

export type TableColumns<EntryType> = Record<string, TableColumnDefinition<EntryType>>;

export interface TableColumnDefinition<EntryType>
{
    header?: string;
    headerOptions?: TableSectionCellOptions<any>;
    cellOptions?: TableCellOptions<EntryType>;
    footerOptions?: TableSectionCellOptions<any>;
}

export interface TableCellOptions<Data>
{
    cell?: (data: Data, rowIndex: number, columnIndex: number, column: TableColumn<Data>) => CellContent;
    width?: number | TableColumnWidth;
    align?: TableCellAlignment;
    padding?: string | TableCellPadding;
    overflow?: TableCellOverflow;
}

export interface TableSectionCellOptions<Data>
{
    cell?: (data: Partial<Data>, rowIndex: number, columnIndex: number, column: TableColumn<Data>) => CellContent;
    overflow?: TableCellOverflow;
}

export interface TableColumnWidth
{
    min?: number;
    max?: number;
    flexFactor?: number;
    contentImportance?: number;
}

export interface TableFormatting
{
    border?: TableBorder | false;
    borderStyle?: FormattingAPI;
}

interface TableBorderLine
{
    left: string;
    join: string;
    right: string;
}

interface TableBorderOptions
{
    top: TableBorderLine;
    middle: TableBorderLine;
    bottom: TableBorderLine;
    horizontal: string;
    vertical: string;
    style?: FormattingAPI;
}

export interface TableCellOverflow
{
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

//----------------------------------------------
// Implementation Logic
//----------------------------------------------

export class Table<EntryType>
{
    static Auto<EntryType extends object>(data: EntryType[], formatting: TableFormatting = {}): Table<EntryType>
    {
        const columnDefinitions = Object.create(null) as Record<string, TableColumnDefinition<EntryType>>;
        const firstEntry = data[0];

        for (const key in firstEntry)
            columnDefinitions[key] = {};

        return new Table<EntryType>(columnDefinitions, formatting, data);
    }

    columns: TableColumn<EntryType>[];
    border: TableBorder;

    headerData?: Partial<EntryType>;
    bodyData?: EntryType[];
    footerData?: Partial<EntryType>;

    constructor(columns: TableColumns<EntryType>, formatting: TableFormatting = {}, data?: EntryType[])
    {
        this.columns = this.parseColumnDefinitions(columns);
        const border = formatting.border === false ? TableBorder.None : formatting.border ?? TableBorder.Sharp;
        this.border = border.withStyle(formatting.borderStyle);

        this.bodyData = data;

        const headerData = Object.create(null) as Partial<EntryType>;
        let hasHeaders = false;
        for (const column of this.columns)
        {
            if (column.header === undefined) continue;

            (headerData as Record<string, unknown>)[column.identifier] = column.header;
            hasHeaders = true;
        }
        if (hasHeaders)
            this.headerData = headerData;
    }

    get emptyWidth()
    {
        //This calculates the width of the table with all columns not containing any content
        const separatorWidths = this.border.getRequiredCellSeparatorSpace(this.columns.length);
        const paddingWidths = this.columns.reduce((total, column) => total + column.paddingSize, 0);
        return separatorWidths + paddingWidths;
    }

    renderLines(preferredWidth: number = -1)
    {
        const columnWidths = new Array<number>(this.columns.length).fill(0);

        let headerCells: ParsedCellContent[] | undefined;
        if (this.headerData)
            headerCells = this.extractCellContentAndTrackContentWidths([this.headerData], this.columns.map(column => column.headerOptions.cell), columnWidths);

        let bodyCells: ParsedCellContent[] | undefined;
        if (this.bodyData && this.bodyData.length)
            bodyCells = this.extractCellContentAndTrackContentWidths(this.bodyData, this.columns.map(column => column.cellOptions.cell), columnWidths);

        let footerCells: ParsedCellContent[] | undefined;
        if (this.footerData)
            footerCells = this.extractCellContentAndTrackContentWidths([this.footerData], this.columns.map(column => column.footerOptions.cell), columnWidths);

        const widths = this.computeColumnWidths(preferredWidth, columnWidths);

        const lines = [
            ...this.renderHeader(headerCells, widths),
            ...this.renderBody(bodyCells, widths),
            ...this.renderFooter(footerCells, widths),
        ];

        return lines;
    }

    extractCellContentAndTrackContentWidths(data: Partial<EntryType>[], accessors: Function[], columnWidths: number[]): ParsedCellContent[]
    {
        const cells = new Array(data.length * this.columns.length);

        let cellIndex = 0, rowIndex = 0, columnIndex = 0;
        for (let row of data)
        {
            columnIndex = 0;
            for (const columnAccessor of accessors)
            {
                const rawCellContent = columnAccessor(row, rowIndex, columnIndex);
                if (Array.isArray(rawCellContent))
                {
                    const content = new HorizontalLayout(rawCellContent as LineElement[]);
                    cells[cellIndex] = content;
                    columnWidths[columnIndex] = Math.max(columnWidths[columnIndex] ?? 0, content.unformattedWidth);
                }
                else
                {
                    let content: string;

                    if (rawCellContent === undefined || rawCellContent === null)
                        content = "";
                    else
                        content = String(rawCellContent);

                    cells[cellIndex] = content;
                    columnWidths[columnIndex] = Math.max(columnWidths[columnIndex] ?? 0, content.length);
                }

                columnIndex++;
                cellIndex++;
            }

            rowIndex++;
        }

        return cells;
    }

    private renderHeader(headerContents: ParsedCellContent[] | undefined, widths: number[])
    {
        const lines: string[] = [];

        if (this.border.isVisible)
            lines.push(this.border.renderTopBorder(widths)!);

        if (!headerContents)
            return lines;

        const adjustedContent = this.columns.map(column => this.renderCell(headerContents[column.index], widths[column.index], column));
        lines.push(this.border.renderCellsWithCellSeparators(adjustedContent));

        if (this.border.isVisible && ((this.bodyData && this.bodyData.length > 0) || this.footerData))
            lines.push(this.border.renderRowSeparator(widths)!);

        return lines;
    }

    private renderBody(bodyContents: ParsedCellContent[] | undefined, widths: number[])
    {
        if (!bodyContents)
            return [];

        const lines: string[] = new Array<string>(this.bodyData!.length);
        const lineCells: string[] = new Array<string>(this.columns.length);

        const columnCount = this.columns.length;
        const rowCount = this.bodyData!.length;

        let cellIndex = 0;

        for (let rowIndex = 0; rowIndex < rowCount; rowIndex++)
        {
            for (let columnIndex = 0; columnIndex < columnCount; columnIndex++, cellIndex++)
            {
                const column = this.columns[columnIndex];
                const content = bodyContents[cellIndex];
                const cellBodyWidth = widths[columnIndex];

                const contentWidth = Math.max(0, cellBodyWidth - column.paddingSize);

                lineCells[columnIndex] = this.renderCell(content, contentWidth, column);
            }

            lines[rowIndex] = this.border.renderCellsWithCellSeparators(lineCells);
        }

        return lines;
    }

    private renderFooter(footerContents: ParsedCellContent[] | undefined, widths: number[])
    {
        const lines: string[] = [];

        if (footerContents)
        {
            if (this.border.isVisible && this.bodyData && this.bodyData.length > 0)
                lines.push(this.border.renderRowSeparator(widths)!);

            const adjustedContent = this.columns.map(column => this.renderCell(footerContents[column.index], widths[column.index], column));
            lines.push(this.border.renderCellsWithCellSeparators(adjustedContent));
        }

        if (this.border.isVisible)
            lines.push(this.border.renderBottomBorder(widths)!);

        return lines;
    }

    private renderCell(cellContent: string | HorizontalLayout, contentWidth: number, column: TableColumn<any>): string
    {
        let cellBody = cellContent instanceof HorizontalLayout ? cellContent.computeString(contentWidth) : cellContent;

        if (cellBody.length > contentWidth)
            cellBody = column.contentOverflowHandler(cellBody, contentWidth);
        else if (cellBody.length < contentWidth)
            cellBody = column.contentUnderflowHandler(cellBody, contentWidth);

        return column.padding.left + cellBody + column.padding.right;
    }

    private computeColumnWidths(requestedTableWidth: number, rawColumnWidths: number[])
    {
        const widths = [...rawColumnWidths];

        if (requestedTableWidth < 0)
            return widths;

        const availableWidth = Math.max(0, requestedTableWidth - this.emptyWidth);
        const widthDifference = availableWidth - widths.reduce((total, width) => total + width, 0);

        if (widthDifference === 0)
            return widths;

        let deltas: number[] = [];

        if (widthDifference > 0)
            deltas = this.growFlexibleColumns(widths, widthDifference);
        else if (widthDifference < 0)
            deltas = this.shrinkFlexibleColumns(widths, -widthDifference);

        for (let i = 0; i < widths.length; i++)
            widths[i] += deltas[i];

        return widths;
    }

    private growFlexibleColumns(contentWidths: number[], amount: number)
    {
        return distributeIntegerCapped(
            amount,
            this.columns.map(column => column.isFlexible ? column.flexFactor : 0),
            this.columns.map((column, index) => column.isFlexible ? column.maximumWidth - contentWidths[index] : 0),
        ).distribution;
    }

    private shrinkFlexibleColumns(contentWidths: number[], amount: number)
    {
        const deltas = new Array<number>(this.columns.length).fill(0);
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
                deltas[columnIndex] = -shrinkAmount;
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
                    deltas[columnIndices[i]] = -distribution[i];

                amount = undistributedAmount;
            }

            if (amount === 0) break;
        }

        return deltas;
    }

    private parseColumnDefinitions(columns: TableColumns<EntryType>)
    {
        return Object.entries(columns).map(([identifier, definition], index) => new TableColumn(index, identifier, definition as TableColumnDefinition<EntryType>));
    }
}

class TableColumn<EntryType>
{
    private static leftAlignContent(content: string, width: number)
    {
        return content + " ".repeat(width - content.length);
    }

    private static rightAlignContent(content: string, width: number)
    {
        return " ".repeat(width - content.length) + content;
    }

    private static centerAlignContent(content: string, width: number)
    {
        const leftLength = Math.ceil((width - content.length) / 2);
        return " ".repeat(leftLength) + content + " ".repeat(width - content.length - leftLength);
    }

    private static truncateContentLeft(content: string, width: number, truncator: string)
    {
        const shrinkBy = Math.min(content.length - width, Math.max(0, content.length - 3));
        return truncator + content.slice(shrinkBy + truncator.length);
    }

    private static truncateContentRight(content: string, width: number, truncator: string)
    {
        const shrinkBy = Math.min(content.length - width, Math.max(0, content.length - 3));
        return content.slice(0, -(shrinkBy + truncator.length)) + truncator;
    }

    readonly index: number;
    readonly identifier: string;
    readonly header?: string;

    readonly isFlexible: boolean;
    readonly minimumWidth: number;
    readonly maximumWidth: number;
    readonly flexFactor: number;
    readonly contentImportance: number;

    readonly headerOptions: Required<TableSectionCellOptions<EntryType>>;
    readonly cellOptions: Required<TableCellOptions<EntryType>>;
    readonly footerOptions: Required<TableSectionCellOptions<Partial<EntryType>>>;
    readonly padding: Required<TableCellPadding>;
    readonly paddingSize: number;

    readonly contentUnderflowHandler: (content: string, width: number) => string;
    readonly contentOverflowHandler: (content: string, width: number) => string;

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
            this.minimumWidth = typeof widthConfiguration === "number" ? widthConfiguration : widthConfiguration?.min ?? 0;
            this.maximumWidth = typeof widthConfiguration === "number" ? widthConfiguration : widthConfiguration?.max ?? Infinity;
            this.flexFactor = widthConfiguration?.flexFactor ?? 1;
            this.contentImportance = widthConfiguration?.contentImportance ?? 0;
        }

        this.isFlexible = this.maximumWidth > this.minimumWidth;

        this.headerOptions = {
            cell: definition.headerOptions?.cell ?? ((headerData, columnIndex, column) => (headerData as any)[identifier]),
            overflow: definition.headerOptions?.overflow ?? definition.cellOptions?.overflow ?? {},
        };
        this.cellOptions = {
            cell: definition.cellOptions?.cell ?? (data => (data as any)[identifier]),
            width: definition.cellOptions?.width ?? {},
            align: definition.cellOptions?.align ?? {},
            padding: definition.cellOptions?.padding ?? "",
            overflow: definition.cellOptions?.overflow ?? {},
        };
        this.footerOptions = {
            cell: definition.footerOptions?.cell ?? ((headerData, columnIndex, column) => (headerData as any)[identifier]),
            overflow: definition.footerOptions?.overflow ?? definition.cellOptions?.overflow ?? {},
        };

        this.padding = this.parsePadding(this.cellOptions.padding);
        this.paddingSize = this.padding.left.length + this.padding.right.length;
        const truncator = this.cellOptions.overflow.truncate ?? "";

        this.contentUnderflowHandler = this.cellOptions.align.horizontal === "right"
            ? TableColumn.rightAlignContent
            : this.cellOptions.align.horizontal === "center"
                ? TableColumn.centerAlignContent
                : TableColumn.leftAlignContent;
        this.contentOverflowHandler = this.cellOptions.align.horizontal === "right"
            ? (content, width) => TableColumn.truncateContentRight(content, width, truncator)
            : (content, width) => TableColumn.truncateContentLeft(content, width, truncator);
    }

    private parsePadding(padding: string | TableCellPadding): Required<TableCellPadding>
    {
        if (typeof padding === "string")
            return { left: padding, right: padding };

        return { left: padding.left ?? "", right: padding.right ?? "" };
    }

    private validateWidthConfiguration(width: number | TableColumnWidth | undefined)
    {
        if (width === undefined) return;

        if (typeof width === "number")
        {
            this.validateColumnWidth(width, "width");
            return;
        }

        this.validateColumnWidth(width.min, "minimum width");
        if (width.max !== undefined && (!Number.isInteger(width.max) || width.max < 0))
            throw new RangeError("The maximum width must be a non-negative integer.");
        if (width.min !== undefined && width.max !== undefined && width.min > width.max)
            throw new RangeError("The minimum width cannot exceed the maximum width.");
        if (width.flexFactor !== undefined && (!Number.isFinite(width.flexFactor) || width.flexFactor <= 0))
            throw new RangeError("The flex factor must be a positive finite number.");
        if (width.contentImportance !== undefined && !Number.isFinite(width.contentImportance))
            throw new RangeError("The content importance must be finite.");
    }

    private validateColumnWidth(width: number | undefined, label: string)
    {
        if (width !== undefined && (!Number.isInteger(width) || width < 0))
            throw new RangeError(`The ${label} must be a non-negative integer.`);
    }
}

export class TableBorder
{
    static readonly None = new TableBorder({
        top: { left: "", join: "", right: "" },
        middle: { left: "", join: "", right: "" },
        bottom: { left: "", join: "", right: "" },
        horizontal: "",
        vertical: "",
    });
    static readonly Sharp = new TableBorder({
        top: { left: "┌", join: "┬", right: "┐" },
        middle: { left: "├", join: "┼", right: "┤" },
        bottom: { left: "└", join: "┴", right: "┘" },
        horizontal: "─",
        vertical: "│",
    });
    static readonly Soft = new TableBorder({
        top: { left: "╭", join: "┬", right: "╮" },
        middle: { left: "├", join: "┼", right: "┤" },
        bottom: { left: "╰", join: "┴", right: "╯" },
        horizontal: "─",
        vertical: "│",
    });

    readonly vertical: string;
    readonly horizontal: string;

    readonly top: TableBorderLine;
    readonly middle: TableBorderLine;
    readonly bottom: TableBorderLine;

    readonly style: FormattingSettings;

    readonly isVisible: boolean;

    private constructor(options: TableBorderOptions)
    {
        this.top = options.top;
        this.middle = options.middle;
        this.bottom = options.bottom;
        this.horizontal = options.horizontal;
        this.vertical = options.vertical;
        this.isVisible = options.horizontal.length > 0 || options.vertical.length > 0;
        this.style = options.style as FormattingSettings ?? FormattingSettings.None;
    }

    withStyle(style: FormattingAPI | undefined)
    {
        if (!style) return this;

        return new TableBorder({
            top: this.top,
            middle: this.middle,
            bottom: this.bottom,
            horizontal: this.horizontal,
            vertical: this.vertical,
            style,
        });
    }

    getRequiredCellSeparatorSpace(columnCount: number)
    {
        return this.isVisible && columnCount > 0 ? columnCount + 1 : 0;
    }

    renderTopBorder(columnWidths: number[])
    {
        return this.renderHorizontalLine(this.top, columnWidths);
    }

    renderRowSeparator(columnWidths: number[])
    {
        return this.renderHorizontalLine(this.middle, columnWidths);
    }

    renderBottomBorder(columnWidths: number[])
    {
        return this.renderHorizontalLine(this.bottom, columnWidths);
    }

    renderCellsWithCellSeparators(cells: string[])
    {
        if (!this.isVisible) return cells.join("");
        const verticalBorder = this.style.format(this.vertical);
        return verticalBorder + cells.join(verticalBorder) + verticalBorder;
    }

    private renderHorizontalLine(line: TableBorderLine, columnWidths: number[])
    {
        if (!this.isVisible || columnWidths.length === 0) return undefined;

        const fragments = [line.left, ...columnWidths.flatMap(width => [this.horizontal.repeat(width), line.join])];
        fragments[fragments.length - 1] = line.right;
        return this.style.format(fragments.join(""));
    }
}
