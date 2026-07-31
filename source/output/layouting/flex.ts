import { extendTextArrayEnd, truncateStringsEnd, truncateStringsStart } from "../formatting/textSize.ts";

/** Fluent operations for configuring a flexible boundary in a line definition. */
export interface FlexAPI
{
    /**
     * Enables truncation of content before this boundary.
     *
     * @param truncatorOrConfig - A marker string, truncation handler, or configuration.
     * @returns This boundary.
     * @example
     * ```ts
     * Flex.shrinkLeft("…");
     * Flex.shrinkLeft({ truncator: fragments => fragments });
     * ```
     */
    shrinkLeft(truncatorOrConfig?: FlexShrinkConfiguration | Truncator): FlexAPI;
    /**
     * Adds a fillable region at this boundary.
     *
     * @param growthElementOrConfig - A fill string, fill handler, or configuration.
     * @returns This boundary.
     * @example
     * ```ts
     * Flex.grow(" ");
     * Flex.grow({ filler: width => "-".repeat(width) });
     * ```
     */
    grow(growthElementOrConfig?: FlexGrowConfiguration | Filler): FlexAPI;
    /**
     * Enables truncation of content after this boundary.
     *
     * @param truncatorOrConfig - A marker string, truncation handler, or configuration.
     * @returns This boundary.
     * @example
     * ```ts
     * Flex.shrinkRight("…");
     * Flex.shrinkRight({ truncator: fragments => fragments });
     * ```
     */
    shrinkRight(truncatorOrConfig?: FlexShrinkConfiguration | Truncator): FlexAPI;
}

/** A truncation marker string or a handler that shortens formatted fragments. */
export type Truncator = string | TruncationHandler;
/** Shortens formatted string fragments while preserving their array shape. */
export type TruncationHandler = (fragments: string[], shrinkLength: number) => string[];
/** Default marker used when a boundary is configured to truncate. */
export const DefaultTruncationMarker = "…";

/** Configuration for a truncatable side of a flexible boundary. */
export interface FlexShrinkConfiguration
{
    /**
     * A truncator like "…" or `(string[], lengthToShrink) => strings.map(...)`.
     * 
     * A custom truncator must work with string fragments as strings may be split by formatting boundaries.
     * Because it is imperative to know which part of the formatted string belongs to which formatting the truncator
     * must return a string[] in the same shape as the given one.
     * Each string element must be mapped to its shortened form: dropped, fully preserved, or shortened.
     */
    readonly truncator: Truncator;

    /**
     * Minimum number of visible columns allocated to this context, _including
     * any truncation marker_. Defaults to 3.
     *
     * If you supply a custom truncator, this informs about the max truncation
     * capacity of the truncator. If a truncator leaves at least 3 letters and
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

/** A repeated fill string or a function that creates fill text. */
export type Filler = string | FillHandler;
/** Creates fill text for a requested visible width. */
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

/** Configurable boundary that allows adjacent line content to shrink or grow. */
export class FlexBoundary implements FlexAPI
{
    /**
     * Creates a boundary that truncates preceding content.
     *
     * @param truncatorOrConfig - A marker string, truncation handler, or configuration.
     * @returns A configured boundary.
     * @example
     * ```ts
     * FlexBoundary.shrinkLeft("…");
     * FlexBoundary.shrinkLeft({ truncator: fragments => fragments });
     * ```
     */
    static shrinkLeft(truncatorOrConfig: FlexShrinkConfiguration | Truncator = DefaultTruncationMarker)
    {
        return new FlexBoundary().shrinkLeft(truncatorOrConfig);
    }

    /**
     * Creates a boundary with a growable fill region.
     *
     * @param growElementOrConfig - A fill string, fill handler, or configuration.
     * @returns A configured boundary.
     * @example
     * ```ts
     * FlexBoundary.grow(" ");
     * FlexBoundary.grow({ filler: width => "-".repeat(width) });
     * ```
     */
    static grow(growElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        return new FlexBoundary().grow(growElementOrConfig);
    }

    /**
     * Creates a boundary that truncates following content.
     *
     * @param truncatorOrConfig - A marker string, truncation handler, or configuration.
     * @returns A configured boundary.
     * @example
     * ```ts
     * FlexBoundary.shrinkRight("…");
     * FlexBoundary.shrinkRight({ truncator: fragments => fragments });
     * ```
     */
    static shrinkRight(truncatorOrConfig: FlexShrinkConfiguration | Truncator = DefaultTruncationMarker)
    {
        return new FlexBoundary().shrinkRight(truncatorOrConfig);
    }

    /** Truncation settings for content before this boundary, if configured. */
    shrinkLeftContext?: ShrinkContext;
    /** Growth settings for this boundary, if configured. */
    growthContext?: GrowthContext;
    /** Truncation settings for content after this boundary, if configured. */
    shrinkRightContext?: ShrinkContext;

