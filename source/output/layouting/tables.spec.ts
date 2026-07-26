import assert from "node:assert/strict";
import { Debug } from "unitium";
import { Formatting } from "../formatting/formatting.ts";
import { Table, TableBorder, type TableColumns } from "./tables.ts";

type FileRow =
    {
        path: string;
        size: number;
    };

export class TableRenderingTests
{
    rendersObjectRowsThroughConfiguredColumns()
    {
        const columns = {
            path: {
                header: "File",
                cellOptions: { padding: { left: " ", right: " " }, width: { minContentWidth: 8 } },
            },
            size: {
                header: "Size",
                cellOptions: {
                    cell: (file: FileRow) => `${file.size} B`,
                    align: { horizontal: "right" as const },
                    padding: " ",
                },
            },
        } satisfies TableColumns<FileRow>;
        const table = new Table(columns, { border: TableBorder.Rounded }, [
            { path: "readme.md", size: 42 },
        ]);

        assert.deepEqual(table.renderLines(), [
            "╭───────────┬──────╮",
            "│ File      │ Size │",
            "├───────────┼──────┤",
            "│ readme.md │ 42 B │",
            "╰───────────┴──────╯",
        ]);
    }

    rereadsMutableDataAndFooterForEveryRender()
    {
        const table = new Table<FileRow>({
            path: { header: "File" },
            size: { header: "Bytes", cellOptions: { align: { horizontal: "right" } } },
        }, { border: TableBorder.None });

        table.bodyData.push({ path: "a.txt", size: 2 });
        table.footerData = { path: "Total", size: 2 };

        assert.deepEqual(table.renderLines(), [
            "File Bytes",
            "a.txt    2",
            "Total    2",
        ]);
    }

    resolvesCustomCellContentOncePerRenderPass()
    {
        type Row = { value: string; };
        const calls = { header: 0, body: 0, footer: 0 };
        const sharedRow = { value: "one" };
        const table = new Table<Row>({
            value: {
                header: "Name",
                headerOptions: {
                    cell: headerData =>
                    {
                        calls.header++;
                        return [`H:${headerData.value}`];
                    },
                },
                cellOptions: {
                    cell: (row, rowIndex) =>
                    {
                        calls.body++;
                        return [`B:${row.value}:${rowIndex}`];
                    },
                },
                footerOptions: {
                    cell: footerData =>
                    {
                        calls.footer++;
                        return [`F:${footerData.value}`];
                    },
                },
            },
        }, { border: false }, [sharedRow, sharedRow]);
        table.footerData = { value: "all" };

        assert.deepEqual(table.renderLines(), [
            "H:Name ",
            "B:one:0",
            "B:one:1",
            "F:all  "]);
        assert.deepEqual(calls, { header: 1, body: 2, footer: 1 });

        table.bodyData[0] = { value: "next" };
        table.footerData = { value: "updated" };

        assert.deepEqual(table.renderLines(), [
            "H:Name   ",
            "B:next:0 ",
            "B:one:1  ",
            "F:updated"]);
        assert.deepEqual(calls, { header: 2, body: 4, footer: 2 });
    }

    rendersWithoutStructuralLinesWhenTheBorderIsNone()
    {
        const table = new Table<FileRow>({
            path: { cellOptions: { padding: { right: " " } } },
            size: {},
        }, { border: false, borderStyle: Formatting.green }, [
            { path: "readme.md", size: 42 },
        ]);

        assert.deepEqual(table.renderLines(), ["readme.md 42"]);
    }

    supportsPositionalRowsAndAutomaticColumns()
    {
        type PackageRow = readonly [string, string];
        const packages: PackageRow[] = [
            ["terminalium", "0.1.0"],
            ["unitium", "0.8.6"],
        ];
        const table = new Table<PackageRow>({
            "0": { cellOptions: { padding: { right: " " } } },
            "1": {},
        }, { border: TableBorder.None }, packages);

        assert.deepEqual(table.renderLines(), [
            "terminalium 0.1.0",
            "unitium     0.8.6",
        ]);

        const automaticTable = Table.Auto(packages, { border: false });

        assert.deepEqual(automaticTable.renderLines(), [
            "terminalium0.1.0",
            "unitium    0.8.6",
        ]);
    }

    usesEnumerablePropertiesFromTheFirstAutomaticRow()
    {
        const table = Table.Auto([
            { name: "terminalium" },
            { name: "unitium", version: "0.8.6" },
        ], { border: false });

        assert.deepEqual(table.renderLines(), [
            "terminalium",
            "unitium    ",
        ]);

        const prototype = { inherited: "prototype" };
        const firstRow = Object.assign(Object.create(prototype), { own: "first" }) as { own: string; inherited: string; };
        const inheritedTable = Table.Auto([firstRow, { own: "second", later: "ignored" }], { border: false });

        assert.deepEqual(inheritedTable.renderLines(), [
            "first prototype",
            "second         ",
        ]);

        assert.throws(() => Table.Auto([]).renderLines());
    }

    rejectsInvalidTableDimensions()
    {
        assert.throws(() => new Table({ value: { cellOptions: { width: -1 } } }), RangeError);
        assert.throws(() => new Table({ value: { cellOptions: { width: { minContentWidth: 3, maxContentWidth: 2 } } } }), RangeError);
        assert.throws(() => new Table({ value: { cellOptions: { width: { flexFactor: 0 } } } }), RangeError);

        const table = new Table({ value: {} }, { border: false }, [{ value: "ok" }]);
        assert.throws(() => table.renderLines(-2), RangeError);
        assert.throws(() => table.renderLines(1.5), RangeError);
    }
}
