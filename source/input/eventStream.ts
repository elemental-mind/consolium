import type { TerminalEvent, TerminalModifierState, TerminalMouseEventInit } from "./events.ts";
import { TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./events.ts";
import { csiKeys, namedCharacters, ss3Keys, tildeKeys } from "./mappings/mappings.ts";
import { TerminalInputStream } from "./rawStream.ts";
import type { TerminalStream } from "./api.ts";

export class TerminalEventStream implements TerminalStream<TerminalEvent>
{
    static get isSupported()
    {
        return TerminalInputStream.isSupported;
    }

    private inputStream = new TerminalInputStream();
    private decoder = new TerminalEventDecoder();
    private eventStream?: AsyncGenerator<TerminalEvent, void>;

    get isOpen()
    {
        return this.eventStream !== undefined;
    }

    open()
    {
        if (this.isOpen)
            return this;

        if (!TerminalEventStream.isSupported)
            throw new Error("TerminalEventStream requires an interactive TTY for stdin and stdout.");

        this.decoder = new TerminalEventDecoder();
        this.inputStream.open();
        this.eventStream = this.parseEvents();
        return this;
    }

    /** Reads and consumes a single terminal event. */
    async read()
    {
        if (!this.eventStream)
            return undefined;

        const result = await this.eventStream.next();
        return result.done ? undefined : result.value;
    }

    async close()
    {
        if (!this.eventStream)
            return;

        const eventStream = this.eventStream;
        this.eventStream = undefined;

        await this.inputStream.close();
        await eventStream.return(undefined);
    }

    [Symbol.asyncIterator](): AsyncIterator<TerminalEvent>
    {
        if (!this.eventStream)
            throw new Error("Can not iterate TerminalEventStream because it is closed.");

        return this.eventStream;
    }

    private async *parseEvents()
    {
        try
        {
            let char: string | undefined;
            while ((char = await this.inputStream.read()) !== undefined)
                if (char === "\x1b")
                    yield* this.parseEscapeSequence();
                else
                    yield this.decoder.decodeCharacter(char);
        }
        finally
        {
            this.eventStream = undefined;
            await this.inputStream.close();
        }
    }

    private async *parseEscapeSequence()
    {
        // Terminal-generated escape sequences are expected to arrive in one stdin chunk.
        // If no following character is already buffered in the input stream,
        // treat Escape as a standalone key instead of an escape sequence.
        if (!this.inputStream.hasBufferedInput)
        {
            yield this.decoder.decodeCharacter("\x1b");
            return;
        }

        const charAfterEscape = await this.inputStream.read() as string;
        if (charAfterEscape === "[")
        {
            const event = await this.parseCSISequence();
            if (event)
                yield event;
        }
        else if (charAfterEscape === "O")
        {
            const instruction = await this.inputStream.read();
            if (instruction)
            {
                const event = this.decoder.decodeSS3(instruction);
                if (event)
                    yield event;
            }
        }
        else
            yield this.decoder.decodeCharacter(charAfterEscape, { altKey: true });
    }

    // To better understand CSI and its structure read the notes in the notes.md file: project/notes.md#control-sequence-introducer-csi
    private async parseCSISequence()
    {
        let namespaceMarker = "";
        let parameters = "";
        let intermediates = "";
        let char: string | undefined;

        while ((char = await this.inputStream.read()) !== undefined)
        {
            const code = char.charCodeAt(0);

            if (code >= 0x3c && code <= 0x3f)
                namespaceMarker = char;
            else if (code >= 0x30 && code <= 0x3f && intermediates.length === 0)
                parameters += char;
            else if (code >= 0x20 && code <= 0x2f)
                intermediates += char;
            else if (code < 0x40 || code > 0x7e)
                throw new Error(`Invalid character in CSI sequence: 0x${code.toString(16)}`);
            else
                return this.decoder.decodeCSI(char, parameters, intermediates, namespaceMarker);
        }

        throw new Error("Incomplete CSI sequence.");
    }
}

export class TerminalEventDecoder
{
    private buttons = 0;

    decodeCharacter(value: string, modifiers: TerminalModifierState = {})
    {
        const namedKey = namedCharacters.get(value);
        if (namedKey)
        {
            const ctrlKey = value === "\x00" ? true : modifiers.ctrlKey;
            return new TerminalKeyboardEvent(namedKey, { ...modifiers, ctrlKey });
        }

        const code = value.charCodeAt(0);
        if (code >= 0x01 && code <= 0x1a)
            return new TerminalKeyboardEvent(String.fromCharCode(code + 0x60), { ...modifiers, ctrlKey: true });

        if (code >= 0x1c && code <= 0x1f)
            return new TerminalKeyboardEvent(String.fromCharCode(code + 0x40), { ...modifiers, ctrlKey: true });

        return new TerminalKeyboardEvent(value, modifiers);
    }

    decodeCSI(instruction: string, parameterString: string, intermediates: string, namespaceMarker: string)
    {
        const parameters = parameterString.length
            ? parameterString.split(";").map(parameter => parameter.length ? Number(parameter) : 0)
            : [];

        if (namespaceMarker === "<")
            return this.decodeMouse(instruction, parameters);

        if (namespaceMarker || intermediates)
            return undefined;

        if (instruction === "Z")
            return new TerminalKeyboardEvent("Tab", { shiftKey: true });

        const directKey = csiKeys.get(instruction);
        if (directKey)
            return new TerminalKeyboardEvent(directKey, this.decodeModifiers(parameters[1]));

        if (instruction === "~")
        {
            const key = tildeKeys.get(parameters[0]);
            if (key)
                return new TerminalKeyboardEvent(key, this.decodeModifiers(parameters[1]));
        }

        return undefined;
    }

    decodeSS3(instruction: string)
    {
        const key = ss3Keys.get(instruction);
        return key ? new TerminalKeyboardEvent(key) : undefined;
    }

    private decodeModifiers(value = 1): TerminalModifierState
    {
        const modifiers = Math.max(0, value - 1);
        return {
            shiftKey: (modifiers & 1) !== 0,
            altKey: (modifiers & 2) !== 0,
            ctrlKey: (modifiers & 4) !== 0,
        };
    }
    private decodeMouse(instruction: string, parameters: number[]): TerminalEvent | undefined
    {
        if ((instruction !== "M" && instruction !== "m") || parameters.length < 3)
            return undefined;

        const code = parameters[0];
        const column = Math.max(0, parameters[1] - 1);
        const row = Math.max(0, parameters[2] - 1);
        const terminalButton = code & 3;
        const isMotion = (code & 32) !== 0;
        const isWheel = (code & 64) !== 0;
        const button = terminalButton < 3 ? terminalButton : -1;
        const buttonMask = button === 0 ? 1 : button === 1 ? 4 : button === 2 ? 2 : 0;
        const init: TerminalMouseEventInit = {
            button,
            buttons: this.buttons,
            column,
            row,
            shiftKey: (code & 4) !== 0,
            altKey: (code & 8) !== 0,
            ctrlKey: (code & 16) !== 0,
        };

        if (isWheel)
        {
            const deltaX = terminalButton === 2 ? -1 : terminalButton === 3 ? 1 : 0;
            const deltaY = terminalButton === 0 ? -1 : terminalButton === 1 ? 1 : 0;
            return new TerminalWheelEvent({ ...init, button: -1, deltaX, deltaY });
        }

        if (isMotion)
            return new TerminalMouseEvent("mousemove", { ...init, button: -1 });

        if (instruction === "m")
        {
            this.buttons &= ~buttonMask;
            return new TerminalMouseEvent("mouseup", { ...init, buttons: this.buttons });
        }

        this.buttons |= buttonMask;
        return new TerminalMouseEvent("mousedown", { ...init, buttons: this.buttons });
    }
}
