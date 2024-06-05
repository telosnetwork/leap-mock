/**
 * Simple object check.
 * https://stackoverflow.com/questions/27936772/how-to-deep-merge-instead-of-shallow-merge
 * @param item
 * @returns {boolean}
 */
function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
export function mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return mergeDeep(target, ...sources);
}

import fs from 'fs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export function readRelativeFile(relativePath: string) {
    const filePath = path.join(currentDir, relativePath);
    return fs.readFileSync(filePath, 'utf-8');
};

export const DEFAULT_ABI_STRING = readRelativeFile('shipAbi.json');
export const DEFAULT_ABI = JSON.parse(DEFAULT_ABI_STRING);

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomByteArray(size: number): Uint8Array {
    return crypto.randomBytes(size);
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
import {
    ABI,
    Asset,
    AssetType,
    Checksum160,
    Checksum256,
    Name,
    NameType,
    Serializer,
} from "@wharfkit/antelope";
import * as crypto from "crypto";
import {Address} from "@ethereumjs/util";
import {AddressType} from "./mock/telos.evm";

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
    receiver: NameType,
    actionDesc: ActionDescriptor
): ['action_trace_v1', ActionTrace] {
    let stringName;
    if (typeof actionDesc.name === 'string')
        stringName = actionDesc.name;
    else
        stringName = actionDesc.name.toString();
    return ['action_trace_v1', {
        action_ordinal: actionOrdinal,
        creator_action_ordinal: 0,
        receipt: ['action_receipt_v0', {
            receiver: receiver,
            act_digest: randomHash(),
            global_sequence: globalSequence,
            recv_sequence: 1,
            auth_sequence: [{account: actionDesc.account, sequence: 1}],
            code_sequence: 0,
            abi_sequence: 0
        }],
        receiver: receiver,
        act: {
            account: actionDesc.account,
            name: actionDesc.name,
            authorization: [{
                actor: actionDesc.account,
                permission: 'active'
            }],
            data: Serializer.encode({type: stringName, abi: contractAbi, object: actionDesc.parameters}).hexString
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

export function uint8ArrayToBigInt(uint8Array: Uint8Array): bigint {
    let result = BigInt(0);

    // Iterate over each byte and shift it into the correct position
    uint8Array.forEach((byte, index) => {
        // BigInt is necessary to handle the large integers correctly
        const bigByte = BigInt(byte);

        // Shift the current byte to its correct position and add it to the result
        result += bigByte << (BigInt(8) * BigInt(uint8Array.length - index - 1));
    });

    return result;
}

const TOKEN_PRECISION = 4;
const TOKEN_ADJUSTMENT = BigInt(10) ** BigInt(18 - TOKEN_PRECISION);
export function assetQuantityToEvm(asset: AssetType) {
    asset = Asset.from(asset);
    return BigInt(asset.value) * TOKEN_ADJUSTMENT;
}

export function addressToSHA256(addr: Address) {
    const rawAddr = addr.toString().substring(2)
    return Checksum256.from('0'.repeat(12 * 2) + rawAddr);
}

export function addressTypeToSHA256(addr: AddressType) {
    if (addr instanceof Checksum160)
        addr = new Address(addr.array);
    return addressToSHA256(addr);
}

export function addressToChecksum160(addr: Address) {
    const rawAddr = addr.toString().substring(2)
    return Checksum160.from(rawAddr);
}

export function nameToBigInt(n: NameType) {
    return BigInt(Name.from(n).value.toString());
}

export function hexToUint8Array(hexStr: string): Uint8Array {
    if (hexStr.startsWith('0x'))
        hexStr = hexStr.slice(2);

    if (hexStr.length % 2 !== 0) {
        throw new Error("Hex string must have an even number of characters");
    }

    const byteArray = new Uint8Array(hexStr.length / 2);

    for (let i = 0, j = 0; i < hexStr.length; i += 2, j++) {
        byteArray[j] = parseInt(hexStr.substring(i, i + 2), 16);
        if (isNaN(byteArray[j])) {
            throw new Error("Invalid character found in hex string");
        }
    }

    return byteArray;
}