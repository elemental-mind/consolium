import assert from "node:assert/strict";
import { FlexBoundary } from "./flex.ts";
import { VerticalLayout } from "./verticalLayout.ts";

export class VerticalLayoutTests
{
    defaultsToMutableEmptySections()
    {
        const layout = new VerticalLayout();
        layout.header.push("header");
        layout.content = ["body"];
        layout.footer.push("footer");

        assert.deepEqual(layout.computeLines(3), ["header", "body", "footer"]);
    }

    keepsHeaderAndFooterAtViewportEdges()
    {
        const layout = new VerticalLayout({ content: ["one"], header: ["header"], footer: ["footer"] });

        assert.deepEqual(layout.computeLines(5), ["header", "one", "", "", "footer"]);
    }

    slicesContentUsingAClampedScrollOffset()
    {
        const layout = new VerticalLayout({ content: ["one", "two", "three", "four"], header: ["header"], footer: ["footer"] });
        layout.scrollOffset = 20;

        assert.deepEqual(layout.computeLines(4), ["header", "three", "four", "footer"]);
        assert.equal(layout.scrollOffset, 2);
    }

    discardsScrollBeyondTheBottom()
    {
        const layout = new VerticalLayout({ content: ["one", "two", "three", "four"] });
        layout.computeLines(2);

        layout.scrollBy(100);
        assert.equal(layout.scrollOffset, 2);

        layout.scrollBy(-1);
        assert.deepEqual(layout.computeLines(2), ["two", "three"]);
    }

    scrollsToTopBottomAndByComputedPages()
    {
        const layout = new VerticalLayout({ content: ["one", "two", "three", "four", "five"], scrollMarkers: false });
        layout.computeLines(2);

        assert.equal(layout.scrollPage(1).scrollOffset, 2);
        layout.computeLines(2);
        assert.equal(layout.scrollPage(-1).scrollOffset, 0);
        assert.equal(layout.scrollBottom().scrollOffset, 3);
        assert.equal(layout.scrollTop().scrollOffset, 0);
    }

