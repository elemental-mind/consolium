export type Color = typeof Colors[keyof typeof Colors];
export const Colors = {
    Black: "black",
    Red: "red",
    Green: "green",
    Yellow: "yellow",
    Blue: "blue",
    Magenta: "magenta",
    Cyan: "cyan",
    White: "white",
    Gray: "gray",
} as const;