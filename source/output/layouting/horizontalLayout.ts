import { distributeIntegerCapped } from "apportionium";
import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { extendTextArrayEnd, textWidth, truncateStringsEnd } from "../formatting/textSize.ts";
import { DefaultTruncationMarker, FlexBoundary, type FlexAPI, type GrowthContext, type ShrinkContext } from "./flex.ts";

/** A line's elements, optionally wrapped in a formatting frame. */
export type LineDefinition = LineElement[] | FormattingFrame;
/** An item accepted in a horizontal line definition. */
export type LineElement = string | FormattingFrame | FlexAPI;
/** A formatting style followed by the elements to which it applies. */
export type FormattingFrame = [style: FormattingAPI, ...LineElement[]];

/** Fallback operations used when flexible regions cannot reach a requested width. */
export interface ForcedWidthOptions
{
    /** Marker appended when forced truncation is necessary. */
    truncator?: string;
    /** Function used to force truncation. */
    truncate: typeof truncateStringsEnd;
    /** Fill string appended when forced extension is necessary. */
    filler?: string;
    /** Function used to force extension. */
    fill: typeof extendTextArrayEnd;
}

/** Parses and renders one terminal line with nested formatting and flexible regions. */
export class HorizontalLayout
{
    /** Unformatted text fragments collected from the line definition. */
    normalizedStrings: string[] = [];
    /** Cumulative visible widths for `normalizedStrings`. */
    cumulativeStringLengths: number[] = [0];

    /** Flexible ranges discovered while parsing the line definition. */
    flexRanges: FlexRange[] = [];
    /** Formatting ranges discovered while parsing the line definition. */
    formattingRanges: FormattingRange[] = [];

    /**
     * Parses a structured line definition into renderable ranges.
     * @param lineDefinition Text, formatting frames, and flexible boundaries.
     * @example
     * new HorizontalLayout(["left", Flex.grow(" "), "right"]);
     * new HorizontalLayout([Formatting.bold, "emphasized"]);
     */
    constructor(lineDefinition: LineDefinition)
    {
        this.flexRanges.push(new FlexRange(this));
        this.formattingRanges.push(new FormattingRange(this, FormattingSettings.None));
        this.parseFormattingFrame(lineDefinition, FormattingSettings.None);
    }

    /** Visible width of the parsed line before flexible adjustment. */
    get unformattedWidth(): number
    {
        return this.cumulativeStringLengths.at(-1)!;
    }

    /**
     * Renders the line at a target width.
     *
     * @param targetWidth - Required visible width.
     * @param force - Optional fallback operations when configured ranges are insufficient.
     * @returns Formatted terminal text.
     */
    computeString(targetWidth: number, force?: ForcedWidthOptions): string
    {
        if (targetWidth < 0) throw new Error("Negative length strings not possible!");

        const widthDifference = targetWidth - this.unformattedWidth;

        let textWidthAdjustmentResult;
        if (widthDifference < 0)
            textWidthAdjustmentResult = this.adjustWith(Truncation, -widthDifference);
        else if (widthDifference > 0)
            textWidthAdjustmentResult = this.adjustWith(Extension, widthDifference);
        else
            textWidthAdjustmentResult = { remainingDifference: 0, modifiedStrings: this.normalizedStrings };

        if (!(force && textWidthAdjustmentResult?.remainingDifference))
            return this.formatStrings(textWidthAdjustmentResult.modifiedStrings);
        else if (widthDifference < 0)
            return this.forceTruncate(targetWidth, textWidthAdjustmentResult, force);
        else //if (widthDifference > 0)
            return this.forceExtend(targetWidth, textWidthAdjustmentResult, force);
    }

    private parseFormattingFrame(frame: LineDefinition, parentFormatting: FormattingSettings)
    {
        if (frame[0] instanceof FormattingSettings)
        {
            const formatting = parentFormatting.createdDerivedFormattingFromMerged(frame[0]);
            this.formattingRanges.at(-1)!.appendRange(formatting);
            this.parseFormattingFrameBody(frame, formatting, 1);
        }
        else
            this.parseFormattingFrameBody(frame, parentFormatting, 0);
    }

