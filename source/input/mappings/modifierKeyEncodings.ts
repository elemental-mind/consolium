import type { BitField, BitFlag } from "../../utils/bitField.ts";

/** Names of supported modifier keys. */
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
/** A single modifier-key bit flag. */
export type ModifierKeyFlag = typeof ModifierKeyFlag[ModifierKeyNames];
/** Individual bit flags for supported modifier keys. */
export const ModifierKeyFlag =
    {
        /** Shift modifier bit. */
        Shift: 0b001 as BitFlag,
        /** Alt modifier bit. */
        Alt: 0b010 as BitFlag,
        /** Ctrl modifier bit. */
        Ctrl: 0b100 as BitFlag,
    } as const;
