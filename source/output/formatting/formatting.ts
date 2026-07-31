import { Colors, mapColorToEscapeCodeSequence, type Color, type ColorValue, type HexColor } from "./color.ts";
import { TextStyles, type TextStyle } from "./textStyle.ts";

/**
 * Fluent ANSI formatting properties and custom-colour tag functions.
 *
 * The API includes named foreground and background colours, text styles, and
 * the `fg`/`bg` tagged templates for hexadecimal RGB colours.
 *
 * @example
 * ```ts
 * Formatting.bold.blue;
 * Formatting.fg`#0af`;
 * ```
 */
export type FormattingAPI = ForegroundColoursAPI & BackgroundColoursAPI & CustomColoursAPI & StylesAPI;
/** Fluent formatting API augmented with internal formatting settings. */
export type FormattingWithInternalAPI = {
    [K in keyof FormattingAPI]: FormattingAPI[K] extends FormattingAPI ? FormattingWithInternalAPI
    : FormattingAPI[K] extends ((...args: infer Arguments) => infer Result extends FormattingAPI) ? ((...args: Arguments) => FormattingWithInternalAPI)
    : FormattingAPI[K]
} & FormattingSettings;

type ForegroundColoursAPI = {
    [color in Color]: FormattingAPI;
};
type BackgroundColoursAPI = {
    [bgColor in `bg${Capitalize<Color>}`]: FormattingAPI;
};
type CustomColoursAPI = {
    fg: ColourCodeStringLiteral;
    bg: ColourCodeStringLiteral;
};
type StylesAPI = {
    [style in TextStyle]: FormattingAPI;
};
type ColourCodeStringLiteral = (strings: TemplateStringsArray, ...substitutions: (string | number)[]) => FormattingAPI;

/** Individual foreground, background, and text-style settings. */
export interface FormattingInfo
{
    /** Foreground named or hexadecimal RGB colour. */
    foreground?: ColorValue;
    /** Background named or hexadecimal RGB colour. */
    background?: ColorValue;
    /** Whether text is bold. */
    bold?: boolean;
    /** Whether text is dimmed. */
    dimmed?: boolean;
    /** Whether text is italic. */
    italic?: boolean;
    /** Whether text is underlined. */
    underlined?: boolean;
    /** Whether text blinks. */
    blinking?: boolean;
    /** Whether foreground and background colours are inverted. */
    inverted?: boolean;
    /** Whether text is hidden. */
    hidden?: boolean;
    /** Whether text has a strikethrough. */
    strikethrough?: boolean;
}


// This class and its prototype is derived at parse time from all the colours etc. that are defined in color.ts and textStyle.ts
const FluentFormattingAPIBase = class FluentBase
{
    private static defineFormattingProperty(name: string, settings: FormattingInfo)
    {
        Object.defineProperty(this, name, {
            configurable: false, enumerable: false,
            get() { return new FormattingSettings(settings); }
        });
        Object.defineProperty(this.prototype, name, {
            configurable: false, enumerable: false,
            get(this: FormattingSettings) { return this.addSettings(settings); }
        });
    };

    private static addFluentAPIMembers()
    {
        for (const color of Object.keys(Colors) as Color[])
        {
            const backgroundColor = `bg${color[0].toUpperCase()}${color.slice(1)}`;

            this.defineFormattingProperty(color, { foreground: color });
            this.defineFormattingProperty(backgroundColor, { background: color });
        }

        for (const style of Object.keys(TextStyles) as TextStyle[])
            this.defineFormattingProperty(style, { [style]: true });
    }

    static {
        this.addFluentAPIMembers();
    }
} as any as new () => (ForegroundColoursAPI & BackgroundColoursAPI & StylesAPI);

/** Stateful formatting object used to build and apply ANSI settings. */
export class FormattingSettings extends FluentFormattingAPIBase
{
    /** A formatting instance with no ANSI settings. */
    static None: FormattingSettings = new FormattingSettings();

    /**
     * Creates formatting with a custom hexadecimal foreground colour.
     *
     * @param strings - Template literal segments containing a three- or six-digit hexadecimal colour.
     * @param substitutions - Values interpolated into the template literal.
     * @returns A fluent formatting API with the selected foreground colour.
     * @example
     * FormattingSettings.fg`#0af`;
     * FormattingSettings.fg`#${"00aaff"}`;
     * FormattingSettings.fg`#${255}`;
     */
    static fg(strings: TemplateStringsArray, ...substitutions: (string | number)[]): FormattingAPI
    {
        return new FormattingSettings().fg(strings, ...substitutions);
    }

    /**
     * Creates formatting with a custom hexadecimal background colour.
     *
     * @param strings - Template literal segments containing a three- or six-digit hexadecimal colour.
     * @param substitutions - Values interpolated into the template literal.
     * @returns A fluent formatting API with the selected background colour.
     * @example
     * FormattingSettings.bg`#0af`;
     * FormattingSettings.bg`#${"00aaff"}`;
     * FormattingSettings.bg`#${255}`;
     */
    static bg(strings: TemplateStringsArray, ...substitutions: (string | number)[]): FormattingAPI
    {
        return new FormattingSettings().bg(strings, ...substitutions);
    }

