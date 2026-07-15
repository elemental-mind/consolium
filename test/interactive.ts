import { TerminalEventStream } from "../source/terminalium.ts";

export async function logEvents()
{
    if (!TerminalEventStream.isSupported)
        throw new Error("Not in interactive terminal");

    const terminalStream = new TerminalEventStream();
    for await (const event of terminalStream.open())
    {
        console.log(event);

        if (event.type === "keypress" && event.ctrlKey && event.key === "c")
            await terminalStream.close();
    }
}

logEvents();
