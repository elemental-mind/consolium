/**
 * Provides raw and decoded terminal input streams together with keyboard,
 * mouse, wheel, CSI, and SS3 event types and modifier mappings.
 *
 * @module
 */

/** Decoded keyboard, mouse, and terminal-control event stream. */
export { TerminalEventStream } from "./eventStream.ts";
/** Raw character stream read from the active terminal. */
export { TerminalInputStream } from "./rawStream.ts";

/** Terminal control and input event classes. */
export { CSIEvent, SS3Event, TerminalEvent, TerminalKeyboardEvent, TerminalMouseEvent, TerminalWheelEvent } from "./events.ts";
/** Structures describing decoded terminal input event data. */
export type { ModifierInfo, MouseEventInfo, TerminalInputEvent, WheelEventInfo } from "./events.ts";

/** Union of decoded mouse-event type strings. */
export type { TerminalMouseEventType } from "./events.ts";
/** Bit field representing currently pressed mouse buttons. */
export type { MouseButtonFlags } from "./mappings/mouseButtonEncodings.ts";
/** Mouse-button values and their bit-flag representations. */
export { MouseButton, MouseButtonFlag } from "./mappings/mouseButtonEncodings.ts";

/** Bit flags representing modifier-key state. */
export { ModifierKeyFlag } from "./mappings/modifierKeyEncodings.ts";
/** Modifier-key names and their combined bit-field type. */
export type { ModifierKeyNames, ModifierKeyFlags } from "./mappings/modifierKeyEncodings.ts";

/**
 * Common lifecycle and iteration contract for terminal input streams.
 *
 * @typeParam T - Value yielded by the stream.
 */
export interface TerminalStream<T> extends AsyncIterable<T>
{
    /** Whether the stream is currently accepting input. */
    readonly isOpen: boolean;

    /** Opens the stream and returns it for chaining. */
    open(): this;
    /** Stops the stream and releases terminal resources. */
    close(): Promise<void>;
}
