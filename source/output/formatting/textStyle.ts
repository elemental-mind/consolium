export type TextStyle = typeof TextStyles[keyof typeof TextStyles];
export const TextStyles = {
    Bold: "bold",
    Dimmed: "dimmed",
    Italic: "italic",
    Underlined: "underlined",
    Blinking: "blinking",
    Inverted: "inverted",
    Hidden: "hidden",
    Strikethrough: "strikethrough",
} as const;