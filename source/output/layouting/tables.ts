import { distributeIntegerCapped } from "apportionium";
import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { Flex } from "./flex.ts";
import { HorizontalLayout, type FormattingFrame, type LineDefinition, type LineElement } from "./horizontalLayout.ts";


//----------------------------------------
// Types & Interfaces
//----------------------------------------

export type ContentLayout = LineDefinition;
export type CellContent = ContentLayout | string | number | bigint | boolean | object | null | undefined;

export type TableColumns<EntryType> = Record<string, TableColumnDefinition<EntryType>>;

export interface TableColumnDefinition<EntryType>
{
    header?: string;
    headerOptions?: TableSectionCellOptions<string>;
    cellOptions?: TableCellOptions<EntryType>;
    footerOptions?: TableSectionCellOptions<Partial<EntryType>>;
}

export interface TableCellOptions<Data>
{
    cell?: (data: Data, rowIndex: number, columnIndex: number) => CellContent;
    width?: number | TableColumnWidth;
    align?: TableCellAlignment;
    padding?: string | TableCellPadding;
    overflow?: TableCellOverflow;
}

export interface TableSectionCellOptions<Data>
{
    cell?: (data: Data, rowIndex: number, columnIndex: number) => CellContent;
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

type FlexibleColumn<EntryType> = {
    column: TableColumn<EntryType>;
    index: number;
};

//----------------------------------------------
// Implementation Logic
//----------------------------------------------

export class Table<EntryType>
{
    static Auto<EntryType extends object>(data: readonly EntryType[], formatting: TableFormatting = {}): Table<EntryType>
    {
        const columnDefinitions = Object.create(null) as Record<string, TableColumnDefinition<EntryType>>;

        for (const entry of data)
            for (const key of Object.keys(entry))
                if (!Object.hasOwn(columnDefinitions, key))
                    columnDefinitions[key] = {};

        return new Table<EntryType>(columnDefinitions, formatting, data);
    }

    data: EntryType[];
    footerData?: Partial<EntryType>;

    private readonly columns: TableColumn<EntryType>[];
    private readonly border: TableBorder;

    constructor(columns: TableColumns<EntryType>, formatting: TableFormatting = {}, data: readonly EntryType[] = [])
    {
        this.columns = this.parseColumnDefinitions(columns);
        const border = formatting.border === false
            ? TableBorder.None
            : formatting.border ?? TableBorder.Sharp;
        this.border = border.withStyle(formatting.borderStyle);
        this.data = [...data];
    }

    renderLines(preferredWidth: number = -1)
    {
        if (!Number.isInteger(preferredWidth) || preferredWidth < -1)
            throw new RangeError("The preferred table width must be a non-negative integer or -1.");

        const widths = this.resolveColumnWidths(preferredWidth);
        const lines = [
            ...this.renderHeader(widths),
            ...this.renderBody(widths),
            ...this.renderFooter(widths),
        ];

        return lines.join("\n");
    }

    private renderHeader(widths: number[])
    {
        const lines: string[] = [];
        const hasHeaders = this.columns.some(column => column.definition.header !== undefined);

        const topBorder = this.border.renderTopBorder(widths);
        if (topBorder !== undefined)
            lines.push(topBorder);
        if (!hasHeaders)
            return lines;

        const headerCells = this.columns.map((column, index) => column.renderHeaderCell(index, widths[index]));
        lines.push(this.renderRow(headerCells));

        const headerSeparator = this.border.renderRowSeparator(widths);
        if (headerSeparator !== undefined && (this.data.length > 0 || this.footerData !== undefined))
            lines.push(headerSeparator);

        return lines;
    }

    private renderBody(widths: number[])
    {
        const lines: string[] = [];

        for (const [rowIndex, entry] of this.data.entries())
        {
            const cells = this.columns.map((column, columnIndex) =>
                column.renderBodyCell(entry, rowIndex, columnIndex, widths[columnIndex]));
            lines.push(this.renderRow(cells));
        }

        return lines;
    }

    private renderFooter(widths: number[])
    {
        const lines: string[] = [];

        if (this.footerData !== undefined)
        {
            const footerSeparator = this.border.renderRowSeparator(widths);
            if (footerSeparator !== undefined && this.data.length > 0)
                lines.push(footerSeparator);

            const cells = this.columns.map((column, index) =>
                column.renderFooterCell(this.footerData!, index, widths[index]));
            lines.push(this.renderRow(cells));
        }

        const bottomBorder = this.border.renderBottomBorder(widths);
        if (bottomBorder !== undefined)
            lines.push(bottomBorder);

        return lines;
    }

