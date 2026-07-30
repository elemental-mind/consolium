import assert from "node:assert/strict";
import { VerticalLayout } from "./verticalLayout.ts";

export class VerticalLayoutTests
{
    keepsHeaderAndFooterAtViewportEdges()
    {
        const layout = new VerticalLayout(["one"], {
            header: ["header"],
            footer: ["footer"],
        });

        assert.deepEqual(layout.computeLines(5), ["header", "one", "", "", "footer"]);
    }

    slicesContentUsingAClampedScrollOffset()
    {
        const layout = new VerticalLayout(["one", "two", "three", "four"], {
            header: ["header"],
            footer: ["footer"],
        });

        layout.scrollOffset = 20;

        assert.deepEqual(layout.computeLines(4), ["header", "three", "four", "footer"]);
        assert.equal(layout.scrollOffset, 2);
    }

    reclampsTheOffsetWhenTheViewportShrinks()
    {
        const layout = new VerticalLayout(["one", "two", "three"], { scrollOffset: 1 });

        assert.deepEqual(layout.computeLines(1), ["two"]);
        assert.equal(layout.scrollOffset, 1);
    }

    preservesTheFooterWhenFixedSectionsExceedTheViewport()
    {
        const layout = new VerticalLayout(["body"], {
            header: ["header one", "header two"],
            footer: ["footer one", "footer two"],
        });

        assert.deepEqual(layout.computeLines(3), ["header one", "footer one", "footer two"]);
    }

    rejectsInvalidViewportAndScrollValues()
    {
        const layout = new VerticalLayout([]);

        assert.throws(() => layout.computeLines(-1), RangeError);
        assert.throws(() => { layout.scrollOffset = 1.5; }, RangeError);
    }

    clampsScrollingAboveTheFirstContentLine()
    {
        const layout = new VerticalLayout(["one"]);

        layout.scrollOffset = -2;
        layout.scrollBy(-1);

        assert.equal(layout.scrollOffset, 0);
    }
}
