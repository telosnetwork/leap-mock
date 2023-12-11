import {ChainDescriptor, ChainMap} from "../src/controller.js";
import {HyperionSequentialReader} from "@eosrio/hyperion-sequential-reader";
import {sleep, randomHash} from "../src/utils.js";
import console from "console";

export function generateTestChainDescriptor(
    chainId?: string,
    startBlock: number = 1,
    endBlock: number = 100,
    asapMode: boolean = false,
    blockGenStrat: 'random' | 'inorder' = 'inorder',
    blocks?: string[][],
    jumps?: [number, number][],
    pauses?: [number, number][],
): ChainDescriptor {
    if (!chainId)
        chainId = randomHash();

    return {
        chainId, startBlock, endBlock, asapMode,
        blockGenStrat, blocks,
        jumps,
        pauses
    } as ChainDescriptor;
}

export function generateTestChainsInfo(): [string, ChainMap] {
    const chains: ChainMap = {};
    const chainDesc = generateTestChainDescriptor();
    chains[chainDesc.chainId] = chainDesc;
    return [chainDesc.chainId, chains];
}

export async function expectSequence(
    shipPort: number,
    httpPort: number,
    blockSequence: number[]
): Promise<number[]> {
    let i = 0;
    let reachedEnd = false;
    let isExpectedSequence = true;
    const receivedSequence = [];
    const reader = new HyperionSequentialReader({
        shipApi: `ws://127.0.0.1:${shipPort}`,
        chainApi: `http://127.0.0.1:${httpPort}`,
        poolSize: 1,
        blockConcurrency: 1,
        outputQueueLimit: 10,
        startBlock: 1,
        logLevel: 'debug'
    });
    reader.onDisconnect = async () => {
        if (!isExpectedSequence || reachedEnd)
            return;

        console.log(`reader disconnected, restarting in 3 seconds...`);
        await sleep(3 * 1000);
        reader.restart();
    };

    let pushedLastUpdate = 0;
    let lastUpdateTime = new Date().getTime() / 1000;
    reader.events.on('block', async (block) => {
        const currentBlock = block.blockInfo.this_block.block_num;
        receivedSequence.push(currentBlock);
        isExpectedSequence = isExpectedSequence && (currentBlock == blockSequence[i]);
        i++;
        pushedLastUpdate++;
        reachedEnd = i == blockSequence.length;
        if (isExpectedSequence && !reachedEnd)
            reader.ack();
    });

    reader.start();

    while(isExpectedSequence && !reachedEnd) {
        const now = new Date().getTime() / 1000;
        const speed = pushedLastUpdate / (now - lastUpdateTime);
        lastUpdateTime = now;
        await sleep(500);
    }

    reader.stop();

    return receivedSequence;
}