    private renderRow(cells: string[])
    {
        return this.border.renderCellSeparators(cells);
    }

    private parseColumnDefinitions(columns: TableColumns<EntryType>)
    {
        return Object.entries(columns).map(([identifier, definition]) =>
            new TableColumn(identifier, definition as TableColumnDefinition<EntryType>));
    }

    private resolveColumnWidths(requestedTableWidth: number)
    {
        const widths = this.columns.map((column, columnIndex) =>
        {
            const preferredWidth = column.measurePreferredWidth(this.data, this.footerData, columnIndex);
            return Math.max(column.minimumWidth, Math.min(column.maximumWidth, preferredWidth));
        });

        if (requestedTableWidth < 0)
            return widths;

        const availableWidth = Math.max(0, requestedTableWidth - this.borderWidth);
        const widthDifference = availableWidth - widths.reduce((total, width) => total + width, 0);

        if (widthDifference > 0)
            this.growFlexibleColumns(widths, widthDifference);
        else if (widthDifference < 0)
            this.shrinkFlexibleColumns(widths, -widthDifference);

        return widths;
    }

    private growFlexibleColumns(widths: number[], amount: number)
    {
        const flexibleColumns = this.findFlexibleColumns(widths);
        this.apportionWidthChange(widths, flexibleColumns, amount, ({ column, index }) =>
            column.maximumWidth - widths[index]);
    }

    private shrinkFlexibleColumns(widths: number[], amount: number)
    {
        const columnsByImportance = Map.groupBy(
            this.findFlexibleColumns(widths),
            ({ column }) => column.contentImportance,
        );
        const sortedImportances = [...columnsByImportance.keys()].sort((a, b) => a - b);

        for (const importance of sortedImportances)
        {
            const columns = columnsByImportance.get(importance)!;
            const changedWidth = this.apportionWidthChange(widths, columns, amount, ({ column, index }) =>
                widths[index] - column.minimumWidth, -1);
            amount -= changedWidth;
            if (amount === 0) return;
        }
    }

    private findFlexibleColumns(widths: number[])
    {
        return this.columns
            .map((column, index) => ({ column, index }))
            .filter(({ column }) => column.isFlexible);
    }

    private apportionWidthChange(
        widths: number[],
        columns: FlexibleColumn<EntryType>[],
        amount: number,
        capacity: (column: FlexibleColumn<EntryType>) => number,
        direction = 1,
    )
    {
        if (columns.length === 0)
            return 0;

        const capacities = columns.map(capacity);
        const { distribution } = distributeIntegerCapped(
            amount,
            columns.map(({ column }) => column.flexFactor),
            capacities,
        );

        let changedWidth = 0;
        for (const [candidateIndex, { index }] of columns.entries())
        {
            widths[index] += direction * distribution[candidateIndex];
            changedWidth += distribution[candidateIndex];
        }
        return changedWidth;
    }

    private get borderWidth()
    {
        return this.border.getRequiredCellSeparatorSpace(this.columns.length);
    }
}

export class TableBorder
{
    static readonly None = new TableBorder("", "", "", "", "", "", "", "", "", "", "");
    static readonly Sharp = new TableBorder("┌", "┬", "┐", "├", "┼", "┤", "└", "┴", "┘", "─", "│");
    static readonly Soft = new TableBorder("╭", "┬", "╮", "├", "┼", "┤", "╰", "┴", "╯", "─", "│");

    private readonly vertical: string;
    private readonly horizontal: string;

    private readonly topLeft: string;
    private readonly topJoin: string;
    private readonly topRight: string;

    private readonly middleLeft: string;
    private readonly middleJoin: string;
    private readonly middleRight: string;

    private readonly bottomLeft: string;
    private readonly bottomJoin: string;
    private readonly bottomRight: string;

    private readonly isVisible: boolean;

    private readonly style: FormattingSettings;

