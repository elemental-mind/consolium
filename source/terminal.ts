import { EventEmitter } from "node:events";
import type { TerminalStream } from "./input/api.ts";
import { TerminalEventStream } from "./input/eventStream.ts";
import type { CSIEvent, SS3Event, TerminalInputEvent, TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./input/events.ts";
import { extendTextArrayEnd, truncateStringsEnd } from "./output/formatting/textSize.ts";
import { HorizontalLayout, type LineDefinition } from "./output/layouting/horizontalLayout.ts";

/** A single, structured line understood by the output layout engine. */
export type TerminalLine = string | LineDefinition;

export interface TerminalSize
{
    readonly width: number;
    readonly height: number;
}

export interface TerminalFrame
{
    readonly header?: readonly TerminalLine[];
    readonly content: readonly TerminalLine[];
    readonly footer?: readonly TerminalLine[];
}

export interface TerminalOptions
{
    readonly output?: TerminalOutput;
    /**
     * Overrides the event source used by startInput(). The source remains
     * private; callers receive its decoded events through this Terminal.
     */
    readonly input?: TerminalInputEventSource;
    readonly color?: "auto" | "always" | "never";
    readonly fallbackSize?: TerminalSize;
}

/** A decoded-event source used internally by Terminal's input lifecycle. */
export interface TerminalInputEventSource extends TerminalStream<TerminalInputEvent> { }

export interface TerminalEventMap
{
    keyPress: TerminalKeyboardEvent;
    mouseDown: TerminalMouseEvent<"mousedown">;
    mouseUp: TerminalMouseEvent<"mouseup">;
    mouseMove: TerminalMouseEvent<"mousemove">;
    wheel: TerminalWheelEvent;
    csi: CSIEvent;
    ss3: SS3Event;
}

export interface AlternateScreenOptions
{
    readonly hideCursor?: boolean;
}

/** The small portion of a Node write stream Terminal needs, also convenient for tests. */
export interface TerminalOutput
{
    readonly isTTY?: boolean;
    readonly columns?: number;
    readonly rows?: number;
    write(value: string): unknown;
    on?(event: "resize", listener: () => void): unknown;
    off?(event: "resize", listener: () => void): unknown;
    removeListener?(event: "resize", listener: () => void): unknown;
}

export interface Disposable
{
    [Symbol.dispose](): void;
}

const defaultSize: TerminalSize = { width: 80, height: 24 };
const ansiEscapeSequence = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const inputEventNames = new Set<keyof TerminalEventMap>(["keyPress", "mouseDown", "mouseUp", "mouseMove", "wheel", "csi", "ss3"]);

export class Terminal extends EventEmitter
{
    private readonly fallbackSize: TerminalSize;
    private readonly color: "auto" | "always" | "never";
    private frameLineCount = 0;

    private readonly output: TerminalOutput;
    private readonly input: TerminalInputEventSource;
    private inputForwardingTask?: Promise<void>;

    constructor(options: TerminalOptions = {})
    {
        super();
        this.output = options.output ?? process.stdout;
        this.input = options.input ?? new TerminalEventStream();
        this.fallbackSize = Terminal.validateSize(options.fallbackSize ?? defaultSize, "fallbackSize");
        this.color = options.color ?? "auto";
    }

    get width() { return this.readDimension(this.output.columns, this.fallbackSize.width); }
    get height() { return this.readDimension(this.output.rows, this.fallbackSize.height); }
    get isInteractive() { return this.output.isTTY === true; }
    get isInputActive() { return this.inputForwardingTask !== undefined; }

    on<EventName extends keyof TerminalEventMap>(event: EventName, listener: (event: TerminalEventMap[EventName]) => void): this;
    override on(event: string | symbol, listener: (...arguments_: any[]) => void): this;
    override on(event: string | symbol, listener: (...arguments_: any[]) => void): this
    {
        super.on(event, listener);

        if (typeof event === "string" && inputEventNames.has(event as keyof TerminalEventMap))
            try
            {
                this.startInput();
            }
            catch (error)
            {
                super.off(event, listener);
                throw error;
            }

        return this;
    }

    /** Opens the private decoded event stream and re-emits its events. */
    startInput(): this
    {
        if (this.inputForwardingTask)
            return this;

        this.input.open();
        this.inputForwardingTask = this.forwardInputEvents();
        return this;
    }

    /** Stops input forwarding and restores the input stream's terminal state. */
    async stopInput(): Promise<void>
    {
        if (!this.inputForwardingTask)
            return;

        await this.input.close();
        await this.inputForwardingTask;
    }

    write(line: TerminalLine): void
    {
        this.output.write(this.renderLine(line));
    }

    writeLine(line: TerminalLine): void
    {
        this.assertLineHasNoNewline(line);
        this.output.write(`${this.renderLine(line)}\n`);
    }

    clearViewport(): void
    {
        this.requireInteractive("clearViewport");
        this.output.write("\u001B[2J\u001B[H");
        this.frameLineCount = 0;
    }

    onResize(listener: (size: TerminalSize) => void): Disposable
    {
        this.requireInteractive("onResize");
        if (!this.output.on)
            throw new Error("onResize requires an output stream that supports resize events.");

        const callback = () => listener({ width: this.width, height: this.height });
        this.output.on("resize", callback);

        let disposed = false;
        return {
            [Symbol.dispose]: () =>
            {
                if (disposed) return;
                disposed = true;
                this.output.off?.("resize", callback) ?? this.output.removeListener?.("resize", callback);
            },
        };
    }

    alternateScreen(options: AlternateScreenOptions = {}): Disposable
    {
        this.requireInteractive("alternateScreen");
        this.output.write(`\u001B[?1049h${options.hideCursor ? "\u001B[?25l" : ""}`);

        let disposed = false;
        return {
            [Symbol.dispose]: () =>
            {
                if (disposed) return;
                disposed = true;
                this.output.write(`${options.hideCursor ? "\u001B[?25h" : ""}\u001B[?1049l`);
                this.frameLineCount = 0;
            },
        };
    }

    writeFrame(frame: TerminalFrame): void
    {
        this.requireInteractive("writeFrame");
        this.clearFrame();

        const header = frame.header ?? [];
        const footer = frame.footer ?? [];
        const availableContentHeight = Math.max(0, this.height - header.length - footer.length);
        const content = frame.content.slice(0, availableContentHeight);
        const footerSpacing = Math.max(0, availableContentHeight - content.length);
        const lines = [...header, ...content, ...Array<string>(footerSpacing).fill(""), ...footer].slice(0, this.height);

        const renderedFrame = lines
            .map(line => this.renderLineToWidth(line))
            .join("\n");
        this.output.write(renderedFrame);

        this.frameLineCount = lines.length;
    }

    clearFrame(): void
    {
        if (this.frameLineCount === 0) return;
        this.requireInteractive("clearFrame");
        const moveToFrameStart = this.frameLineCount > 1 ? `\u001B[${this.frameLineCount - 1}A` : "";
        this.output.write(`\r${moveToFrameStart}\u001B[J`);
        this.frameLineCount = 0;
    }

    private renderLine(line: TerminalLine): string
    {
        const result = typeof line === "string"
            ? line
            : this.renderDefinition(line);

        return this.shouldUseColor ? result : result.replace(ansiEscapeSequence, "");
    }

    private renderDefinition(line: LineDefinition): string
    {
        const layout = new HorizontalLayout(line);
        return layout.unformattedWidth > this.width
            ? layout.computeString(this.width, { truncate: truncateStringsEnd, fill: extendTextArrayEnd })
            : layout.computeString(this.width);
    }

    private renderLineToWidth(line: TerminalLine): string
    {
        return this.renderLine(typeof line === "string" ? [line] : line);
    }

    private get shouldUseColor()
    {
        return this.color === "always" || (this.color === "auto" && this.isInteractive);
    }

    private assertLineHasNoNewline(line: TerminalLine): void
    {
        if (typeof line === "string")
        {
            if (/[\n\r]/.test(line))
                throw new RangeError("writeLine does not accept line-feed or carriage-return characters.");
            return;
        }

        for (const element of line)
            if (typeof element === "string")
                this.assertLineHasNoNewline(element);
            else if (Array.isArray(element))
                this.assertLineHasNoNewline(element);
    }

    private requireInteractive(method: string): void
    {
        if (!this.isInteractive)
            throw new Error(`${method} requires an interactive TTY output stream.`);
    }

    private readDimension(value: number | undefined, fallback: number)
    {
        return value && Number.isInteger(value) && value > 0 ? value : fallback;
    }

    private static validateSize(size: TerminalSize, name: string): TerminalSize
    {
        if (!Number.isInteger(size.width) || size.width <= 0 || !Number.isInteger(size.height) || size.height <= 0)
            throw new RangeError(`${name} width and height must be positive integers.`);
        return size;
    }

    private async forwardInputEvents(): Promise<void>
    {
        try
        {
            for await (const event of this.input)
                this.emitInputEvent(event);
        }
        finally
        {
            this.inputForwardingTask = undefined;
        }
    }

    private emitInputEvent(event: TerminalInputEvent): void
    {
        switch (event.type)
        {
            case "keypress": this.emit("keyPress", event); break;
            case "mousedown": this.emit("mouseDown", event); break;
            case "mouseup": this.emit("mouseUp", event); break;
            case "mousemove": this.emit("mouseMove", event); break;
            case "wheel": this.emit("wheel", event); break;
            case "csi": this.emit("csi", event); break;
            case "ss3": this.emit("ss3", event); break;
        }
    }
}
