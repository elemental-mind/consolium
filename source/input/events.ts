import { MouseButton, MouseButtonFlag, type MouseButtonFlags } from "./mappings/mouseButtonEncodings.ts";
import { ModifierKeyFlag, type ModifierKeyFlags } from "./mappings/modifierKeyEncodings.ts";

export type TerminalMouseEventType = "mousedown" | "mouseup" | "mousemove" | "wheel";

export interface ModifierInfo
{
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
}

export interface MouseEventInfo extends ModifierInfo
{
    button: MouseButton;
    buttons: MouseButtonFlags;
    column: number;
    row: number;
}

export interface WheelEventInfo extends MouseEventInfo 
{
    deltaX: number;
    deltaY: number;
}

export abstract class TerminalEvent implements ModifierInfo
{
    static readonly shiftKeyBit = ModifierKeyFlag.Shift;
    static readonly altKeyBit = ModifierKeyFlag.Alt;
    static readonly ctrlKeyBit = ModifierKeyFlag.Ctrl;

    abstract readonly type: string;
    private readonly modifierKeys: ModifierKeyFlags;

    get altKey() { return (this.modifierKeys & TerminalEvent.altKeyBit) !== 0; }
    get ctrlKey() { return (this.modifierKeys & TerminalEvent.ctrlKeyBit) !== 0; }
    get shiftKey() { return (this.modifierKeys & TerminalEvent.shiftKeyBit) !== 0; }

    protected constructor(modifiers: Partial<ModifierInfo> = {})
    {
        this.modifierKeys = (
            (modifiers.shiftKey ? TerminalEvent.shiftKeyBit : 0) |
            (modifiers.altKey ? TerminalEvent.altKeyBit : 0) |
            (modifiers.ctrlKey ? TerminalEvent.ctrlKeyBit : 0)
        ) as ModifierKeyFlags;
    }
}

export class TerminalKeyboardEvent extends TerminalEvent
{
    readonly type = "keypress";
    readonly key: string;

    constructor(key: string, modifiers: Partial<ModifierInfo> = {})
    {
        super(modifiers);
        this.key = key;
    }
}

export class CSIEvent extends TerminalEvent
{
    readonly type = "csi";
    readonly namespaceMarker: string;
    readonly instruction: string;
    readonly parameters: number[];
    readonly intermediates: string;

    constructor(instruction: string, parameters = [] as number[], intermediates = "", namespaceMarker = "")
    {
        super();
        this.namespaceMarker = namespaceMarker;
        this.instruction = instruction;
        this.parameters = parameters;
        this.intermediates = intermediates;
    }
}

export class SS3Event extends TerminalEvent
{
    readonly type = "ss3";
    readonly instruction: string;

    constructor(instruction: string)
    {
        super();
        this.instruction = instruction;
    }
}

export class TerminalMouseEvent<Type extends TerminalMouseEventType> extends TerminalEvent implements MouseEventInfo
{
    static readonly leftMouseButtonBit = MouseButtonFlag.Left;
    static readonly rightMouseButtonBit = MouseButtonFlag.Right;
    static readonly middleMouseButtonBit = MouseButtonFlag.Middle;

    readonly type: Type;
    readonly button: MouseButton;
    readonly buttons: MouseButtonFlags;

    readonly column: number;
    readonly row: number;

    get leftMouseButton() { return (this.buttons & TerminalMouseEvent.leftMouseButtonBit) !== 0; }
    get middleMouseButton() { return (this.buttons & TerminalMouseEvent.middleMouseButtonBit) !== 0; }
    get rightMouseButton() { return (this.buttons & TerminalMouseEvent.rightMouseButtonBit) !== 0; }

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

export class TerminalWheelEvent extends TerminalMouseEvent<"wheel"> implements WheelEventInfo
{
    readonly deltaX: number;
    readonly deltaY: number;

    constructor(init: Partial<WheelEventInfo> = {})
    {
        super("wheel", init);
        this.deltaX = init.deltaX ?? 0;
        this.deltaY = init.deltaY ?? 0;
    }
}

/** Internal union used by the decoded input stream. */
export type TerminalInputEvent =
    CSIEvent |
    SS3Event |
    TerminalKeyboardEvent |
    TerminalMouseEvent<Exclude<TerminalMouseEventType, "wheel">> |
    TerminalWheelEvent;
