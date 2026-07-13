import { TextDecoder } from "node:util";

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
