import fs from 'fs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
function loadAbi() {
    const filePath = path.join(currentDir, '../shipAbi.json');
    return fs.readFileSync(filePath, 'utf-8');
};

export const DEFAULT_ABI_STRING = loadAbi();
export const DEFAULT_ABI = JSON.parse(DEFAULT_ABI_STRING);

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

export function getNextBlockTime(): Date {
    const now = new Date().getTime();
    const roundedNow = Math.ceil(now / 500) * 500;
    return new Date(roundedNow);
}

import * as net from 'net';
import path from "path";
import {fileURLToPath} from "node:url";

export function getRandomPort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.listen(0, () => {
            const port = (server.address() as net.AddressInfo).port;
            server.close(() => resolve(port));
        });

        server.on('error', (err) => {
            reject(err);
        });
    });
}

export function generateRandomHashes(
    size: number,
    jumpsSize: number
): string[][] {
    const blocks: string[][] = [];

    for (let j = 0; j < jumpsSize + 1; j++)
        blocks.push(
            Array.from({length: size + 1}, (_, __) => randomHash()));

    return blocks;
}

export function intAsHash(n: number): string {
    const hex = n.toString(16);
    return hex.padStart(64, '0');
}

export function generateInOrderBlockHashes(
    size: number,
    jumpSize: number,
    increment: string = '1000000'
): string[][] {
   const blocks: string[][] = [];
   for (let j = 0; j < jumpSize; j++)
       blocks.push(
           Array.from(
               {length: size + 1},
               (_, i) => intAsHash(i + (j * parseInt(increment, 16)))
           )
       );
   return blocks;
}