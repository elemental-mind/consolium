import { distributeIntegerCapped } from "apportionium";
import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { Flex } from "./flex.ts";
import
{
    HorizontalLayout,
    type FormattingFrame,
    type LineDefinition,
    type LineElement,
} from "./horizontalLayout.ts";

export type ContentLayout = LineDefinition;
export type CellContent = ContentLayout | string | number | bigint | boolean | object | null | undefined;

export interface TableRenderControl
{
    width?: number;
    horizontalOffset?: number;
}

export interface TableColumnWidth
{
    min?: number;
    max?: number;
    flexFactor?: number;
    contentImportance?: number;
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

export interface TableColumnDefinition<EntryType>
{
    header?: string;
    headerOptions?: TableSectionCellOptions<string>;
    cellOptions?: TableCellOptions<EntryType>;
    footerOptions?: TableSectionCellOptions<Partial<EntryType>>;
}

type PositionalColumnKey<EntryType extends readonly unknown[]> = Exclude<keyof EntryType, keyof readonly unknown[]> & string;
type TableColumnKey<EntryType> = EntryType extends readonly unknown[]
    ? PositionalColumnKey<EntryType>
    : Extract<keyof EntryType, string>;

export type TableColumns<EntryType> = {
    readonly [Key in TableColumnKey<EntryType>]?: TableColumnDefinition<EntryType>
};

export interface TableFormatting
{
    border?: TableBorder | false;
    borderStyle?: FormattingAPI;
}

export class TableBorder
{
    static readonly none = new TableBorder("", "", "", "", "", "", "", "", "", "", "");
    static readonly light = new TableBorder("┌", "┬", "┐", "├", "┼", "┤", "└", "┴", "┘", "─", "│");
    static readonly rounded = new TableBorder("╭", "┬", "╮", "├", "┼", "┤", "╰", "┴", "╯", "─", "│");

    readonly vertical: string;

    private readonly topLeft: string;
    private readonly topJoin: string;
    private readonly topRight: string;
    private readonly middleLeft: string;
    private readonly middleJoin: string;
    private readonly middleRight: string;
    private readonly bottomLeft: string;
    private readonly bottomJoin: string;
    private readonly bottomRight: string;
    private readonly horizontal: string;

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
    }

    renderTop(columnWidths: number[])
    {
        if (!this.isVisible) return undefined;
        return this.renderHorizontalLine(this.topLeft, this.topJoin, this.topRight, columnWidths);
    }

    renderSeparator(columnWidths: number[])
    {
        if (!this.isVisible) return undefined;
        return this.renderHorizontalLine(this.middleLeft, this.middleJoin, this.middleRight, columnWidths);
    }

    renderBottom(columnWidths: number[])
    {
        if (!this.isVisible) return undefined;
        return this.renderHorizontalLine(this.bottomLeft, this.bottomJoin, this.bottomRight, columnWidths);
    }

    renderRow(cells: string[], renderedVerticalBorder = this.vertical)
    {
        if (!this.isVisible) return cells.join("");
        return renderedVerticalBorder + cells.join(renderedVerticalBorder) + renderedVerticalBorder;
    }

    getWidth(columnCount: number)
    {
        return this.isVisible && columnCount > 0 ? columnCount + 1 : 0;
    }

    private get isVisible()
    {
        return this.horizontal.length > 0 || this.vertical.length > 0;
    }

    private renderHorizontalLine(left: string, join: string, right: string, columnWidths: number[])
    {
        const fragments = [left, ...columnWidths.flatMap(width => [this.horizontal.repeat(width), join])];
        fragments[fragments.length - 1] = right;
        return fragments.join("");
    }
}

class TableCellTemplate<Data>
{
    private readonly selectContent?: (data: Data, rowIndex: number, columnIndex: number) => CellContent;
    private readonly selectDefaultContent: (data: Data) => unknown;
    private readonly alignment: TableCellAlignment;
    private readonly padding: Required<TableCellPadding>;
    private readonly overflow: TableCellOverflow;

