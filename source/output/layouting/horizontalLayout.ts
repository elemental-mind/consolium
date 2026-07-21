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

    computeString(targetWidth: number): string
    {
        let adjustedStrings = this.normalizedStrings;

        if (this.unformattedWidth < targetWidth)
            adjustedStrings = this.growToSize(targetWidth);
        else if (this.unformattedWidth > targetWidth)
            adjustedStrings = this.shrinkToSize(targetWidth);

        return this.formatStrings(adjustedStrings);
    }

    private shrinkToSize(targetLength: number)
    {
        let truncationLength = this.unformattedWidth - targetLength;

        const truncatorMap = new Map<number, FlexRange[]>();
        for (const range of this.flexRanges)
            if (range.truncator)
                truncatorMap.get(range.contentImportance)?.push(range) ?? truncatorMap.set(range.contentImportance, [range]);

        const truncatablesImportanceSorted = [...truncatorMap.entries()].sort((entry1, entry2) => entry1[0] - entry2[0]).map(([importance, ranges]) => ranges);

        const truncationTarget = [...this.normalizedStrings];
        for (const ranges of truncatablesImportanceSorted)
        {
            if (ranges.length === 1)
                truncationLength -= ranges[0].truncate(truncationTarget, truncationLength);
            else
                truncationLength -= this.distributeTruncation(ranges, truncationTarget, truncationLength);

            if (truncationLength === 0) break;
        }

        return truncationTarget;
    }

    private growToSize(targetLength: number): string[]
    {
        let remainingGrowth = targetLength - this.unformattedWidth;
        const fillTarget = [...this.normalizedStrings];

        const fillersByPriority = new Map<number, FlexRange[]>();
        for (const range of this.flexRanges)
            if (range.filler)
                fillersByPriority.get(range.filler.fillPriority)?.push(range) ?? fillersByPriority.set(range.filler.fillPriority, [range]);

        const priorityGroups = [...fillersByPriority.entries()].sort(([priority1], [priority2]) => priority2 - priority1).map(([priority, ranges]) => ranges);

        for (const ranges of priorityGroups)
        {
            if (ranges.length === 1)
            {
                const range = ranges[0];
                const lengthToAdd = range.filler!.max ? Math.min(range.filler!.max!, remainingGrowth) : remainingGrowth;

                fillTarget[range.startIndex] = range.filler!.fill(lengthToAdd);
                remainingGrowth -= lengthToAdd;
            }
            else
                remainingGrowth -= this.distributeGrowth(fillTarget, ranges, remainingGrowth);

            if (remainingGrowth === 0) break;
        }

        return fillTarget;
    }

    private formatStrings(adjustedStrings: string[]): string
    {
        const formattingChunks = [];

        for (const range of this.formattingRanges)
            formattingChunks.push(range.getFormattedString(adjustedStrings));

        return formattingChunks.join("");
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
                this.normalizedStrings.push(frameElement);
                this.cumulativeStringLengths.push(this.unformattedWidth + frameElement.length);
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
            this.normalizedStrings.push("");
            this.cumulativeStringLengths.push(this.unformattedWidth);
            startingFlexRange = startingFlexRange.appendRange();
        }

        if (flexBoundary.shrinkRightContext)
            startingFlexRange.setTruncator(flexBoundary.shrinkRightContext);
    }

    private distributeTruncation(ranges: FlexRange[], truncationTarget: string[], truncationLength: number)
    {
        const factors = ranges.map(range => range.truncator!.flexFactor);
        const distribution = ranges.map(() => 0);
        const activeRangeIndices = new Set<number>();

        let totalCapacity = 0;
        for (const [index, range] of ranges.entries())
        {
            totalCapacity += range.truncationCapacity;
            if (range.truncationCapacity > 0)
                activeRangeIndices.add(index);
            else
                factors[index] = 0;
        }

        let remainingTruncation = Math.min(truncationLength, totalCapacity);

        // Allocate by flex factor. If a range reaches its preservation limit,
        // redistribute its excess share among the ranges that can still shrink.
        while (remainingTruncation > 0 && activeRangeIndices.size > 0)
        {
            const shares = this.distributeInteger(remainingTruncation, factors);
            remainingTruncation = 0;

            for (const index of activeRangeIndices)
            {
                const rangeCapacity = ranges[index].truncationCapacity;
                const newAttribution = distribution[index] + shares[index];

                if (newAttribution >= rangeCapacity)
                {
                    distribution[index] = rangeCapacity;
                    remainingTruncation += newAttribution - rangeCapacity;
                    activeRangeIndices.delete(index);
                    factors[index] = 0;
                }
                else
                    distribution[index] = newAttribution;
            }
        }

        let effectivelyRemovedCharCount = 0;
        for (const [index, range] of ranges.entries())
            effectivelyRemovedCharCount += range.truncate(truncationTarget, distribution[index]);

        return effectivelyRemovedCharCount;
    }

    private distributeGrowth(fillTarget: string[], ranges: FlexRange[], remainingGrowth: number)
    {
        const factors: number[] = [];
        const distribution: number[] = [];
        const cappedRangeIndices = new Set<number>();
        let allRangesCapped = false;

        for (const [index, range] of ranges.entries())
        {
            const filler = range.filler!;
            factors.push(filler.flexFactor);
            if (filler.max) cappedRangeIndices.add(index);
        }

        if (cappedRangeIndices.size === ranges.length)
            allRangesCapped = true;

        //We iterate multiple times by filling the distribution, then capping it at maxes - then iterating again with the excess sum until
        //there is nothing to distribute anymore or all values are capped.
        //the second part is a special case. When all ranges were capped, but none are left to fill we abort and report the remaining growth back to the caller.
        while (remainingGrowth && !(allRangesCapped && cappedRangeIndices.size === 0))
        {
            for (const [index, difference] of this.distributeInteger(remainingGrowth, factors).entries())
                distribution[index] += difference;
            remainingGrowth = 0;

            if (cappedRangeIndices.size)
            {
                //If we have capped value indices left, we need to check whether the updated distribution exceeds them
                for (const index of cappedRangeIndices)
                {
                    const attributedValue = distribution[index];
                    const maxValue = ranges[index].filler!.max!;

                    if (attributedValue > maxValue)
                    {
                        //If we exceed the capacity of a range we ...
                        //... don't come back to check the cap in the next round
                        cappedRangeIndices.delete(index);
                        //... stop allocating growth to it
                        factors[index] = 0;
                        //... cap it
                        distribution[index] = maxValue;
                        //... and add the excess to be redistributed in the next round
                        remainingGrowth += attributedValue - maxValue;
                    }
                }
            }
        }

        for (const [index, range] of ranges.entries())
            range.grow(fillTarget, distribution[index]);

        return remainingGrowth;
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

        // We might have an integer amount left to be dsitributed. 
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
        if (this.endIndex === this.startIndex)
        {
            this.formatting = formatting;
            return this;
        }

        return this.append(new FormattingRange(this.layout, formatting), this.layout.formattingRanges);
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
        if (this.endIndex === this.startIndex)
            return this;

        return this.append(new FlexRange(this.layout), this.layout.flexRanges);
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