    private parseFormattingFrameBody(frame: LineDefinition, formatting: FormattingSettings, index: number)
    {
        const finalIndex = frame.length;
        while (index < finalIndex)
        {
            const frameElement = frame[index++];

            if (typeof frameElement === "string")
            {
                this.pushString(frameElement);
            }
            else if (Array.isArray(frameElement))
            {
                this.parseFormattingFrame(frameElement, formatting);
                if (this.formattingRanges.at(-1)!.formatting !== formatting)
                    this.formattingRanges.at(-1)!.appendRange(formatting);
            }
            else if (frameElement instanceof FlexBoundary)
                this.parseFlexBoundary(frameElement);
            else if (frameElement instanceof FormattingSettings)
                throw new Error("Formattings are only allowed in the first position of a formatting frame.");
            else
                throw new Error("Element not allowed in formatting frame.");
        }
    }

    private parseFlexBoundary(flexBoundary: FlexBoundary)
    {
        // Basically we need to manage the boundaries...left of a boundary a Flexrange ends, right it starts,
        // and when we have a growth element that's an own range for itself;
        //
        // -----<truncator>][---<filler>---][<truncator>-----
        //
        const endingFlexRange = this.flexRanges.at(-1)!;
        let startingFlexRange = endingFlexRange.appendRange();

        if (flexBoundary.shrinkLeftContext)
            endingFlexRange.setTruncator(flexBoundary.shrinkLeftContext);

        if (flexBoundary.growthContext)
        {
            // A growth element gets its own FlexRange and an empty string to extend
            const growthRange = startingFlexRange;
            growthRange.filler = flexBoundary.growthContext;
            this.pushString("");
            startingFlexRange = startingFlexRange.appendRange();
        }

        if (flexBoundary.shrinkRightContext)
            startingFlexRange.setTruncator(flexBoundary.shrinkRightContext);
    }

    private pushString(value: string)
    {
        this.normalizedStrings.push(value);
        this.cumulativeStringLengths.push(this.unformattedWidth + textWidth(value));
    }

    private adjustWith(AdjustmentType: typeof Extension | typeof Truncation, remainingDifference: number)
    {
        const modifiedStrings = [...this.normalizedStrings];
        const adjustmentGroups = this.discoverPossibleAdjustmentsAndGroupByPriority(AdjustmentType);
        const sortedPriorities = [...adjustmentGroups.keys()].sort((a, b) => a - b);

        for (const adjustmentPriority of sortedPriorities)
        {
            const adjustmentGroup = adjustmentGroups.get(adjustmentPriority)!;
            if (adjustmentGroup.length === 1)
                remainingDifference -= adjustmentGroup[0].applyWidthDifference(modifiedStrings, remainingDifference);
            else
                remainingDifference -= this.adjustGroup(adjustmentGroup, modifiedStrings, remainingDifference);

            if (remainingDifference === 0) break;
        }

        return { remainingDifference, modifiedStrings };
    }

    private discoverPossibleAdjustmentsAndGroupByPriority(AdjustmentType: typeof Extension | typeof Truncation)
    {
        const adjustmentGroups = new Map<number, (Extension | Truncation)[]>();

        for (const range of this.flexRanges)
        {
            const adjustment = AdjustmentType.fromRangeIfCompatible(range);

            if (!adjustment) continue;

            const adjustmentGroup = adjustmentGroups.get(adjustment.priority);
            if (adjustmentGroup)
                adjustmentGroup.push(adjustment);
            else
                adjustmentGroups.set(adjustment.priority, [adjustment]);
        }

        return adjustmentGroups;
    }

