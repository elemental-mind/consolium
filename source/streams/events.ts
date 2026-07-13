import type { TerminalEvent } from "../input/events.ts";
import { CSIEvent, KeyboardEvent } from "../input/events.ts";
import { TerminalInputStream } from "./characters.ts";
import type { TerminalStream, TerminalStreamOptions } from "./stream.ts";

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
        const charAfterEscape = await this.inputStream.read();

        if (charAfterEscape === undefined)
            return;

        if (charAfterEscape === "[")
            yield* this.parseCSIEvent();
        else
            yield new KeyboardEvent(charAfterEscape, KeyboardEvent.AltModifier);
    }

    // Look into the CSIEvent class to better understand what we are parsing here.
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
