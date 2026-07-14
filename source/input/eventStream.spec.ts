import assert from "node:assert/strict";
import { TerminalEventDecoder } from "./eventStream.ts";
import { TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./events.ts";

export class TerminalEventDecoderTestSuite
{
    decodesControlCharactersAsKeyPresses()
    {
        const event = new TerminalEventDecoder().decodeCharacter("\x03");

        assert.equal(event.type, "keypress");
        assert.equal(event.key, "c");
        assert.equal(event.ctrlKey, true);
    }

    prefersNamedKeysForAmbiguousControlCharacters()
    {
        const decoder = new TerminalEventDecoder();

        assert.equal(decoder.decodeCharacter("\t").key, "Tab");
        assert.equal(decoder.decodeCharacter("\r").key, "Enter");
        assert.equal(decoder.decodeCharacter("\x7f").key, "Backspace");
    }

    decodesModifiedNavigationKeys()
    {
        const event = new TerminalEventDecoder().decodeCSI("A", "1;6", "", "");

        assert(event instanceof TerminalKeyboardEvent);
        assert.equal(event.key, "ArrowUp");
        assert.equal(event.shiftKey, true);
        assert.equal(event.ctrlKey, true);
    }

    decodesFunctionKeysFromSS3Sequences()
    {
        const event = new TerminalEventDecoder().decodeSS3("P");

        assert(event instanceof TerminalKeyboardEvent);
        assert.equal(event.key, "F1");
    }

    decodesSeparateMouseEventsAndTracksButtonState()
    {
        const decoder = new TerminalEventDecoder();
        const down = decoder.decodeCSI("M", "0;11;5", "", "<");
        const move = decoder.decodeCSI("M", "32;13;6", "", "<");
        const up = decoder.decodeCSI("m", "0;13;6", "", "<");

        assert(down instanceof TerminalMouseEvent);
        assert.equal(down.type, "mousedown");
        assert.equal(down.button, 0);
        assert.equal(down.buttons, 1);
        assert.equal(down.column, 10);
        assert.equal(down.row, 4);

        assert(move instanceof TerminalMouseEvent);
        assert.equal(move.type, "mousemove");
        assert.equal(move.buttons, 1);
        assert.equal(move.column, 12);
        assert.equal(move.row, 5);

        assert(up instanceof TerminalMouseEvent);
        assert.equal(up.type, "mouseup");
        assert.equal(up.buttons, 0);
    }

    decodesWheelWithoutChangingMouseButtonState()
    {
        const event = new TerminalEventDecoder().decodeCSI("M", "64;3;8", "", "<");

        assert(event instanceof TerminalWheelEvent);
        assert.equal(event.type, "wheel");
        assert.equal(event.button, -1);
        assert.equal(event.deltaX, 0);
        assert.equal(event.deltaY, -1);
    }
}
