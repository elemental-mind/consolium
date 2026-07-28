import assert from "node:assert/strict";
import { extendTextArrayEnd, extendTextArrayStart, textWidth, truncateStringsEnd, truncateStringsStart, truncateTextEnd, truncateTextStart } from "./textSize.ts";

export class TerminalWidthTests
{
    countsPrintableAsciiCharacters()
    {
        assert.equal(textWidth("The quick brown fox 123!?"), 25);
    }

    countsWesternCharactersAndGraphemeClusters()
    {
        assert.equal(textWidth("hello"), 5);
        assert.equal(textWidth("café"), 4);
        assert.equal(textWidth("cafe\u0301"), 4);
        assert.equal(textWidth("𝄞"), 1);
    }

    countsEmojiGraphemeClustersAsTwoColumns()
    {
        assert.equal(textWidth("😀"), 2);
        assert.equal(textWidth("👩🏽‍💻"), 2);
        assert.equal(textWidth("👨‍👩‍👧‍👦"), 2);
        assert.equal(textWidth("🇩🇪"), 2);
        assert.equal(textWidth("1️⃣"), 2);
        assert.equal(textWidth("Hi 👩‍💻!"), 6);
    }

    distinguishesTextAndEmojiPresentation()
    {
        assert.equal(textWidth("♥"), 1);
        assert.equal(textWidth("♥️"), 2);
    }

    ignoresStandaloneNonPrintingClusters()
    {
        assert.equal(textWidth(""), 0);
        assert.equal(textWidth("\u0301"), 0);
        assert.equal(textWidth("\n\t"), 0);
    }

    keepsCombiningSequencesIntactWhenTruncating()
    {
        assert.equal(truncateTextEnd("cafe\u0301", 4, 4), "cafe\u0301");
        assert.equal(truncateTextEnd("cafe\u0301", 4, 3), "caf");
        assert.equal(truncateTextStart("cafe\u0301", 4, 3), "afe\u0301");
        assert.equal(truncateTextEnd("\u0301", 0, 1), "\u0301");
        assert.equal(truncateTextEnd("\u0301", 0, 0), "");
    }

    fillsColumnsThatCannotContainAnEntireGrapheme()
    {
        const text = "ab😀cd";

        assert.equal(truncateTextEnd(text, 6, 3), "ab ");
        assert.equal(truncateTextStart(text, 6, 3), " cd");
        assert.equal(truncateTextEnd(text, 6, 4), "ab😀");
        assert.equal(truncateTextStart(text, 6, 4), "😀cd");
        assert.equal(truncateTextEnd("ab", 2, 3), "ab");
    }

    excludesTheTruncatorFromTheTargetRetainedContentWidth()
    {
        const text = "ab😀cd";

        assert.equal(truncateTextEnd(text, 6, 4, "…"), "ab😀…");
        assert.equal(truncateTextStart(text, 6, 4, "…"), "…😀cd");
        assert.equal(truncateTextEnd(text, 6, 6, "…"), text);
        assert.equal(truncateTextEnd("abcdef", 6, 2, "..."), "ab...");
        assert.equal(truncateTextStart("abcdef", 6, 2, "..."), "...ef");
        assert.equal(truncateTextEnd("abcdef", 6, 0, "..."), "...");
        assert.equal(truncateTextStart("abcdef", 6, 0, "..."), "...");
        assert.equal(truncateTextEnd("😀😀😀", 6, 5, "..."), "😀😀 ...");
        assert.equal(truncateTextStart("😀😀😀", 6, 5, "..."), "... 😀😀");
    }

    truncatesFragmentArraysWithoutLosingFormattingPositions()
    {
        const text = ["ab", "😀", "cd"];

        assert.deepEqual(truncateStringsEnd([...text], 6, 4, "…"), ["ab", " …", ""]);
        assert.deepEqual(truncateStringsStart([...text], 6, 4, "…"), ["", "… ", "cd"]);
        assert.deepEqual(truncateStringsEnd(["😀", "😀", "😀"], 6, 5, "..."), ["😀", "...", ""]);
        assert.deepEqual(truncateStringsStart(["😀", "😀", "😀"], 6, 5, "..."), ["", "...", "😀"]);
    }

    extendsFragmentArraysAtTheRequestedBoundary()
    {
        const text = ["left", "right"];

        assert.deepEqual(extendTextArrayEnd(text, 9, 12, ".-"), ["left", "right.-."]);
        assert.deepEqual(extendTextArrayStart(text, 9, 12, ".-"), ["-.-left", "right"]);
        assert.deepEqual(extendTextArrayStart(text, 9, 11, ".-"), [".-left", "right"]);
    }
}
