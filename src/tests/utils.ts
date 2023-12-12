import {ChainDescriptor, NewChainInfo} from "../controller.js";
import {HyperionSequentialReader} from "@eosrio/hyperion-sequential-reader";
import {sleep, randomHash} from "../utils.js";
import {assert} from "chai";
import logging from "../logging.js";

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

export async function expectSequence(
    chainInfo: NewChainInfo,
    blockSequence: number[]
) {
    let i = 0;
    let reachedEnd = false;
    let isExpectedSequence = true;
    const receivedSequence = [];
    const reader = new HyperionSequentialReader({
        shipApi: `ws://127.0.0.1:${chainInfo.shipPort}`,
        chainApi: `http://127.0.0.1:${chainInfo.httpPort}`,
        poolSize: 1,
        blockConcurrency: 1,
        outputQueueLimit: 10,
        startBlock: 1,
        logLevel: logging.level
    });
    reader.onDisconnect = async () => {
        if (!isExpectedSequence || reachedEnd)
            return;

        logging.info(`reader disconnected, restarting in 3 seconds...`);
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

    return assert.deepStrictEqual(
        receivedSequence, blockSequence, 'Received wrong sequence from ship');
}