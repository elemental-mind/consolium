/** A hash-prefixed hexadecimal RGB colour, such as `#0af` or `#00aaff`. */
export type HexColor = `#${string}`;
/** A named terminal colour or a hexadecimal RGB colour. */
export type ColorValue = Color | HexColor;

/** The supported named ANSI terminal colours. */
export type Color = keyof typeof Colors;
/** ANSI SGR foreground-colour codes indexed by their public colour names. */
export const Colors = {
    /** ANSI black foreground code. */
    black: 30,
    /** ANSI red foreground code. */
    red: 31,
    /** ANSI green foreground code. */
    green: 32,
    /** ANSI yellow foreground code. */
    yellow: 33,
    /** ANSI blue foreground code. */
    blue: 34,
    /** ANSI magenta foreground code. */
    magenta: 35,
    /** ANSI cyan foreground code. */
    cyan: 36,
    /** ANSI white foreground code. */
    white: 37,
    /** ANSI gray foreground code. */
    gray: 90,
} as const;

/**
 * Converts a public colour value into ANSI SGR parameters.
 *
 * @param color - A named colour, a three- or six-digit hexadecimal RGB colour, or `undefined`.
 * @param background - Whether to produce background rather than foreground parameters.
 * @returns SGR parameters, or an empty array when no colour is supplied.
 * @example
 * mapColorToEscapeCodeSequence("red", false); // [31]
 * mapColorToEscapeCodeSequence("#0af", true); // [48, 2, 0, 170, 255]
 * mapColorToEscapeCodeSequence(undefined, false); // []
 */
export function mapColorToEscapeCodeSequence(color: ColorValue | undefined, background: boolean)
{
    if (!color) return [];

    if (color.startsWith("#"))
        return mapHexColourToEscapeCodeSeqeunce(color, background);

    if (!background)
        return [Colors[color as Color]];
    else
        //Background colour codes just have a ten offset vs. foreground colour codes
        return [Colors[color as Color] + 10];
}

function mapHexColourToEscapeCodeSeqeunce(colorCode: string, background: boolean)
{
    if (background)
        return [48, 2, ...mapHexCodeToHexBytes(colorCode)];
    else
        return [38, 2, ...mapHexCodeToHexBytes(colorCode)];
}

function mapHexCodeToHexBytes(code: string)
{
    const rgb = [];

    if (code.length === 7)
        for (const byteIndex of [1, 3, 5])
            rgb.push(Number.parseInt(code[byteIndex] + code[byteIndex + 1], 16));
    else if (code.length === 4)
        //If we have a hex of #FFF for example we transform it into #FFFFFF
        for (const byteIndex of [1, 2, 3])
            rgb.push(Number.parseInt(code[byteIndex] + code[byteIndex], 16));
    else
        throw new Error("Unrecognizable hex colour");

    return rgb;
}
