import { TextDecoder } from "node:util";
import type { TerminalStream } from "./api.ts";

/** Reads raw Unicode characters from the process terminal. */
export class TerminalInputStream implements TerminalStream<string>
{
    /** Whether interactive terminal input is available in the current process. */
    static get isSupported(): boolean
    {
        return process.stdin.isTTY === true && process.stdout.isTTY === true;
    }

    private buffer: string[] = [];

    private decoder?: TextDecoder;
    private decoderSettings = { stream: true };

    private nextValuePromise: PromiseWithResolvers<string | undefined> | null = null;
    private valuePromiseAwaiterIsConsumingChar: boolean = false;

    /** Whether raw terminal input is currently enabled. */
    get isOpen(): boolean
    {
        return this.decoder !== undefined;
    }

    /** Whether one or more characters are available without waiting. */
    get hasBufferedInput(): boolean
    {
        return this.buffer.length > 0;
    }

    /**
     * Enables raw input and terminal mouse reporting.
     *
     * @returns This stream for chaining.
     * @throws {Error} When standard input and output are not interactive TTYs.
     */
    open(): this
    {
        if (!TerminalInputStream.isSupported)
            throw new Error("TerminalInputStream requires an interactive TTY for stdin and stdout.");

        if (this.isOpen)
            return this;

        process.stdin.setRawMode(true);
        process.stdout.write("\x1b[?1003h\x1b[?1006h");

        this.decoder = new TextDecoder();

        process.stdin.on("data", this.onStdinData);
        process.stdin.resume();

        return this;
    }

    /**
     * Returns the next character without consuming it.
     *
     * @returns A buffered character immediately, a promise while open and waiting for input, or `undefined` when closed.
     * @example
     * ```ts
     * const stream = new TerminalInputStream().open();
     * stream.peek(); // "a" when input is buffered
     * stream.peek(); // Promise<string | undefined> while open and waiting
     * stream.close(); stream.peek(); // undefined
     * ```
     */
    peek(): string | Promise<string | undefined> | undefined
    {
        if (this.buffer.length)
            return this.buffer[0];

        return this.isOpen ? this.nextValue(false) : undefined;
    }

    /**
     * Reads and consumes a single character.
     *
     * @returns A buffered character immediately, a promise while open and waiting for input, or `undefined` when closed.
     * @example
     * ```ts
     * const stream = new TerminalInputStream().open();
     * stream.read(); // "a" when input is buffered
     * stream.read(); // Promise<string | undefined> while open and waiting
     * stream.close(); stream.read(); // undefined
     * ```
     */
    read(): string | Promise<string | undefined> | undefined
    {
        if (this.buffer.length)
            return this.buffer.shift()!;

        return this.isOpen ? this.nextValue(true) : undefined;
    }

    /** Disables raw input and terminal mouse reporting, then clears buffered input. */
    async close()
    {
        if (!this.isOpen)
            return;

        this.nextValuePromise?.resolve(undefined);
        this.nextValuePromise = null;

        process.stdout.write("\x1b[?1006l\x1b[?1003l");

        process.stdin.setRawMode(false);

        process.stdin.pause();
        process.stdin.off("data", this.onStdinData);

        this.decoder = undefined;
        this.buffer = [];
    }

    /**
     * Iterates over characters until the stream closes, then closes it if iteration ends early.
     *
     * @returns An asynchronous iterator of raw terminal characters.
     * @throws {Error} When the stream is closed.
     */
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
