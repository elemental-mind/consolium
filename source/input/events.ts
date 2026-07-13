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

export class CSIEvent
{
    // Quick primer on CSI: CSI stands for Control Sequence Introducer. ESC followed by [ is interpreted as a control sequence beginning followed by a 
    // sequence of parameter bytes and then followed by a final command character, specifying the command.
    // 
    // Seqeunces are expressed in the layout specified below. Numerical parameters are expressed as concatenated ASCII digit bytes. 
    // So e.g. the number 15 is expressed as the ASCII char byte for "1" followed by the ASCII char byte for "5". 
    // Multiple Parameters can be present and are separated by ";".
    //
    // CSI layout:       ESC                [                <priv marker/Namesp.>    <parameters>    <intermediates>    <command letter>
    //                           
    // >Optionality:     required           required         optional                 optional        optional           required
    // >Range:           literal: \x1b      literal: [       one of: <=>?             0x30-3f*        0x20-2f*           0x40-7e
    // 
    // Example: ESC [ < 35;35;5 M is an SGR mouse event; "<" is not numeric. 
    // 
    // It can be read as "In namespace '<' execute function M(35, 35, 5);".
    //
    // For further understanding a light intro can be followed at: https://notes.burke.libbey.me/ansi-escape-codes/

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