import type { TerminalStream } from "./api.ts";
import type { ModifierInfo, MouseEventInfo, TerminalInputEvent } from "./events.ts";
import type { MouseButtonFlags } from "./mappings/mouseButtonEncodings.ts";
import { MouseButton, MouseButtonFlag } from "./mappings/mouseButtonEncodings.ts";
import { CSIEvent, SS3Event, TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./events.ts";
import { namedCharacters } from "./mappings/charToKey.ts";
import { csiInstructionToKey, tildeInstructionParamToKey } from "./mappings/csiCodesToKey.ts";
import { ss3InstructionsToKey } from "./mappings/ss3CodesToKey.ts";
import { TerminalInputStream } from "./rawStream.ts";
import type { BitField } from "../utils/bitField.ts";

/** Decodes raw terminal input into keyboard, mouse, CSI, and SS3 events. */
export class TerminalEventStream implements TerminalStream<TerminalInputEvent>
{
    /** Whether interactive terminal input is available in the current process. */
    static get isSupported(): boolean
    {
        return TerminalInputStream.isSupported;
    }

    private inputStream = new TerminalInputStream();
    private eventDecoder = new TerminalEventDecoder();
    private eventStream?: AsyncGenerator<TerminalInputEvent, void>;

    /** Whether the stream is open and ready to yield events. */
    get isOpen(): boolean { return this.eventStream !== undefined; }

    /**
     * Opens raw input and begins decoding terminal events.
     *
     * @returns This stream for chaining.
     * @throws {Error} When standard input and output are not interactive TTYs.
     */
    open(): this
    {
        if (!TerminalEventStream.isSupported)
            throw new Error("TerminalEventStream requires an interactive TTY for stdin and stdout.");

        if (this.isOpen)
            return this;

        this.eventDecoder = new TerminalEventDecoder();
        this.inputStream.open();
        this.eventStream = this.parseEvents();

        return this;
    }

    /**
     * Reads and consumes a single terminal event.
     *
     * @returns The next event, or `undefined` when the stream is closed or exhausted.
     */
    async read(): Promise<TerminalInputEvent | undefined>
    {
        if (!this.eventStream)
            return undefined;

        const result = await this.eventStream.next();
        return result.done ? undefined : result.value;
    }

    /** Stops the stream, restores terminal input, and releases pending iteration. */
    async close()
    {
        if (!this.eventStream)
            return;

        const eventStream = this.eventStream;
        this.eventStream = undefined;

        await this.inputStream.close();
        await eventStream.return(undefined);
    }

    /**
     * Returns the asynchronous event iterator for this open stream.
     *
     * @returns An iterator that yields decoded terminal input events.
     * @throws {Error} When the stream is closed.
     */
    [Symbol.asyncIterator](): AsyncIterator<TerminalInputEvent>
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
                    yield this.eventDecoder.decodeCharacter(char);
        }
        finally
        {
            await this.inputStream.close();
            this.eventStream = undefined;
        }
    }

    private async *parseEscapeSequence()
    {
        // Terminal-generated escape sequences are expected to arrive in one multibyte stdin chunk.
        // If ESC is the only byte in this chunk, we assume ESC was pressed.
        if (!this.inputStream.hasBufferedInput)
        {
            yield this.eventDecoder.decodeCharacter("\x1b");
            return;
        }

        const charAfterEscape = await this.inputStream.read() as string;
        if (charAfterEscape === "[")
            yield* this.parseCSISequence();
        else if (charAfterEscape === "O")
            yield* this.parseSS3Sequence();
        else
            yield this.eventDecoder.decodeCharacter(charAfterEscape, { altKey: true });
    }

    // To better understand CSI and its structure read the notes in the notes.md file: project/notes.md#control-sequence-introducer-csi
    private async *parseCSISequence()
    {
        let namespaceMarker = "";
        let parameterChars = "";
        let intermediatesChars = "";
        let char: string | undefined;

        while ((char = await this.inputStream.read()) !== undefined)
        {
            const code = char.charCodeAt(0);

            if (code >= 0x3c && code <= 0x3f)
                namespaceMarker = char;
            else if (code >= 0x30 && code <= 0x3f && intermediatesChars.length === 0)
                parameterChars += char;
            else if (code >= 0x20 && code <= 0x2f)
                intermediatesChars += char;
            else if (code < 0x40 || code > 0x7e)
                throw new Error(`Invalid character in CSI sequence: 0x${code.toString(16)}`);
            else
            {
                const instruction = char;
                yield this.eventDecoder.decodeCSISequence(namespaceMarker, instruction, parameterChars, intermediatesChars);
                return;
            }
        }

        throw new Error("Incomplete CSI sequence.");
    }

    private async *parseSS3Sequence()
    {
        const ss3Instruction = await this.inputStream.read();

        if (ss3Instruction)
            yield this.eventDecoder.decodeSS3Sequence(ss3Instruction);
        else
            throw new Error("Incomplete SS3 sequence.");
    }
}

