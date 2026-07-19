export interface FlexAPI
{
    shrinkLeft(truncatorOrConfig?: FlexShrinkConfiguration | Truncator): FlexAPI;
    grow(growthElementOrConfig?: FlexGrowConfiguration | Filler): FlexAPI;
    shrinkRight(truncatorOrConfig?: FlexShrinkConfiguration | Truncator): FlexAPI;
}

export type Truncator = string | TruncationHandler;
export type TruncationHandler = (text: string, targetWidth: number) => string;

export interface FlexShrinkConfiguration
{
    /**
     * A truncator like "..." or (string, width) => string.substring(...)
     */
    readonly truncator: Truncator;

    /**
     * Minimum number of visible columns allocated to this context, including
     * any truncation marker. Defaults to zero.
     */
    readonly preserve?: number;

    /**
     * Higher values are preserved before lower values. Contexts with equal
     * importance share shrinkage according to `flexFactor`. Defaults to zero.
     */
    readonly contentImportance?: number;

    /**
     * Relative amount of shrinkage accepted among contexts with equal content
     * importance. Defaults to one and must be greater than zero.
     */
    readonly flexFactor?: number;
}

export type Filler = string | FillHandler;
export type FillHandler = (targetLength: number) => string;

/** Controls how the fragment emitted by a Flex boundary may grow. */
export interface FlexGrowConfiguration
{
    /**
     * The growth string to be repeated like " " or a function returning
     * a string of the required length like (width) => "-".repeat(width)
     */
    readonly filler: Filler;

    /** Minimum emitted width in visible terminal columns. Defaults to zero. */
    readonly min?: number;

    /** Maximum emitted width in visible terminal columns. Defaults to unbounded. */
    readonly max?: number;

    /**
     * Higher values receive available space before lower values. Growth contexts
     * with equal importance share space according to `flexFactor`. Defaults to
     * zero.
     */
    readonly contentImportance?: number;

    /**
     * Relative amount of growth among contexts with equal content importance.
     * Defaults to one and must be greater than zero.
     */
    readonly flexFactor?: number;
}

export class FlexBoundary implements FlexAPI
{
    static shrinkLeft(truncatorOrConfig: FlexShrinkConfiguration | Truncator = "...")
    {
        return new FlexBoundary().shrinkLeft(truncatorOrConfig);
    }

    static grow(growElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        return new FlexBoundary().grow(growElementOrConfig);
    }

    static shrinkRight(truncatorOrConfig: FlexShrinkConfiguration | Truncator = "...")
    {
        return new FlexBoundary().shrinkRight(truncatorOrConfig);
    }

    shrinkLeftContext?: ShrinkContext;
    growthContext?: GrowthContext;
    shrinkRightContext?: ShrinkContext;

    shrinkLeft(truncatorOrConfig: FlexShrinkConfiguration | Truncator = "...")
    {
        this.shrinkLeftContext = new ShrinkContext(truncatorOrConfig, "left");

        return this;
    }

    grow(growthElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        this.growthContext = new GrowthContext(growthElementOrConfig);

        return this;
    }

    shrinkRight(truncatorOrConfig: FlexShrinkConfiguration | Truncator = "...")
    {
        this.shrinkRightContext = new ShrinkContext(truncatorOrConfig, "right");

        return this;
    }
}

export const Flex = FlexBoundary as FlexAPI;

export class ShrinkContext implements FlexShrinkConfiguration
{
    readonly truncator!: Truncator;
    readonly preserve?: number;
    readonly contentImportance?: number;
    readonly flexFactor?: number;
    readonly direction: "left" | "right";

    constructor(
        truncatorOrConfig: FlexShrinkConfiguration | Truncator = "...",
        direction: "left" | "right" = "left",
    )
    {
        this.direction = direction;

        if (typeof truncatorOrConfig === "object")
            Object.assign(this, truncatorOrConfig);
        else
            this.truncator = truncatorOrConfig;
    }

    shrink(fragments: string[], shrinkBy: number)
    {
        if (fragments.length === 0)
            return [];

        const text = fragments.join("");
        const normalizedShrink = Math.min(text.length, Math.max(0, shrinkBy));

        if (normalizedShrink === 0)
            return [...fragments];

        const targetLength = text.length - normalizedShrink;
        const truncated = this.truncate(text, targetLength);
        const result = fragments.map(() => "");

        result[this.direction === "left" ? 0 : result.length - 1] = truncated;
        return result;
    }

    private truncate(text: string, targetLength: number)
    {
        if (typeof this.truncator === "function")
            return this.truncator(text, targetLength);

        if (targetLength <= this.truncator.length)
            return this.truncator.slice(0, targetLength);

        const retainedLength = targetLength - this.truncator.length;
        return this.direction === "left"
            ? text.slice(0, retainedLength) + this.truncator
            : this.truncator + text.slice(text.length - retainedLength);
    }
}

export class GrowthContext implements FlexGrowConfiguration
{
    readonly filler!: Filler;
    readonly min?: number;
    readonly max?: number;
    readonly contentImportance?: number;
    readonly flexFactor?: number;

    constructor(growthElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        if (typeof growthElementOrConfig === "object")
            Object.assign(this, growthElementOrConfig);
        else
            this.filler = growthElementOrConfig;
    }

    fill(length: number)
    {
        if (typeof this.filler === "function")
            return this.filler(length);

        if (length === 0)
            return "";

        if (this.filler.length === 0)
            throw new RangeError("A string filler cannot be empty when growth is required.");

        return this.filler.repeat(Math.ceil(length / this.filler.length)).slice(0, length);
    }
}
