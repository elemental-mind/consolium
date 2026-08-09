import assert from "node:assert/strict";
import * as formatting from "./style.ts";
import { bg, blue, bold, Formatting, green } from "./style.ts";
import type { FormattingAPI, FormattingWithInternalAPI } from "./formatting/formatting.ts";

const settingsOf = (formatting: FormattingAPI) => (formatting as FormattingWithInternalAPI).settings;

export class FormattingExportsTests
{
    exportsNamedColoursAndStyles()
    {
        assert.deepEqual(settingsOf(blue.bgGreen), settingsOf(Formatting.blue.bgGreen));
        assert.deepEqual(settingsOf(green.bold), settingsOf(Formatting.green.bold));
        assert.deepEqual(settingsOf(bold.blue), settingsOf(Formatting.bold.blue));
        assert.deepEqual(settingsOf(formatting.blue.bgGreen), settingsOf(Formatting.blue.bgGreen));
    }

    exportsCustomColourFunctions()
    {
        assert.deepEqual(settingsOf(bg`#123`.blue), settingsOf(Formatting.bg`#123`.blue));
    }
}
