import { Formatting } from "./output/formatting/formatting.ts";

export { Formatting } from "./output/formatting/formatting.ts";
export type { FormattingAPI, FormattingInfo } from "./output/formatting/formatting.ts";

export const {
    black, red, green, yellow, blue, magenta, cyan, white, gray,
    bgBlack, bgRed, bgGreen, bgYellow, bgBlue, bgMagenta, bgCyan, bgWhite, bgGray,
    fg, bg,
    bold, dimmed, italic, underlined, blinking, inverted, hidden, strikethrough,
} = Formatting;
