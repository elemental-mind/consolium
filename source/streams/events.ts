import type { TerminalEvent } from "../input/events.ts";
import { CSIEvent, KeyboardEvent } from "../input/events.ts";
import { TerminalRawCharacterStream } from "./characters.ts";

export class TerminalEventStream
{
    static StreamClosure = new class StreamClosure { };

    static get isSupportedInCurrentEnvironment()
    {
        return process.stdin.isTTY && process.stdout.isTTY;
    }

    private inputStream = new TerminalRawCharacterStream();
    private eventStream?: AsyncGenerator<TerminalEvent>;

    constructor()
    {
        if (!TerminalEventStream.isSupportedInCurrentEnvironment) throw new Error("TerminalEventStream requires an interactive TTY for stdin and stdout.");
    }

    get events()
    {
        if (!this.eventStream)
            throw new Error("Can not get events because TerminalEventStream is closed.");

        return this.eventStream;
    }

    open()
    {
        if (!this.eventStream)
        {
            this.inputStream.open();
            this.eventStream = this.parseEvents();
        }

        return this.eventStream!;
    }

    close()
    {
        if (!this.eventStream)
            return;

        this.eventStream.return(TerminalEventStream.StreamClosure);
        this.inputStream.close();
    }

    private async *parseEvents()
    {
        try
        {
            let char: string;
            while (char = await this.inputStream.consumeChar())
                if (char === "\x1b")
                    yield* this.parseEscapeSequence();
                else
                    yield new KeyboardEvent(char, KeyboardEvent.NoModifier);
        }
        catch (errorOrStreamClosure)
        {
            if (errorOrStreamClosure !== TerminalRawCharacterStream.StreamClosure)
                throw errorOrStreamClosure;
        }
    }

    private async *parseEscapeSequence()
    {
        const charAfterEscape = await this.inputStream.consumeChar();

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

        let char: string;
        while (char = await this.inputStream.consumeChar())
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
