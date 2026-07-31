/**
 * Provides convenient ANSI colour and text-style functions, including
 * foreground and background colours and composable formatting helpers.
 *
 * @module
 */

import { Formatting } from "./output/formatting/formatting.ts";

export { Formatting } from "./output/formatting/formatting.ts";
export type { FormattingAPI, FormattingInfo } from "./output/formatting/formatting.ts";

export const black: typeof Formatting.black = Formatting.black;
export const red: typeof Formatting.red = Formatting.red;
export const green: typeof Formatting.green = Formatting.green;
export const yellow: typeof Formatting.yellow = Formatting.yellow;
export const blue: typeof Formatting.blue = Formatting.blue;
export const magenta: typeof Formatting.magenta = Formatting.magenta;
export const cyan: typeof Formatting.cyan = Formatting.cyan;
export const white: typeof Formatting.white = Formatting.white;
export const gray: typeof Formatting.gray = Formatting.gray;
export const bgBlack: typeof Formatting.bgBlack = Formatting.bgBlack;
export const bgRed: typeof Formatting.bgRed = Formatting.bgRed;
export const bgGreen: typeof Formatting.bgGreen = Formatting.bgGreen;
export const bgYellow: typeof Formatting.bgYellow = Formatting.bgYellow;
export const bgBlue: typeof Formatting.bgBlue = Formatting.bgBlue;
export const bgMagenta: typeof Formatting.bgMagenta = Formatting.bgMagenta;
export const bgCyan: typeof Formatting.bgCyan = Formatting.bgCyan;
export const bgWhite: typeof Formatting.bgWhite = Formatting.bgWhite;
export const bgGray: typeof Formatting.bgGray = Formatting.bgGray;
export const fg: typeof Formatting.fg = Formatting.fg;
export const bg: typeof Formatting.bg = Formatting.bg;
export const bold: typeof Formatting.bold = Formatting.bold;
export const dimmed: typeof Formatting.dimmed = Formatting.dimmed;
export const italic: typeof Formatting.italic = Formatting.italic;
export const underlined: typeof Formatting.underlined = Formatting.underlined;
export const blinking: typeof Formatting.blinking = Formatting.blinking;
export const inverted: typeof Formatting.inverted = Formatting.inverted;
export const hidden: typeof Formatting.hidden = Formatting.hidden;
export const strikethrough: typeof Formatting.strikethrough = Formatting.strikethrough;
