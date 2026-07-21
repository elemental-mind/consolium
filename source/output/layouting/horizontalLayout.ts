import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { FlexBoundary, type FlexAPI, type GrowthContext, type ShrinkContext } from "./flex.ts";

export type LineDefinition = LineElement[] | FormattingFrame;
export type LineElement = string | FormattingFrame | FlexAPI;
export type FormattingFrame = [style: FormattingAPI, ...LineElement[]];

abstract class FlexAdjustment
{
    readonly range: FlexRange;

    constructor(range: FlexRange)
    {
        this.range = range;
    }

    abstract get priority(): number;
    abstract get flexFactor(): number;
    abstract get capacity(): number;
    abstract apply(target: string[], amount: number): number;
}

interface FlexAdjustmentConstructor
{
    new(range: FlexRange): FlexAdjustment;
    sortByPriority(ranges: FlexRange[]): FlexRange[];
}

class ShrinkAdjustment extends FlexAdjustment
{
    static sortByPriority(ranges: FlexRange[]) { return ranges.toSorted((left, right) => left.contentImportance - right.contentImportance); }

    get priority() { return this.range.contentImportance; }
    get flexFactor() { return this.range.truncator!.flexFactor; }
    get capacity() { return this.range.truncationCapacity; }
    apply(target: string[], amount: number) { return this.range.truncate(target, amount); }
}

class GrowAdjustment extends FlexAdjustment
{
    static sortByPriority(ranges: FlexRange[]) { return ranges.toSorted((left, right) => (right.filler?.fillPriority ?? 0) - (left.filler?.fillPriority ?? 0)); }

    get priority() { return this.range.filler!.fillPriority; }
    get flexFactor() { return this.range.filler!.flexFactor; }
    get capacity() { return this.range.filler!.max; }
    apply(target: string[], amount: number) { return this.range.grow(target, amount); }
}

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

    computeString(targetWidth: number): string
    {
        let adjustedStrings = this.normalizedStrings;
        const widthDifference = targetWidth - this.unformattedWidth;

        if (widthDifference)
            adjustedStrings = this.adjustBy(widthDifference);

        return this.formatStrings(adjustedStrings);
    }

    private adjustBy(difference: number): string[]
    {
        const adjustmentTarget = [...this.normalizedStrings];

        const Adjustment = difference < 0 ? ShrinkAdjustment : GrowAdjustment;
        let remainingAdjustment = Math.abs(difference);

        for (const adjustmentGroup of this.prioritySortedAndGroupedAdjustments(Adjustment))
        {
            if (adjustmentGroup.length === 1)
                remainingAdjustment -= adjustmentGroup[0].apply(adjustmentTarget, remainingAdjustment);
            else
                remainingAdjustment -= this.adjustGroup(adjustmentGroup, adjustmentTarget, remainingAdjustment);

            if (remainingAdjustment === 0) break;
        }

        return adjustmentTarget;
    }

    /** Groups the participating flex adjustments by priority, in the order in which they consume space. */
    private prioritySortedAndGroupedAdjustments(Adjustment: FlexAdjustmentConstructor): FlexAdjustment[][]
    {
        const adjustmentsGroupedByPriority = new Map<number, FlexAdjustment[]>();

        for (const range of Adjustment.sortByPriority(this.flexRanges))
        {
            const adjustment = new Adjustment(range);
            const priority = adjustment.priority;

            const group = adjustmentsGroupedByPriority.get(priority);
            if (group) group.push(adjustment); else adjustmentsGroupedByPriority.set(priority, [adjustment]);
        }

        return [...adjustmentsGroupedByPriority.values()];
    }

    private adjustGroup(adjustments: FlexAdjustment[], target: string[], amount: number): number
    {
        const distribution = this.distributeCapped(amount, adjustments);

        let appliedAmount = 0;
        for (const [index, adjustment] of adjustments.entries())
            appliedAmount += adjustment.apply(target, distribution[index]);

        return appliedAmount;
    }

    /**
     * Distributes an amount as integers proportional to the adjustments' flex factors.
     * Shares are capped at each adjustment's capacity (undefined = uncapped) and the
     * excess of capped shares is redistributed among the ranges that can still flex.
     */
    private distributeCapped(amount: number, adjustments: FlexAdjustment[]): number[]
    {
        const distribution: number[] = [];
        const distributionFactors: number[] = [];
        const indicesOfRangesWithCapacity = new Set<number>();

        for (const [index, adjustment] of adjustments.entries())
        {
            distribution.push(0);

            if (adjustment.capacity)
            {
                distributionFactors.push(adjustment.flexFactor);
                indicesOfRangesWithCapacity.add(index);
            }
            else
                distributionFactors.push(0);
        }

        // Allocate by flex factor. Whenever a range reaches its capacity, its
        // excess share is redistributed in the next round.
        while (amount && indicesOfRangesWithCapacity.size)
        {
            const shares = this.distributeInteger(amount, distributionFactors);

            amount = 0;

            for (const index of indicesOfRangesWithCapacity)
            {
                const capacity = adjustments[index].capacity;
                const assignment = distribution[index] + shares[index];

                if (assignment >= capacity)
                {
                    distribution[index] = capacity;
                    amount += assignment - capacity;
                    indicesOfRangesWithCapacity.delete(index);
                    distributionFactors[index] = 0;
                }
                else
                    distribution[index] = assignment;
            }
        }

        return distribution;
    }

    private distributeInteger(amount: number, factors: number[]): number[]
    {
        let total = 0;
        for (const factor of factors) total += factor;

        const distribution: number[] = [];
        const roundingErrors: number[] = [];
        const indices: number[] = [];

        let remainingToDistribute = amount;
        for (let index = 0; index < factors.length; index++)
        {
            const idealAttribution = factors[index] * amount / total;
            const actualAttribution = Math.floor(idealAttribution);

            distribution.push(actualAttribution);
            roundingErrors.push(idealAttribution - actualAttribution);
            indices.push(index);

            remainingToDistribute -= actualAttribution;
        }

        // We sort by remainder size - but only keep track of indices
        indices.sort((leftIndex, rightIndex) => roundingErrors[rightIndex] - roundingErrors[leftIndex]);

        // We might have an integer amount left to be distributed.
        // The candidates with the biggest errors each get one added until the remainder is exhausted.
        for (let index = 0; index < remainingToDistribute; index++)
            distribution[indices[index]]++;

        return distribution;
    }

    private formatStrings(adjustedStrings: string[]): string
    {
        return this.formattingRanges
            .map(range => range.getFormattedString(adjustedStrings))
            .join("");
    }

    private parseFormattingFrame(frame: LineDefinition, parentFormatting: FormattingSettings)
    {
        if (frame[0] instanceof FormattingSettings)
        {
            const formatting = FormattingSettings.fromMerged(parentFormatting, frame[0] as any as FormattingSettings);
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
