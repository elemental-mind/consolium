import { Colors, mapColorToEscapeCodeSequence, type Color, type ColorValue, type HexColor } from "./color.ts";
import { TextStyles, type TextStyle } from "./textStyle.ts";

export type FormattingAPI = ForegroundColoursAPI & BackgroundColoursAPI & CustomColoursAPI & StylesAPI;
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

export class FormattingSettings extends FluentFormattingAPIBase
{
    static None = new FormattingSettings();

    static fg(strings: TemplateStringsArray, ...substitutions: (string | number)[])
    {
        return new FormattingSettings().fg(strings, ...substitutions);
    }

    static bg(strings: TemplateStringsArray, ...substitutions: (string | number)[])
    {
        return new FormattingSettings().bg(strings, ...substitutions);
    }

    settings: FormattingInfo = {};
    get isNullFormatting()
    {
        return this.checkForNullFormatting();
    }

    private shouldCloneOnChange = true;

    constructor(settings: FormattingInfo = {})
    {
        super();
        this.settings = settings;
    }

    fg(strings: TemplateStringsArray, ...substitutions: (string | number)[])
    {
        return this.addSettings({ foreground: this.getColorStringFromStringLiteral(strings, substitutions) }) as any as FormattingAPI;
    }

    bg(strings: TemplateStringsArray, ...substitutions: (string | number)[])
    {
        return this.addSettings({ background: this.getColorStringFromStringLiteral(strings, substitutions) }) as any as FormattingAPI;
    }

    createdDerivedFormattingFromMerged(overrideFormatting: FormattingSettings | FormattingInfo)
    {
        const overrides = overrideFormatting instanceof FormattingSettings ? overrideFormatting.settings : overrideFormatting;

        const mergedFormatting = new FormattingSettings({ ...this.settings, ...overrides });
        mergedFormatting.shouldCloneOnChange = false;
        return mergedFormatting;
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

    addSettings(settings: FormattingInfo)
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

export const Formatting = FormattingSettings as any as FormattingAPI;
