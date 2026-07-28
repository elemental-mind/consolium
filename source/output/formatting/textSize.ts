const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

// \p{...} matches characters belonging to the named Unicode property.
const isZeroWidthCharacter = /^[\p{Mark}\p{Control}\p{Format}]+$/u;
// VS16 (\uFE0F) requests emoji-style presentation; U+20E3 completes an emoji keycap sequence
const isEmojiCharacter = /[\p{Emoji_Presentation}\uFE0F\u20E3]/u;
// Matches one printable ASCII character: U+0020 (space) through U+007E (~), inclusive.
const isNormalCharacter = /^[\x20-\x7E]$/;

const onlyNormalCharacters = /^[\x20-\x7E]*$/;

export function textWidth(text: string): number
{
    if (text === "")
        return 0;
    if (onlyNormalCharacters.test(text))
        return text.length;

    let width = 0;
    for (const { segment } of graphemeSegmenter.segment(text))
        width += graphemeWidth(segment);

    return width;
}

/**
 * Truncates complete graphemes from the start, retaining targetContentWidth columns
 * of content and prefixing a truncator when truncation occurs.
 */
export function truncateTextStart(text: string, currentWidth: number, targetContentWidth: number, truncator = ""): string
{
    if (targetContentWidth < 0)
        return truncator;
    if (targetContentWidth === 0)
        return currentWidth > 0 ? truncator : "";
    if (currentWidth <= targetContentWidth)
        return text;

    if (onlyNormalCharacters.test(text))
        return truncator + text.slice(text.length - targetContentWidth);

    const truncationThreshold = currentWidth - targetContentWidth;
    let truncatedContentWidth = 0;
    for (const { segment, index } of graphemeSegmenter.segment(text))
    {
        truncatedContentWidth += graphemeWidth(segment);
        if (truncatedContentWidth >= truncationThreshold)
            return truncator + " ".repeat(truncatedContentWidth - truncationThreshold) + text.slice(index + segment.length);
    }

    return text;
}

/**
 * Truncates complete graphemes from the end, retaining targetContentWidth columns
 * of content and suffixing a truncator when truncation occurs.
 */
export function truncateTextEnd(text: string, currentWidth: number, targetContentWidth: number, truncator = ""): string
{
    if (targetContentWidth < 0)
        return truncator;
    if (targetContentWidth === 0)
        return currentWidth > 0 ? truncator : "";
    if (currentWidth <= targetContentWidth)
        return text;

    if (onlyNormalCharacters.test(text))
        return text.slice(0, targetContentWidth) + truncator;

    let currentContentWidth = 0;
    for (const { segment, index } of graphemeSegmenter.segment(text))
    {
        const segmentWidth = graphemeWidth(segment);
        currentContentWidth += segmentWidth;
        if (currentContentWidth > targetContentWidth)
            return text.slice(0, index) + " ".repeat(targetContentWidth - (currentContentWidth - segmentWidth)) + truncator;
    }

    return text;
}

/** Truncates fragments from the start, retaining their positions for formatting. */
export function truncateStringsStart(textArrayToModify: string[], currentWidth: number, targetWidth: number, truncator = ""): string[]
{
    return truncateStrings(textArrayToModify, currentWidth, targetWidth, truncator, {
        startIndex: 0,
        step: 1,
        fragmentTruncator: truncateTextStart,
    });
}

/** Truncates fragments from the end, retaining their positions for formatting. */
export function truncateStringsEnd(textArrayToModify: string[], currentWidth: number, targetWidth: number, truncator = ""): string[]
{
    return truncateStrings(textArrayToModify, currentWidth, targetWidth, truncator, {
        startIndex: textArrayToModify.length - 1,
        step: -1,
        fragmentTruncator: truncateTextEnd,
    });
}

function truncateStrings(textArrayToModify: string[], currentWidth: number, targetWidth: number, truncator: string, strategy: {
    startIndex: number;
    step: 1 | -1;
    fragmentTruncator: typeof truncateTextStart;
}): string[]
{
    if (targetWidth <= 0)
        return textArrayToModify.map(() => "");
    if (currentWidth <= targetWidth)
        return textArrayToModify;

    truncator = truncator.slice(0, targetWidth);
    let { startIndex: index, fragmentTruncator, step } = strategy;

    let widthToTruncate = currentWidth - (targetWidth - truncator.length);
    while (widthToTruncate)
    {
        const fragmentWidth = textWidth(textArrayToModify[index]);

        if (widthToTruncate >= fragmentWidth)
        {
            widthToTruncate -= fragmentWidth;
            textArrayToModify[index] = widthToTruncate === 0 ? truncator : "";
        }
        else //widthToTruncate < fragmentWidth
        {
            const retainedWidth = fragmentWidth - widthToTruncate;
            textArrayToModify[index] = fragmentTruncator(textArrayToModify[index], fragmentWidth, retainedWidth, truncator);
            return textArrayToModify;
        }

        index += step;
    }

    return textArrayToModify;
}

/** Extends the first fragment, retaining the array shape used by formatting ranges. */
export function extendTextArrayStart(text: string[], currentWidth: number, targetWidth: number, filler = " "): string[]
{
    if (currentWidth >= targetWidth || text.length === 0)
        return text;

    const extendedText = [...text];
    extendedText[0] = fillTextStart(targetWidth - currentWidth, filler) + extendedText[0];
    return extendedText;
}

/** Extends the last fragment, retaining the array shape used by formatting ranges. */
export function extendTextArrayEnd(text: string[], currentWidth: number, targetWidth: number, filler = " "): string[]
{
    if (currentWidth >= targetWidth || text.length === 0)
        return text;

    const extendedText = [...text];
    const lastIndex = extendedText.length - 1;
    extendedText[lastIndex] += fillText(targetWidth - currentWidth, filler);
    return extendedText;
}

function fillText(targetWidth: number, filler: string): string
{
    return filler.repeat(Math.ceil(targetWidth / filler.length)).slice(0, targetWidth);
}

function fillTextStart(targetWidth: number, filler: string): string
{
    return filler.repeat(Math.ceil(targetWidth / filler.length)).slice(-targetWidth);
}

function graphemeWidth(grapheme: string): number
{
    // East Asian width and locale-dependent ambiguous-width characters are intentionally ignored.
    if (isNormalCharacter.test(grapheme))
        return 1;
    if (isZeroWidthCharacter.test(grapheme))
        return 0;
    if (isEmojiCharacter.test(grapheme))
        return 2;

    return 1;
}
