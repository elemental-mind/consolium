/**
 * Provides convenient ANSI colour and text-style functions, including
 * foreground and background colours and composable formatting helpers.
 *
 * @module
 */

import { Formatting } from "./output/formatting/formatting.ts";

/** Composable ANSI formatting API. */
export { Formatting } from "./output/formatting/formatting.ts";
/** Settings accepted when constructing or extending formatting. */
export type { FormattingAPI, FormattingInfo } from "./output/formatting/formatting.ts";

/** Fluent formatting with a black foreground. */
export const black: typeof Formatting.black = Formatting.black;
/** Fluent formatting with a red foreground. */
export const red: typeof Formatting.red = Formatting.red;
/** Fluent formatting with a green foreground. */
export const green: typeof Formatting.green = Formatting.green;
/** Fluent formatting with a yellow foreground. */
export const yellow: typeof Formatting.yellow = Formatting.yellow;
/** Fluent formatting with a blue foreground. */
export const blue: typeof Formatting.blue = Formatting.blue;
/** Fluent formatting with a magenta foreground. */
export const magenta: typeof Formatting.magenta = Formatting.magenta;
/** Fluent formatting with a cyan foreground. */
export const cyan: typeof Formatting.cyan = Formatting.cyan;
/** Fluent formatting with a white foreground. */
export const white: typeof Formatting.white = Formatting.white;
/** Fluent formatting with a gray foreground. */
export const gray: typeof Formatting.gray = Formatting.gray;
/** Fluent formatting with a black background. */
export const bgBlack: typeof Formatting.bgBlack = Formatting.bgBlack;
/** Fluent formatting with a red background. */
export const bgRed: typeof Formatting.bgRed = Formatting.bgRed;
/** Fluent formatting with a green background. */
export const bgGreen: typeof Formatting.bgGreen = Formatting.bgGreen;
/** Fluent formatting with a yellow background. */
export const bgYellow: typeof Formatting.bgYellow = Formatting.bgYellow;
/** Fluent formatting with a blue background. */
export const bgBlue: typeof Formatting.bgBlue = Formatting.bgBlue;
/** Fluent formatting with a magenta background. */
export const bgMagenta: typeof Formatting.bgMagenta = Formatting.bgMagenta;
/** Fluent formatting with a cyan background. */
export const bgCyan: typeof Formatting.bgCyan = Formatting.bgCyan;
/** Fluent formatting with a white background. */
export const bgWhite: typeof Formatting.bgWhite = Formatting.bgWhite;
/** Fluent formatting with a gray background. */
export const bgGray: typeof Formatting.bgGray = Formatting.bgGray;
/**
 * Tagged template for a custom hexadecimal foreground colour.
 *
 * @example
 * fg`#0af`;
 * fg`#${"00aaff"}`;
 */
export const fg: typeof Formatting.fg = Formatting.fg;
/**
 * Tagged template for a custom hexadecimal background colour.
 *
 * @example
 * bg`#0af`;
 * bg`#${"00aaff"}`;
 */
export const bg: typeof Formatting.bg = Formatting.bg;
/** Fluent formatting with bold text. */
export const bold: typeof Formatting.bold = Formatting.bold;
/** Fluent formatting with dimmed text. */
export const dimmed: typeof Formatting.dimmed = Formatting.dimmed;
/** Fluent formatting with italic text. */
export const italic: typeof Formatting.italic = Formatting.italic;
/** Fluent formatting with underlined text. */
export const underlined: typeof Formatting.underlined = Formatting.underlined;
/** Fluent formatting with blinking text. */
export const blinking: typeof Formatting.blinking = Formatting.blinking;
/** Fluent formatting with inverted foreground and background colours. */
export const inverted: typeof Formatting.inverted = Formatting.inverted;
/** Fluent formatting with hidden text. */
export const hidden: typeof Formatting.hidden = Formatting.hidden;
/** Fluent formatting with strikethrough text. */
export const strikethrough: typeof Formatting.strikethrough = Formatting.strikethrough;