    private constructor(
        topLeft: string,
        topJoin: string,
        topRight: string,
        middleLeft: string,
        middleJoin: string,
        middleRight: string,
        bottomLeft: string,
        bottomJoin: string,
        bottomRight: string,
        horizontal: string,
        vertical: string,
        style?: FormattingAPI,
    )
    {
        this.topLeft = topLeft;
        this.topJoin = topJoin;
        this.topRight = topRight;
        this.middleLeft = middleLeft;
        this.middleJoin = middleJoin;
        this.middleRight = middleRight;
        this.bottomLeft = bottomLeft;
        this.bottomJoin = bottomJoin;
        this.bottomRight = bottomRight;
        this.horizontal = horizontal;
        this.vertical = vertical;
        this.isVisible = horizontal.length > 0 || vertical.length > 0;
        this.style = style as FormattingSettings ?? FormattingSettings.None;
    }

    withStyle(style: FormattingAPI | undefined)
    {
        if (!style) return this;

        return new TableBorder(
            this.topLeft,
            this.topJoin,
            this.topRight,
            this.middleLeft,
            this.middleJoin,
            this.middleRight,
            this.bottomLeft,
            this.bottomJoin,
            this.bottomRight,
            this.horizontal,
            this.vertical,
            style,
        );
    }

    getRequiredCellSeparatorSpace(columnCount: number)
    {
        return this.isVisible && columnCount > 0 ? columnCount + 1 : 0;
    }

    renderTopBorder(columnWidths: number[])
    {
        return this.renderHorizontalLine(this.topLeft, this.topJoin, this.topRight, columnWidths);
    }

    renderRowSeparator(columnWidths: number[])
    {
        return this.renderHorizontalLine(this.middleLeft, this.middleJoin, this.middleRight, columnWidths);
    }

    renderBottomBorder(columnWidths: number[])
    {
        return this.renderHorizontalLine(this.bottomLeft, this.bottomJoin, this.bottomRight, columnWidths);
    }

    renderCellSeparators(cells: string[])
    {
        if (!this.isVisible) return cells.join("");
        const verticalBorder = this.style.format(this.vertical);
        return verticalBorder + cells.join(verticalBorder) + verticalBorder;
    }

    private renderHorizontalLine(left: string, join: string, right: string, columnWidths: number[])
    {
        if (!this.isVisible || columnWidths.length === 0) return undefined;

        const fragments = [left, ...columnWidths.flatMap(width => [this.horizontal.repeat(width), join])];
        fragments[fragments.length - 1] = right;
        return this.style.format(fragments.join(""));
    }
}

class TableColumn<EntryType>
{
    readonly identifier: string;
    readonly definition: TableColumnDefinition<EntryType>;

    private readonly headerTemplate: TableCellTemplate<EntryType, string>;
    private readonly bodyTemplate: TableCellTemplate<EntryType, EntryType>;
    private readonly footerTemplate: TableCellTemplate<EntryType, Partial<EntryType>>;

    constructor(identifier: string, definition: TableColumnDefinition<EntryType>)
    {
        this.identifier = identifier;
        this.definition = definition;
        this.validateWidthConfiguration();

        const sharedOptions = definition.cellOptions as TableCellOptions<unknown> | undefined;
        const headerOptions = {
            cell: (title: string) => title,
            ...definition.headerOptions,
        };
        this.headerTemplate = new TableCellTemplate(this, headerOptions, sharedOptions);
        this.bodyTemplate = new TableCellTemplate(this, definition.cellOptions, sharedOptions);
        this.footerTemplate = new TableCellTemplate(this, definition.footerOptions, sharedOptions);
    }

    get widthConfiguration()
    {
        return this.definition.cellOptions?.width;
    }

    get isFlexible()
    {
        return typeof this.widthConfiguration === "object";
    }

    get minimumWidth()
    {
        const width = this.widthConfiguration;
        return typeof width === "number" ? width : width?.min ?? 0;
    }

    get maximumWidth()
    {
        const width = this.widthConfiguration;
        return typeof width === "number" ? width : width?.max ?? Infinity;
    }

    get flexFactor()
    {
        const width = this.widthConfiguration;
        return typeof width === "object" ? width.flexFactor ?? 1 : 0;
    }

    get contentImportance()
    {
        const width = this.widthConfiguration;
        return typeof width === "object" ? width.contentImportance ?? 0 : Infinity;
    }

