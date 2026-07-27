const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

const printableAsciiSequence = /^[\x20-\x7E]*$/;

// \p{...} matches characters belonging to the named Unicode property.
const isZeroWidthCharacter = /^[\p{Mark}\p{Control}\p{Format}]+$/u;
// VS16 (\uFE0F) requests emoji-style presentation; U+20E3 completes an emoji keycap sequence
const isEmojiCharacter = /[\p{Emoji_Presentation}\uFE0F\u20E3]/u;
// Matches one printable ASCII character: U+0020 (space) through U+007E (~), inclusive.
const isNormalCharacter = /^[\x20-\x7E]$/;

export function textSize(text: string): number
{
    if (printableAsciiSequence.test(text))
        return text.length;

    let width = 0;

    for (const { segment } of graphemeSegmenter.segment(text))
    {
        //East Asian width and locale-dependent ambiguous-width characters are intentionally ignored in this sequence of checks.
        if (isNormalCharacter.test(segment))
            width++;
        else if (isZeroWidthCharacter.test(segment))
            width += 0;
        else if (isEmojiCharacter.test(segment))
            width += 2;
        else
            width++;
    }

    return width;
}