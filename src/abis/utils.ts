import {ABI} from "@greymass/eosio";
import fs from 'fs';
import path from "path";
import {fileURLToPath} from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export function loadAbi(abiName: string): ABI {
    if (!abiName.endsWith('.abi'))
        abiName += '.abi';

    const abiPath = path.join(currentDir, abiName);
    const abiStr = fs.readFileSync(abiPath, 'utf-8');
    return JSON.parse(abiStr) as ABI;
}