    /**
     * Configures this boundary to truncate preceding content.
     *
     * @param truncatorOrConfig - A marker string, truncation handler, or configuration.
     * @returns This boundary.
     * @example
     * ```ts
     * boundary.shrinkLeft("…");
     * boundary.shrinkLeft({ truncator: fragments => fragments });
     * ```
     */
    shrinkLeft(truncatorOrConfig: FlexShrinkConfiguration | Truncator = DefaultTruncationMarker)
    {
        //When we shrink left of a boundary, it means we shrink the end of the string in the previous section
        this.shrinkLeftContext = new ShrinkContext(truncatorOrConfig, truncateStringsEnd);

        return this;
    }

    /**
     * Configures this boundary with a growable fill region.
     *
     * @param growthElementOrConfig - A fill string, fill handler, or configuration.
     * @returns This boundary.
     * @example
     * ```ts
     * boundary.grow(" ");
     * boundary.grow({ filler: width => "-".repeat(width) });
     * ```
     */
    grow(growthElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        this.growthContext = new GrowthContext(growthElementOrConfig);

        return this;
    }

    /**
     * Configures this boundary to truncate following content.
     *
     * @param truncatorOrConfig - A marker string, truncation handler, or configuration.
     * @returns This boundary.
     * @example
     * ```ts
     * boundary.shrinkRight("…");
     * boundary.shrinkRight({ truncator: fragments => fragments });
     * ```
     */
    shrinkRight(truncatorOrConfig: FlexShrinkConfiguration | Truncator = DefaultTruncationMarker)
    {
        //When we shrink right of a boundary, it means we shrink the start of the string in the following section
        this.shrinkRightContext = new ShrinkContext(truncatorOrConfig, truncateStringsStart);

        return this;
    }
}

/** Factory-style flexible-boundary API for use inside line definitions. */
export const Flex = FlexBoundary as FlexAPI;

/** Runtime truncation configuration used by horizontal layout ranges. */
export class ShrinkContext implements FlexShrinkConfiguration
{
    /** Minimum visible width retained by this context, including its marker. */
    preserve = 3;
    /** Relative priority for retaining this context's content. */
    contentImportance = 0;
    /** Relative share of shrinkage among equally important contexts. */
    flexFactor = 1;
    /** Marker or callback used to truncate text fragments. */
    truncator!: Truncator;
    /** Fragment-truncation direction used by this context. */
    truncationStrategy: typeof truncateStringsEnd;

    /**
     * Creates truncation settings.
     *
     * @param truncatorOrConfig - A marker string, truncation handler, or configuration.
     * @param truncationStrategy - The fragment truncation function.
     * @example
     * ```ts
     * new ShrinkContext("…");
     * new ShrinkContext({ truncator: fragments => fragments, preserve: 4 });
     * ```
     */
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

    /**
     * Shrinks a range of fragments in place.
     *
     * @param truncationTarget - Fragments to modify.
     * @param startIndexInclusive - First fragment index.
     * @param endIndexExclusive - Index after the last fragment.
     * @param currentWidth - Current visible width.
     * @param shrinkBy - Width to remove.
     * @returns The modified fragments, or `undefined` for an empty range.
     */
    shrink(truncationTarget: string[], startIndexInclusive: number, endIndexExclusive: number, currentWidth: number, shrinkBy: number): string[] | undefined
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

/** Runtime growth configuration used by horizontal layout ranges. */
export class GrowthContext implements FlexGrowConfiguration
{
    /** Fill string or callback. */
    filler!: Filler;
    /** Relative priority for receiving additional width. */
    fillPriority = 0;
    /** Relative share of growth among equally prioritized contexts. */
    flexFactor = 1;
    /** Maximum visible width this context may emit. */
    max = Infinity;

    /**
     * Creates growth settings.
     *
     * @param growthElementOrConfig - A fill string, fill handler, or configuration.
     * @example
     * ```ts
     * new GrowthContext(" ");
     * new GrowthContext({ filler: width => "-".repeat(width), max: 10 });
     * ```
     */
    constructor(growthElementOrConfig: FlexGrowConfiguration | Filler = " ")
    {
        if (typeof growthElementOrConfig === "object")
            Object.assign(this, growthElementOrConfig);
        else if (typeof growthElementOrConfig === "function" || (typeof growthElementOrConfig === "string" && growthElementOrConfig.length > 0))
            this.filler = growthElementOrConfig;
        else
            throw new Error("Filler not valid.");
    }

    /**
     * Produces fill text of the requested width.
     *
     * @param length - Requested visible width.
     * @returns Fill text.
     */
    fill(length: number): string
    {
        if (typeof this.filler === "function")
            return this.filler(length);

        return extendTextArrayEnd([""], 0, length, this.filler)[0];
    }
}
