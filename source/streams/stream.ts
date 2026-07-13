export interface TerminalStreamOptions
{
    /** Enables terminal mouse button and motion reporting. */
    mouseEvents?: boolean;
}

export interface TerminalStream<T> extends AsyncIterable<T>
{
    readonly isOpen: boolean;

    open(options?: TerminalStreamOptions): this;
    close(): Promise<void>;
}
