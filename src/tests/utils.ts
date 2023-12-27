import {ChainDescriptor, NewChainInfo} from "../controller.js";
import {HyperionSequentialReader} from "@eosrio/hyperion-sequential-reader";
import {sleep, randomHash} from "../utils.js";
import {assert} from "chai";
import {logger} from "../logging.js";
import {loadAbi} from "../abis/utils.js";

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
        logLevel: logger.level
    });
    reader.onDisconnect = async () => {
        if (!isExpectedSequence || reachedEnd)
            return;

        logger.info(`reader disconnected, restarting in 3 seconds...`);
        await sleep(3 * 1000);
        reader.restart();
    };

    for (const [name, abiPath] of [
        ['eosio.token', 'eosio.token'],
        ['eosio.evm', 'telos.evm']
    ])
        reader.addContract(name, loadAbi(abiPath));

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

import {ControllerContext} from "../controllerUtils.js";
import {ControllerConfig, ChainRuntime} from "../controller.js";
import {
    getRandomPort,
} from "../utils.js";
import {describe} from "mocha";
import {ActionDescriptor} from "../types";

export function describeMockChainTests(
    title: string,
    tests: {
        [key: string]: {
            sequence: number[],
            chainConfig: {
                shipPort?: number,
                httpPort?: number,
                blocks?: string[][],
                jumps?: [number, number][],
                pauses?: [number, number][],
                txs?: {[key: number]: ActionDescriptor[]}
            },
            testFn?: (ctx: ControllerContext, chainInfo: NewChainInfo, runtime: ChainRuntime) => Promise<void>
        }
    }
) {
    describe(title, async function() {
        const config: ControllerConfig = {controlPort: await getRandomPort()};
        const context = new ControllerContext(config);

        before(async function ()  {
            await context.bootstrap();
        });
        beforeEach(async function () {
            await context.startTest(this.currentTest.title);
        });
        afterEach(async function () {
            await context.endTest(this.currentTest.title);
        });
        after(async function () {
            await context.teardown();
        });

        for (const testName in tests) {
            const testInfo = tests[testName];
            context.registerTestChain(testName, testInfo.chainConfig);
            it(testName, async function() {
                const chainInfo = context.getTestChain(testName);
                await expectSequence(
                    chainInfo,
                    testInfo.sequence
                );
                if (testInfo.testFn)
                    await testInfo.testFn(context, chainInfo, context.controller.getRuntime(chainInfo.chainId));
            });
        }

    });
}

import { JsonRpc } from 'eosjs';

// @ts-ignore
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

export function getRPCClient(endpoint: string) {
    return new JsonRpc(endpoint, { fetch });
}