import assert from "node:assert/strict";
import { KeyboardEvent } from "./events.ts";

export class KeyboardEventTestSuite
{
    preservesTabAsSpecialKey()
    {
        const event = new KeyboardEvent("\t");

        assert.equal(event.value, "\t");
        assert.equal(event.ctrl, false);
    }

    preservesCarriageReturnAsEnter()
    {
        const event = new KeyboardEvent("\r");

        assert.equal(event.value, "\r");
        assert.equal(event.ctrl, false);
    }

    preservesLineFeedAsEnter()
    {
        const event = new KeyboardEvent("\n");

        assert.equal(event.value, "\n");
        assert.equal(event.ctrl, false);
    }

    preservesDeleteAsBackspace()
    {
        const event = new KeyboardEvent("\x7f");

        assert.equal(event.value, "\x7f");
        assert.equal(event.ctrl, false);
    }

    decodesOtherControlCharactersAsCtrlLetters()
    {
        const event = new KeyboardEvent("\x03");

        assert.equal(event.value, "c");
        assert.equal(event.ctrl, true);
    }

    preservesBaseModifiersForSpecialKeys()
    {
        const event = new KeyboardEvent("\t", KeyboardEvent.AltModifier);

        assert.equal(event.alt, true);
        assert.equal(event.ctrl, false);
    }
}