    private validateWidthConfiguration()
    {
        const width = this.widthConfiguration;
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

    measurePreferredWidth(data: EntryType[], footerData: Partial<EntryType> | undefined, columnIndex: number)
    {
        if (typeof this.widthConfiguration === "number")
            return this.widthConfiguration;

        const measuredWidths = data.map((entry, rowIndex) =>
            this.bodyTemplate.measure(entry, rowIndex, columnIndex));

        if (this.definition.header !== undefined)
            measuredWidths.push(this.headerTemplate.measure(this.definition.header, 0, columnIndex));
        if (footerData !== undefined)
            measuredWidths.push(this.footerTemplate.measure(footerData, 0, columnIndex));

        return Math.max(this.minimumWidth, ...measuredWidths);
    }

    renderHeaderCell(columnIndex: number, width: number)
    {
        return this.headerTemplate.render(this.definition.header ?? "", 0, columnIndex, width);
    }

    renderBodyCell(entry: EntryType, rowIndex: number, columnIndex: number, width: number)
    {
        return this.bodyTemplate.render(entry, rowIndex, columnIndex, width);
    }

    renderFooterCell(footerData: Partial<EntryType>, columnIndex: number, width: number)
    {
        return this.footerTemplate.render(footerData, 0, columnIndex, width);
    }

    readValue(data: EntryType | Partial<EntryType>)
    {
        return (data as Record<string, unknown>)[this.identifier];
    }
}

class TableCellTemplate<EntryType, Data>
{
    private readonly column: TableColumn<EntryType>;
    private readonly alignment: TableCellAlignment;
    private readonly padding: Required<TableCellPadding>;
    private readonly overflow: TableCellOverflow;

    constructor(
        column: TableColumn<EntryType>,
        contentOptions: TableSectionCellOptions<Data> | TableCellOptions<Data> | undefined,
        sharedOptions: TableCellOptions<unknown> | undefined,
    )
    {
        this.column = column;
        if (contentOptions?.cell)
            this.resolveContent = contentOptions.cell;
        this.alignment = sharedOptions?.align ?? {};
        this.padding = this.parsePadding(sharedOptions?.padding);
        this.overflow = contentOptions?.overflow ?? sharedOptions?.overflow ?? {};
    }

    measure(data: Data, rowIndex: number, columnIndex: number)
    {
        const content = this.getContent(data, rowIndex, columnIndex);
        const paddingWidth = content.ownsLayout ? 0 : this.padding.left.length + this.padding.right.length;
        return new HorizontalLayout(content.layout).unformattedWidth + paddingWidth;
    }

    render(data: Data, rowIndex: number, columnIndex: number, width: number)
    {
        const content = this.getContent(data, rowIndex, columnIndex);
        if (content.ownsLayout)
            return new HorizontalLayout(content.layout).computeString(width);

        const contentWidth = Math.max(0, width - this.padding.left.length - this.padding.right.length);
        const alignedLayout = this.createAlignedLayout(content.layout, this.overflow.truncate ?? "");
        const renderedContent = new HorizontalLayout(alignedLayout).computeString(contentWidth);
        return this.padding.left + renderedContent + this.padding.right;
    }

    private getContent(data: Data, rowIndex: number, columnIndex: number)
    {
        const content = this.resolveContent(data, rowIndex, columnIndex);

        return Array.isArray(content)
            ? { layout: content as ContentLayout, ownsLayout: true }
            : { layout: [String(content ?? "")] as ContentLayout, ownsLayout: false };
    }

    private resolveContent(data: Data, _rowIndex: number, _columnIndex: number): CellContent
    {
        return this.column.readValue(data as Partial<EntryType>) as CellContent;
    }

    private createAlignedLayout(layout: ContentLayout, truncator: string): ContentLayout
    {
        const contentElements = layout[0] instanceof FormattingSettings
            ? [layout as FormattingFrame]
            : layout as LineElement[];

        if (this.alignment.horizontal === "right")
            return [Flex.grow(" ").shrinkRight(truncator), ...contentElements];

        if (this.alignment.horizontal === "center")
            return [Flex.grow(" "), ...contentElements, Flex.shrinkLeft(truncator).grow(" ")];

        return [...contentElements, Flex.shrinkLeft(truncator).grow(" ")];
    }

    private parsePadding(padding: string | TableCellPadding | undefined): Required<TableCellPadding>
    {
        if (typeof padding === "string")
            return { left: padding, right: padding };

        return {
            left: padding?.left ?? "",
            right: padding?.right ?? "",
        };
    }
}
