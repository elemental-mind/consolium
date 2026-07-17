import { Formatting } from "../../source/output/formatting/formatting.ts";

console.log(Formatting.bold.underlined.format("Terminalium formatting preview"));
console.log();

console.log(Formatting.red.format("Red error text"));
console.log(Formatting.yellow.bold.format("Bold yellow warning text"));
console.log(Formatting.green.italic.format("Italic green success text"));
console.log(Formatting.blue.bgWhite.underlined.format("Underlined blue text on white"));
console.log(Formatting.black.bgCyan.bold.format("Bold black text on cyan"));
console.log(Formatting.magenta.strikethrough.format("Strikethrough magenta text"));
console.log(Formatting.fg`#FF8A3D`.bg`#252A34`.bold.format("True-color orange on charcoal"));
console.log(Formatting.cyan.bold.italic.underlined.format("Combined text styles"));
