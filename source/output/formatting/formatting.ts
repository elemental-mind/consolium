import { Colors, mapColorToEscapeCodeSequence as getColorEscapeCode, mapColorToEscapeCodeSequence, type Color, type ColorValue, type HexColor } from "./color.ts";
import { TextStyles, type TextStyle } from "./textStyle.ts";

type ColourHexCodeLiteral = (strings: TemplateStringsArray, ...substitutions: (string | number)[]) => FormattingAPI;
type FormattingAPI =
    {
        [possibleSetting in (Color | `bg${Capitalize<Color>}` | TextStyle)]: FormattingAPI;
    } &
    {
        fg: ColourHexCodeLiteral;
        bg: ColourHexCodeLiteral;
        format(value: string): string;
        merge(overrides: FormattingAPI | FormattingInfo): FormattingAPI;
        readonly settings: FormattingInfo;
    };

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

class FormattingSettings
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
            get(this: FormattingSettings) 
            {
                return this.with(settings);
            }
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

    fg(strings: TemplateStringsArray, ...substitutions: (string | number)[])
    {
        return this.with({ foreground: this.getLiteralColour(strings, substitutions) });
    }

    bg(strings: TemplateStringsArray, ...substitutions: (string | number)[])
    {
        return this.with({ background: this.getLiteralColour(strings, substitutions) });
    }

    format(value: string)
    {
        const escapeCodes = [];
        for (const [key, setting] of Object.entries(this.settings))
            if (key.endsWith("ground"))
                escapeCodes.push(...mapColorToEscapeCodeSequence(setting, key === "background"));
            else if (setting === true)
                escapeCodes.push(TextStyles[key as TextStyle]);

        if (escapeCodes.length === 0)
            return value;

        return `\u001B[${escapeCodes.join(";")}m${value}\u001B[0m`;
    }

    merge(overrideFormatting: FormattingAPI | FormattingInfo)
    {
        const overrideSettings: FormattingInfo = overrideFormatting instanceof FormattingSettings
            ? (overrideFormatting as FormattingAPI).settings
            : overrideFormatting as FormattingInfo;
        const mergedFormatting = new FormattingSettings({ ...this.settings, ...overrideSettings });

        mergedFormatting.shouldCloneOnChange = false;
        return mergedFormatting;
    }

    private with(settings: FormattingInfo)
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

    private getLiteralColour(strings: TemplateStringsArray, substitutions: (string | number)[]): HexColor
    {
        let color = strings[0];

        for (let index = 0; index < substitutions.length; index++)
            color += substitutions[index] + strings[index + 1];

        // Accept three- or six-digit hexadecimal RGB colors, such as #FFF or #FFFFFF.
        if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color))
            throw new TypeError(`Invalid hex color: ${color}`);

        return color as HexColor;
    }
};

//We add the hasInstance member to support instanceof operator type inference
type FormattingClass =
    { [possibleSetting in (Color | `bg${Capitalize<Color>}` | TextStyle)]: FormattingAPI; } &
    {
        fg: ColourHexCodeLiteral;
        bg: ColourHexCodeLiteral;
        [Symbol.hasInstance](value: unknown): value is FormattingAPI;
    };
export const Formatting: FormattingClass = FormattingSettings as any;