    private adjustGroup(adjustments: Adjustment[], target: string[], amount: number): number
    {
        const { distribution } = distributeIntegerCapped(
            amount,
            adjustments.map(adjustment => adjustment.flexFactor),
            adjustments.map(adjustment => adjustment.capacity),
        );

        let adjustedAmount = 0;
        for (const [index, adjustment] of adjustments.entries())
            adjustedAmount += adjustment.applyWidthDifference(target, distribution[index]);

        return adjustedAmount;
    }

    private formatStrings(adjustedStrings: string[]): string
    {
        return this.formattingRanges
            .map(range => range.getFormattedString(adjustedStrings))
            .join("");
    }

    private forceTruncate(targetWidth: number, adjustmentResult: ReturnType<HorizontalLayout["adjustWith"]>, options: ForcedWidthOptions)
    {
        options.truncator = options.truncator?.slice(0, targetWidth) ?? DefaultTruncationMarker.slice(0, targetWidth);

        const currentWidth = targetWidth + adjustmentResult.remainingDifference;
        const truncatedStrings = options.truncate(adjustmentResult.modifiedStrings, currentWidth, targetWidth, options.truncator);

        return this.formatStrings(truncatedStrings);
    }

    private forceExtend(targetWidth: number, adjustmentResult: ReturnType<HorizontalLayout["adjustWith"]>, options: ForcedWidthOptions)
    {
        options.filler = options.filler ?? " ";

        return options.fill([this.formatStrings(adjustmentResult.modifiedStrings)], 0, adjustmentResult.remainingDifference, options.filler)[0];
    }
}

/** Contiguous fragment range shared by formatting and flexible layout concerns. */
export class Range<RangeType extends Range<RangeType>>
{
    /** Layout that owns this range. */
    readonly layout: HorizontalLayout;
    /** Next adjacent range, if any. */
    next?: RangeType;
    /** Index of this range's first text fragment. */
    startIndex: number;

    /**
     * Creates a range starting at the layout's current fragment position.
     *
     * @param layout - Owning horizontal layout.
     */
    constructor(layout: HorizontalLayout)
    {
        this.layout = layout;
        this.startIndex = layout.normalizedStrings.length;
    }

    /** Index immediately after this range's final text fragment. */
    get endIndex(): number
    {
        return this.next?.startIndex ?? this.layout.normalizedStrings.length;
    }

    /** Whether this range contains no text fragments. */
    get isEmpty(): boolean
    {
        return this.endIndex === this.startIndex;
    }

    /** Visible width of this range before adjustment. */
    get baseLength(): number
    {
        return this.layout.cumulativeStringLengths[this.endIndex] - this.layout.cumulativeStringLengths[this.startIndex];
    }

    /**
     * Links and records a following range.
     *
     * @param range - Range to append.
     * @param ranges - Owning range collection.
     * @returns The appended range.
     */
    protected append(range: RangeType, ranges: RangeType[]): RangeType
    {
        this.next = range;
        ranges.push(range);
        return range;
    }

    /**
     * Reuses this range when it is empty, otherwise appends a new one.
     *
     * @param ranges - Owning range collection.
     * @param createRange - Factory for a following range.
     * @returns This range or the appended range.
     */
    protected appendOrReuse(ranges: RangeType[], createRange: () => RangeType): this | RangeType
    {
        return this.isEmpty ? this : this.append(createRange(), ranges);
    }
}

/** Fragment range with one terminal formatting setting. */
export class FormattingRange extends Range<FormattingRange>
{
    /** Formatting applied to text in this range. */
    formatting: FormattingSettings;

    /**
     * Creates a formatted range.
     *
     * @param layout - Owning horizontal layout.
     * @param formatting - Formatting applied to this range.
     */
    constructor(layout: HorizontalLayout, formatting: FormattingSettings)
    {
        super(layout);
        this.formatting = formatting;
    }

    /**
     * Starts a following range using a formatting setting.
     *
     * @param formatting - Formatting for the following range.
     * @returns The reused or appended range.
     */
    appendRange(formatting: FormattingSettings): this | FormattingRange
    {
        const range = this.appendOrReuse(this.layout.formattingRanges, () => new FormattingRange(this.layout, formatting));
        range.formatting = formatting; // only changes anything when the current range was reused
        return range;
    }

