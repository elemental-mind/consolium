import type { LineDefinition } from "./horizontalLayout.ts";

/** A single structured terminal line understood by the layout engines. */
export type TerminalLine = string | LineDefinition;

/** Options for fixed sections and the initial scroll position of a vertical layout. */
export interface VerticalLayoutOptions
{
    /** Lines fixed to the top of the viewport. */
    readonly header?: readonly TerminalLine[];
    /** Lines fixed to the bottom of the viewport. */
    readonly footer?: readonly TerminalLine[];
    /** Initial non-negative scroll offset into the content. */
    readonly scrollOffset?: number;
}

/**
 * Selects the lines visible in a terminal viewport while keeping header and
 * footer sections fixed at its edges. Rendering and cursor movement belong to
 * Terminal; this class only owns vertical layout state.
 */
export class VerticalLayout
{
    /** Lines fixed at the top of the viewport. */
    readonly header: readonly TerminalLine[];
    /** Scrollable content lines. */
    readonly content: readonly TerminalLine[];
    /** Lines fixed at the bottom of the viewport. */
    readonly footer: readonly TerminalLine[];

    private currentScrollOffset = 0;

    /**
     * Creates a vertical layout.
     * @param content Scrollable lines.
     * @param options Fixed sections and optional initial scroll offset.
     * @example
     * new VerticalLayout(["plain", [Formatting.bold, "formatted"]]);
     */
    constructor(content: readonly TerminalLine[], options: VerticalLayoutOptions = {})
    {
        this.header = options.header ?? [];
        this.content = content;
        this.footer = options.footer ?? [];
        this.scrollOffset = options.scrollOffset ?? 0;
    }

    /** Current non-negative scroll offset into `content`. */
    get scrollOffset(): number { return this.currentScrollOffset; }
    /**
     * Sets the non-negative scroll offset, truncating fractional values.
     *
     * @param value - Requested offset.
     */
    set scrollOffset(value: number)
    {
        this.currentScrollOffset = Math.max(0, Math.trunc(value));
    }

    /**
     * Moves the scroll offset by an amount.
     *
     * @param amount - Rows to move; negative values scroll upward.
     * @returns This layout.
     */
    scrollBy(amount: number): this
    {
        this.scrollOffset += amount;
        return this;
    }

    /**
     * Selects the lines visible at a viewport height.
     *
     * @param height - Number of terminal rows.
     * @returns Fixed lines, visible content, and blank padding.
     */
    computeLines(height: number): readonly TerminalLine[]
    {
        const contentHeight = this.getContentViewportHeight(height);
        this.currentScrollOffset = Math.min(this.currentScrollOffset, this.getMaxScrollOffset(height));

        const { header, footer } = this.getVisibleFixedSections(height);
        const content = this.content.slice(this.currentScrollOffset, this.currentScrollOffset + contentHeight);
        const spacing = Array<TerminalLine>(contentHeight - content.length).fill("");

        return [...header, ...content, ...spacing, ...footer];
    }

    private getContentViewportHeight(height: number): number
    {
        const { header, footer } = this.getVisibleFixedSections(height);
        return height - header.length - footer.length;
    }

    private getVisibleFixedSections(height: number)
    {
        // When fixed sections exceed the viewport, preserve the footer at the
        // bottom and fill the remaining rows with the beginning of the header.
        const footer = this.footer.slice(Math.max(0, this.footer.length - height));
        const header = this.header.slice(0, Math.max(0, height - footer.length));
        return { header, footer };
    }

    private getMaxScrollOffset(viewportHeight: number)
    {
        return Math.max(0, this.content.length - this.getContentViewportHeight(viewportHeight));
    }
}
