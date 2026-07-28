import assert from "node:assert/strict";
import { Formatting, FormattingSettings } from "../formatting/formatting.ts";
import { extendTextArrayEnd, extendTextArrayStart, truncateStringsEnd, truncateStringsStart } from "../formatting/textSize.ts";
import { Flex } from "./flex.ts";
import { HorizontalLayout } from "./horizontalLayout.ts";

export class HorizontalLayoutGrowthTests
{
    growsSingleFillerToTheTargetWidth()
    {
        const layout = new HorizontalLayout(["left", Flex.grow("."), "right"]);

        assert.equal(layout.computeString(14), "left.....right");
    }

    sharesGrowthAccordingToFlexFactor()
    {
        const layout = new HorizontalLayout([
            Flex.grow({ filler: "a", flexFactor: 1 }),
            Flex.grow({ filler: "b", flexFactor: 3 }),
        ]);

        assert.equal(layout.computeString(8), "aabbbbbb");
    }

    redistributesGrowthAfterFillerReachesItsMaximum()
    {
        const layout = new HorizontalLayout([
            Flex.grow({ filler: "a", flexFactor: 1 }),
            Flex.grow({ filler: "b", flexFactor: 3, max: 4 }),
        ]);

        assert.equal(layout.computeString(8), "aaaabbbb");
    }

    fillsHigherPrioritiesBeforeLowerPriorities()
    {
        const layout = new HorizontalLayout([
            Flex.grow({ filler: "l", fillPriority: 0 }),
            Flex.grow({ filler: "h", fillPriority: 10, max: 2 }),
        ]);

        assert.equal(layout.computeString(5), "lllhh");
    }

    doesNotGrowLowerPrioritiesAfterAnUnboundedPriorityGroupConsumesTheTarget()
    {
        const layout = new HorizontalLayout([
            Flex.grow({ filler: "a", fillPriority: 10 }),
            Flex.grow({ filler: "b", fillPriority: 10 }),
            Flex.grow({ filler: "c", fillPriority: 0 }),
        ]);

        assert.equal(layout.computeString(6), "aaabbb");
    }

    passesUnusedGrowthFromACappedGroupToTheNextPriority()
    {
        const layout = new HorizontalLayout([
            Flex.grow({ filler: "a", fillPriority: 10, max: 2 }),
            Flex.grow({ filler: "b", fillPriority: 10, max: 2 }),
            Flex.grow({ filler: "c", fillPriority: 0 }),
        ]);

        assert.equal(layout.computeString(10), "aabbcccccc");
    }

    treatsZeroAsAGrowthLimit()
    {
        const layout = new HorizontalLayout([
            Flex.grow({ filler: "x", fillPriority: 10, max: 0 }),
            Flex.grow({ filler: "y", fillPriority: 0 }),
        ]);

        assert.equal(layout.computeString(3), "yyy");
    }

    supportsFunctionFillers()
    {
        const layout = new HorizontalLayout([
            Flex.grow(length => "=".repeat(length)),
        ]);

        assert.equal(layout.computeString(3), "===");
    }

    stopsGrowingWhenAllFillersReachTheirMaximum()
    {
        const layout = new HorizontalLayout([
            "[",
            Flex.grow({ filler: ".", max: 2 }),
            "]",
        ]);

        assert.equal(layout.computeString(10), "[..]");
    }

    doesNotMutateTheLayoutBetweenRenders()
    {
        const layout = new HorizontalLayout(["left", Flex.grow(" "), "right"]);

        assert.equal(layout.computeString(12), "left   right");
        assert.equal(layout.computeString(10), "left right");
        assert.equal(layout.computeString(11), "left  right");
    }

    forceExtendsWithDirectionalFillersOutsideFormatting()
    {
        const layout = new HorizontalLayout([Formatting.green, "same"]);
        const formattedText = (Formatting.green as FormattingSettings).format("same");

        assert.equal(layout.computeString(7, { truncate: truncateStringsEnd, fill: extendTextArrayEnd, filler: ".-" }), formattedText + ".-.");
        assert.equal(layout.computeString(7, { truncate: truncateStringsStart, fill: extendTextArrayStart, filler: ".-" }), "-.-" + formattedText);
        assert.equal(layout.computeString(6, { truncate: truncateStringsStart, fill: extendTextArrayStart, filler: ".-" }), ".-" + formattedText);
    }
}

