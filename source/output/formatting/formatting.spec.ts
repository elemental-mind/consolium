import assert from "node:assert/strict";
import { Formatting } from "./formatting.ts";

export class FormattingChainingTests
{
    combinesNamedColorsAndTextStyles()
    {
        const formatting = Formatting.red.bgBlue.bold.underlined;

        assert.deepEqual(formatting.settings, {
            foreground: "red",
            background: "blue",
            bold: true,
            underlined: true,
        });
    }

    latestForegroundAndBackgroundColorsTakePrecedence()
    {
        const formatting = Formatting.red.blue.bgBlack.bgWhite.bold;

        assert.deepEqual(formatting.settings, {
            foreground: "blue",
            background: "white",
            bold: true,
        });
    }

    combinesLiteralColorSegmentsBeforeContinuingTheChain()
    {
        const red = "FF";
        const green = "00";
        const blue = "A1";

        const formatting = Formatting.fg`#${red}${green}${blue}`.bg`#123`.italic;

        assert.deepEqual(formatting.settings, {
            foreground: "#FF00A1",
            background: "#123",
            italic: true,
        });
    }

    keepsSeparateFluentChainsIndependent()
    {
        const red = Formatting.red.bold;
        const blue = Formatting.blue.italic;

        assert.deepEqual(red.settings, {
            foreground: "red",
            bold: true,
        });
        assert.deepEqual(blue.settings, {
            foreground: "blue",
            italic: true,
        });
    }

    supportsDestructuringNamedColors()
    {
        const { red, green } = Formatting;

        const formatting1 = red.bgWhite.bold;
        const formatting2 = green.bgBlack.underlined;

        assert.deepEqual(formatting1.settings, {
            foreground: "red",
            background: "white",
            bold: true,
        });
        assert.deepEqual(formatting2.settings, {
            foreground: "green",
            background: "black",
            underlined: true,
        });
    }

    identifiesFormattingResultsWithInstanceof()
    {
        const { red } = Formatting;
        const formattingResults = [
            Formatting.green,
            Formatting.blue.bold,
            red.bgWhite.underlined,
            Formatting.fg`#ABC`,
            Formatting.bg`#123456`.italic,
        ];

        for (const formatting of formattingResults)
            assert(formatting instanceof Formatting);

        assert(!({ settings: {} } instanceof Formatting));
    }

    mergesFormattingForEmbeddedContexts()
    {
        const parent = Formatting.blue.bgBlack.bold;
        const child = Formatting.red.underlined;

        const embedded = parent.merge(child).italic;

        assert.deepEqual(embedded.settings, {
            foreground: "red",
            background: "black",
            bold: true,
            underlined: true,
            italic: true,
        });
        assert.deepEqual(parent.settings, {
            foreground: "blue",
            background: "black",
            bold: true,
        });
        assert.deepEqual(child.settings, {
            foreground: "red",
            underlined: true,
        });
        assert(embedded instanceof Formatting);
    }

    mergesRawOverridesIncludingDisabledStyles()
    {
        const parent = Formatting.green.bold.italic;

        const embedded = parent.merge({ bold: false, background: "white" });

        assert.deepEqual(embedded.settings, {
            foreground: "green",
            background: "white",
            bold: false,
            italic: true,
        });
        assert.deepEqual(parent.settings, {
            foreground: "green",
            bold: true,
            italic: true,
        });
    }
}
