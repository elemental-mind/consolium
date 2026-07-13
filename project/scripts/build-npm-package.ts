import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

const distributionFolder = "distribution";
const nodeDistributionFolder = path.join(distributionFolder, "npm");

async function build()
{
    console.log("Building...");
    console.log("Deleting old Node distribution folder...");
    await deleteOldNodeDistFolder();
    console.log("Compiling project...");
    await compileProject();
    console.log("Release ready for publishing.");
}

async function deleteOldNodeDistFolder()
{
    await fs.rm(nodeDistributionFolder, { recursive: true, force: true });
}

async function compileProject()
{
    execSync(`tsc --project "project/configuration/tsconfig.release.json"`, { stdio: 'inherit' });
}

build();
