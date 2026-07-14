export type TerminalMouseEventType = "mousedown" | "mouseup" | "mousemove" | "wheel";

type BitField = number;
type BitFlag = number;

export interface ModifierInfo
{
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
}

export interface MouseEventInfo extends ModifierInfo
{
    button: number;
    buttons: BitField;
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
    static readonly shiftKeyBit: BitFlag = 1 << 0;
    static readonly altKeyBit: BitFlag = 1 << 1;
    static readonly ctrlKeyBit: BitFlag = 1 << 2;

    abstract readonly type: string;
    private readonly modifierBits: BitField;
    get altKey() { return (this.modifierBits & TerminalEvent.altKeyBit) !== 0; }
    get ctrlKey() { return (this.modifierBits & TerminalEvent.ctrlKeyBit) !== 0; }
    get shiftKey() { return (this.modifierBits & TerminalEvent.shiftKeyBit) !== 0; }

    protected constructor(modifiers: Partial<ModifierInfo> = {})
    {
        this.modifierBits =
            (modifiers.shiftKey ? TerminalEvent.shiftKeyBit : 0) |
            (modifiers.altKey ? TerminalEvent.altKeyBit : 0) |
            (modifiers.ctrlKey ? TerminalEvent.ctrlKeyBit : 0);
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
    static readonly leftMouseButtonBit: BitFlag = 1 << 0;
    static readonly rightMouseButtonBit: BitFlag = 1 << 1;
    static readonly middleMouseButtonBit: BitFlag = 1 << 2;

    readonly type: Type;
    /** The button associated with the event: 0 for left, 1 for middle, 2 for right, or -1 for none. */
    readonly button: number;
    /**
     * Bitmask of all buttons currently pressed:
     * ```text
     * 2 1 0
     * │ │ └─ left
     * │ └─── right
     * └───── middle
     * ```
     */
    readonly buttons: BitField;

    readonly column: number;
    readonly row: number;

    get leftMouseButton() { return (this.buttons & TerminalMouseEvent.leftMouseButtonBit) !== 0; }
    get middleMouseButton() { return (this.buttons & TerminalMouseEvent.middleMouseButtonBit) !== 0; }
    get rightMouseButton() { return (this.buttons & TerminalMouseEvent.rightMouseButtonBit) !== 0; }

    constructor(type: Type, init: Partial<MouseEventInfo> = {})
    {
        super(init);
        this.type = type;
        this.button = init.button ?? -1;
        this.buttons = init.buttons ?? 0;
        this.column = init.column ?? 0;
        this.row = init.row ?? 0;
    }
}

export class TerminalWheelEvent extends TerminalMouseEvent<"wheel"> implements WheelEventInfo
{
    static readonly DOM_DELTA_LINE = 1;

    readonly deltaX: number;
    readonly deltaY: number;
    readonly deltaMode = TerminalWheelEvent.DOM_DELTA_LINE;

    constructor(init: Partial<WheelEventInfo> = {})
    {
        super("wheel", init);
        this.deltaX = init.deltaX ?? 0;
        this.deltaY = init.deltaY ?? 0;
    }
}
