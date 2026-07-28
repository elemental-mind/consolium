//@ts-nocheck
// Concept sketch. This file combines the proposed input, formatting, and terminal APIs and does not need to compile yet.

import { blue, Flex, gray, green, Terminal, TerminalEventStream, type TerminalLine } from "../../source/consolium.ts";

// Inputs

async function useInputs()
{
    const eventStream = new TerminalEventStream();

    for await (const event of eventStream)
    {
        if (event.type === "keypress")
            input += event.key;
        if (event.type === "wheel")
            scrollPosition += event.deltaY;
    }
}

// Outputs

async function useOutputs()
{
    const terminal = new Terminal();

    if (!terminal.isInteractive)
    {
        terminal.writeLine("Copying files...");
        await files.copyEnd;
        terminal.writeLine("All files copied");
        return;
    }

    const render = () =>
    {
        const header: TerminalLine[] = [[blue.bold, "Copying files..."]];
        const content: TerminalLine[] = files.map(file =>
        {
            const state = file.copied ? green.bold`complete` : file.pending ? gray`pending` : progressBar(file.progress);
            return [[file.copied ? green : gray, file.name], Flex.shrinkLeft({ truncator: "...", preserve: 10 }).grow(" "), state];
        });
        const footer: TerminalLine[] = [[gray, "Overall progress"], Flex.grow(" "), progressBar(files.progress)];

        terminal.writeFrame({ header, content, footer });
    };

    using screen = terminal.alternateScreen({ hideCursor: true });
    using renderLoop = setInterval(render, 100);
    using resizer = terminal.onResize(render);

    render();
    await files.copyEnd;

    terminal.writeLine(green.bold`All files copied`);
}

function progressBar(progress: number): TerminalLine
{
    const completed = Math.round(progress / 10);
    return ["[", [green, "=".repeat(completed)], [gray, "-".repeat(10 - completed)], `] ${progress}%`];
}
