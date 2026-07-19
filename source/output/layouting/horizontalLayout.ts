import { FormattingSettings, type FormattingAPI } from "../formatting/formatting.ts";
import { FlexBoundary, type FlexAPI, type GrowthContext, type ShrinkContext } from "./flex.ts";

export type LineDefinition = LineElement[] | FormattingFrame;
export type LineElement = string | FormattingFrame | FlexAPI;
export type FormattingFrame = [style: FormattingAPI, ...LineElement[]];

export class HorizontalLayout
{
    readonly normalizedStrings: string[] = [];
    readonly stringLengths: number[] = [];
    readonly rawLength!: number;

    flexRanges: FlexRange[] = [];
    formattingRanges: FormattingRange[] = [];

    constructor(lineDefinition: LineDefinition)
    {
        this.flexRanges.push(new FlexRange(0));
        this.formattingRanges.push(new FormattingRange(0, FormattingSettings.None));
        this.parseFormattingFrame(lineDefinition, FormattingSettings.None);
    }

    computeString(targetLength: number): string
    {
        return "TODO";
    }

    private parseFormattingFrame(frame: LineDefinition, parentFormatting: FormattingSettings)
    {
        if (frame[0] instanceof FormattingSettings)
        {
            const formatting = FormattingSettings.fromMerged(parentFormatting, frame[0] as any as FormattingSettings);
            this.openFormattingRange(formatting);
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
                this.stringLengths.push(frameElement.length);
            }
            else if (Array.isArray(frameElement))
            {
                this.parseFormattingFrame(frameElement, formatting);
                if (this.formattingRanges.at(-1)!.formatting !== formatting)
                    this.formattingRanges.push(new FormattingRange(this.normalizedStrings.length, formatting));
            }
            else if (frameElement instanceof FlexBoundary)
                this.parseFlexBoundary(frameElement);
            else if (frameElement instanceof FormattingSettings)
                throw new Error("Formattings are only allowed in the first position of a formatting frame.");
            else
                throw new Error("Element not allowed in formatting frame.");
        }
    }

    private openFormattingRange(formatting: FormattingSettings)
    {
        const newRange = new FormattingRange(this.normalizedStrings.length, formatting);
        const previousRange = this.formattingRanges.at(-1)!;

        if (previousRange.startIndex === newRange.startIndex)
            this.formattingRanges.pop();

        this.formattingRanges.push(newRange);
    }

    private parseFlexBoundary(flexBoundary: FlexBoundary)
    {
        // Basically we need to manage the boundaries...left of a boundary a Flexrange ends, right it starts, 
        // and when we have a growth element that's an own range for itself;
        //
        // -----<truncator>][---<filler>---][<truncator>-----
        //
        const endingFlexRange = this.flexRanges.at(-1)!;
        let startingFlexRange = new FlexRange(this.normalizedStrings.length);

        if (endingFlexRange.startIndex === startingFlexRange.startIndex)
            startingFlexRange = endingFlexRange;
        else
            this.flexRanges.push(startingFlexRange);

        if (flexBoundary.shrinkLeftContext)
            endingFlexRange.rightTruncatorConfig = flexBoundary.shrinkLeftContext;

        if (flexBoundary.growthContext)
        {
            const growthRange = startingFlexRange;
            growthRange.filler = flexBoundary.growthContext;
            this.normalizedStrings.push("");
            this.stringLengths.push(0);
            startingFlexRange = new FlexRange(this.normalizedStrings.length);
            this.flexRanges.push(startingFlexRange);
        }

        if (flexBoundary.shrinkRightContext)
            startingFlexRange.leftTruncatorConfig = flexBoundary.shrinkRightContext;
    }
}

export class Range
{
    startIndex: number;

    constructor(startIndex: number)
    {
        this.startIndex = startIndex;
    }
}

export class FormattingRange extends Range
{
    readonly formatting: FormattingSettings;

    constructor(startIndex: number, formatting: FormattingSettings)
    {
        super(startIndex);
        this.formatting = formatting;
    }
}

export class FlexRange extends Range
{
    leftTruncatorConfig?: ShrinkContext;
    rightTruncatorConfig?: ShrinkContext;
    filler?: GrowthContext;
}
