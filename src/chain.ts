import {
    addSecondsToDate,
    generateActionTrace,
    getNextBlockTime, nameToBigInt,
    randomHash,
    randomInt,
    sleep,
} from "./utils.js";
import {ABI, Name, NameType, Serializer} from "@wharfkit/antelope";
import {logger} from "./logging.js";
import {ActionDescriptor, ActionTrace, TransactionTraceOptions} from "./types.js";

import {ActionMocker, ApplyContext, EOSVMAssertionError, MockingManifest} from "./mock/abstract.js";

import path from "path";
import {fileURLToPath} from "node:url";
import {MockChainbase, TableIndex} from "./chainbase.js";

const libOffset = 333;
const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

interface ShipSession {
    ws: any,
    shouldSync: boolean;
    syncTaskRunning: boolean;
    ackBlocks: number,
    startBlock: number,
    currentBlock: number,
    reachedHead: boolean
}

export class MockChain {
    shipAbi: ABI;

    private asapMode: boolean;
    private startBlock: number;
    private endBlock: number;
    private chainId: string;
    private startTime: string;
    private blockHistory: string[][];

    private transactions: {[key: number]: TransactionTraceOptions[]};
    private generatedTraces: {[key: number]: ActionTrace[]} = {};

    private db = new MockChainbase();

    private jumps: [number, number][];
    private jumpIndex: number;

    private pauses: [number, number][];
    private pauseIndex: number;

    private sessions: {[key: number]: ShipSession} = {};
    private lastSessionId: number = 0;

    private headBlockNum: number;
    private forkDB = {
        block_id: ZERO_HASH,
        block_num: 0
    };
    private actionMockers: {[key: string]: [NameType, ActionMocker][]} = {};

    private jumpedLastBlock: boolean = false;
    private shouldProduce: boolean;
    private producerTaskRunning: boolean;

    private globalSequence: number = 0;
    private actionOrdinal: number;

    private pauseHandler: (time: number) => Promise<void>;

    constructor(
        chainId: string,
        startTime: string,
        startBlock: number,
        endBlock: number,
        shipAbi: ABI,
        pauseHandler: (time: number) => Promise<void>,
        asapMode: boolean = false
    ) {
        this.chainId = chainId;
        this.startTime = startTime;
        this.startBlock = startBlock;
        this.endBlock = endBlock;
        this.shipAbi = shipAbi;
        this.pauseHandler = pauseHandler;

        this.headBlockNum = startBlock;

        this.transactions = {};

        this.jumps = [];
        this.jumpIndex = 0;

        this.pauses = [];
        this.pauseIndex = 0;

        this.blockHistory = [];

        this.asapMode = asapMode;
    }

    getDB() {
        return this.db;
    }

    async initializeMockingModule(name: string) {
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        const module = await import(path.join(currentDir, `./mock/${name}/manifest.js`));
        const moduleConstants = await import(path.join(currentDir, `./mock/${name}/constants.js`));
        const manifest: MockingManifest = module.mockingManifest;
        if (!manifest)
            throw new Error(`mocking module ${name} doesnt have a manifest`);

        for (const contractName in manifest.contracts) {
            const contract = manifest.contracts[contractName];
            const indexes = new Map<bigint, TableIndex[]>();
            for (const tableName in contract.tableMappings)
                indexes.set(nameToBigInt(tableName), contract.tableMappings[tableName]);

            this.db.setContract(contractName, {abi: contract.abi, indexes});
        }

        manifest.actions.forEach(mocker => {
            const actionKey = `${mocker.code}::${mocker.action}`;
            if (!(actionKey in this.actionMockers))
                this.actionMockers[actionKey] = [];

            this.actionMockers[actionKey].push([moduleConstants.SELF, mocker]);
        });
    }

    log(level: string, message: string) {
        logger[level](`chain: ${message}`);
    }

    setPauses(pauses: [number, number][]) {
        this.pauseIndex = 0;
        this.pauses = pauses;
        this.log('info', `set pauses array of size ${pauses.length}`);
    }

