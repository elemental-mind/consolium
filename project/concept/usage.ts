//@ts-nocheck
//Concept scartchpad. File does not need to work.

import { TerminalEventStream } from "../../source/terminalium.ts";

//Inputs

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

//Outputs

function useOutputs()
{
    const terminal = new TerminalRenderer();
    terminal.openAlternativeScreen();

    while (!files.copyCompleted && await Promise.race(timeout(100), files.copyEnd))
    {
        if (copyFileSync.copyCompleted)
            break;

        header = [];
        content = [];
        footer = [];

        header.push("Copying files...");

        for (const file of files)
        {
            if (file.copied)
                content.push(leftAligned.truncatable(file.name, { text: "green" }));
            else if (file.pending)
                content.push(leftAligned.truncatable(file.name, { text: "#595959", background: "white" }));
            else
                content.push(
                    leftAligned
                        .truncatable(file.name, { text: "white", background: "#000000" })
                        .rightAligned(`[${"=".repeat(file.progress / 10)}${"-".repeat((100 - file.progress) / 10)}]`)
                );
        }

        footer.push("Overall progress:");
        footer.push("=".repeat(files.progress * terminal.width / 100));

        terminal.renderFrame(
            header,     //Fixed to top
            content,    //scrollable
            footer      //Fixed to bottom
        );
    }

    terminal.clearFrame();
    terminal.closeAlternativeScreen();

    terminal.writeLine("All files copied");
}