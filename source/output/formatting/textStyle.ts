export type TextStyle = keyof typeof TextStyles;
export const TextStyles = {
    bold: 1,
    dimmed: 2,
    italic: 3,
    underlined: 4,
    blinking: 5,
    inverted: 7,
    hidden: 8,
    strikethrough: 9,
} as const;
