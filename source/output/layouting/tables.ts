import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { Flex } from "./flex.ts";
import {
    HorizontalLayout,
    type FormattingFrame,
    type LineDefinition,
    type LineElement,
} from "./horizontalLayout.ts";

export type TerminalLine = string | LineDefinition;

export interface TableRenderControl
{
    width?: number;
    horizontalOffset?: number;
    formatting?: boolean;
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

export interface TableCellOptions<Data>
{
    value?: (data: Data, rowIndex: number, columnIndex: number) => unknown;
    cell?: (data: Data, rowIndex: number, columnIndex: number) => TerminalLine;
    width?: number | TableColumnWidth;
    align?: "left" | "center" | "right";
    padding?: string;
    padLeft?: string;
    padRight?: string;
    overflow?: TableCellOverflow;
}

export interface TableSectionCellOptions<Data>
{
    value?: (data: Data, rowIndex: number, columnIndex: number) => unknown;
    cell?: (data: Data, rowIndex: number, columnIndex: number) => TerminalLine;
    overflow?: TableCellOverflow;
}

export interface TableColumn<Row>
{
    header?: string;
    headerOptions?: TableSectionCellOptions<string>;
    cellOptions?: TableCellOptions<Row>;
    footerOptions?: TableSectionCellOptions<Partial<Row>>;
}

export type TableColumns<Row> = Row extends readonly unknown[]
    ? readonly TableColumn<Row>[]
    : { readonly [Key in keyof Row]?: TableColumn<Row> };

export interface TableFormatting
{
    border?: TableBorder | false;
    borderStyle?: FormattingAPI;
}

export interface RenderedTableSections
{
    head: string[];
    body: string[];
    footer: string[];
}

export class TableBorder
{
    static readonly light = new TableBorder("┌", "┬", "┐", "├", "┼", "┤", "└", "┴", "┘", "─", "│");
    static readonly rounded = new TableBorder("╭", "┬", "╮", "├", "┼", "┤", "╰", "┴", "╯", "─", "│");

    readonly topLeft: string;
    readonly topJoin: string;
    readonly topRight: string;
    readonly middleLeft: string;
    readonly middleJoin: string;
    readonly middleRight: string;
    readonly bottomLeft: string;
    readonly bottomJoin: string;
    readonly bottomRight: string;
    readonly horizontal: string;
    readonly vertical: string;

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
}

type ColumnIdentifier = string | number | symbol;
type TableSection = "header" | "body" | "footer";

class TableColumnModel<Row>
{
    readonly identifier: ColumnIdentifier;
    readonly definition: TableColumn<Row>;

    constructor(identifier: ColumnIdentifier, definition: TableColumn<Row>)
    {
        this.identifier = identifier;
        this.definition = definition;
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

    get horizontalPadding()
    {
        const options = this.definition.cellOptions;
        return {
            left: options?.padLeft ?? options?.padding ?? "",
            right: options?.padRight ?? options?.padding ?? "",
        };
    }
}

export class Table<Row>
{
    readonly data: Row[];
    footerData?: Partial<Row>;

    private readonly columns: TableColumnModel<Row>[];
    private readonly formatting: TableFormatting;

    constructor(columns: TableColumns<Row>, formatting: TableFormatting = {}, data: readonly Row[] = [])
    {
        this.columns = this.normalizeColumns(columns);
        this.formatting = formatting;
        this.data = [...data];
    }

    static auto<Row extends object>(
        data: readonly Row[],
        formatting: TableFormatting = {},
    ): Table<Row>
    {
        const firstRow = data[0];
        const columns = Array.isArray(firstRow)
            ? firstRow.map(() => ({}))
            : Object.fromEntries(data.flatMap(row => Reflect.ownKeys(row)).map(key => [key, {}]));

        return new Table<Row>(columns as TableColumns<Row>, formatting, data);
    }

    render(control: TableRenderControl = {})
    {
        return this.renderLines(control).join("\n");
    }

    renderLines(control: TableRenderControl = {})
    {
        const { head, body, footer } = this.renderSections(control);
        return [...head, ...body, ...footer];
    }

