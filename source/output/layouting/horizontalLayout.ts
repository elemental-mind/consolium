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
        throw new Error("Method not implemented.");
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
        throw new Error("Method not implemented.");
        return effectivelyRemovedCharCount;
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

    truncate(truncationTarget: string[], truncateBy: number)
    {
        const possibleTruncation = Math.min(truncateBy, this.truncationCapacity);
        if (possibleTruncation === 0) return 0;

        this.truncator!.shrink(truncationTarget, this.startIndex, this.endIndex, possibleTruncation);

        return possibleTruncation;
    }
}