    constructor(
        contentOptions: TableSectionCellOptions<Data> | TableCellOptions<Data> | undefined,
        sharedOptions: TableCellOptions<unknown> | undefined,
        selectDefaultContent: (data: Data) => unknown,
    )
    {
        this.selectContent = contentOptions?.cell;
        this.selectDefaultContent = selectDefaultContent;
        this.alignment = sharedOptions?.align ?? {};
        this.padding = this.parsePadding(sharedOptions?.padding);
        this.overflow = contentOptions?.overflow ?? sharedOptions?.overflow ?? {};
    }

    measure(data: Data, rowIndex: number, columnIndex: number)
    {
        const content = this.resolveContent(data, rowIndex, columnIndex);
        const paddingWidth = content.ownsLayout ? 0 : this.padding.left.length + this.padding.right.length;
        return new HorizontalLayout(content.layout).unformattedWidth + paddingWidth;
    }

    render(data: Data, rowIndex: number, columnIndex: number, width: number)
    {
        const content = this.resolveContent(data, rowIndex, columnIndex);
        if (content.ownsLayout)
            return new HorizontalLayout(content.layout).computeString(width);

        const contentWidth = Math.max(0, width - this.padding.left.length - this.padding.right.length);
        const alignedLayout = this.createAlignedLayout(content.layout, this.overflow.truncate ?? "");
        const renderedContent = new HorizontalLayout(alignedLayout).computeString(contentWidth);
        return this.padding.left + renderedContent + this.padding.right;
    }

    private resolveContent(data: Data, rowIndex: number, columnIndex: number)
    {
        const content = this.selectContent
            ? this.selectContent(data, rowIndex, columnIndex)
            : this.selectDefaultContent(data);

        return Array.isArray(content)
            ? { layout: content as ContentLayout, ownsLayout: true }
            : { layout: [String(content ?? "")] as ContentLayout, ownsLayout: false };
    }

