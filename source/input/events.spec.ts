import assert from "node:assert/strict";
import { CSIEvent, SS3Event, TerminalEvent, TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./events.ts";

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
        assert(event instanceof TerminalEvent);
    }

    exposesUnknownSequenceData()
    {
        const csi = new CSIEvent("z", [12, 3], "$", "?");
        const ss3 = new SS3Event("x");

        assert.equal(csi.type, "csi");
        assert.equal(csi.instruction, "z");
        assert.deepEqual(csi.parameters, [12, 3]);
        assert.equal(csi.intermediates, "$");
        assert.equal(csi.namespaceMarker, "?");
        assert.equal(csi.altKey, false);
        assert.equal(ss3.type, "ss3");
        assert.equal(ss3.instruction, "x");
    }

    exposesTerminalCellCoordinates()
    {
        const event = new TerminalMouseEvent("mousemove", {
            buttons: 5,
            column: 10,
            row: 4,
        });

        assert.equal(event.type, "mousemove");
        assert.equal(event.button, -1);
        assert.equal(event.buttons, 5);
        assert.equal(event.leftMouseButton, true);
        assert.equal(event.middleMouseButton, true);
        assert.equal(event.rightMouseButton, false);
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
