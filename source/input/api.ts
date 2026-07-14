export { TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./events.ts";
export type { TerminalEvent, TerminalModifierState, TerminalMouseEventInit, TerminalMouseEventType, TerminalWheelEventInit } from "./events.ts";
export { TerminalEventStream } from "./eventStream.ts";
export { TerminalInputStream } from "./rawStream.ts";

export interface TerminalStream<T> extends AsyncIterable<T>
{
    readonly isOpen: boolean;

    open(): this;
    close(): Promise<void>;
}