    pagesByTheVisibleContentCount()
    {
        const layout = new VerticalLayout({ content: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"], scrollMarkers: true });
        const firstPage = layout.computeLines(4);

        assert.deepEqual(firstPage.slice(0, 3), ["one", "two", "three"]);
        assert.equal(layout.scrollPage(1).scrollOffset, 3);

        const secondPage = layout.computeLines(4);
        assert.deepEqual(secondPage.slice(1, 3), ["five", "six"]);
        assert.equal(layout.scrollPage(-1).scrollOffset, 1);
    }

    pagesAcrossConsecutiveMarkerWindows()
    {
        const layout = new VerticalLayout({ content: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"], scrollMarkers: true });

        layout.computeLines(4);
        layout.scrollPage(1).computeLines(4);

        assert.equal(layout.scrollPage(1).scrollOffset, 5);
        layout.computeLines(4);
        assert.equal(layout.scrollPage(-1).scrollOffset, 3);
    }

    distinguishesScrollAndOverscroll()
    {
        const content = ["one", "two", "three", "four"];
        const normal = new VerticalLayout({ content, scrollMarkers: false });
        const overscroll = new VerticalLayout({ content, scrollMode: "overscroll", scrollMarkers: false });

        assert.deepEqual(normal.scrollBottom().computeLines(3), ["two", "three", "four"]);
        assert.deepEqual(overscroll.scrollBottom().computeLines(3), ["four", "", ""]);
    }

    placesConditionalScrollMarkersAroundContent()
    {
        const layout = new VerticalLayout({ content: ["one", "two", "three", "four", "five", "six", "seven"], scrollMarkers: true });

        const initial = layout.computeLines(4);
        assert.equal(initial.length, 4);
        assert.equal(initial[0], "one");
        assert.equal(initial[3] instanceof Array, true);
        assert.deepEqual(initial.slice(0, 3), ["one", "two", "three"]);

        layout.scrollOffset = 1;
        const middle = layout.computeLines(4);
        assert.equal(middle[0] instanceof Array, true);
        assert.equal(middle[3] instanceof Array, true);
        assert.deepEqual(middle.slice(1, 3), ["three", "four"]);

        const bottom = layout.scrollBottom().computeLines(4);
        assert.equal(bottom[0] instanceof Array, true);
        assert.deepEqual(bottom.slice(1), ["five", "six", "seven"]);
    }

    movesContentUpOnePhysicalRowAfterTheFirstScrollWithMarkers()
    {
        const layout = new VerticalLayout({ content: ["one", "two", "three", "four", "five"], scrollMarkers: true });
        const initial = layout.computeLines(4);

        const afterFirstScroll = layout.scrollBy(1).computeLines(4);

        assert.equal(initial.indexOf("three") - afterFirstScroll.indexOf("three"), 1);
    }

    createsCenteredMarkerDefinitions()
    {
        const layout = new VerticalLayout({ content: ["one", "two", "three", "four"], scrollMarkers: true });
        const marker = layout.computeLines(3)[2] as unknown[];

        assert.equal(marker[1] instanceof FlexBoundary, true);
        assert.equal(marker[2], "↓ Scroll for more ↓");
        assert.equal(marker[3] instanceof FlexBoundary, true);
    }

    keepsTinyScrolledViewportsWithinTheirHeight()
    {
        const layout = new VerticalLayout({ content: ["one", "two", "three"], scrollOffset: 1 });

        assert.deepEqual(layout.computeLines(1), ["two"]);
    }

    disablesScrollMarkersExplicitly()
    {
        const layout = new VerticalLayout({ content: ["one", "two", "three", "four", "five"], scrollMarkers: false });

        assert.deepEqual(layout.computeLines(4), ["one", "two", "three", "four"]);
        assert.deepEqual(layout.scrollBy(1).computeLines(4), ["two", "three", "four", "five"]);
    }

    replacesBothScrollMarkersWithCustomLines()
    {
        const layout = new VerticalLayout({
            content: ["one", "two", "three", "four", "five", "six", "seven"],
            scrollMarkers: { top: "Earlier items", bottom: "Later items" },
        });

        assert.deepEqual(layout.computeLines(4), ["one", "two", "three", "Later items"]);
        assert.deepEqual(layout.scrollBy(1).computeLines(4), ["Earlier items", "three", "four", "Later items"]);
    }

    hidesAnOmittedCustomMarkerSide()
    {
        const layout = new VerticalLayout({
            content: ["one", "two", "three", "four", "five"],
            scrollMarkers: { top: "Earlier items" },
        });

        assert.deepEqual(layout.computeLines(4), ["one", "two", "three", "four"]);
        assert.deepEqual(layout.scrollBy(1).computeLines(4), ["Earlier items", "three", "four", "five"]);
    }

    supportsSingleCustomMarkerSides()
    {
        const topDisabled = new VerticalLayout({
            content: ["one", "two", "three", "four", "five", "six", "seven"],
            scrollMarkers: { bottom: "Later items" },
        });
        assert.deepEqual(topDisabled.computeLines(4), ["one", "two", "three", "Later items"]);

        const bottomDisabled = new VerticalLayout({
            content: ["one", "two", "three", "four", "five", "six", "seven"],
            scrollMarkers: { top: "Earlier items" },
        });
        assert.deepEqual(bottomDisabled.computeLines(4), ["one", "two", "three", "four"]);
        assert.deepEqual(bottomDisabled.scrollBy(1).computeLines(4), ["Earlier items", "three", "four", "five"]);
    }

    createsDefaultMarkersWithDistinctFlexibleBoundariesPerLayout()
    {
        const firstMarker = new VerticalLayout({ content: ["one", "two", "three", "four"], scrollMarkers: true }).computeLines(3)[2] as unknown[];
        const secondMarker = new VerticalLayout({ content: ["one", "two", "three", "four"], scrollMarkers: true }).computeLines(3)[2] as unknown[];

        assert.notEqual(firstMarker, secondMarker);
        assert.notEqual(firstMarker[1], secondMarker[1]);
        assert.notEqual(firstMarker[3], secondMarker[3]);
    }

    preservesTheFooterWhenFixedSectionsExceedTheViewport()
    {
        const layout = new VerticalLayout({ content: ["body"], header: ["header one", "header two"], footer: ["footer one", "footer two"] });

        assert.deepEqual(layout.computeLines(3), ["header one", "footer one", "footer two"]);
    }

    clampsScrollingAboveTheFirstContentLine()
    {
        const layout = new VerticalLayout({ content: ["one"] });
        layout.scrollOffset = -2;
        layout.scrollBy(-1);

        assert.equal(layout.scrollOffset, 0);
    }
}
