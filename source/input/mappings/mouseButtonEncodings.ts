import type { BitField, BitFlag } from "../../utils/bitField.ts";

/** Names of recognized mouse buttons, including the no-button state. */
export type MouseButtonNames = "None" | "Left" | "Middle" | "Right";

type MouseButtonAPI = {
    readonly None: -1;
    readonly Left: 0;
    readonly Middle: 1;
    readonly Right: 2;
    readonly fromXtermCode: (xtermCode: number) => number;
};

/**
 * Mouse button enum:
 * ```text
 * none  left  middle  right
 *  -1     0      1      2
 * ```
 */
export type MouseButton = MouseButtonAPI[MouseButtonNames];
/** Numeric mouse-button values and xterm conversion helper. */
export const MouseButton: MouseButtonAPI =
    {
        /** No button; used for movement, wheel, and release states. */
        None: -1,
        /** Left mouse button. */
        Left: 0,
        /** Middle mouse button. */
        Middle: 1,
        /** Right mouse button. */
        Right: 2,

        /**
         * Converts an xterm button code to the internal button code.
         * ```text
         *           left  middle  right  none
         * xterm:      0      1      2      3
         * ours:       0      1      2     -1
         * ```
         *
         * @param xtermCode - xterm button code.
         * @returns The corresponding button value; xterm's release code `3` becomes `-1`.
         * @example
         * ```ts
         * MouseButton.fromXtermCode(0); // MouseButton.Left
         * MouseButton.fromXtermCode(3); // MouseButton.None
         * ```
         */
        fromXtermCode(xtermCode: number) { return xtermCode === 3 ? -1 : xtermCode; },
    } as const;

/**
 * Mouse Button bit flags:
 * ```text
 * 2 1 0
 * │ │ └─ left
 * │ └─── right
 * └───── middle
 * ```
 */
export type MouseButtonFlags = BitField;
type MouseButtonFlagAPI = {
    readonly None: BitFlag;
    readonly Left: BitFlag;
    readonly Middle: BitFlag;
    readonly Right: BitFlag;
    readonly fromButtonCode: (button: MouseButton) => BitFlag;
};
/** A single mouse-button bit flag. */
export type MouseButtonFlag = MouseButtonFlagAPI[MouseButtonNames];
/** Individual bit flags for mouse buttons and a conversion helper. */
export const MouseButtonFlag: MouseButtonFlagAPI =
    {
        /** Empty button-state bit field. */
        None: 0b000 as BitFlag,
        /** Bit indicating the left button is held. */
        Left: 0b001 as BitFlag,
        /** Bit indicating the middle button is held. */
        Middle: 0b100 as BitFlag,
        /** Bit indicating the right button is held. */
        Right: 0b010 as BitFlag,

        /**
         * Returns the bit flag corresponding to a mouse-button value.
         *
         * @param button - A left, middle, right, or no-button value.
         * @returns The matching button flag, or `MouseButtonFlag.None` for no button.
         * @example
         * ```ts
         * MouseButtonFlag.fromButtonCode(MouseButton.Left); // MouseButtonFlag.Left
         * MouseButtonFlag.fromButtonCode(MouseButton.Middle); // MouseButtonFlag.Middle
         * MouseButtonFlag.fromButtonCode(MouseButton.Right); // MouseButtonFlag.Right
         * MouseButtonFlag.fromButtonCode(MouseButton.None); // MouseButtonFlag.None
         * ```
         */
        fromButtonCode(button: MouseButton) { return (button === 0 ? 0b001 : button === 1 ? 0b100 : button === 2 ? 0b010 : 0) as BitFlag; },
    } as const;
