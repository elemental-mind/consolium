import { TextDecoder } from "node:util";
import type { TerminalStream, TerminalStreamOptions } from "./api.ts";

export class TerminalInputStream implements TerminalStream<string>
{
    static get isSupported()
    {
        return process.stdin.isTTY === true && process.stdout.isTTY === true;
    }

    private buffer: string[] = [];

    private decoder?: TextDecoder;
    private decoderSettings = { stream: true };

    private nextValuePromise: PromiseWithResolvers<string | undefined> | null = null;
    private valuePromiseAwaiterIsConsumingChar: boolean = false;

    private withMouseEvents: boolean = false;

    get isOpen()
    {
        return this.decoder !== undefined;
    }

    get hasBufferedInput()
    {
        return this.buffer.length > 0;
    }

    open(options: TerminalStreamOptions = {})
    {
        if (!TerminalInputStream.isSupported)
            throw new Error("TerminalInputStream requires an interactive TTY for stdin and stdout.");

        if (this.isOpen)
            return this;

        this.withMouseEvents = options.mouseEvents ?? false;

        process.stdin.setRawMode(true);

        if (this.withMouseEvents)
            process.stdout.write("\x1b[?1003h\x1b[?1006h");

        this.decoder = new TextDecoder();

        process.stdin.on("data", this.onStdinData);
        process.stdin.resume();

        return this;
    }

    /** Returns the next character without consuming it. */
    peek()
    {
        if (this.buffer.length)
            return this.buffer[0];

        return this.isOpen ? this.nextValue(false) : undefined;
    }

    /** Reads and consumes a single character. */
    read()
    {
        if (this.buffer.length)
            return this.buffer.shift()!;

        return this.isOpen ? this.nextValue(true) : undefined;
    }

    async close()
    {
        if (!this.isOpen)
            return;

        this.nextValuePromise?.resolve(undefined);
        this.nextValuePromise = null;

        if (this.withMouseEvents)
            process.stdout.write("\x1b[?1006l\x1b[?1003l");
        this.withMouseEvents = false;

        process.stdin.setRawMode(false);

        process.stdin.pause();
        process.stdin.off("data", this.onStdinData);

        this.decoder = undefined;
        this.buffer = [];
    }

    async *[Symbol.asyncIterator](): AsyncIterator<string>
    {
        if (!this.isOpen)
            throw new Error("Can not iterate TerminalInputStream because it is closed.");

        try
        {
            let char: string | undefined;
            while ((char = await this.read()) !== undefined)
                yield char;
        }
        finally
        {
            await this.close();
        }
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
