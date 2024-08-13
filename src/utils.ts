import fs from 'fs';
import path from "path";
import {fileURLToPath} from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function loadAbi() {
    const filePath = path.join(currentDir, './shipAbi.json');
    return fs.readFileSync(filePath, 'utf-8');
}

export const SHIP_ABI_STR = loadAbi();
export const SHIP_ABI = JSON.parse(SHIP_ABI_STR);

export function randomHex(size: number): string {
    let result = '';
    const characters = '0123456789abcdef';
    for (let i = 0; i < size; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

export function randomHash(): string {
    return randomHex(64);
}
