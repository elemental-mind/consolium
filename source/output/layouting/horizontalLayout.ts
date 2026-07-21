import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { FlexBoundary, type FlexAPI, type GrowthContext, type ShrinkContext } from "./flex.ts";

export type LineDefinition = LineElement[] | FormattingFrame;
export type LineElement = string | FormattingFrame | FlexAPI;
export type FormattingFrame = [style: FormattingAPI, ...LineElement[]];

interface FlexAdjustment
{
    priorityOf(range: FlexRange): number | undefined;
    highestPriorityFirst: boolean;
    flexFactorOf(range: FlexRange): number;
    capacityOf(range: FlexRange): number | undefined;
    apply(range: FlexRange, target: string[], amount: number): number;
}

const shrinkAdjustment: FlexAdjustment = {
    priorityOf: range => range.truncator ? range.contentImportance : undefined,
    highestPriorityFirst: false,
    flexFactorOf: range => range.truncator!.flexFactor,
    capacityOf: range => range.truncationCapacity,
    apply: (range, target, amount) => range.truncate(target, amount),
};

const growAdjustment: FlexAdjustment = {
    priorityOf: range => range.filler?.fillPriority,
    highestPriorityFirst: true,
    flexFactorOf: range => range.filler!.flexFactor,
    capacityOf: range => range.filler!.max,
    apply: (range, target, amount) => range.grow(target, amount),
};

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

        if (this.unformattedWidth < targetWidth)
            adjustedStrings = this.growToSize(targetWidth);
        else if (this.unformattedWidth > targetWidth)
            adjustedStrings = this.shrinkToSize(targetWidth);

        return this.formatStrings(adjustedStrings);
    }

    private shrinkToSize(targetLength: number): string[]
    {
        return this.adjustToSize(shrinkAdjustment, this.unformattedWidth - targetLength);
    }

    private growToSize(targetLength: number): string[]
    {
        return this.adjustToSize(growAdjustment, targetLength - this.unformattedWidth);
    }

    private adjustToSize(adjustment: FlexAdjustment, amount: number): string[]
    {
        const adjustmentTarget = [...this.normalizedStrings];
        let remaining = amount;

        for (const ranges of this.groupFlexRanges(adjustment))
        {
            remaining -= ranges.length === 1
                ? adjustment.apply(ranges[0], adjustmentTarget, remaining)
                : this.distributeAcross(ranges, adjustmentTarget, remaining, adjustment);

            if (remaining === 0) break;
        }

        return adjustmentTarget;
    }

    /** Groups the participating flex ranges by priority, in the order in which the adjustment consumes them. */
    private groupFlexRanges(adjustment: FlexAdjustment): FlexRange[][]
    {
        const rangesByPriority = new Map<number, FlexRange[]>();

        for (const range of this.flexRanges)
        {
            const priority = adjustment.priorityOf(range);
            if (priority === undefined) continue;

            const group = rangesByPriority.get(priority);
            if (group) group.push(range);
            else rangesByPriority.set(priority, [range]);
        }

        const direction = adjustment.highestPriorityFirst ? -1 : 1;

        return [...rangesByPriority.entries()]
            .sort(([priorityA], [priorityB]) => direction * (priorityA - priorityB))
            .map(([, ranges]) => ranges);
    }

    private distributeAcross(ranges: FlexRange[], target: string[], amount: number, adjustment: FlexAdjustment): number
    {
        const distribution = this.distributeCapped(
            amount,
            ranges.map(adjustment.flexFactorOf),
            ranges.map(adjustment.capacityOf));

        let appliedAmount = 0;
        for (const [index, range] of ranges.entries())
            appliedAmount += adjustment.apply(range, target, distribution[index]);

        return appliedAmount;
    }

    /**
     * Distributes an amount as integers proportional to the given flex factors.
     * Shares are capped at the matching capacity (undefined = uncapped) and the
     * excess of capped shares is redistributed among the ranges that can still flex.
     */
    private distributeCapped(amount: number, factors: number[], capacities: (number | undefined)[]): number[]
    {
        const distribution = factors.map(() => 0);
        const remainingFactors = [...factors];
        const activeIndices = new Set<number>();

        for (const [index, factor] of factors.entries())
        {
            const capacity = capacities[index];

            if (factor > 0 && (capacity === undefined || capacity > 0))
                activeIndices.add(index);
            else
                remainingFactors[index] = 0;
        }

        let remaining = amount;

        // Allocate by flex factor. Whenever a range reaches its capacity, its
        // excess share is redistributed in the next round.
        while (remaining > 0 && activeIndices.size > 0)
        {
            const shares = this.distributeInteger(remaining, remainingFactors);
            remaining = 0;

            for (const index of activeIndices)
            {
                const capacity = capacities[index];
                const newShare = distribution[index] + shares[index];

                if (capacity !== undefined && newShare >= capacity)
                {
                    distribution[index] = capacity;
                    remaining += newShare - capacity;
                    remainingFactors[index] = 0;
                    activeIndices.delete(index);
                }
                else
                    distribution[index] = newShare;
            }
        }

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