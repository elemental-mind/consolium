import * as fs from 'fs/promises';
import * as path from 'path';

const distributionFolder = path.join("distribution", "jsr");
const jsrDenoTemplatePath = path.join("project", "configuration", "jsr-deno.json");

async function build()
{
    console.log("Preparing JSR build...");
    console.log("Deleting old JSR distribution folder...");
    await deleteOldDistFolder();
    console.log("Preparing JSR distribution folder...");
    await copyOnlySourceFiles();
    await copyRepoArtifacts();
    await writeDenoConfig();
    console.log("JSR release folder ready.");
}

async function deleteOldDistFolder()
{
    await fs.rm(distributionFolder, { recursive: true, force: true });
}

async function copyOnlySourceFiles()
{
    await fs.cp("source", path.join(distributionFolder, "source"), { recursive: true, filter: file => !file.endsWith("spec.ts") });
}

async function copyRepoArtifacts()
{
    await fs.copyFile("README.md", path.join(distributionFolder, "README.md"));
}

async function writeDenoConfig()
{
    const packageJSON = await readJSONFile("package.json") as { version: string; };
    const denoConfig = await readJSONFile(jsrDenoTemplatePath) as { version: string; };

    denoConfig.version = packageJSON.version;

    await fs.writeFile(path.join(distributionFolder, "deno.json"), JSON.stringify(denoConfig, undefined, 2));
}

async function readJSONFile<T>(filePath: string): Promise<T>
{
    return JSON.parse(await fs.readFile(filePath, "utf8"));
}

build();