    setJumps(jumps: [number, number][], index: number) {
        this.jumpIndex = 0;
        this.jumps = jumps;
        this.log('info', `set jumps array of size ${jumps.length} index ${index}`)
    }

    setBlockHistory(blocks: string[], index: number) {
        if (index > this.blockHistory.length)
            throw new Error("Tried to set index out of order");

        if (index == this.blockHistory.length)
            this.blockHistory.push(blocks);
        else
            this.blockHistory[index] = blocks;

        this.log('info', `set blocks array of size ${blocks.length} index ${index}`)
    }

    setTransactions(actions: {[key: number]: ActionDescriptor[]}) {
        let globalSequence = 0;
        for (const blockNum in actions) {
            let actionOrdinal = 1;
            this.transactions[blockNum] = [];
            const generatedActions: ['action_trace_v1', ActionTrace][] = [];
            for (const action of actions[blockNum]) {
                generatedActions.push(
                    generateActionTrace(
                        actionOrdinal, globalSequence,
                        this.db.getContract(action.account).abi,
                        action.account,
                        action
                    )
                );
                actionOrdinal++;
            }
            this.transactions[blockNum].push({action_traces: generatedActions});
            globalSequence++;
        }
    }

    getBlockHash(blockNum: number, prev: boolean = false): string {
        if (blockNum < (this.startBlock - 1) || blockNum > this.endBlock)
            throw new Error("Invalid range");

        return this.blockHistory[
            !prev ? this.jumpIndex : this.jumpIndex - 1
        ][blockNum - this.startBlock + 1];
    }

    getLibBlock() : [number, string] {
        let libNum = this.headBlockNum - libOffset;
        let libHash = ZERO_HASH;
        if (this.startBlock <= libNum && this.endBlock >= libNum)
            libHash = this.getBlockHash(libNum);
        else
            libNum = 0;

        return [libNum, libHash];
    }

    getBlockTimestamp(blockNum: number) {
        const startTime = new Date(this.startTime).getTime();

        if (isNaN(startTime))
            throw new Error('Invalid startTime');

        const blockTimestampMs = startTime + (blockNum * 500);
        return  new Date(blockTimestampMs);
    }

    getTxTraces(blockNum: number) {
        const traces = [];
        if (blockNum in this.transactions) {
            for (const txDesc of this.transactions[blockNum]) {

                const actionTraces = [];
                if (blockNum in this.generatedTraces)
                    this.generatedTraces[blockNum].forEach(
                        trace => actionTraces.push(['action_trace_v1', trace]));

                traces.push(['transaction_trace_v0', {
                    id: txDesc.id ? txDesc.id : randomHash(),
                    status: txDesc.status ? txDesc.status : 0,
                    cpu_usage_us: txDesc.cpu_usage_us ? txDesc.cpu_usage_us : randomInt(800, 1200),
                    net_usage_words: txDesc.net_usage_words ? txDesc.net_usage_words : randomInt(18, 42),
                    elapsed: txDesc.elapsed ? txDesc.elapsed : 0,
                    net_usage: txDesc.net_usage ? txDesc.net_usage : 0,
                    scheduled: txDesc.scheduled ? txDesc.scheduled : false,
                    action_traces: actionTraces,
                    partial: txDesc.partial ? txDesc.partial : ['partial_transaction_v0', {
                        expiration: addSecondsToDate(this.getBlockTimestamp(blockNum), randomInt(20, 30)).toISOString().substring(0, 19),
                        ref_block_num: 1,
                        ref_block_prefix: 0,
                        max_net_usage_words: 0,
                        max_cpu_usage_ms: 0,
                        delay_sec: 0,
                        transaction_extensions: [],
                        signatures: [],
                        context_free_data: []
                    }],
                    account_ram_delta: null,
                    except: null,
                    error_code: null,
                    failed_dtrx_trace: null
                }]);
            }
        }
        return traces;
    }