    /** The ANSI settings represented by this instance. */
    settings: FormattingInfo = {};
    /** Whether this instance currently has no enabled formatting. */
    isNullFormatting: boolean = true;

    private shouldCloneOnChange = true;

    /**
     * Creates a formatting instance from settings.
     *
     * @param settings - Initial foreground, background, and text-style settings.
     */
    constructor(settings: FormattingInfo = {})
    {
        super();
        this.settings = settings;
        this.isNullFormatting = this.checkForNullFormatting();
    }

    /**
     * Adds a custom hexadecimal foreground colour.
     *
     * @param strings - Template literal segments containing a three- or six-digit hexadecimal colour.
     * @param substitutions - Values interpolated into the template literal.
     * @returns A fluent formatting API with the merged foreground colour.
     * @example
     * Formatting.bold.fg`#0af`;
     * Formatting.bold.fg`#${"00aaff"}`;
     * Formatting.bold.fg`#${255}`;
     */
    fg(strings: TemplateStringsArray, ...substitutions: (string | number)[]): FormattingAPI
    {
        return this.addSettings({ foreground: this.getColorStringFromStringLiteral(strings, substitutions) }) as any as FormattingAPI;
    }

    /**
     * Adds a custom hexadecimal background colour.
     *
     * @param strings - Template literal segments containing a three- or six-digit hexadecimal colour.
     * @param substitutions - Values interpolated into the template literal.
     * @returns A fluent formatting API with the merged background colour.
     * @example
     * Formatting.bold.bg`#0af`;
     * Formatting.bold.bg`#${"00aaff"}`;
     * Formatting.bold.bg`#${255}`;
     */
    bg(strings: TemplateStringsArray, ...substitutions: (string | number)[]): FormattingAPI
    {
        return this.addSettings({ background: this.getColorStringFromStringLiteral(strings, substitutions) }) as any as FormattingAPI;
    }

    /**
     * Merges this instance's settings with another instance or a settings object.
     *
     * @param overrideFormatting - An existing formatting instance or settings to override on this instance.
     * @returns A derived formatting instance containing the merged settings.
     * @example
     * Formatting.red.createdDerivedFormattingFromMerged(Formatting.bold);
     * Formatting.red.createdDerivedFormattingFromMerged({ bold: true });
     */
    createdDerivedFormattingFromMerged(overrideFormatting: FormattingSettings | FormattingInfo): FormattingSettings
    {
        const overrides = overrideFormatting instanceof FormattingSettings ? overrideFormatting.settings : overrideFormatting;

        const mergedFormatting = new FormattingSettings({ ...this.settings, ...overrides });
        mergedFormatting.shouldCloneOnChange = false;
        return mergedFormatting;
    }

    /**
     * Wraps text in this instance's ANSI escape sequences.
     *
     * @param value - Text to format.
     * @returns The formatted text, or the original value when no settings are enabled.
     */
    format(value: string): string
    {
        if (this.isNullFormatting)
            return value;

        const escapeCodes = [];
        for (const [key, setting] of Object.entries(this.settings))
            // We route color settings (foreground, background) to escape sequence decoder
            if (key.endsWith("ground"))
                escapeCodes.push(...mapColorToEscapeCodeSequence(setting, key === "background"));
            // Text style settings are boolean and their escape code can be read directly from the encoding Object
            else if (setting)
                escapeCodes.push(TextStyles[key as TextStyle]);

        return `\u001B[${escapeCodes.join(";")}m${value}\u001B[0m`;
    }

    /**
     * Adds settings to this fluent chain.
     *
     * @param settings - Settings to merge into the chain.
     * @returns A derived chain or this mutable derived instance.
     */
    addSettings(settings: FormattingInfo): FormattingSettings
    {
        if (this.shouldCloneOnChange)
        {
            const fluentChain = new FormattingSettings({ ...this.settings, ...settings });
            fluentChain.shouldCloneOnChange = false;
            return fluentChain;
        }

        Object.assign(this.settings, settings);
        this.isNullFormatting = this.checkForNullFormatting();
        return this;
    }

    private checkForNullFormatting()
    {
        for (const key in this.settings)
            if (this.settings[key as keyof typeof this.settings] !== false) return false;
        return true;
    }

    private getColorStringFromStringLiteral(stringLiteralStaticParts: TemplateStringsArray, stringLiteralDynamicParts: (string | number)[]): HexColor
    {
        let color = stringLiteralStaticParts[0];

        //We zip static parts and dynamic parts. Dynamic parts are always enclosed in static parts.
        for (let index = 0; index < stringLiteralDynamicParts.length; index++)
            color += stringLiteralDynamicParts[index] + stringLiteralStaticParts[index + 1];

        // Accept three- or six-digit hexadecimal RGB colors, such as #FFF or #FFFFFF.
        if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color))
            throw new TypeError(`Invalid hex color: ${color}`);

        return color as HexColor;
    }
};

/**
 * Entry point for composable ANSI formatting.
 *
 * @example
 * Formatting.bold.red.format("Error");
 * Formatting.fg`#0af`.bg`#111`.format("Custom colours");
 */
export const Formatting = FormattingSettings as any as FormattingAPI;
