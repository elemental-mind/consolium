import assert from "node:assert/strict";
import { textSize } from "./textSize.ts";

export class TerminalWidthTests
{
    countsPrintableAsciiCharacters()
    {
        assert.equal(textSize("The quick brown fox 123!?"), 25);
    }

    countsWesternCharactersAndGraphemeClusters()
    {
        assert.equal(textSize("hello"), 5);
        assert.equal(textSize("café"), 4);
        assert.equal(textSize("cafe\u0301"), 4);
        assert.equal(textSize("𝄞"), 1);
    }

    countsEmojiGraphemeClustersAsTwoColumns()
    {
        assert.equal(textSize("😀"), 2);
        assert.equal(textSize("👩🏽‍💻"), 2);
        assert.equal(textSize("👨‍👩‍👧‍👦"), 2);
        assert.equal(textSize("🇩🇪"), 2);
        assert.equal(textSize("1️⃣"), 2);
        assert.equal(textSize("Hi 👩‍💻!"), 6);
    }

    distinguishesTextAndEmojiPresentation()
    {
        assert.equal(textSize("♥"), 1);
        assert.equal(textSize("♥️"), 2);
    }

    ignoresStandaloneNonPrintingClusters()
    {
        assert.equal(textSize(""), 0);
        assert.equal(textSize("\u0301"), 0);
        assert.equal(textSize("\n\t"), 0);
    }
}