    generateBlock(blockNum: number) {
        const blockTimestamp = this.getBlockTimestamp(blockNum);
        const prevHash = this.getBlockHash(blockNum - 1);

        return {
            timestamp: blockTimestamp.toISOString().slice(0, -1),
            producer: 'eosio',
            confirmed: 0,
            previous: prevHash,
            transaction_mroot: ZERO_HASH,
            action_mroot: ZERO_HASH,
            schedule_version: 0,
            new_producers: null,
            header_extensions: [],
            producer_signature: "SIG_K1_KZDYebJdphZ5Pdk6WtjtDuY3BN4gPwiVvbHozwjdu587HBjCskEwfhub24xx33eavDGnapFFQ357jSciQEPvG9FcGhgBKA",
            transactions: [],
            block_extensions: []
        };
    }

    generateHeadBlockResponse(blockNum: number) {
        const blockHash = this.getBlockHash(blockNum);

        const prevBlockNum = blockNum - 1;
        const prevHash = this.getBlockHash(prevBlockNum, this.jumpedLastBlock);

        const [libNum, libHash] = this.getLibBlock();

        const block = this.generateBlock(blockNum);

        return {
            head: {
                block_num: blockNum,
                block_id: blockHash
            },
            last_irreversible: {
                block_num: libNum,
                block_id: libHash
            },
            this_block: {
                block_num: blockNum,
                block_id: blockHash
            },
            prev_block: {
                block_num: prevBlockNum,
                block_id: prevHash
            },
            block: Serializer.encode(
                {type: 'signed_block', abi: this.shipAbi, object: block}),
            traces: Serializer.encode(
                {type: 'transaction_trace[]', abi: this.shipAbi, object: this.getTxTraces(blockNum)}),
            deltas: Serializer.encode(
                {type: 'table_delta[]', abi: this.shipAbi, object: []})
        }
    }

    generateStatusResponse() {
        const blockHash = this.getBlockHash(this.headBlockNum);
        const [libNum, libHash] = this.getLibBlock();

        return {
            head: {
                block_num: this.headBlockNum,
                block_id: blockHash
            },
            last_irreversible: {
                block_num: libNum,
                block_id: libHash
            },
            trace_begin_block: this.startBlock,
            trace_end_block: this.endBlock,
            chain_state_begin_block: this.startBlock,
            chain_state_end_block: this.endBlock,
            chain_id: this.chainId
        }
    }

    ackBlocks(sessionId: number, amount: number) {
        const sesh = this.getSession(sessionId);

        const currentBlock = sesh.currentBlock;
        if (currentBlock > this.endBlock)
            return;

        sesh.ackBlocks += amount;
    }

    private setBlock(num: number) {
        this.headBlockNum = num;
        for (const seshId in this.sessions) {
            if (this.sessions[seshId].reachedHead) {
                this.sessions[seshId].startBlock = num;
                this.sessions[seshId].ackBlocks = 1;
            }
        }

        this.forkDB.block_id = this.getBlockHash(num);
        this.forkDB.block_num = num;
        this.jumpIndex++;
        this.jumpedLastBlock = true;
        this.log('info', `set next block to ${num}`);
    }

    increaseBlock() {
        if (this.headBlockNum > this.endBlock)
            return;

        if (this.jumpIndex < this.jumps.length &&
            this.headBlockNum == this.jumps[this.jumpIndex][0]) {
            this.setBlock(this.jumps[this.jumpIndex][1]);
        } else {
            this.headBlockNum++;
            this.jumpedLastBlock = false;
        }
    }

