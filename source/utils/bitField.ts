declare const bitFlag: unique symbol;
declare const bitField: unique symbol;

/** A branded number used to represent a collection of bit flags. */
export type BitField = number &
{
    readonly [bitField]: true;
};

/** A branded `BitField` value containing one individual flag. */
export type BitFlag = BitField &
{
    readonly [bitFlag]: true;
};
