/** Maps terminal control characters to normalized key names. */
export const namedCharacters = new Map([
    ["\x00", " "],
    ["\x08", "Backspace"],
    ["\t", "Tab"],
    ["\n", "Enter"],
    ["\r", "Enter"],
    ["\x1b", "Escape"],
    ["\x7f", "Backspace"],
]);
