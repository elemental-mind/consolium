export { CSIEvent, SS3Event, TerminalEvent, TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./events.ts";
export type { ModifierInfo, MouseEventInfo, WheelEventInfo } from "./events.ts";
export type { TerminalMouseEventType } from "./events.ts";
export { TerminalEventStream } from "./eventStream.ts";
export { TerminalInputStream } from "./rawStream.ts";

export interface TerminalStream<T> extends AsyncIterable<T>
{
    readonly isOpen: boolean;

    open(): this;
    close(): Promise<void>;
}
