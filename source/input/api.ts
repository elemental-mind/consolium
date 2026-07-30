export { TerminalEventStream } from "./eventStream.ts";
export { TerminalInputStream } from "./rawStream.ts";

export { CSIEvent, SS3Event, TerminalEvent, TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./events.ts";
export type { ModifierInfo, MouseEventInfo, TerminalInputEvent, WheelEventInfo } from "./events.ts";

export type { TerminalMouseEventType } from "./events.ts";
export type { MouseButtonFlags } from "./mappings/mouseButtonEncodings.ts";
export { MouseButton, MouseButtonFlag } from "./mappings/mouseButtonEncodings.ts";

export { ModifierKeyFlag } from "./mappings/modifierKeyEncodings.ts";
export type { ModifierKeyNames, ModifierKeyFlags } from "./mappings/modifierKeyEncodings.ts";

export interface TerminalStream<T> extends AsyncIterable<T>
{
    readonly isOpen: boolean;

    open(): this;
    close(): Promise<void>;
}
