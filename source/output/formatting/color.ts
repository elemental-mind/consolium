export type HexColor = `#${string}`;
export type ColorValue = Color | HexColor;

export type Color = keyof typeof Colors;
export const Colors = {
    black: 30,
    red: 31,
    green: 32,
    yellow: 33,
    blue: 34,
    magenta: 35,
    cyan: 36,
    white: 37,
    gray: 90,
} as const;

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