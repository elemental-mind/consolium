export interface TerminalStream<T> extends AsyncIterable<T>
{
    readonly isOpen: boolean;

    open(): this;
    close(): Promise<void>;
}