    renderSections(control: TableRenderControl = {}): RenderedTableSections
    {
        const formatting = control.formatting ?? true;
        const widths = this.resolveColumnWidths(control.width ?? -1);
        const head: string[] = [];
        const body = this.data.map((row, index) => this.renderRow("body", row, index, widths, formatting));
        const footer: string[] = [];
        const hasHeaders = this.columns.some(column => column.definition.header !== undefined);
        const border = this.resolvedBorder;

        if (border)
            head.push(this.renderBorderLine("top", widths, formatting));

        if (hasHeaders)
        {
            head.push(this.renderRow("header", undefined, 0, widths, formatting));
            if (border && (body.length > 0 || this.footerData !== undefined))
                head.push(this.renderBorderLine("middle", widths, formatting));
        }

        if (this.footerData !== undefined)
        {
            if (border && body.length > 0)
                footer.push(this.renderBorderLine("middle", widths, formatting));
            footer.push(this.renderRow("footer", this.footerData, 0, widths, formatting));
        }

        if (border)
            footer.push(this.renderBorderLine("bottom", widths, formatting));

        const visibleWidth = control.width ?? -1;
        const offset = control.horizontalOffset ?? 0;
        return {
            head: head.map(line => this.clipLine(line, visibleWidth, offset)),
            body: body.map(line => this.clipLine(line, visibleWidth, offset)),
            footer: footer.map(line => this.clipLine(line, visibleWidth, offset)),
        };
    }

    private get resolvedBorder()
    {
        return this.formatting.border === false
            ? undefined
            : this.formatting.border ?? TableBorder.light;
    }

    private normalizeColumns(columns: TableColumns<Row>)
    {
        if (Array.isArray(columns))
            return columns.map((definition, index) => new TableColumnModel(index, definition));

        return Reflect.ownKeys(columns as object).map(key =>
            new TableColumnModel(key, (columns as Record<PropertyKey, TableColumn<Row>>)[key]));
    }