    /**
     * Formats this range's slice of fragments.
     *
     * @param strings - All adjusted layout fragments.
     * @returns The formatted text for this range.
     */
    getFormattedString(strings: string[]): string
    {
        const text = strings.slice(this.startIndex, this.endIndex).join("");

        return text.length ? this.formatting.format(text) : "";
    }
}

/** Fragment range that may grow or truncate during width adjustment. */
export class FlexRange extends Range<FlexRange>
{
    /** Truncation context applied to this range, if any. */
    truncator?: ShrinkContext;
    /** Growth context applied to this range, if any. */
    filler?: GrowthContext;

    /** Maximum width this range can currently surrender. */
    get truncationCapacity(): number
    {
        if (!this.truncator) return 0;

        const preservedLength = this.truncator?.preserve ?? 0;
        return Math.max(0, this.baseLength - preservedLength);
    }

    /** Priority used when distributing truncation. */
    get contentImportance(): number
    {
        return this.truncator?.contentImportance ?? 0;
    }

    /**
     * Starts a following flexible range.
     *
     * @returns The reused or appended range.
     */
    appendRange(): this | FlexRange
    {
        return this.appendOrReuse(this.layout.flexRanges, () => new FlexRange(this.layout));
    }

    /**
     * Sets this range's truncation context.
     *
     * @param truncator - Context to use for truncation.
     */
    setTruncator(truncator: ShrinkContext)
    {
        if (this.truncator) throw new RangeError("A FlexRange can only have one truncator. Choose either shrinkLeft() or shrinkRight().");

        this.truncator = truncator;
    }

    /**
     * Grows this range in place.
     *
     * @param growthTarget - Fragments to modify.
     * @param growBy - Requested width to add.
     * @returns Width actually added.
     */
    grow(growthTarget: string[], growBy: number): number
    {
        const filler = this.filler!;
        const possibleGrowth = Math.min(growBy, filler.max ?? Infinity);

        growthTarget[this.startIndex] = filler.fill(possibleGrowth);

        return possibleGrowth;
    }

    /**
     * Truncates this range in place.
     *
     * @param truncationTarget - Fragments to modify.
     * @param truncateBy - Requested width to remove.
     * @returns Width actually removed.
     */
    truncate(truncationTarget: string[], truncateBy: number): number
    {
        const possibleTruncation = Math.min(truncateBy, this.truncationCapacity);
        if (possibleTruncation === 0) return 0;

        this.truncator!.shrink(truncationTarget, this.startIndex, this.endIndex, this.baseLength, possibleTruncation);

        return possibleTruncation;
    }
}

abstract class Adjustment
{
    readonly range: FlexRange;
    readonly priority: number;
    readonly flexFactor: number;
    readonly capacity: number;

    constructor(range: FlexRange, priority: number, flexFactor: number, capacity: number)
    {
        this.range = range;
        this.priority = priority;
        this.flexFactor = flexFactor;
        this.capacity = capacity;
    }

    abstract applyWidthDifference(target: string[], amount: number): number;
}

class Truncation extends Adjustment
{
    static fromRangeIfCompatible(range: FlexRange)
    {
        return range.truncationCapacity > 0 ? new Truncation(range) : undefined;
    }

    constructor(range: FlexRange)
    {
        super(range, range.contentImportance, range.truncator!.flexFactor, range.truncationCapacity);
    }

    applyWidthDifference(target: string[], amount: number)
    {
        return this.range.truncate(target, amount);
    }
}

class Extension extends Adjustment
{
    static fromRangeIfCompatible(range: FlexRange)
    {
        if (range.filler) return new Extension(range);
    }

    constructor(range: FlexRange)
    {
        super(range, -range.filler!.fillPriority, range.filler!.flexFactor, range.filler!.max);
    }

    applyWidthDifference(target: string[], amount: number)
    {
        return this.range.grow(target, amount);
    }
}