/** Stateful decoder for individual terminal characters and escape sequences. */
export class TerminalEventDecoder
{
    private buttons: MouseButtonFlags = MouseButtonFlag.None;

    /**
     * Decodes one non-CSI/SS3 terminal character as a keyboard event.
     *
     * @param value - Character to decode, including control characters.
     * @param modifiers - Modifier state supplied by the enclosing escape sequence.
     * @returns The normalized keyboard event.
     * @example
     * ```ts
     * const decoder = new TerminalEventDecoder();
     * decoder.decodeCharacter("a"); // key "a"
     * decoder.decodeCharacter("\x03"); // Ctrl+C
     * ```
     */
    decodeCharacter(value: string, modifiers: Partial<ModifierInfo> = {})
    {
        const namedKey = namedCharacters.get(value);
        if (namedKey)
            return new TerminalKeyboardEvent(namedKey, { ...modifiers, ctrlKey: value === "\x00" ? true : modifiers.ctrlKey });

        const code = value.charCodeAt(0);
        if (code >= 0x01 && code <= 0x1a)
            return new TerminalKeyboardEvent(String.fromCharCode(code + 0x60), { ...modifiers, ctrlKey: true });

        if (code >= 0x1c && code <= 0x1f)
            return new TerminalKeyboardEvent(String.fromCharCode(code + 0x40), { ...modifiers, ctrlKey: true });

        return new TerminalKeyboardEvent(value, {
            ...modifiers,
            shiftKey:
                modifiers.shiftKey ||
                // Terminals report resulting character, but no modifier state. We need to infer shift from the letter category.
                // \p{Lu} —> a Unicode character in the Letter, Uppercase category.
                /^\p{Lu}$/u.test(value),
        });
    }

    /**
     * Decodes a parsed CSI sequence.
     *
     * @param namespaceMarker - Optional CSI private namespace marker, such as `"<"` for SGR mouse input.
     * @param instruction - CSI final instruction character.
     * @param parameterString - Semicolon-delimited numeric CSI parameters.
     * @param intermediates - CSI intermediate characters.
     * @returns A recognized keyboard or mouse event, or a generic `CSIEvent`.
     * @example
     * ```ts
     * const decoder = new TerminalEventDecoder();
     * decoder.decodeCSISequence("", "A", "", ""); // ArrowUp keyboard event
     * decoder.decodeCSISequence("<", "M", "0;1;1", ""); // mouse-down event
     * decoder.decodeCSISequence("", "q", "", ""); // CSIEvent
     * ```
     */
    decodeCSISequence(namespaceMarker: string, instruction: string, parameterString: string, intermediates: string)
    {
        const parameters = parameterString.length ? parameterString.split(";").map(parameter => parameter.length ? Number(parameter) : 0) : [];

        let event;
        if (namespaceMarker === "<" && (event = this.decodeMouseEvent(instruction, parameters)))
            return event;

        if (!namespaceMarker && !intermediates)
        {
            let key;
            switch (instruction)
            {
                case "Z":
                    event = new TerminalKeyboardEvent("Tab", { shiftKey: true }); break;
                case "~":
                    if (key = tildeInstructionParamToKey.get(parameters[0]))
                        event = new TerminalKeyboardEvent(key, this.decodeCSIModifierKeyState(parameters[1]));
                    break;
                default:
                    if (key = csiInstructionToKey.get(instruction))
                        event = new TerminalKeyboardEvent(key, this.decodeCSIModifierKeyState(parameters[1]));
            }
        }

        //If we don't have a recognized event (undefined) we return a generic CSI event
        event ??= new CSIEvent(instruction, parameters, intermediates, namespaceMarker);
        return event;
    }

    /**
     * Decodes a parsed SS3 sequence.
     *
     * @param instruction - SS3 instruction character.
     * @returns A recognized keyboard event, or a generic `SS3Event`.
     * @example
     * ```ts
     * const decoder = new TerminalEventDecoder();
     * decoder.decodeSS3Sequence("P"); // F1 keyboard event
     * decoder.decodeSS3Sequence("x"); // SS3Event
     * ```
     */
    decodeSS3Sequence(instruction: string)
    {
        const key = ss3InstructionsToKey.get(instruction);
        return key ? new TerminalKeyboardEvent(key) : new SS3Event(instruction);
    }

