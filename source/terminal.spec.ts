import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Formatting } from "./output/formatting/formatting.ts";
import { Flex } from "./output/layouting/flex.ts";
import { CSIEvent, SS3Event, TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./input/events.ts";
import type { TerminalInputEvent } from "./input/events.ts";
import { Terminal, type TerminalInputEventSource } from "./terminal.ts";

class FakeOutput extends EventEmitter
{
    isTTY = false;
    columns?: number;
    rows?: number;
    written = "";

    write(value: string)
    {
        this.written += value;
        return true;
    }
}

class FakeInput implements TerminalInputEventSource
{
    private readonly stopped = Promise.withResolvers<void>();
    private readonly events: readonly TerminalInputEvent[];
    isOpen = false;

    constructor(events: readonly TerminalInputEvent[])
    {
        this.events = events;
    }

    open()
    {
        this.isOpen = true;
        return this;
    }

    async close()
    {
        this.isOpen = false;
        this.stopped.resolve();
    }

    async *[Symbol.asyncIterator](): AsyncIterator<TerminalInputEvent>
    {
        for (const event of this.events)
            yield event;

        await this.stopped.promise;
    }
}

export class TerminalTests
{
    extendsEventEmitterAndReEmitsDecodedInputEvents()
    {
        const input = new FakeInput([
            new TerminalKeyboardEvent("x"),
            new TerminalMouseEvent("mousedown"),
            new TerminalMouseEvent("mouseup"),
            new TerminalMouseEvent("mousemove"),
            new TerminalWheelEvent(),
            new CSIEvent("A"),
            new SS3Event("P"),
        ]);
        const terminal = new Terminal({ output: new FakeOutput(), input });
        const received: string[] = [];

        terminal.on("keyPress", event => received.push(`${event.type}:${event.key}`));
        terminal.on("mouseDown", event => received.push(event.type));
        terminal.on("mouseUp", event => received.push(event.type));
        terminal.on("mouseMove", event => received.push(event.type));
        terminal.on("wheel", event => received.push(event.type));
        terminal.on("csi", event => received.push(event.type));
        terminal.on("ss3", event => received.push(event.type));

        return terminal.stopInput().then(() =>
        {
            assert.deepEqual(received, ["keypress:x", "mousedown", "mouseup", "mousemove", "wheel", "csi", "ss3"]);
            assert.equal(terminal.isInputActive, false);
            assert.equal(input.isOpen, false);
        });
    }

    startsInputOnlyOnceUntilItIsStopped()
    {
        const input = new FakeInput([]);
        const terminal = new Terminal({ output: new FakeOutput(), input });

        assert.equal(terminal.startInput(), terminal);
        assert.equal(terminal.startInput(), terminal);
        assert.equal(terminal.isInputActive, true);

        return terminal.stopInput();
    }

    usesFallbackDimensionsForNonTtyOutput()
    {
        const terminal = new Terminal({ output: new FakeOutput(), fallbackSize: { width: 12, height: 4 } });

        assert.equal(terminal.width, 12);
        assert.equal(terminal.height, 4);
        assert.equal(terminal.isInteractive, false);
    }

    usesCurrentTTYDimensions()
    {
        const output = new FakeOutput();
        output.isTTY = true;
        output.columns = 30;
        output.rows = 8;

        const terminal = new Terminal({ output, fallbackSize: { width: 12, height: 4 } });

        assert.equal(terminal.width, 30);
        assert.equal(terminal.height, 8);
    }

    writesStructuredLinesAndDisablesColorForPipes()
    {
        const output = new FakeOutput();
        const terminal = new Terminal({ output, fallbackSize: { width: 10, height: 2 } });

        terminal.writeLine(["left", Flex.grow("."), [Formatting.green, "right"]]);

        assert.equal(output.written, "left.right\n");
    }

    validatesNewlinesInNestedLineFragments()
    {
        const terminal = new Terminal({ output: new FakeOutput() });

        assert.throws(() => terminal.writeLine([Formatting.green, "bad\nline"]), RangeError);
    }

    requiresA_TTYForViewportMutations()
    {
        const terminal = new Terminal({ output: new FakeOutput() });

        assert.throws(() => terminal.clearViewport(), /interactive TTY/);
        assert.throws(() => terminal.writeFrame({ content: [] }), /interactive TTY/);
        assert.throws(() => terminal.alternateScreen(), /interactive TTY/);
    }

    managesResizeSubscriptionsAndAlternateScreenLifetime()
    {
        const output = new FakeOutput();
        output.isTTY = true;
        output.columns = 20;
        output.rows = 5;
        const terminal = new Terminal({ output });
        const sizes: { width: number; height: number; }[] = [];

        const subscription = terminal.onResize(size => sizes.push(size));
        output.columns = 25;
        output.emit("resize");
        subscription[Symbol.dispose]();
        output.columns = 30;
        output.emit("resize");

        const screen = terminal.alternateScreen({ hideCursor: true });
        screen[Symbol.dispose]();
        screen[Symbol.dispose]();

        assert.deepEqual(sizes, [{ width: 25, height: 5 }]);
        assert.equal(output.written, "\u001B[?1049h\u001B[?25l\u001B[?25h\u001B[?1049l");
    }

    replacesAndClearsFramesWithoutErasingPriorOutput()
    {
        const output = new FakeOutput();
        output.isTTY = true;
        output.columns = 10;
        output.rows = 4;
        const terminal = new Terminal({ output });

        terminal.writeLine("before");
        terminal.writeFrame({ header: ["head"], content: ["one", "two", "three"], footer: ["foot"] });
        terminal.clearFrame();

        assert.equal(output.written, "before\nhead\none\ntwo\nfoot\r\u001B[3A\u001B[J");
    }

    keepsTheFooterAtTheBottomWithoutScrollingTheViewport()
    {
        const output = new FakeOutput();
        output.isTTY = true;
        output.columns = 4;
        output.rows = 4;
        const terminal = new Terminal({ output });

        terminal.writeFrame({ header: ["header"], content: ["body"], footer: ["foot"] });

        assert.equal(output.written, "hea…\nbody\n\nfoot");
    }
}
