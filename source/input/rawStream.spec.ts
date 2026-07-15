import assert from "node:assert/strict";
import { TextDecoder } from "node:util";
import { TerminalInputStream } from "./rawStream.ts";

export class TerminalInputStreamTestSuite
{
    bufferedReadReturnsACharacterSynchronously()
    {
        const stream = this.#createOpenStream();
        this.#emitInput(stream, "x");

        assert.equal(stream.hasBufferedInput, true);
        assert.equal(stream.read(), "x");
        assert.equal(stream.hasBufferedInput, false);
    }

    async emptyReadReturnsAPromiseForFutureInput()
    {
        const stream = this.#createOpenStream();

        const read = stream.read();
        assert(read instanceof Promise);

        this.#emitInput(stream, "x");
        assert.equal(await read, "x");
    }

    async checkingEmptyBufferDoesNotConsumeFutureInput()
    {
        const stream = this.#createOpenStream();

        assert.equal(stream.hasBufferedInput, false);

        const read = stream.read();
        this.#emitInput(stream, "x");

        assert.equal(await read, "x");
    }

    #createOpenStream()
    {
        const stream = new TerminalInputStream();
        Reflect.set(stream, "decoder", new TextDecoder());
        return stream;
    }

    #emitInput(stream: TerminalInputStream, value: string)
    {
        const onStdinData = Reflect.get(stream, "onStdinData") as (data: string) => void;
        onStdinData(value);
    }
}
