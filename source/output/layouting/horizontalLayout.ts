import { distributeIntegerCapped } from "apportionium";
import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { FlexBoundary, type FlexAPI, type GrowthContext, type ShrinkContext } from "./flex.ts";

export type LineDefinition = LineElement[] | FormattingFrame;
export type LineElement = string | FormattingFrame | FlexAPI;
export type FormattingFrame = [style: FormattingAPI, ...LineElement[]];

export class HorizontalLayout
{
    normalizedStrings: string[] = [];
    cumulativeStringLengths: number[] = [0];

    flexRanges: FlexRange[] = [];
    formattingRanges: FormattingRange[] = [];

    constructor(lineDefinition: LineDefinition)
    {
        this.flexRanges.push(new FlexRange(this));
        this.formattingRanges.push(new FormattingRange(this, FormattingSettings.None));
        this.parseFormattingFrame(lineDefinition, FormattingSettings.None);
    }

    get unformattedWidth()
    {
        return this.cumulativeStringLengths.at(-1)!;
    }

    computeString(targetWidth: number, formatting = true): string
    {
        let adjustedStrings = this.normalizedStrings;
        const widthDifference = targetWidth - this.unformattedWidth;

        if (widthDifference < 0)
            adjustedStrings = this.adjustWith(Truncation, -widthDifference);
        else if (widthDifference > 0)
            adjustedStrings = this.adjustWith(Extension, widthDifference);

        return formatting
            ? this.formatStrings(adjustedStrings)
            : adjustedStrings.join("");
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
        this.cumulativeStringLengths.push(this.unformattedWidth + value.length);
    }

    private adjustWith(AdjustmentType: typeof Extension | typeof Truncation, difference: number): string[]
    {
        const modifiedStrings = [...this.normalizedStrings];
        const adjustmentGroups = this.discoverPossibleAdjustmentsAndGroupByPriority(AdjustmentType);
        const sortedPriorities = [...adjustmentGroups.keys()].sort((a, b) => a - b);

        for (const adjustmentPriority of sortedPriorities)
        {
            const adjustmentGroup = adjustmentGroups.get(adjustmentPriority)!;
            if (adjustmentGroup.length === 1)
                difference -= adjustmentGroup[0].apply(modifiedStrings, difference);
            else
                difference -= this.adjustGroup(adjustmentGroup, modifiedStrings, difference);

            if (difference === 0) break;
        }

        return modifiedStrings;
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
            adjustedAmount += adjustment.apply(target, distribution[index]);

        return adjustedAmount;
    }

    private formatStrings(adjustedStrings: string[]): string
    {
        return this.formattingRanges
            .map(range => range.getFormattedString(adjustedStrings))
            .join("");
    }
}

export class Range<RangeType extends Range<RangeType>>
{
    readonly layout: HorizontalLayout;
    next?: RangeType;
    startIndex: number;

    constructor(layout: HorizontalLayout)
    {
        this.layout = layout;
        this.startIndex = layout.normalizedStrings.length;
    }

    get endIndex()
    {
        return this.next?.startIndex ?? this.layout.normalizedStrings.length;
    }

    get isEmpty()
    {
        return this.endIndex === this.startIndex;
    }

    get baseLength()
    {
        return this.layout.cumulativeStringLengths[this.endIndex] - this.layout.cumulativeStringLengths[this.startIndex];
    }

    protected append(range: RangeType, ranges: RangeType[])
    {
        this.next = range;
        ranges.push(range);
        return range;
    }

    /** Reuses this range when it is still empty, otherwise links in a new range created by the factory. */
    protected appendOrReuse(ranges: RangeType[], createRange: () => RangeType)
    {
        return this.isEmpty ? this : this.append(createRange(), ranges);
    }
}

export class FormattingRange extends Range<FormattingRange>
{
    formatting: FormattingSettings;

    constructor(layout: HorizontalLayout, formatting: FormattingSettings)
    {
        super(layout);
        this.formatting = formatting;
    }

    appendRange(formatting: FormattingSettings)
    {
        const range = this.appendOrReuse(this.layout.formattingRanges, () => new FormattingRange(this.layout, formatting));
        range.formatting = formatting; // only changes anything when the current range was reused
        return range;
    }

    getFormattedString(strings: string[])
    {
        const text = strings.slice(this.startIndex, this.endIndex).join("");

        return text.length ? this.formatting.format(text) : "";
    }
}

export class FlexRange extends Range<FlexRange>
{
    truncator?: ShrinkContext;
    filler?: GrowthContext;

    get truncationCapacity()
    {
        if (!this.truncator) return 0;

        const preservedLength = this.truncator?.preserve ?? 0;
        return Math.max(0, this.baseLength - preservedLength);
    }

    get contentImportance()
    {
        return this.truncator?.contentImportance ?? 0;
    }

    appendRange()
    {
        return this.appendOrReuse(this.layout.flexRanges, () => new FlexRange(this.layout));
    }

    setTruncator(truncator: ShrinkContext)
    {
        if (this.truncator) throw new RangeError("A FlexRange can only have one truncator. Choose either shrinkLeft() or shrinkRight().");

        this.truncator = truncator;
    }

    grow(growthTarget: string[], growBy: number)
    {
        const filler = this.filler!;
        const possibleGrowth = Math.min(growBy, filler.max ?? Infinity);

        growthTarget[this.startIndex] = filler.fill(possibleGrowth);

        return possibleGrowth;
    }

    truncate(truncationTarget: string[], truncateBy: number)
    {
        const possibleTruncation = Math.min(truncateBy, this.truncationCapacity);
        if (possibleTruncation === 0) return 0;

        this.truncator!.shrink(truncationTarget, this.startIndex, this.endIndex, possibleTruncation);

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

    abstract apply(target: string[], amount: number): number;
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

    apply(target: string[], amount: number)
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

    apply(target: string[], amount: number)
    {
        return this.range.grow(target, amount);
    }
}
