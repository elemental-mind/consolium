import { TextDecoder } from "node:util";
import type { TerminalEvent } from "./input/events.ts";
import { CSIEvent, KeyboardEvent } from "./input/events.ts";

export class TerminalRawCharacterStream
{
    static StreamClosure = new class StreamClosure { };

    private buffer: string[] = [];

    private decoder?: TextDecoder;
    private decoderSettings = { stream: true };

    private nextValuePromise: PromiseWithResolvers<string> | null = null;
    private valuePromiseAwaiterIsConsumingChar: boolean = false;

    get isOpen()
    {
        return this.decoder !== undefined;
    }

    open()
    {
        process.stdin.setRawMode(true);
        process.stdout.write("\x1b[?1003h\x1b[?1006h");

        this.decoder = new TextDecoder();

        process.stdin.on("data", this.onStdinData);
        process.stdin.resume();
    }

    peekChar()
    {
        return this.buffer.length ? this.buffer[0] : this.nextValue(false);
    }

    consumeChar()
    {
        return this.buffer.length ? this.buffer.shift()! : this.nextValue(true);
    }

    close()
    {
        this.nextValuePromise?.reject(TerminalRawCharacterStream.StreamClosure);

        process.stdout.write("\x1b[?1006l\x1b[?1003l");
        process.stdin.setRawMode(false);

        process.stdin.pause();
        process.stdin.off("data", this.onStdinData);

        this.decoder = undefined;
    }

    private onStdinData = (data: string | Buffer) =>
    {
        const chars = typeof data === "string" ? data : this.decoder!.decode(data, this.decoderSettings);

        for (const char of chars)
        {
            if (this.nextValuePromise)
            {
                this.nextValuePromise.resolve(char);
                this.nextValuePromise = null;

                if (this.valuePromiseAwaiterIsConsumingChar)
                    continue;
            }

            this.buffer.push(char);
        }
    };

    private nextValue(consuming: boolean)
    {
        if (this.nextValuePromise) throw new Error("Only a single stream reader allowed!");

        this.nextValuePromise = Promise.withResolvers();
        this.valuePromiseAwaiterIsConsumingChar = consuming;
        return this.nextValuePromise.promise;
    }
}

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
