import { extendTextArrayEnd, truncateStringsEnd, truncateStringsStart } from "../formatting/textSize.ts";

export interface FlexAPI
{
    shrinkLeft(truncatorOrConfig?: FlexShrinkConfiguration | Truncator): FlexAPI;
    grow(growthElementOrConfig?: FlexGrowConfiguration | Filler): FlexAPI;
    shrinkRight(truncatorOrConfig?: FlexShrinkConfiguration | Truncator): FlexAPI;
}

export type Truncator = string | TruncationHandler;
export type TruncationHandler = (fragments: string[], shrinkLength: number) => string[];
export const DefaultTruncationMarker = "…";

export interface FlexShrinkConfiguration
{
    /**
     * A truncator like "…" or (string[], lenghtToShrink) => strings.map...
     * 
     * A custom truncator must work with string fragments as strings may be split by fromatting boundaries.
     * Because it is imperative to know which part of the formatted string belongs to which formatting the truncator
     * must return a string[] in the same shape as the given one.
     * Each string element must be mapped to its shortened form. Either dropped, fully preserved, or shortened. 
     */
    readonly truncator: Truncator;

    /**
     * Minimum number of visible columns allocated to this context, _including
     * any truncation marker_. Defaults to 3.
     *
     * If you supply a custom truncator, this informs about the max truncation
     * capacity of the truncator. If a truncator leaves at leaset 3 letters and
     * adds "…", preserve should be set to 4.
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

    /** Higher values grow first when more line size is needed. Defaults to zero. */
    readonly fillPriority?: number;

    /** Maximum emitted width in visible terminal columns. Defaults to unbounded. */
    readonly max?: number;

    /**
     * Relative amount of growth among contexts with equal content importance.
     * Defaults to one and must be greater than zero.
     */
    readonly flexFactor?: number;
}

export class FlexBoundary implements FlexAPI
{
    static shrinkLeft(truncatorOrConfig: FlexShrinkConfiguration | Truncator = DefaultTruncationMarker)
    {
        return new FlexBoundary().shrinkLeft(truncatorOrConfig);
    }

    static grow(growElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        return new FlexBoundary().grow(growElementOrConfig);
    }

    static shrinkRight(truncatorOrConfig: FlexShrinkConfiguration | Truncator = DefaultTruncationMarker)
    {
        return new FlexBoundary().shrinkRight(truncatorOrConfig);
    }

    shrinkLeftContext?: ShrinkContext;
    growthContext?: GrowthContext;
    shrinkRightContext?: ShrinkContext;

    shrinkLeft(truncatorOrConfig: FlexShrinkConfiguration | Truncator = DefaultTruncationMarker)
    {
        //When we shrink left of a boundary, it means we shrink the end of the string in the previous section
        this.shrinkLeftContext = new ShrinkContext(truncatorOrConfig, truncateStringsEnd);

        return this;
    }

    grow(growthElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        this.growthContext = new GrowthContext(growthElementOrConfig);

        return this;
    }

    shrinkRight(truncatorOrConfig: FlexShrinkConfiguration | Truncator = DefaultTruncationMarker)
    {
        //When we shrink right of a boundary, it means we shrink the start of the string in the following section
        this.shrinkRightContext = new ShrinkContext(truncatorOrConfig, truncateStringsStart);

        return this;
    }
}

export const Flex = FlexBoundary as FlexAPI;

export class ShrinkContext implements FlexShrinkConfiguration
{
    preserve = 3;
    contentImportance = 0;
    flexFactor = 1;
    truncator!: Truncator;
    truncationStrategy: typeof truncateStringsEnd;

    constructor(truncatorOrConfig: FlexShrinkConfiguration | Truncator = DefaultTruncationMarker, truncationStrategy = truncateStringsEnd)
    {
        this.truncationStrategy = truncationStrategy;

        if (typeof truncatorOrConfig === "object")
            Object.assign(this, truncatorOrConfig);
        else
            this.truncator = truncatorOrConfig;

        if (typeof this.truncator === "string" && this.truncator.length > this.preserve)
            throw new RangeError("The truncator cannot be longer than the preserved content.");
    }

    shrink(truncationTarget: string[], startIndexInclusive: number, endIndexExclusive: number, currentWidth: number, shrinkBy: number)
    {
        if (startIndexInclusive === endIndexExclusive) return;

        if (typeof this.truncator === "string")
            this.useDefaultTruncator(truncationTarget, startIndexInclusive, endIndexExclusive, currentWidth, shrinkBy);
        else
            this.useCustomTruncator(truncationTarget, startIndexInclusive, endIndexExclusive, shrinkBy);

        return truncationTarget;
    }

    private useDefaultTruncator(truncationTarget: string[], startIndexInclusive: number, endIndexExclusive: number, currentWidth: number, shrinkBy: number)
    {
        const fragments = truncationTarget.slice(startIndexInclusive, endIndexExclusive);
        const truncatedFragments = this.truncationStrategy(fragments, currentWidth, currentWidth - shrinkBy, this.truncator as string);

        for (let index = 0; index < truncatedFragments.length; index++)
            truncationTarget[startIndexInclusive + index] = truncatedFragments[index];
    }

    private useCustomTruncator(truncationTarget: string[], startIndexInclusive: number, endIndexExclusive: number, shrinkBy: number)
    {
        const fragments = truncationTarget.slice(startIndexInclusive, endIndexExclusive);
        const resultFragments = (this.truncator as TruncationHandler)(fragments, shrinkBy);

        if (resultFragments.length !== fragments.length)
            throw new RangeError("A custom truncator must return the same number of fragments it received.");

        for (let index = 0; index < resultFragments.length; index++)
            truncationTarget[startIndexInclusive + index] = resultFragments[index];
    }
}

export class GrowthContext implements FlexGrowConfiguration
{
    filler!: Filler;
    fillPriority = 0;
    flexFactor = 1;
    max = Infinity;

    constructor(growthElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        if (typeof growthElementOrConfig === "object")
            Object.assign(this, growthElementOrConfig);
        else if (typeof growthElementOrConfig === "function" || (typeof growthElementOrConfig === "string" && growthElementOrConfig.length > 0))
            this.filler = growthElementOrConfig;
        else
            throw new Error("Filler not valid.");
    }

    fill(length: number)
    {
        if (typeof this.filler === "function")
            return this.filler(length);

        return extendTextArrayEnd([""], 0, length, this.filler)[0];
    }
}
