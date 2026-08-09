import { gray } from "../style.ts";
import { Flex } from "./flex.ts";
import type { LineDefinition } from "./horizontalLayout.ts";

/** A single structured terminal line understood by the layout engines. */
export type TerminalLine = string | LineDefinition;

/** Determines whether the final content line is aligned to the viewport bottom or may overscroll to its top. */
export type VerticalLayoutScrollMode = "scroll" | "overscroll";

/**
 * Optional replacements for the conditional indicators at the edges of a
 * scrollable viewport. Provide a custom line for either side; omitted sides
 * are hidden.
 */
export interface ScrollMarkerOptions
{
    /** Line shown when content exists above the current viewport, omit to hide it. */
    readonly top?: TerminalLine;
    /** Line shown when content exists below the current viewport, omit to hide it. */
    readonly bottom?: TerminalLine;
}

/** Initial sections and scrolling behaviour for a vertical layout. */
export interface VerticalLayoutOptions
{
    /** Lines fixed to the top of the viewport. */
    readonly header?: readonly TerminalLine[];
    /** Scrollable lines between the fixed sections. */
    readonly content?: readonly TerminalLine[];
    /** Lines fixed to the bottom of the viewport. */
    readonly footer?: readonly TerminalLine[];
    /** Initial non-negative scroll offset into the content. */
    readonly scrollOffset?: number;
    /** Whether scrolling stops at the bottom or allows the last line at the top. */
    readonly scrollMode?: VerticalLayoutScrollMode;
    /**
     * Conditional scroll indicators. Omit this option or use `true` for the
     * default centered indicators, `false` to disable them, or an object to
     * replace individual sides (an omitted side is hidden).
     */
    readonly scrollMarkers?: ScrollMarkerOptions | boolean;
}

/**
 * Selects the lines visible in a terminal viewport while keeping header and
 * footer sections fixed at its edges. Rendering and cursor movement belong to
 * Terminal; this class only owns vertical layout state.
 */
export class VerticalLayout
{
    /** Lines fixed at the top of the viewport. These may be updated after construction. */
    header: TerminalLine[];
    /** Scrollable content lines. These may be updated after construction. */
    content: TerminalLine[];
    /** Lines fixed at the bottom of the viewport. These may be updated after construction. */
    footer: TerminalLine[];

    readonly scrollMode: VerticalLayoutScrollMode;
    /** Effective scroll indicator settings, or `undefined` when indicators are disabled. */
    readonly scrollMarkers?: ScrollMarkerOptions;

    private currentScrollOffset = 0;
    private lastScrollSectionHeight = 1;
    private visibleContentStart = 0;
    private visibleContentEnd = 0;

    /**
     * Creates a vertical layout with optional fixed sections and scrollable content.
     *
     * @example
     * new VerticalLayout({ content: ["first", "second"] });
     * new VerticalLayout({ content: items, scrollMarkers: { top: "More above" } });
     */
    constructor(options: VerticalLayoutOptions = {})
    {
        this.header = [...(options.header ?? [])];
        this.content = [...(options.content ?? [])];
        this.footer = [...(options.footer ?? [])];
        this.scrollMode = options.scrollMode === "overscroll" ? "overscroll" : "scroll";

        if (options.scrollMarkers === true || options.scrollMarkers === undefined)
            this.scrollMarkers = {
                top: [gray, Flex.grow(" "), "↑ Scroll for more ↑", Flex.grow(" ")],
                bottom: [gray, Flex.grow(" "), "↓ Scroll for more ↓", Flex.grow(" ")],
            };
        else if (options.scrollMarkers === false)
            this.scrollMarkers = undefined;
        else
            this.scrollMarkers = options.scrollMarkers;

        this.scrollOffset = options.scrollOffset ?? 0;
    }

    /** Current non-negative integer scroll offset into `content`. */
    get scrollOffset(): number
    {
        return this.currentScrollOffset;
    }

    set scrollOffset(value: number)
    {
        this.currentScrollOffset = Math.min(this.getMaxScrollOffset(this.lastScrollSectionHeight), Math.max(0, value));
    }

    /** Moves the scroll offset by an amount. Negative values scroll upward. */
    scrollBy(amount: number): this
    {
        this.scrollOffset += amount;
        return this;
    }

    /** Moves to the first content line. */
    scrollTop(): this
    {
        this.currentScrollOffset = 0;
        return this;
    }

    /** Moves to the bottom using the most recently computed scroll-section height. */
    scrollBottom(): this
    {
        this.currentScrollOffset = this.getMaxScrollOffset(this.lastScrollSectionHeight);
        return this;
    }

    /** Moves to the page after or before the content seen in the latest render. */
    scrollPage(direction: 1 | -1): this
    {
        this.scrollOffset += (this.visibleContentEnd - this.visibleContentStart) * direction;
        return this;
    }

    /** Selects exactly the requested viewport-height lines. */
    computeLines(height: number): readonly TerminalLine[]
    {
        // When fixed sections exceed the viewport, preserve the footer at the
        // bottom and fill the remaining rows with the beginning of the header.
        const footer = this.footer.slice(Math.max(0, this.footer.length - height));
        const header = this.header.slice(0, Math.max(0, height - footer.length));

        const scrollSectionHeight = height - header.length - footer.length;
        this.lastScrollSectionHeight = scrollSectionHeight;

        this.scrollOffset = this.currentScrollOffset;

        const content = this.computeScrollContainer(scrollSectionHeight);

        return [...header, ...content, ...footer];
    }

    private computeScrollContainer(scrollSectionHeight: number): TerminalLine[]
    {
        const content = this.content.slice(this.currentScrollOffset, this.currentScrollOffset + scrollSectionHeight);

        //We suppress scroll markers for really tiny windows as they would eat too much space.
        const scrollMarkersSupressed = scrollSectionHeight < 3;

        const showTopMarker = !scrollMarkersSupressed && this.scrollMarkers?.top && this.currentScrollOffset > 0 && content.length > 1;
        const showBottomMarker = !scrollMarkersSupressed && this.scrollMarkers?.bottom && this.currentScrollOffset + scrollSectionHeight < this.content.length;

        this.visibleContentStart = this.currentScrollOffset + Number(showTopMarker);
        this.visibleContentEnd = Math.min(this.content.length, this.currentScrollOffset + scrollSectionHeight - Number(showBottomMarker));

        let fillerLineCount = scrollSectionHeight - content.length;
        if (fillerLineCount) while (fillerLineCount--) content.push("");

        if (showTopMarker) content[0] = this.scrollMarkers!.top!;
        if (showBottomMarker) content[scrollSectionHeight - 1] = this.scrollMarkers!.bottom!;

        return content;
    }

    private getMaxScrollOffset(scrollSectionHeight: number): number
    {
        if (scrollSectionHeight <= 0 || this.content.length === 0) return 0;
        if (this.scrollMode === "overscroll") return this.content.length - 1;
        return Math.max(0, this.content.length - scrollSectionHeight);
    }
}