    generateChainInfo() {
        const headBlock = this.generateBlock(this.headBlockNum);
        const headHash = this.getBlockHash(this.headBlockNum);

        const [libNum, libHash] = this.getLibBlock();
        let libTimestamp = new Date(0).toISOString().slice(0, -1);
        if (libNum > 0)
            libTimestamp = this.generateBlock(libNum).timestamp;

        return {
            server_version: 'cafebabe',
            chain_id: this.chainId,
            head_block_num: this.headBlockNum,
            last_irreversible_block_num: libNum,
            last_irreversible_block_id: libHash,
            head_block_id: headHash,
            head_block_time: headBlock.timestamp,
            head_block_producer: headBlock.producer,
            virtual_block_cpu_limit: 200000000,
            virtual_block_net_limit: 1048576000,
            block_cpu_limit: 199900,
            block_net_limit: 1048576,
            server_version_string: 'v4.0.0',
            fork_db_head_block_num: this.forkDB.block_num,
            fork_db_head_block_id: this.forkDB.block_id,
            server_full_version_string: 'v4.0.0-ship-mocker',
            total_cpu_weight: '53817162457',
            total_net_weight: '45368489859',
            earliest_available_block_num: this.startBlock,
            last_irreversible_block_time: libTimestamp
        };
    }

    private getContext(receiver: NameType, contract: NameType, name: NameType, contractABI: ABI, params: any) {
        return new ApplyContext(
            this.globalSequence,
            this.actionOrdinal,
            this.db,
            contractABI,
            Name.from(contract),
            Name.from(name),
            Name.from(receiver),
            params
        );
    }

    private addExtraTrace(trace: ActionTrace) {
        if (!(this.headBlockNum in this.generatedTraces))
            this.generatedTraces[this.headBlockNum] = [];
        this.generatedTraces[this.headBlockNum].push(trace)
    }

    applyTrace(trace: ActionTrace) {
        const contract = trace.act.account;
        const contractABI = this.db.getContract(contract).abi;
        const actionName = Name.from(trace.act.name).toString();

        const params = Serializer.decode({
            data: trace.act.data,
            type: actionName,
            abi: contractABI,
            ignoreInvalidUTF8: true
        });

        const mockerName = `${contract}::${actionName}`;
        const mockers = this.actionMockers[mockerName];

        if (mockers.length > 0) {
            // apply root trace
            for(const [receiver, mocker] of mockers) {
                const ctx = this.getContext(
                    receiver, contract, actionName, contractABI, params);

                mocker.handler(ctx);
                // if (Name.from(receiver).equals(contract))
                this.addExtraTrace(ctx.getTrace());

                this.db.commit();

                this.actionOrdinal++;
                this.globalSequence++;

                // recursion to process all subActions
                for(const trace of ctx.subActions)
                    this.applyTrace(trace);
            }
        } else
            throw new Error(`Action handler not found for ${mockerName}`);
    }

    async produceBlock() {
        if (this.pauseIndex < this.pauses.length) {
            const [pauseBlock, pauseTime] = this.pauses[this.pauseIndex];
            if (pauseBlock == this.headBlockNum) {
                this.pauseHandler(pauseTime).then();
                this.pauseIndex++;
            }
        }

        // apply txs
        if (this.headBlockNum in this.transactions) {
            const txs = this.transactions[this.headBlockNum];
            for (const tx of txs) {
                this.actionOrdinal = 0;
                for (const [_, actionTrace] of tx.action_traces) {
                    try {
                        this.applyTrace(actionTrace);
                    } catch (e) {
                        if (e instanceof EOSVMAssertionError) {
                            this.db.revert();
                            this.log('error', e.message);
                        } else
                            throw e;
                    }
                }
            }
        }

        this.log('debug', `producing block ${this.headBlockNum}`);

        const headBlock = Serializer.encode({
            type: "result",
            abi: this.shipAbi,
            object: ["get_blocks_result_v0", this.generateHeadBlockResponse(this.headBlockNum)]
        }).array;
        for (const id in this.sessions) {
            const sesh = this.sessions[id];
            if (this.headBlockNum <= sesh.startBlock + sesh.ackBlocks)
                sesh.ws.send(headBlock);
        }
    }

    async waitNextBlock() {
        const now = new Date().getTime();
        const nextBlockTime = getNextBlockTime();
        await sleep(nextBlockTime.getTime() - now);
    }

