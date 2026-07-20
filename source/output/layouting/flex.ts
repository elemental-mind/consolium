export interface FlexAPI
{
    shrinkLeft(truncatorOrConfig?: FlexShrinkConfiguration | Truncator): FlexAPI;
    grow(growthElementOrConfig?: FlexGrowConfiguration | Filler): FlexAPI;
    shrinkRight(truncatorOrConfig?: FlexShrinkConfiguration | Truncator): FlexAPI;
}

export type Truncator = string | TruncationHandler;
export type TruncationHandler = (fragments: string[], shrinkLength: number) => string[];

export interface FlexShrinkConfiguration
{
    /**
     * A truncator like "..." or (string[], lenghtToShrink) => strings.map...
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
     * adds "...", preserve should be set to 6.
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

    /** Higher values grow first when more line size is needed. */
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
    truncator!: Truncator;
    preserve = 3;
    contentImportance = 0;
    flexFactor = 1;
    direction: "left" | "right";

    constructor(truncatorOrConfig: FlexShrinkConfiguration | Truncator = "...", direction: "left" | "right" = "left")
    {
        this.direction = direction;

        if (typeof truncatorOrConfig === "object")
            Object.assign(this, truncatorOrConfig);
        else
            this.truncator = truncatorOrConfig;

        if (typeof this.truncator === "string" && this.truncator.length > this.preserve)
            throw new RangeError("The truncator cannot be longer than the preserved content.");
    }

    shrink(truncationTarget: string[], startIndexInclusive: number, endIndexExclusive: number, shrinkBy: number)
    {
        if (startIndexInclusive === endIndexExclusive) return;

        if (typeof this.truncator === "string")
            this.useDefaultTruncator(truncationTarget, startIndexInclusive, endIndexExclusive, shrinkBy);
        else
            this.useCustomTruncator(truncationTarget, startIndexInclusive, endIndexExclusive, shrinkBy);

        return truncationTarget;
    }

    private useDefaultTruncator(truncationTarget: string[], startIndexInclusive: number, endIndexExclusive: number, shrinkBy: number)
    {
        const truncator = this.truncator as string;

        // The truncator is added again, so remove enough input to make room for it.
        let truncationLength = shrinkBy + truncator.length;
        const [start, end, step] = this.direction === "left"
            ? [endIndexExclusive - 1, startIndexInclusive - 1, -1]
            : [startIndexInclusive, endIndexExclusive, 1];

        for (let index = start; index !== end; index += step)
        {
            const chunk = truncationTarget[index];

            if (chunk.length === 0)
                continue;

            if (chunk.length < truncationLength)
            {
                truncationLength -= chunk.length;
                truncationTarget[index] = "";
                continue;
            }

            if (chunk.length === truncationLength)
            {
                truncationTarget[index] = truncator;
                return;
            }

            if (chunk.length > truncationLength)
            {
                if (this.direction === "left")
                    truncationTarget[index] = chunk.slice(0, -truncationLength) + truncator;
                else
                    truncationTarget[index] = truncator + chunk.slice(truncationLength);

                return;
            }
        }
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
    max?: number;
    flexFactor = 1;

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
