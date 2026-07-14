declare const bitFlag: unique symbol;
declare const bitField: unique symbol;

export type BitField = number &
{
    readonly [bitField]: true;
};

export type BitFlag = BitField &
{
    readonly [bitFlag]: true;
};
