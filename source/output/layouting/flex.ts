
export type Truncator = string | TruncationHandler;  //e.g. "..." or (string, width) => string.substring(...)
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

export class Flex
{
    static shrinkLeft(truncatorOrConfig: FlexShrinkConfiguration | Truncator = "...")
    {
        return new Flex().shrinkLeft(truncatorOrConfig);
    }

    static grow(growElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        return new Flex().grow(growElementOrConfig);
    }

    static shrinkRight(truncatorOrConfig: FlexShrinkConfiguration | Truncator = "...")
    {
        return new Flex().shrinkRight(truncatorOrConfig);
    }

    shrinkLeftConfig?: FlexShrinkConfiguration;
    growConfig?: FlexGrowConfiguration;
    shrinkRightConfig?: FlexShrinkConfiguration;

    shrinkLeft(truncatorOrConfig: FlexShrinkConfiguration | Truncator = "...")
    {
        this.shrinkLeftConfig = typeof truncatorOrConfig === "object" ? truncatorOrConfig : { truncator: truncatorOrConfig };

        return this;
    }

    grow(growthElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        this.growConfig = typeof growthElementOrConfig === "object" ? growthElementOrConfig : { filler: growthElementOrConfig };

        return this;
    }

    shrinkRight(truncatorOrConfig: FlexShrinkConfiguration | Truncator = "...")
    {
        this.shrinkRightConfig = typeof truncatorOrConfig === "object" ? truncatorOrConfig : { truncator: truncatorOrConfig };

        return this;
    }
}
