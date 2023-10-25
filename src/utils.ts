import fs from 'fs';

export function loadAbi() {
    const filePath = './shipAbi.json';
    return fs.readFileSync(filePath, 'utf-8');
};

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
