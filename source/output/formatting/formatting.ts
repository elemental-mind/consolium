import { Colors, type Color } from "./color.ts";
import { TextStyles, type TextStyle } from "./textStyle.ts";

export type HexColor = `#${string}`;
export type ColorValue = Color | HexColor;

type ColourHexCodeLiteral = (strings: TemplateStringsArray, ...substitutions: (string | number)[]) => FormattingAPI;
type FormattingAPI =
    {
        [possibleSetting in (Color | `bg${keyof typeof Colors}` | TextStyle)]: FormattingAPI;
    } &
    {
        fg: ColourHexCodeLiteral;
        bg: ColourHexCodeLiteral;
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
        for (const [name, color] of Object.entries(Colors))
            this.defineFormattingProperty(color, { foreground: color }), this.defineFormattingProperty(`bg${name}`, { background: color });

        for (const style of Object.values(TextStyles))
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

    private shouldCloneOnChange = true;
    settings: FormattingInfo = {};

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
    { [possibleSetting in (Color | `bg${keyof typeof Colors}` | TextStyle)]: FormattingAPI; } &
    {
        fg: ColourHexCodeLiteral;
        bg: ColourHexCodeLiteral;
        [Symbol.hasInstance](value: unknown): value is FormattingAPI;
    };
export const Formatting: FormattingClass = FormattingSettings as any;
