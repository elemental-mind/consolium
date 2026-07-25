import assert from "node:assert/strict";
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
                cellOptions: { padding: { left: " ", right: " " }, width: { min: 8 } },
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
        const table = new Table(columns, { border: TableBorder.Soft }, [
            { path: "readme.md", size: 42 },
        ]);

        assert.equal(table.renderLines(), [
            "╭───────────┬──────╮",
            "│ File      │ Size │",
            "├───────────┼──────┤",
            "│ readme.md │ 42 B │",
            "╰───────────┴──────╯",
        ].join("\n"));
    }

    rereadsMutableDataAndFooterForEveryRender()
    {
        const table = new Table<FileRow>({
            path: { header: "File" },
            size: { header: "Bytes", cellOptions: { align: { horizontal: "right" } } },
        }, { border: TableBorder.None });

        table.data.push({ path: "a.txt", size: 2 });
        table.footerData = { path: "Total", size: 2 };

        assert.equal(table.renderLines(), [
            "File Bytes",
            "a.txt    2",
            "Total    2",
        ].join("\n"));
    }

    rendersWithoutStructuralLinesWhenTheBorderIsNone()
    {
        const table = new Table<FileRow>({
            path: { cellOptions: { padding: { right: " " } } },
            size: {},
        }, { border: TableBorder.None }, [
            { path: "readme.md", size: 42 },
        ]);

        assert.equal(table.renderLines(), "readme.md 42");
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

        assert.equal(table.renderLines(), [
            "terminalium 0.1.0",
            "unitium     0.8.6",
        ].join("\n"));

        const automaticTable = Table.Auto(packages, { border: false });

        assert.equal(automaticTable.renderLines(), [
            "terminalium0.1.0",
            "unitium    0.8.6",
        ].join("\n"));
    }

    discoversColumnsIntroducedByLaterAutomaticRows()
    {
        const table = Table.Auto([
            { name: "terminalium" },
            { name: "unitium", version: "0.8.6" },
        ], { border: false });

        assert.equal(table.renderLines(), [
            "terminalium     ",
            "unitium    0.8.6",
        ].join("\n"));

        assert.equal(Table.Auto([]).renderLines(), "");
    }

    rejectsInvalidTableDimensions()
    {
        assert.throws(() => new Table({ value: { cellOptions: { width: -1 } } }), RangeError);
        assert.throws(() => new Table({ value: { cellOptions: { width: { min: 3, max: 2 } } } }), RangeError);
        assert.throws(() => new Table({ value: { cellOptions: { width: { flexFactor: 0 } } } }), RangeError);

        const table = new Table({ value: {} }, { border: false }, [{ value: "ok" }]);
        assert.throws(() => table.renderLines(-2), RangeError);
        assert.throws(() => table.renderLines(1.5), RangeError);
    }
}
