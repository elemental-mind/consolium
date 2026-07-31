import { MouseButton, MouseButtonFlag, type MouseButtonFlags } from "./mappings/mouseButtonEncodings.ts";
import { ModifierKeyFlag, type ModifierKeyFlags } from "./mappings/modifierKeyEncodings.ts";

/** Names of decoded terminal mouse event variants. */
export type TerminalMouseEventType = "mousedown" | "mouseup" | "mousemove" | "wheel";

/** Modifier-key state associated with a terminal event. */
export interface ModifierInfo
{
    /** Whether Alt was held. */
    altKey: boolean;
    /** Whether Ctrl was held. */
    ctrlKey: boolean;
    /** Whether Shift was held. */
    shiftKey: boolean;
}

/** Mouse position, button, and modifier state associated with an event. */
export interface MouseEventInfo extends ModifierInfo
{
    /** The button that triggered the event, or `MouseButton.None`. */
    button: MouseButton;
    /** Bit field of buttons currently held down. */
    buttons: MouseButtonFlags;
    /** Zero-based terminal column. */
    column: number;
    /** Zero-based terminal row. */
    row: number;
}

/** Mouse event information augmented with scroll deltas. */
export interface WheelEventInfo extends MouseEventInfo 
{
    /** Horizontal scroll delta. */
    deltaX: number;
    /** Vertical scroll delta. */
    deltaY: number;
}

/** Base class for decoded terminal events. */
export abstract class TerminalEvent implements ModifierInfo
{
    /** Bit used to represent Shift in an event's modifier state. */
    static readonly shiftKeyBit = ModifierKeyFlag.Shift;
    /** Bit used to represent Alt in an event's modifier state. */
    static readonly altKeyBit = ModifierKeyFlag.Alt;
    /** Bit used to represent Ctrl in an event's modifier state. */
    static readonly ctrlKeyBit = ModifierKeyFlag.Ctrl;

    /** Discriminator identifying the concrete event variant. */
    abstract readonly type: string;
    private readonly modifierKeys: ModifierKeyFlags;

    /** Whether Alt was held when the event occurred. */
    get altKey(): boolean { return (this.modifierKeys & TerminalEvent.altKeyBit) !== 0; }
    /** Whether Ctrl was held when the event occurred. */
    get ctrlKey(): boolean { return (this.modifierKeys & TerminalEvent.ctrlKeyBit) !== 0; }
    /** Whether Shift was held when the event occurred. */
    get shiftKey(): boolean { return (this.modifierKeys & TerminalEvent.shiftKeyBit) !== 0; }

    /**
     * Creates an event with optional modifier state.
     *
     * @param modifiers - Modifier values; omitted values default to `false`.
     */
    protected constructor(modifiers: Partial<ModifierInfo> = {})
    {
        this.modifierKeys = (
            (modifiers.shiftKey ? TerminalEvent.shiftKeyBit : 0) |
            (modifiers.altKey ? TerminalEvent.altKeyBit : 0) |
            (modifiers.ctrlKey ? TerminalEvent.ctrlKeyBit : 0)
        ) as ModifierKeyFlags;
    }
}

/** A decoded key press. */
export class TerminalKeyboardEvent extends TerminalEvent
{
    /** Event discriminator, always `"keypress"`. */
    readonly type = "keypress";
    /** Normalized key name or the typed character. */
    readonly key: string;

    /**
     * @param key - Normalized key name or typed character.
     * @param modifiers - Modifier state for the key press.
     */
    constructor(key: string, modifiers: Partial<ModifierInfo> = {})
    {
        super(modifiers);
        this.key = key;
    }
}

/** An unrecognized Control Sequence Introducer (CSI) sequence. */
export class CSIEvent extends TerminalEvent
{
    /** Event discriminator, always `"csi"`. */
    readonly type = "csi";
    /** Optional CSI private namespace marker. */
    readonly namespaceMarker: string;
    /** CSI final instruction character. */
    readonly instruction: string;
    /** Parsed numeric CSI parameters. */
    readonly parameters: number[];
    /** CSI intermediate characters. */
    readonly intermediates: string;