export class HorizontalLayoutShrinkTests
{
    retainsBestEffortOutputUnlessForced()
    {
        const layout = new HorizontalLayout([Formatting.green, "same", [Formatting.red, "same"]]);

        assert.equal(
            layout.computeString(5),
            (Formatting.green as FormattingSettings).format("same") + (Formatting.red as FormattingSettings).format("same"),
        );
    }

    forceTruncatesOnTheRightBeforeApplyingFormatting()
    {
        const layout = new HorizontalLayout([Formatting.green, "same", [Formatting.red, "same"]]);

        assert.equal(
            layout.computeString(5, { truncate: truncateStringsEnd, fill: extendTextArrayEnd }),
            (Formatting.green as FormattingSettings).format("same") + (Formatting.red as FormattingSettings).format("…"),
        );
        assert.equal(
            layout.computeString(7, { truncate: truncateStringsEnd, fill: extendTextArrayEnd, truncator: "..." }),
            (Formatting.green as FormattingSettings).format("same") + (Formatting.red as FormattingSettings).format("..."),
        );
        assert.equal(layout.computeString(2, { truncate: truncateStringsEnd, fill: extendTextArrayEnd, truncator: "..." }), (Formatting.green as FormattingSettings).format(".."));
        assert.equal(layout.computeString(0, { truncate: truncateStringsEnd, fill: extendTextArrayEnd, truncator: "..." }), "");
    }

    forceTruncatesOnTheLeftAndPreservesRightFormatting()
    {
        const layout = new HorizontalLayout([Formatting.green, "same", [Formatting.red, "same"]]);

        assert.equal(
            layout.computeString(7, { truncate: truncateStringsStart, fill: extendTextArrayStart, truncator: "..." }),
            (Formatting.green as FormattingSettings).format("...") + (Formatting.red as FormattingSettings).format("same"),
        );
    }

    sharesShrinkageAccordingToFlexFactor()
    {
        const layout = new HorizontalLayout([
            "abcdefghij",
            Flex.shrinkLeft({ truncator: "...", flexFactor: 1 }),
            "klmnopqrst",
            Flex.shrinkLeft({ truncator: "...", flexFactor: 3 }),
        ]);

        assert.equal(layout.computeString(12), "abcde...k...");
    }

    usesASingleWidthEllipsisAsTheDefaultFlexTruncationMarker()
    {
        const layout = new HorizontalLayout(["abcdef", Flex.shrinkLeft()]);

        assert.equal(layout.computeString(4), "abc…");
    }

    redistributesShrinkageAfterARangeReachesItsPreservationLimit()
    {
        const layout = new HorizontalLayout([
            "abcdefghij",
            Flex.shrinkLeft({ truncator: "...", flexFactor: 1, preserve: 9 }),
            "klmnopqrst",
            Flex.shrinkLeft({ truncator: "...", flexFactor: 3 }),
        ]);

        assert.equal(layout.computeString(12), "abcdef......");
    }

    shrinksLowerImportanceBeforeHigherImportance()
    {
        const layout = new HorizontalLayout([
            "abcdefghij",
            Flex.shrinkLeft({ truncator: "...", contentImportance: 0, preserve: 8 }),
            "klmnopqrst",
            Flex.shrinkLeft({ truncator: "...", contentImportance: 10 }),
        ]);

        assert.equal(layout.computeString(15), "abcde...klmn...");
    }

    measuresAndTruncatesVisibleColumnsWithoutSplittingGraphemes()
    {
        const layout = new HorizontalLayout(["a😀b"]);

        assert.equal(layout.unformattedWidth, 4);
        assert.equal(layout.computeString(3, { truncate: truncateStringsEnd, fill: extendTextArrayEnd }), "a …");
        assert.equal(layout.computeString(3, { truncate: truncateStringsStart, fill: extendTextArrayStart }), "… b");
    }

    flexTruncationKeepsItsExactWidthAtWideGraphemeBoundaries()
    {
        const truncateRight = new HorizontalLayout(["a😀b", Flex.shrinkLeft()]);
        const truncateLeft = new HorizontalLayout([Flex.shrinkRight(), "a😀b"]);

        assert.equal(truncateRight.computeString(3), "a …");
        assert.equal(truncateLeft.computeString(3), "… b");
    }
}
