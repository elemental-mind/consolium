export type TerminalEvent = KeyboardEvent | CSIEvent;
export type ModifierBitFlag = number;

export class KeyboardEvent
{
    static NoModifier = 0;
    static AltModifier = 1 << 0;
    static CtrlModifier = 1 << 1;

    readonly type = "character";
    readonly value: string;
    readonly modifiers: ModifierBitFlag = KeyboardEvent.NoModifier;

    constructor(value: string, baseModifiers: ModifierBitFlag = KeyboardEvent.NoModifier)
    {
        this.value = value;
        this.modifiers = baseModifiers;

        const code = value.charCodeAt(0);

        // Escape is also the prefix for terminal sequences, while the remaining keys share their
        // byte representation with Ctrl+I, Ctrl+J, Ctrl+M, and Ctrl+?. Prefer named-key semantics.
        if (value === "\x1b" || value === "\t" || value === "\r" || value === "\n" || value === "\x7f")
            return;

        if (code >= 0x01 && code <= 0x1a)
        {
            this.value = String.fromCharCode(code + 0x60);
            this.modifiers |= KeyboardEvent.CtrlModifier;
        }
        else if (code <= 0x1f || code === 0x7f)
            this.modifiers |= KeyboardEvent.CtrlModifier;
    }

    get alt() { return (this.modifiers & KeyboardEvent.AltModifier) !== 0; }
    get ctrl() { return (this.modifiers & KeyboardEvent.CtrlModifier) !== 0; }
}

// To better understand CSI and its structure read the notes in the notes.md file: project/notes.md#control-sequence-introducer-csi
export class CSIEvent
{
    static readonly isParameterByte = (code: number) => code >= 0x30 && code <= 0x3f;
    static readonly isPrivateMarkerByte = (code: number) => code >= 0x3c && code <= 0x3f;
    static readonly isIntermediateByte = (code: number) => code >= 0x20 && code <= 0x2f;
    static readonly isFinalByte = (code: number) => code >= 0x40 && code <= 0x7e;

    readonly type = "csi";
    readonly namespaceMarker: string;
    readonly instruction: string;
    readonly parameters: number[];
    readonly intermediates: string;

    constructor(instruction: string, parameters: string, intermediates: string, namespace = "")
    {
        this.instruction = instruction;
        this.parameters = parameters.length ? parameters.split(";").map(parameterString => Number(parameterString)) : [];
        this.namespaceMarker = namespace;
        this.intermediates = intermediates;
    }
}