    /**
     * @param instruction - CSI final instruction character.
     * @param parameters - Parsed numeric parameters.
     * @param intermediates - CSI intermediate characters.
     * @param namespaceMarker - Optional private namespace marker.
     */
    constructor(instruction: string, parameters = [] as number[], intermediates = "", namespaceMarker = "")
    {
        super();
        this.namespaceMarker = namespaceMarker;
        this.instruction = instruction;
        this.parameters = parameters;
        this.intermediates = intermediates;
    }
}

/** An unrecognized Single Shift 3 (SS3) sequence. */
export class SS3Event extends TerminalEvent
{
    /** Event discriminator, always `"ss3"`. */
    readonly type = "ss3";
    /** SS3 instruction character. */
    readonly instruction: string;

    /**
     * @param instruction - SS3 instruction character.
     */
    constructor(instruction: string)
    {
        super();
        this.instruction = instruction;
    }
}

/** A decoded mouse press, release, or movement event. */
export class TerminalMouseEvent<Type extends TerminalMouseEventType> extends TerminalEvent implements MouseEventInfo
{
    /** Bit used to represent the left button in `buttons`. */
    static readonly leftMouseButtonBit = MouseButtonFlag.Left;
    /** Bit used to represent the right button in `buttons`. */
    static readonly rightMouseButtonBit = MouseButtonFlag.Right;
    /** Bit used to represent the middle button in `buttons`. */
    static readonly middleMouseButtonBit = MouseButtonFlag.Middle;

    /** Event discriminator supplied to the constructor. */
    readonly type: Type;
    /** Button that triggered the event, or `MouseButton.None`. */
    readonly button: MouseButton;
    /** Bit field of buttons currently held down. */
    readonly buttons: MouseButtonFlags;

    /** Zero-based terminal column. */
    readonly column: number;
    /** Zero-based terminal row. */
    readonly row: number;

    /** Whether the left mouse button is held. */
    get leftMouseButton(): boolean { return (this.buttons & TerminalMouseEvent.leftMouseButtonBit) !== 0; }
    /** Whether the middle mouse button is held. */
    get middleMouseButton(): boolean { return (this.buttons & TerminalMouseEvent.middleMouseButtonBit) !== 0; }
    /** Whether the right mouse button is held. */
    get rightMouseButton(): boolean { return (this.buttons & TerminalMouseEvent.rightMouseButtonBit) !== 0; }

    /**
     * @param type - Mouse event variant.
     * @param init - Position, button, and modifier values; omitted values use neutral defaults.
     * @example
     * ```ts
     * new TerminalMouseEvent("mousedown", { button: MouseButton.Left });
     * new TerminalMouseEvent("mousemove", { column: 10, row: 2 });
     * ```
     */
    constructor(type: Type, init: Partial<MouseEventInfo> = {})
    {
        super(init);
        this.type = type;
        this.button = init.button ?? MouseButton.None;
        this.buttons = init.buttons ?? MouseButtonFlag.None;
        this.column = init.column ?? 0;
        this.row = init.row ?? 0;
    }
}

/** A decoded mouse-wheel event. */
export class TerminalWheelEvent extends TerminalMouseEvent<"wheel"> implements WheelEventInfo
{
    /** Horizontal scroll delta. */
    readonly deltaX: number;
    /** Vertical scroll delta. */
    readonly deltaY: number;

    /**
     * @param init - Position, button, modifier, and scroll-delta values.
     */
    constructor(init: Partial<WheelEventInfo> = {})
    {
        super("wheel", init);
        this.deltaX = init.deltaX ?? 0;
        this.deltaY = init.deltaY ?? 0;
    }
}

/** Union of all event variants emitted by the decoded input stream. */
export type TerminalInputEvent =
    CSIEvent |
    SS3Event |
    TerminalKeyboardEvent |
    TerminalMouseEvent<Exclude<TerminalMouseEventType, "wheel">> |
    TerminalWheelEvent;
