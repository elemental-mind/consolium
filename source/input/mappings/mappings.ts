export const namedCharacters = new Map([
    ["\x00", " "],
    ["\x08", "Backspace"],
    ["\t", "Tab"],
    ["\n", "Enter"],
    ["\r", "Enter"],
    ["\x1b", "Escape"],
    ["\x7f", "Backspace"],
]);

export const csiKeys = new Map([
    ["A", "ArrowUp"],
    ["B", "ArrowDown"],
    ["C", "ArrowRight"],
    ["D", "ArrowLeft"],
    ["F", "End"],
    ["H", "Home"],
]);

export const tildeKeys = new Map([
    [1, "Home"],
    [2, "Insert"],
    [3, "Delete"],
    [4, "End"],
    [5, "PageUp"],
    [6, "PageDown"],
    [7, "Home"],
    [8, "End"],
    [11, "F1"],
    [12, "F2"],
    [13, "F3"],
    [14, "F4"],
    [15, "F5"],
    [17, "F6"],
    [18, "F7"],
    [19, "F8"],
    [20, "F9"],
    [21, "F10"],
    [23, "F11"],
    [24, "F12"],
]);

export const ss3Keys = new Map([
    ["A", "ArrowUp"],
    ["B", "ArrowDown"],
    ["C", "ArrowRight"],
    ["D", "ArrowLeft"],
    ["F", "End"],
    ["H", "Home"],
    ["P", "F1"],
    ["Q", "F2"],
    ["R", "F3"],
    ["S", "F4"],
]);
