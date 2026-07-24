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
                cellOptions: { padding: " ", width: { min: 8 } },
            },
            size: {
                header: "Size",
                cellOptions: {
                    value: (file: FileRow) => `${file.size} B`,
                    align: "right" as const,
                    padding: " ",
                },
            },
        } satisfies TableColumns<FileRow>;
        const table = new Table(columns, { border: TableBorder.rounded }, [
            { path: "readme.md", size: 42 },
        ]);

        assert.equal(table.render({ formatting: false }), [
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
            size: { header: "Bytes", cellOptions: { align: "right" } },
        }, { border: false });

        table.data.push({ path: "a.txt", size: 2 });
        table.footerData = { path: "Total", size: 2 };

        assert.deepEqual(table.renderLines({ formatting: false }), [
            "File Bytes",
            "a.txt    2",
            "Total    2",
        ]);
    }

    supportsPositionalRowsAndAutomaticColumns()
    {
        type PackageRow = readonly [string, string];
        const table = Table.auto<PackageRow>([
            ["terminalium", "0.1.0"],
            ["unitium", "0.8.6"],
        ], { border: false });

        assert.equal(table.render({ formatting: false }), [
            "terminalium0.1.0",
            "unitium    0.8.6",
        ].join("\n"));
    }
}
