import type { BitField, BitFlag } from "../../utils/bitField.ts";

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
export const MouseButton: MouseButtonAPI =
    {
        None: -1,
        Left: 0,
        Middle: 1,
        Right: 2,

        /**
         * Converts an xterm button code to the internal button code.
         * ```text
         *           left  middle  right  none
         * xterm:      0      1      2      3
         * ours:       0      1      2     -1
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
export type MouseButtonFlag = MouseButtonFlagAPI[MouseButtonNames];
export const MouseButtonFlag: MouseButtonFlagAPI =
    {
        None: 0b000 as BitFlag,
        Left: 0b001 as BitFlag,
        Middle: 0b100 as BitFlag,
        Right: 0b010 as BitFlag,

        fromButtonCode(button: MouseButton) { return (button === 0 ? 0b001 : button === 1 ? 0b100 : button === 2 ? 0b010 : 0) as BitFlag; },
    } as const;
