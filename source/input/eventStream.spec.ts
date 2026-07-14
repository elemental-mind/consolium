import assert from "node:assert/strict";
import { TerminalEventDecoder } from "./eventStream.ts";
import { CSIEvent, SS3Event, TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./events.ts";

export class TerminalEventDecoderTestSuite
{
    decodesControlCharactersAsKeyPresses()
    {
        const event = new TerminalEventDecoder().decodeCharacter("\x03");

        assert.equal(event.type, "keypress");
        assert.equal(event.key, "c");
        assert.equal(event.ctrlKey, true);
    }

    infersShiftForCapitalLetters()
    {
        const decoder = new TerminalEventDecoder();

        assert.equal(decoder.decodeCharacter("A").shiftKey, true);
        assert.equal(decoder.decodeCharacter("Ä").shiftKey, true);
        assert.equal(decoder.decodeCharacter("a").shiftKey, false);
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
        const event = new TerminalEventDecoder().decodeCSISequence("", "A", "1;6", "");

        assert(event instanceof TerminalKeyboardEvent);
        assert.equal(event.key, "ArrowUp");
        assert.equal(event.shiftKey, true);
        assert.equal(event.ctrlKey, true);
    }

    decodesFunctionKeysFromSS3Sequences()
    {
        const event = new TerminalEventDecoder().decodeSS3Sequence("P");

        assert(event instanceof TerminalKeyboardEvent);
        assert.equal(event.key, "F1");
    }

    emitsUnknownCSISequences()
    {
        const event = new TerminalEventDecoder().decodeCSISequence("?", "z", "12;3", "$");

        assert(event instanceof CSIEvent);
        assert.equal(event.instruction, "z");
        assert.deepEqual(event.parameters, [12, 3]);
        assert.equal(event.intermediates, "$");
        assert.equal(event.namespaceMarker, "?");
    }

    emitsUnknownSS3Sequences()
    {
        const event = new TerminalEventDecoder().decodeSS3Sequence("x");

        assert(event instanceof SS3Event);
        assert.equal(event.instruction, "x");
    }

    emitsMalformedMouseSequencesAsCSIEvents()
    {
        const event = new TerminalEventDecoder().decodeCSISequence("<", "M", "0;1", "");

        assert(event instanceof CSIEvent);
    }

    decodesSeparateMouseEventsAndTracksButtonState()
    {
        const decoder = new TerminalEventDecoder();
        const down = decoder.decodeCSISequence("<", "M", "0;11;5", "");
        const move = decoder.decodeCSISequence("<", "M", "32;13;6", "");
        const up = decoder.decodeCSISequence("<", "m", "0;13;6", "");

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
        const event = new TerminalEventDecoder().decodeCSISequence("<", "M", "64;3;8", "");

        assert(event.type === "wheel");
        assert.equal(event.button, -1);
        assert.equal(event.deltaX, 0);
        assert.equal(event.deltaY, -1);
        assert(event instanceof TerminalWheelEvent);
    }
}
