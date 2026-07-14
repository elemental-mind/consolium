export interface TerminalModifierState
{
    altKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
}

export class TerminalKeyboardEvent
{
    readonly type = "keypress";
    readonly key: string;
    readonly altKey: boolean;
    readonly ctrlKey: boolean;
    readonly shiftKey: boolean;

    constructor(key: string, modifiers: TerminalModifierState = {})
    {
        this.key = key;
        this.altKey = modifiers.altKey ?? false;
        this.ctrlKey = modifiers.ctrlKey ?? false;
        this.shiftKey = modifiers.shiftKey ?? false;
    }
}

export type TerminalMouseEventType = "mousedown" | "mouseup" | "mousemove";
type TerminalPointerEventType = TerminalMouseEventType | "wheel";

export interface TerminalMouseEventInit extends TerminalModifierState
{
    button?: number;
    buttons?: number;
    column?: number;
    row?: number;
}

export class TerminalMouseEvent<Type extends TerminalPointerEventType = TerminalMouseEventType>
{
    readonly type: Type;
    readonly button: number;
    readonly buttons: number;
    readonly column: number;
    readonly row: number;
    readonly altKey: boolean;
    readonly ctrlKey: boolean;
    readonly shiftKey: boolean;

    constructor(type: Type, init: TerminalMouseEventInit = {})
    {
        this.type = type;
        this.button = init.button ?? -1;
        this.buttons = init.buttons ?? 0;
        this.column = init.column ?? 0;
        this.row = init.row ?? 0;
        this.altKey = init.altKey ?? false;
        this.ctrlKey = init.ctrlKey ?? false;
        this.shiftKey = init.shiftKey ?? false;
    }
}

export interface TerminalWheelEventInit extends TerminalMouseEventInit
{
    deltaX?: number;
    deltaY?: number;
}

export class TerminalWheelEvent extends TerminalMouseEvent<"wheel">
{
    static readonly DOM_DELTA_LINE = 1;

    readonly deltaX: number;
    readonly deltaY: number;
    readonly deltaMode = TerminalWheelEvent.DOM_DELTA_LINE;

    constructor(init: TerminalWheelEventInit = {})
    {
        super("wheel", init);

        this.deltaX = init.deltaX ?? 0;
        this.deltaY = init.deltaY ?? 0;
    }
}

export type TerminalEvent =
    | TerminalKeyboardEvent
    | TerminalMouseEvent<TerminalMouseEventType>
    | TerminalWheelEvent;
