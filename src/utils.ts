import fs from 'fs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
function loadAbi() {
    const filePath = path.join(currentDir, './shipAbi.json');
    return fs.readFileSync(filePath, 'utf-8');
};

function removeLastSuffix(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) {
        return fileName; // No dot found, return the original string
    }
    return fileName.substring(0, lastDotIndex);
}

function loadDefaultContracts(): {[key: string]: ABI} {
    const contracts = {};

    const files = fs.readdirSync('./abis');

    for (const fileName of files) {
        const filePath = path.join('./abis', fileName);
        const fileContents = fs.readFileSync(filePath, 'utf8');

        contracts[removeLastSuffix(fileName)] = JSON.parse(fileContents) as ABI;
    }

    return contracts;
}

export const DEFAULT_CONTRACTS = loadDefaultContracts();

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

export function randomInt(min: number, max: number): number {
    // Ensure the min and max are integers
    min = Math.ceil(min);
    max = Math.floor(max);

    // Generate the random integer
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getNextBlockTime(): Date {
    const now = new Date().getTime();
    const roundedNow = Math.ceil(now / 500) * 500;
    return new Date(roundedNow);
}

export function addSecondsToDate(d: Date, s: number): Date {
    let newDate = new Date(d); // Clone the original date to avoid modifying it
    newDate.setSeconds(d.getSeconds() + s);
    return newDate;
}

import * as net from 'net';
import path from "path";
import {fileURLToPath} from "node:url";
import {ActionDescriptor, ActionTrace} from "./types";
import {ABI, Serializer} from "@greymass/eosio";
import {logger} from "./logging";

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


export function generateActionTrace(
    actionOrdinal: number,
    globalSequence: number,
    contractAbi: ABI,
    actionDesc: ActionDescriptor
): ['action_trace_v1', ActionTrace] {
    return ['action_trace_v1', {
        action_ordinal: actionOrdinal,
        creator_action_ordinal: 0,
        receipt: ['action_receipt_v0', {
            receiver: actionDesc.account,
            act_digest: randomHash(),
            global_sequence: globalSequence,
            recv_sequence: 1,
            auth_sequence: [{account: actionDesc.account, sequence: 1}],
            code_sequence: 0,
            abi_sequence: 0
        }],
        receiver: actionDesc.account,
        act: {
            account: actionDesc.account,
            name: actionDesc.name,
            authorization: [{
                actor: actionDesc.account,
                permission: 'active'
            }],
            data: Serializer.encode({type: actionDesc.name, abi: contractAbi, object: actionDesc.parameters}).hexString
        },
        context_free: false,
        elapsed: randomInt(16, 60),
        console: '',
        account_ram_deltas: [],
        except: null,
        error_code: null,
        return_value: ''
    }];
}

export class AntelopeTransfer {

    account: string = 'eosio.token';
    name: string = 'transfer';
    parameters: {
        from: string;
        to: string;
        quantity: string;
        memo: string;
    };

    constructor(opts: {
        from: string, to: string, quantity: string,
        memo?: string
    }) {
        this.parameters = {
            ...opts,
            memo: opts.memo ? opts.memo : ''
        };
    }

}