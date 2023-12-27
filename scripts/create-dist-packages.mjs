import { fileURLToPath } from 'node:url';
import path from 'path';
import * as fs from 'fs-extra';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const shipAbiSrc = path.join(currentDir, '../src/shipAbi.json');
const shipAbiDst = path.join(currentDir, '../build/shipAbi.json');
fs.copy(shipAbiSrc, shipAbiDst);

const abisDirSrc = path.join(currentDir, '../src/abis');
const abisDirDst = path.join(currentDir, '../build/abis');
fs.copy(abisDirSrc, abisDirDst);
