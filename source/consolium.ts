/**
 * Provides the {@link Terminal} abstraction for terminal output, sizing,
 * alternate-screen handling, frame rendering, and decoded input events.
 *
 * @module
 */

import { EventEmitter } from "node:events";
import type { TerminalStream } from "./input/api.ts";
import { TerminalEventStream } from "./input/eventStream.ts";
import type { CSIEvent, SS3Event, TerminalInputEvent, TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./input/events.ts";
import { extendTextArrayEnd, truncateStringsEnd } from "./output/formatting/textSize.ts";
import { HorizontalLayout, type LineDefinition } from "./output/layouting/horizontalLayout.ts";
import { VerticalLayout, type TerminalLine } from "./output/layouting/verticalLayout.ts";

/** The number of visible columns and rows available in a terminal. */
export interface TerminalSize
{
    /** The available width in visible terminal columns. */
    readonly width: number;

    /** The available height in visible terminal rows. */
    readonly height: number;
}

/** Options controlling a {@link Terminal} instance. */
export interface TerminalOptions
{
    /** The stream receiving rendered terminal output. Defaults to `process.stdout`. */
    readonly output?: TerminalOutput;

    /**
     * Overrides the event source used by {@link Terminal.startInput}. The
     * source remains private; callers receive its decoded events through this
     * `Terminal`.
     */
    readonly input?: TerminalInputEventSource;

    /** Whether ANSI color sequences are emitted automatically, always, or never. */
    readonly color?: "auto" | "always" | "never";

    /** The dimensions used when the output stream does not report a valid size. */
    readonly fallbackSize?: TerminalSize;
}

/** A decoded-event source used by {@link Terminal}'s input lifecycle. */
export interface TerminalInputEventSource extends TerminalStream<TerminalInputEvent> { }

/** Event names emitted by {@link Terminal}, mapped to their event payloads. */
export interface TerminalEventMap
{
    /** A key press, including named keys such as `ArrowUp`. */
    keypress: TerminalKeyboardEvent;

    /** A mouse-button press. */
    mousedown: TerminalMouseEvent<"mousedown">;

    /** A mouse-button release. */
    mouseup: TerminalMouseEvent<"mouseup">;

    /** A mouse movement event. */
    mousemove: TerminalMouseEvent<"mousemove">;

    /** A mouse-wheel event. */
    wheel: TerminalWheelEvent;

    /** An unrecognized or otherwise generic CSI event. */
    csi: CSIEvent;

    /** An unrecognized or otherwise generic SS3 event. */
    ss3: SS3Event;
}

/** Options for an alternate-screen session. */
export interface AlternateScreenOptions
{
    /** Hides the cursor until the returned disposable is disposed. */
    readonly hideCursor?: boolean;
}

/** The portion of a Node write stream that {@link Terminal} needs. */
export interface TerminalOutput
{
    /** Whether this output is connected to an interactive terminal. */
    readonly isTTY?: boolean;

    /** The current terminal width, when reported by the output stream. */
    readonly columns?: number;

    /** The current terminal height, when reported by the output stream. */
    readonly rows?: number;

    /** Writes a rendered value to the output stream. */
    write(value: string): unknown;

    /** Registers a listener for terminal resize events. */
    on?(event: "resize", listener: () => void): unknown;

    /** Removes a listener previously registered for terminal resize events. */
    off?(event: "resize", listener: () => void): unknown;

    /** Compatibility fallback for streams that do not expose `off`. */
    removeListener?(event: "resize", listener: () => void): unknown;
}

/** A resource whose cleanup can be requested with JavaScript's `using` syntax. */
export interface Disposable
{
    /** Releases the resource. Calling it more than once must be harmless. */
    [Symbol.dispose](): void;
}

const defaultSize: TerminalSize = { width: 80, height: 24 };
const ansiEscapeSequence = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const inputEventNames = new Set<keyof TerminalEventMap>(["keypress", "mousedown", "mouseup", "mousemove", "wheel", "csi", "ss3"]);

/**
 * Coordinates terminal output, responsive frame rendering, and decoded input
 * events.
 *
 * @example
 * ```ts
 * const terminal = new Terminal({ color: "always" });
 * terminal.writeLine("Ready");
 * ```
 */
export class Terminal extends EventEmitter
{
    private readonly fallbackSize: TerminalSize;
    private readonly color: "auto" | "always" | "never";
    private frameLineCount = 0;

    private readonly output: TerminalOutput;
    private readonly input: TerminalInputEventSource;
    private inputForwardingTask?: Promise<void>;

    /** Creates a terminal controller using the supplied streams and options. */
    constructor(options: TerminalOptions = {})
    {
        super();
        this.output = options.output ?? process.stdout;
        this.input = options.input ?? new TerminalEventStream();
        this.fallbackSize = Terminal.validateSize(options.fallbackSize ?? defaultSize, "fallbackSize");
        this.color = options.color ?? "auto";
    }

    /** The current output width, or the configured fallback width. */
    get width(): number { return this.readDimension(this.output.columns, this.fallbackSize.width); }

    /** The current output height, or the configured fallback height. */
    get height(): number { return this.readDimension(this.output.rows, this.fallbackSize.height); }

    /** Whether the output stream reports an interactive TTY. */
    get isInteractive(): boolean { return this.output.isTTY === true; }

    /** Whether decoded input events are currently being forwarded. */
    get isInputActive(): boolean { return this.inputForwardingTask !== undefined; }

    /**
     * Registers a listener for a decoded terminal event and starts input
     * forwarding when the listener is for an input event.
     *
     * @example
     * ```ts
     * terminal.on("keypress", event => console.log(event.key));
     * terminal.on("mousedown", event => console.log(event.column, event.row));
     * ```
     */
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

    /** Opens the decoded event stream and re-emits its events from this terminal. */
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

    /**
     * Writes a line without appending a line break.
     *
     * @example
     * ```ts
     * terminal.write("status");
     * terminal.write(["left", "right"]);
     * ```
     */
    write(line: TerminalLine): void
    {
        this.output.write(this.renderLine(line));
    }

    /**
     * Writes a line followed by a line-feed.
     *
     * @example
     * ```ts
     * terminal.writeLine("status");
     * terminal.writeLine(["left", "right"]);
     * ```
     */
    writeLine(line: TerminalLine): void
    {
        this.assertLineHasNoNewline(line);
        this.output.write(`${this.renderLine(line)}\n`);
    }

    /** Clears the visible terminal viewport and moves the cursor home. */
    clearViewport(): void
    {
        this.requireInteractive("clearViewport");
        this.output.write("\u001B[2J\u001B[H");
        this.frameLineCount = 0;
    }

    /**
     * Subscribes to terminal resize events.
     *
     * @returns A disposable that removes the resize listener.
     * @example
     * ```ts
     * using resize = terminal.onResize(size => console.log(size.width, size.height));
     * ```
     */
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

    /**
     * Enters the alternate screen and returns a disposable that restores the
     * previous screen when released.
     *
     * @example
     * ```ts
     * using screen = terminal.alternateScreen({ hideCursor: true });
     * terminal.writeFrame(["temporary content"]);
     * ```
     */
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

    /**
     * Renders a viewport frame, replacing the previously written frame.
     *
     * @example
     * ```ts
     * terminal.writeFrame(["first", "second"]);
     * terminal.writeFrame(new VerticalLayout(["scrollable"]));
     * ```
     */
    writeFrame(frame: readonly TerminalLine[] | VerticalLayout): void
    {
        this.requireInteractive("writeFrame");
        this.clearFrame();

        const layout = frame instanceof VerticalLayout ? frame : new VerticalLayout(frame);
        const lines = layout.computeLines(this.height);

        const renderedFrame = lines
            .map(line =>
            {
                this.assertLineHasNoNewline(line);
                return this.renderLineToWidth(line);
            })
            .join("\n");
        this.output.write(renderedFrame);

        this.frameLineCount = lines.length;
    }

    /** Removes the most recently rendered frame from the viewport. */
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
                this.emit(event.type, event);
        }
        finally
        {
            this.inputForwardingTask = undefined;
        }
    }
}
