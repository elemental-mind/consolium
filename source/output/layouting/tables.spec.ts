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
        const table = new Table(columns, { border: TableBorder.rounded }, [
            { path: "readme.md", size: 42 },
        ]);

        assert.equal(table.render(), [
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
        }, { border: TableBorder.none });

        table.data.push({ path: "a.txt", size: 2 });
        table.footerData = { path: "Total", size: 2 };

        assert.equal(table.render(), [
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
        }, { border: TableBorder.none }, [
            { path: "readme.md", size: 42 },
        ]);

        assert.equal(table.render(), "readme.md 42");
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
        }, { border: TableBorder.none }, packages);

        assert.equal(table.render(), [
            "terminalium 0.1.0",
            "unitium     0.8.6",
        ].join("\n"));

        const automaticTable = Table.Auto(packages, { border: false });

        assert.equal(automaticTable.render(), [
            "terminalium0.1.0",
            "unitium    0.8.6",
        ].join("\n"));
    }
}