    private decodeCSIModifierKeyState(xTermReportedValue = 1): ModifierInfo
    {
        //Xterm reports 1 + a modifier bitmask. After subtracting 1 the bitmask is as follows:
        //  2 1 0
        //  │ │ └─ Shift
        //  │ └─── Alt
        //  └───── Ctrl
        //Clamp explicit zero so subtraction cannot produce -1, which has every bit set.
        const modifiers = Math.max(0, xTermReportedValue - 1);
        return {
            shiftKey: (modifiers & 0b001) !== 0,
            altKey: (modifiers & 0b010) !== 0,
            ctrlKey: (modifiers & 0b100) !== 0,
        };
    }

    private decodeMouseEvent(instruction: string, parameters: number[]): TerminalInputEvent | undefined
    {
        if ((instruction !== "M" && instruction !== "m") || parameters.length < 3)
            return undefined;

        //Mouse event bitmask:
        //  6 5 4 3 2 1 0
        //  │ │ │ │ │ └─┴─ normally button encoding: 0 = left, 1 = middle, 2 = right, 3 = release / no button
        //  | | | | |       └ In case of wheel event encodes scroll direction: 0 = Up, 1 = Down, 2 = left, 3 = right
        //  │ │ │ │ └───── Shift
        //  │ │ │ └─────── Alt
        //  │ │ └───────── Ctrl
        //  │ └─────────── move event
        //  └───────────── wheel event
        const statusByte = parameters[0] as BitField;

        const eventType = this.decodeMouseEventType(instruction, statusByte);

        const commonEventParameters: Omit<MouseEventInfo, "buttons" | "button"> = {
            ...this.decodeRowAndColumnAsZeroBased(parameters),            //column, row
            ...this.decodeMouseEventModifierKeyState(statusByte),    //ctr, alt, shift
        };

        switch (eventType)
        {
            case "mousemove":
                return new TerminalMouseEvent(eventType, { button: MouseButton.None, buttons: this.buttons, ...commonEventParameters });
            case "wheel":
                return new TerminalWheelEvent({ button: MouseButton.None, buttons: this.buttons, ...this.decodeScrollDeltas(statusByte), ...commonEventParameters });
            case "mousedown":
                {
                    const { button, buttonBitFlag } = this.decodeActuatedButton(statusByte);
                    this.buttons = (this.buttons | buttonBitFlag) as MouseButtonFlags;
                    return new TerminalMouseEvent(eventType, { button, buttons: this.buttons, ...commonEventParameters });
                }
            case "mouseup":
                {
                    const { button, buttonBitFlag } = this.decodeActuatedButton(statusByte);
                    this.buttons = (this.buttons & ~buttonBitFlag) as MouseButtonFlags;
                    return new TerminalMouseEvent(eventType, { button, buttons: this.buttons, ...commonEventParameters });
                }
        }
    }

    private decodeMouseEventType(instruction: string, statusBits: BitField)
    {
        if ((statusBits & 0b0100000) !== 0)
            return "mousemove";
        if ((statusBits & 0b1000000) !== 0)
            return "wheel";
        if (instruction === "M")
            return "mousedown";
        if (instruction === "m")
            return "mouseup";

        throw new Error("Unknown mouse event type");
    }

    private decodeRowAndColumnAsZeroBased(parameters: number[])
    {
        //Reported terminal cell coordinates are 1-based. We need to offset them for a normalized repr.
        const [, oneBasedColumn, oneBasedRow] = parameters;
        return { column: oneBasedColumn - 1, row: oneBasedRow - 1 };
    }

    private decodeMouseEventModifierKeyState(statusBits: BitField)
    {
        return {
            shiftKey: (statusBits & 0b0000100) !== 0,
            altKey: (statusBits & 0b0001000) !== 0,
            ctrlKey: (statusBits & 0b0010000) !== 0
        };
    }

    private decodeActuatedButton(statusBits: BitField)
    {
        const buttonCode = statusBits & 0b0000011;
        switch (buttonCode)
        {
            case 0: return { button: MouseButton.Left, buttonBitFlag: MouseButtonFlag.Left };
            case 1: return { button: MouseButton.Middle, buttonBitFlag: MouseButtonFlag.Middle };
            case 2: return { button: MouseButton.Right, buttonBitFlag: MouseButtonFlag.Right };
            default: return { button: MouseButton.None, buttonBitFlag: MouseButtonFlag.None };
        }
    }

    private decodeScrollDeltas(statusBits: BitField)
    {
        const scrollDirection = statusBits & 0b0000011;
        switch (scrollDirection)
        {
            case 0: return { deltaX: 0, deltaY: -1 }; //Up
            case 1: return { deltaX: 0, deltaY: 1 };  //Down
            case 2: return { deltaX: -1, deltaY: 0 }; //Left
            default: return { deltaX: 1, deltaY: 0 };  //Right
        }
    }
}
