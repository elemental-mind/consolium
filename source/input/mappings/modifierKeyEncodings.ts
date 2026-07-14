import type { BitField, BitFlag } from "../../utils/bitField.ts";

export type ModifierKeyNames = "Shift" | "Alt" | "Ctrl";

/**
 * Bit flags used to store modifier-key state:
 * ```text
 * 2 1 0
 * │ │ └─ shift
 * │ └─── alt
 * └───── ctrl
 * ```
 */
export type ModifierKeyFlags = BitField;
export type ModifierKeyFlag = typeof ModifierKeyFlag[ModifierKeyNames];
export const ModifierKeyFlag =
    {
        Shift: 0b001 as BitFlag,
        Alt: 0b010 as BitFlag,
        Ctrl: 0b100 as BitFlag,
    } as const;