    private createAlignedLayout(layout: ContentLayout, truncator: string): ContentLayout
    {
        const contentElements = layout[0] instanceof FormattingSettings
            ? [layout as FormattingFrame]
            : layout as LineElement[];

        if (this.alignment.horizontal === "right")
            return [Flex.grow(" ").shrinkRight(truncator), ...contentElements];

        if (this.alignment.horizontal === "center")
            return [Flex.grow(" ").shrinkRight(truncator), ...contentElements, Flex.grow(" ")];

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

class TableColumn<EntryType>
{
    readonly identifier: string;
    readonly definition: TableColumnDefinition<EntryType>;

    private readonly headerTemplate: TableCellTemplate<string>;
    private readonly bodyTemplate: TableCellTemplate<EntryType>;
    private readonly footerTemplate: TableCellTemplate<Partial<EntryType>>;

    constructor(identifier: string, definition: TableColumnDefinition<EntryType>)
    {
        this.identifier = identifier;
        this.definition = definition;

        const sharedOptions = definition.cellOptions as TableCellOptions<unknown> | undefined;
        this.headerTemplate = new TableCellTemplate(definition.headerOptions, sharedOptions, title => title);
        this.bodyTemplate = new TableCellTemplate(definition.cellOptions, sharedOptions, entry => this.readValue(entry));
        this.footerTemplate = new TableCellTemplate(definition.footerOptions, sharedOptions, footer => this.readValue(footer));
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

    renderHeader(columnIndex: number, width: number)
    {
        return this.headerTemplate.render(this.definition.header ?? "", 0, columnIndex, width);
    }

    renderBody(entry: EntryType, rowIndex: number, columnIndex: number, width: number)
    {
        return this.bodyTemplate.render(entry, rowIndex, columnIndex, width);
    }

    renderFooter(footerData: Partial<EntryType>, columnIndex: number, width: number)
    {
        return this.footerTemplate.render(footerData, 0, columnIndex, width);
    }

    private readValue(data: EntryType | Partial<EntryType>)
    {
        return (data as Record<string, unknown>)[this.identifier];
    }
}

type FlexibleColumn<EntryType> = {
    column: TableColumn<EntryType>;
    index: number;
};

export class Table<EntryType>
{
    static Auto<EntryType extends object>(data: readonly EntryType[], formatting: TableFormatting = {}): Table<EntryType>
    {
        const firstEntry = data[0];
        let columnIdentifiers: string[];

        if (Array.isArray(firstEntry))
            columnIdentifiers = firstEntry.map((_, index) => String(index));
        else
        {
            const encounteredIdentifiers = data.flatMap(entry => Object.keys(entry));
            columnIdentifiers = [...new Set(encounteredIdentifiers)];
        }

        const columnDefinitions = Object.fromEntries(
            columnIdentifiers.map(identifier => [identifier, {}]),
        );

        return new Table<EntryType>(columnDefinitions as TableColumns<EntryType>, formatting, data);
    }

    readonly data: EntryType[];
    footerData?: Partial<EntryType>;

    private readonly columns: TableColumn<EntryType>[];
    private readonly formatting: TableFormatting;

    constructor(columns: TableColumns<EntryType>, formatting: TableFormatting = {}, data: readonly EntryType[] = [])
    {
        this.columns = this.parseColumnDefinitions(columns);
        this.formatting = formatting;
        this.data = [...data];
    }

    private get resolvedBorder()
    {
        return this.formatting.border === false
            ? TableBorder.none
            : this.formatting.border ?? TableBorder.light;
    }

    render(control: TableRenderControl = {})
    {
        const widths = this.resolveColumnWidths(control.width ?? -1);
        const lines = [
            ...this.renderHeader(widths),
            ...this.renderBody(widths),
            ...this.renderFooter(widths),
        ];
        const visibleWidth = control.width ?? -1;
        const horizontalOffset = control.horizontalOffset ?? 0;

        return lines
            .map(line => this.clipLine(line, visibleWidth, horizontalOffset))
            .join("\n");
    }

    private renderHeader(widths: number[])
    {
        const lines: string[] = [];
        const border = this.resolvedBorder;
        const hasHeaders = this.columns.some(column => column.definition.header !== undefined);

        const topBorder = border.renderTop(widths);
        if (topBorder !== undefined)
            lines.push(this.formatBorder(topBorder));
        if (!hasHeaders)
            return lines;

        const cells = this.columns.map((column, index) => column.renderHeader(index, widths[index]));
        lines.push(this.renderRow(cells));

        const headerSeparator = border.renderSeparator(widths);
        if (headerSeparator !== undefined && (this.data.length > 0 || this.footerData !== undefined))
            lines.push(this.formatBorder(headerSeparator));

        return lines;
    }

    private renderBody(widths: number[])
    {
        return this.data.map((entry, rowIndex) =>
        {
            const cells = this.columns.map((column, columnIndex) =>
                column.renderBody(entry, rowIndex, columnIndex, widths[columnIndex]));
            return this.renderRow(cells);
        });
    }

    private renderFooter(widths: number[])
    {
        const lines: string[] = [];
        const border = this.resolvedBorder;

        if (this.footerData !== undefined)
        {
            const footerSeparator = border.renderSeparator(widths);
            if (footerSeparator !== undefined && this.data.length > 0)
                lines.push(this.formatBorder(footerSeparator));

            const cells = this.columns.map((column, index) =>
                column.renderFooter(this.footerData!, index, widths[index]));
            lines.push(this.renderRow(cells));
        }

        const bottomBorder = border.renderBottom(widths);
        if (bottomBorder !== undefined)
            lines.push(this.formatBorder(bottomBorder));

        return lines;
    }

    private renderRow(cells: string[])
    {
        const border = this.resolvedBorder;
        const verticalBorder = this.formatBorder(border.vertical);
        return border.renderRow(cells, verticalBorder);
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
        return this.resolvedBorder.getWidth(this.columns.length);
    }

    private formatBorder(text: string)
    {
        if (!this.formatting.borderStyle)
            return text;
        return (this.formatting.borderStyle as unknown as { format(value: string): string }).format(text);
    }

    private clipLine(line: string, width: number, horizontalOffset: number)
    {
        if (width < 0)
            return line;
        return line.slice(horizontalOffset, horizontalOffset + width);
    }
}
