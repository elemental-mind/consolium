import type { TerminalEvent } from "./events.ts";
import { CSIEvent, KeyboardEvent } from "./events.ts";
import { TerminalInputStream } from "./rawStream.ts";
import type { TerminalStream, TerminalStreamOptions } from "./api.ts";

export class TerminalEventStream implements TerminalStream<TerminalEvent>
{
    static get isSupported()
    {
        return TerminalInputStream.isSupported;
    }

    private inputStream = new TerminalInputStream();
    private eventStream?: AsyncGenerator<TerminalEvent, void>;

    get isOpen()
    {
        return this.eventStream !== undefined;
    }

    open(options: TerminalStreamOptions = {})
    {
        if (this.isOpen)
            return this;

        if (!TerminalEventStream.isSupported)
            throw new Error("TerminalEventStream requires an interactive TTY for stdin and stdout.");

        this.inputStream.open(options);
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
                    yield new KeyboardEvent(char, KeyboardEvent.NoModifier);
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
            yield new KeyboardEvent("\x1b", KeyboardEvent.NoModifier);
            return;
        }

        const charAfterEscape = await this.inputStream.read() as string;
        if (charAfterEscape === "[")
            yield* this.parseCSIEvent();
        else
            yield new KeyboardEvent(charAfterEscape, KeyboardEvent.AltModifier);
    }

    // To better understand CSI and its structure read the notes in the notes.md file: project/notes.md#control-sequence-introducer-csi
    private async *parseCSIEvent()
    {
        let namespaceMarker = "";
        let parameters = "";
        let intermediates = "";

        let char: string | undefined;
        while ((char = await this.inputStream.read()) !== undefined)
        {
            const code = char.charCodeAt(0);

            if (CSIEvent.isPrivateMarkerByte(code))
                namespaceMarker = char;
            else if (CSIEvent.isParameterByte(code) && intermediates.length === 0)
                parameters += char;
            else if (CSIEvent.isIntermediateByte(code))
                intermediates += char;
            else if (!CSIEvent.isFinalByte(code))
                throw new Error(`Invalid character in CSI sequence: 0x${code.toString(16)}`);
            else
            {
                yield new CSIEvent(char, parameters, intermediates, namespaceMarker);
                return;
            }
        }
    }
}
