/** The supported ANSI text-style names. */
export type TextStyle = keyof typeof TextStyles;
/** ANSI SGR text-style codes indexed by their public style names. */
export const TextStyles = {
    /** ANSI bold style code. */
    bold: 1,
    /** ANSI dim style code. */
    dimmed: 2,
    /** ANSI italic style code. */
    italic: 3,
    /** ANSI underline style code. */
    underlined: 4,
    /** ANSI blinking style code. */
    blinking: 5,
    /** ANSI inverse-video style code. */
    inverted: 7,
    /** ANSI hidden style code. */
    hidden: 8,
    /** ANSI strikethrough style code. */
    strikethrough: 9,
} as const;
