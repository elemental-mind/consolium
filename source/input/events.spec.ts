import assert from "node:assert/strict";
import { TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./events.ts";

export class TerminalEventTestSuite
{
    exposesBrowserStyleKeyboardProperties()
    {
        const event = new TerminalKeyboardEvent("c", { altKey: true, ctrlKey: true });

        assert.equal(event.type, "keypress");
        assert.equal(event.key, "c");
        assert.equal(event.altKey, true);
        assert.equal(event.ctrlKey, true);
        assert.equal(event.shiftKey, false);
    }

    exposesTerminalCellCoordinates()
    {
        const event = new TerminalMouseEvent("mousemove", {
            buttons: 1,
            column: 10,
            row: 4,
        });

        assert.equal(event.type, "mousemove");
        assert.equal(event.button, -1);
        assert.equal(event.buttons, 1);
        assert.equal(event.column, 10);
        assert.equal(event.row, 4);
    }

    exposesWheelDeltasInLineUnits()
    {
        const event = new TerminalWheelEvent({ deltaY: -1 });

        assert(event instanceof TerminalMouseEvent);
        assert.equal(event.type, "wheel");
        assert.equal(event.deltaY, -1);
        assert.equal(event.deltaMode, TerminalWheelEvent.DOM_DELTA_LINE);
    }
}