    startProducer() {
        if (this.producerTaskRunning)
            throw new Error('tried to start second producer task');

        this.shouldProduce = true;
        setTimeout(async () => {
            this.producerTaskRunning = true;
            await this.waitNextBlock();

            while (this.shouldProduce &&
                   this.headBlockNum <= this.endBlock) {
                await this.produceBlock();

                if (!this.asapMode)
                    await this.waitNextBlock();

                this.increaseBlock();
            }
            this.producerTaskRunning = false;
        }, 0);
    }

    async stopProducer() {
        this.shouldProduce = false;
        while (this.producerTaskRunning)
            await sleep(100);
    }

    initializeShipSession(ws) {
        const seshId: number = this.lastSessionId++;

        this.sessions[seshId] = {
            ws,
            syncTaskRunning: false,
            shouldSync: false,
            ackBlocks: 0,
            startBlock: -1,
            currentBlock: -1,
            reachedHead: false
        };

        this.log('debug', `session ${seshId} created.`)
        return seshId;
    }

    getSession(sessionId: number) {
        if (!(sessionId in this.sessions))
            throw new Error(`session ${sessionId} not found`);

        return this.sessions[sessionId];
    }

    async stopSession(sessionId: number) {
        const sesh = this.getSession(sessionId)

        // stop sync task if present
        if (sesh.shouldSync) {
            sesh.shouldSync = false;

            while(sesh.syncTaskRunning)
                await sleep(20);
        }

        delete this.sessions[sessionId];
        this.log('debug', `stopped session ${sessionId}`);
    }
    /**
     * This function sets up the session parameters for block synchronization, starting from `start_block_num` 
     * and targeting `end_block_num`. It performs a check to ensure the requested block range is within the 
     * permissible range. If the range is valid, it updates the session's block range and starts a synchronization 
     * task if necessary.
     * 
     * @param {number} sessionId - The unique identifier of the session.
     * @param {Object} requestData - An object containing the block range for synchronization.
     * @param {number} requestData.start_block_num - The starting block number for synchronization.
     * @param {number} requestData.end_block_num - The ending block number for synchronization.
     */
    sessionGetBlocks(
        sessionId: number,
        requestData: {
            start_block_num: number,
            end_block_num: number
        }
    ) {
        if (requestData.start_block_num < this.startBlock)
            throw new Error('trying to initialize ship session outside the range');

        const sesh = this.getSession(sessionId);

        sesh.startBlock = requestData.start_block_num;
        sesh.currentBlock = requestData.start_block_num;

        if (requestData.start_block_num == this.headBlockNum) {
            sesh.reachedHead = true;
        } else {
            sesh.shouldSync = true;
            sesh.syncTaskRunning = true;

            setTimeout(async () => {
                this.log('debug', `start sync task for session ${sessionId}`);

                while (sesh.shouldSync &&
                       sesh.currentBlock < this.headBlockNum) {

                    let ackedBlock = sesh.startBlock + sesh.ackBlocks;
                    while (sesh.currentBlock <= ackedBlock) {
                        const nextBlock = Serializer.encode({
                            type: "result",
                            abi: this.shipAbi,
                            object: [
                                "get_blocks_result_v0",
                                this.generateHeadBlockResponse(sesh.currentBlock)
                            ]
                        }).array;
                        sesh.ws.send(nextBlock);

                         if (sesh.currentBlock % 100 == 0)
                             this.log('debug', `session ${sessionId}: sent block ${sesh.currentBlock}`);

                        sesh.currentBlock++;
                    }
                    await sleep(20);
                }
                sesh.reachedHead = true;
                sesh.shouldSync = false;
                sesh.syncTaskRunning = false;
                this.log('debug', `sync task for session ${sessionId} ended.`);
            }, 0);
        }
    }

    sessionAckBlocks(sessionId: number, amount: number) {
        const sesh = this.getSession(sessionId);

        if (sesh.currentBlock + 1 > this.endBlock)
            return;

        sesh.ackBlocks += amount;
    }

    async fullStop() {
        const tasks = [];
        for (const sessionId in this.sessions) {
            // @ts-ignore
            tasks.push(this.stopSession(sessionId));
        }

        await Promise.all(tasks);

        await this.stopProducer();
    }
}
