import { Colors, mapColorToEscapeCodeSequence, type Color, type ColorValue, type HexColor } from "./color.ts";
import { TextStyles, type TextStyle } from "./textStyle.ts";

type ColourCodeStringLiteral = (strings: TemplateStringsArray, ...substitutions: (string | number)[]) => FormattingAPI;

export interface FormattingInfo
{
    foreground?: ColorValue;
    background?: ColorValue;
    bold?: boolean;
    dimmed?: boolean;
    italic?: boolean;
    underlined?: boolean;
    blinking?: boolean;
    inverted?: boolean;
    hidden?: boolean;
    strikethrough?: boolean;
}

export type FormattingAPI =
    {
        [possibleSetting in (Color | `bg${Capitalize<Color>}` | TextStyle)]: FormattingAPI;
    } & {
        fg: ColourCodeStringLiteral;
        bg: ColourCodeStringLiteral;
    };

export class FormattingSettings
{
    //---------------
    // Setup part for adding fluent API members
    //---------------
    private static defineFormattingProperty(name: string, settings: FormattingInfo)
    {
        Object.defineProperty(FormattingSettings, name, {
            configurable: false, enumerable: false,
            get() { return new FormattingSettings(settings); }
        });
        Object.defineProperty(FormattingSettings.prototype, name, {
            configurable: false, enumerable: false,
            get(this: FormattingSettings) { return this.apply(settings); }
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

    //---------------------------
    // Normal class members
    //---------------------------

    static None = new FormattingSettings();

    static fromMerged(baseFormatting: FormattingSettings, overrideFormatting: FormattingSettings)
    {
        const mergedFormatting = new FormattingSettings({ ...baseFormatting.settings, ...overrideFormatting.settings });
        mergedFormatting.shouldCloneOnChange = false;
        return mergedFormatting;
    }

    static fg(strings: TemplateStringsArray, ...substitutions: (string | number)[])
    {
        return new FormattingSettings().fg(strings, ...substitutions);
    }

    static bg(strings: TemplateStringsArray, ...substitutions: (string | number)[])
    {
        return new FormattingSettings().bg(strings, ...substitutions);
    }

    settings: FormattingInfo = {};
    private shouldCloneOnChange = true;

    constructor(settings: FormattingInfo = {})
    {
        this.settings = settings;
    }

    get isNullFormatting()
    {
        for (const key in this.settings)
            if (this.settings[key as keyof typeof this.settings] !== false) return false;
        return true;
    }

    fg(strings: TemplateStringsArray, ...substitutions: (string | number)[])
    {
        return this.apply({ foreground: this.getColorStringFromStringLiteral(strings, substitutions) });
    }

    bg(strings: TemplateStringsArray, ...substitutions: (string | number)[])
    {
        return this.apply({ background: this.getColorStringFromStringLiteral(strings, substitutions) });
    }

    format(value: string)
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

    private apply(settings: FormattingInfo)
    {
        if (this.shouldCloneOnChange)
        {
            const fluentChain = new FormattingSettings({ ...this.settings, ...settings });
            fluentChain.shouldCloneOnChange = false;
            return fluentChain;
        }

        Object.assign(this.settings, settings);
        return this;
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

export const Formatting = FormattingSettings as any as FormattingAPI;
