import {  copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'path';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(currentDir, '../src/shipAbi.json');
const dest = path.join(currentDir, '../build/shipAbi.json');

copyFileSync(src, dest);
