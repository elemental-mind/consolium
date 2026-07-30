import type { LineDefinition } from "./horizontalLayout.ts";

/** A single structured terminal line understood by the layout engines. */
export type TerminalLine = string | LineDefinition;

export interface VerticalLayoutOptions
{
    readonly header?: readonly TerminalLine[];
    readonly footer?: readonly TerminalLine[];
    readonly scrollOffset?: number;
}

/**
 * Selects the lines visible in a terminal viewport while keeping header and
 * footer sections fixed at its edges. Rendering and cursor movement belong to
 * Terminal; this class only owns vertical layout state.
 */
export class VerticalLayout
{
    readonly header: readonly TerminalLine[];
    readonly content: readonly TerminalLine[];
    readonly footer: readonly TerminalLine[];

    private currentScrollOffset = 0;

    constructor(content: readonly TerminalLine[], options: VerticalLayoutOptions = {})
    {
        this.header = options.header ?? [];
        this.content = content;
        this.footer = options.footer ?? [];
        this.scrollOffset = options.scrollOffset ?? 0;
    }

    get scrollOffset() { return this.currentScrollOffset; }
    set scrollOffset(value: number)
    {
        this.currentScrollOffset = Math.max(0, Math.trunc(value));
    }

    scrollBy(amount: number): this
    {
        this.scrollOffset += amount;
        return this;
    }

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