    private resolveColumnWidths(requestedTableWidth: number)
    {
        const widths = this.columns.map(column =>
        {
            const preferredWidth = this.measurePreferredWidth(column);
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

    private measurePreferredWidth(column: TableColumnModel<Row>)
    {
        if (typeof column.widthConfiguration === "number")
            return column.widthConfiguration;

        const measuredWidths: number[] = [];
        if (column.definition.header !== undefined)
            measuredWidths.push(this.measureCell("header", column, undefined, 0));
        for (const [rowIndex, row] of this.data.entries())
            measuredWidths.push(this.measureCell("body", column, row, rowIndex));
        if (this.footerData !== undefined)
            measuredWidths.push(this.measureCell("footer", column, this.footerData, 0));

        return Math.max(column.minimumWidth, ...measuredWidths);
    }

    private measureCell(section: TableSection, column: TableColumnModel<Row>, data: unknown, rowIndex: number)
    {
        const line = this.createCellLine(section, column, data, rowIndex);
        const padding = this.cellPadding(section, column);
        return new HorizontalLayout(this.normalizeLine(line)).unformattedWidth
            + padding.left.length + padding.right.length;
    }

    private growFlexibleColumns(widths: number[], amount: number)
    {
        const candidates = this.columns
            .map((column, index) => ({ column, index }))
            .filter(({ column, index }) => column.isFlexible && widths[index] < column.maximumWidth);

        while (amount > 0 && candidates.length > 0)
        {
            for (const candidate of candidates.toSorted((a, b) => b.column.flexFactor - a.column.flexFactor))
            {
                if (widths[candidate.index] >= candidate.column.maximumWidth)
                    continue;
                widths[candidate.index]++;
                amount--;
                if (amount === 0) return;
            }

            for (let index = candidates.length - 1; index >= 0; index--)
                if (widths[candidates[index].index] >= candidates[index].column.maximumWidth)
                    candidates.splice(index, 1);
        }
    }

    private shrinkFlexibleColumns(widths: number[], amount: number)
    {
        const candidates = this.columns
            .map((column, index) => ({ column, index }))
            .filter(({ column, index }) => column.isFlexible && widths[index] > column.minimumWidth)
            .toSorted((a, b) => a.column.contentImportance - b.column.contentImportance);

        for (const { column, index } of candidates)
        {
            const shrinkBy = Math.min(amount, widths[index] - column.minimumWidth);
            widths[index] -= shrinkBy;
            amount -= shrinkBy;
            if (amount === 0) return;
        }
    }

    private get borderWidth()
    {
        if (!this.resolvedBorder || this.columns.length === 0)
            return 0;
        return this.columns.length + 1;
    }

    private renderRow(section: TableSection, data: unknown, rowIndex: number, widths: number[], formatting: boolean)
    {
        const cells = this.columns.map((column, columnIndex) =>
            this.renderCell(section, column, data, rowIndex, columnIndex, widths[columnIndex], formatting));
        const border = this.resolvedBorder;

        if (!border)
            return cells.join("");

        const verticalBorder = this.formatBorder([border.vertical], formatting);
        return verticalBorder + cells.join(verticalBorder) + verticalBorder;
    }

    private renderCell(
        section: TableSection,
        column: TableColumnModel<Row>,
        data: unknown,
        rowIndex: number,
        columnIndex: number,
        width: number,
        formatting: boolean,
    )
    {
        const line = this.createCellLine(section, column, data, rowIndex, columnIndex);
        const padding = this.cellPadding(section, column);
        const contentWidth = Math.max(0, width - padding.left.length - padding.right.length);
        const options = column.definition.cellOptions;
        const customCell = section === "body" && options?.cell !== undefined;
        const contentLine = customCell
            ? this.normalizeLine(line)
            : this.createAlignedLine(line, options?.align ?? "left", this.cellOverflow(section, column)?.truncate ?? "");
        const renderedContent = new HorizontalLayout(contentLine).computeString(contentWidth, formatting);

        return padding.left + renderedContent + padding.right;
    }

    private createAlignedLine(line: TerminalLine, align: "left" | "center" | "right", truncator: string): LineDefinition
    {
        const normalizedLine = this.normalizeLine(line);
        const contentElements = normalizedLine[0] instanceof FormattingSettings
            ? [normalizedLine as FormattingFrame]
            : normalizedLine as LineElement[];

        if (align === "right")
        {
            const rightAlignedLine: LineDefinition = [Flex.grow(" ").shrinkRight(truncator), ...contentElements];
            return rightAlignedLine;
        }

        // Center alignment is intentionally approximate in the draft; both sides
        // participate in growth, while the established layout engine decides remainders.
        if (align === "center")
        {
            const centeredLine: LineDefinition = [Flex.grow(" ").shrinkRight(truncator), ...contentElements, Flex.grow(" ")];
            return centeredLine;
        }

        return [...contentElements, Flex.shrinkLeft(truncator).grow(" ")];
    }

    private createCellLine(
        section: TableSection,
        column: TableColumnModel<Row>,
        data: unknown,
        rowIndex: number,
        columnIndex = this.columns.indexOf(column),
    ): TerminalLine
    {
        if (section === "header")
            return this.selectCellContent(column.definition.headerOptions, column.definition.header, rowIndex, columnIndex);

        if (section === "footer")
        {
            const defaultValue = this.readDefaultValue(data, column.identifier);
            return this.selectCellContent(
                column.definition.footerOptions,
                defaultValue,
                rowIndex,
                columnIndex,
                data as Partial<Row>,
            );
        }

        const defaultValue = this.readDefaultValue(data, column.identifier);
        return this.selectCellContent(
            column.definition.cellOptions,
            defaultValue,
            rowIndex,
            columnIndex,
            data as Row,
        );
    }

    private selectCellContent<Data>(
        options: TableSectionCellOptions<Data> | TableCellOptions<Data> | undefined,
        defaultValue: unknown,
        rowIndex: number,
        columnIndex: number,
        callbackData = defaultValue as Data,
    ): TerminalLine
    {
        if (options?.cell)
            return options.cell(callbackData as Data, rowIndex, columnIndex);
        const value = options?.value
            ? options.value(callbackData as Data, rowIndex, columnIndex)
            : defaultValue;
        return String(value ?? "");
    }

    private readDefaultValue(data: unknown, identifier: ColumnIdentifier)
    {
        if (data === undefined || data === null)
            return "";
        return (data as Record<PropertyKey, unknown>)[identifier];
    }

    private normalizeLine(line: TerminalLine): LineDefinition
    {
        return typeof line === "string" ? [line] : line;
    }

    private cellPadding(section: TableSection, column: TableColumnModel<Row>)
    {
        if (section === "body" && column.definition.cellOptions?.cell)
            return { left: "", right: "" };
        return column.horizontalPadding;
    }

    private cellOverflow(section: TableSection, column: TableColumnModel<Row>)
    {
        if (section === "header")
            return column.definition.headerOptions?.overflow ?? column.definition.cellOptions?.overflow;
        if (section === "footer")
            return column.definition.footerOptions?.overflow ?? column.definition.cellOptions?.overflow;
        return column.definition.cellOptions?.overflow;
    }

    private renderBorderLine(position: "top" | "middle" | "bottom", widths: number[], formatting: boolean)
    {
        const border = this.resolvedBorder!;
        const [left, join, right] = position === "top"
            ? [border.topLeft, border.topJoin, border.topRight]
            : position === "middle"
                ? [border.middleLeft, border.middleJoin, border.middleRight]
                : [border.bottomLeft, border.bottomJoin, border.bottomRight];
        const fragments = [left, ...widths.flatMap(width => [border.horizontal.repeat(width), join])];
        fragments[fragments.length - 1] = right;
        return this.formatBorder(fragments, formatting);
    }

    private formatBorder(fragments: string[], formatting: boolean)
    {
        const text = fragments.join("");
        if (!formatting || !this.formatting.borderStyle)
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
