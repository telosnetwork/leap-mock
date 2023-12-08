import {randomHash} from "./utils.js";
import {ABI, Serializer} from "@greymass/eosio";
import console from "console";


const libOffset = 333;
const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

interface ShipSession {
    ws: any,
    syncTask: any,
    ackBlocks: number,
    startBlock: number,
    currentBlock: number,
    reachedHead: boolean
};

export class MockChain {
    private startBlock: number;
    private endBlock: number;
    private shipAbi: ABI;
    private chainId: string;
    private startTime: string;
    private blockHistory: [number, string][][];

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

    private shouldProduce: boolean;
    private producerTaskRunning: boolean;

    constructor(
        chainId: string,
        startTime: string,
        startBlock: number,
        endBlock: number,
        shipAbi: ABI
    ) {
        this.chainId = chainId;
        this.startTime = startTime;
        this.startBlock = startBlock;
        this.endBlock = endBlock;
        this.shipAbi = shipAbi;

        this.headBlockNum = startBlock;

        this.jumps = [];
        this.jumpIndex = 0;

        this.pauses = [];
        this.pauseIndex = 0;

        this.blockHistory = [];

        const randBlocks: [number, string][] = [];
        for (let i = startBlock - 1; i <= endBlock; i++)
            randBlocks.push([i, randomHash()]);

        this.setBlockHistory(randBlocks, 0);
    }

    setPauses(pauses: [number, number][]) {
        this.pauseIndex = 0;
        this.pauses = pauses;
        console.log(`CONTROL: set pauses array of size ${pauses.length}`);
    }

    setJumps(jumps: [number, number][], index: number) {
        this.jumpIndex = 0;
        this.jumps = jumps;
        console.log(`CONTROL: set jumps array of size ${jumps.length} index ${index}`);
    }

    setBlockHistory(blocks: [number, string][], index: number) {
        if (index > this.blockHistory.length)
            throw new Error("Tried to set index out of order");

        if (index == this.blockHistory.length)
            this.blockHistory.push(blocks);
        else
            this.blockHistory[index] = blocks;

        console.log(`CONTROL: set blocks array of size ${blocks.length} index ${index}`);
    }

    getBlockHash(blockNum: number) {
        if (blockNum < (this.startBlock - 1) || blockNum > this.endBlock)
            throw new Error("Invalid range");

        return this.blockHistory[this.jumpIndex][blockNum - this.startBlock + 1][1];
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

    generateBlock(blockNum: number) {
        const startTime = new Date(this.startTime).getTime();
        if (isNaN(startTime)) {
            throw new Error('Invalid startTime');
        }
        const blockTimestampMs = startTime + (blockNum * 500);
        const blockTimestamp = new Date(blockTimestampMs);

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
        const prevHash = this.getBlockHash(prevBlockNum);

        const [libNum, libHash] = this.getLibBlock();

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
                {type: 'signed_block', abi: this.shipAbi, object: this.generateBlock(blockNum)}),
            traces: Serializer.encode(
                {type: 'action_trace[]', abi: this.shipAbi, object: []}),
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
        if (!(sessionId in this.sessions)) {
            console.log(`WARNING!: ackBlocks called with ${sessionId} which is not in sessions map`);
            return;
        }

        const currentBlock = this.sessions[sessionId].currentBlock;
        if (currentBlock > this.endBlock)
            return;

        this.sessions[sessionId].ackBlocks += amount;
    }

    setBlock(num: number) {
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
        console.log(`CONTROL: set next block to ${num}`);
    }

    increaseBlock() {
        if (this.headBlockNum > this.endBlock)
            return;

        if (this.jumpIndex < this.jumps.length &&
            this.headBlockNum == this.jumps[this.jumpIndex][0]) {
            this.setBlock(this.jumps[this.jumpIndex][1]);
            this.jumpIndex++;
        } else
            this.headBlockNum++;
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

    async produceBlock() {
        if (this.pauseIndex < this.pauses.length) {
            const [pauseBlock, pauseTime] = this.pauses[this.pauseIndex];
            if (pauseBlock == this.headBlockNum) {
                await sleep(pauseTime);
                this.pauseIndex++;
            }
        }

        console.log(`producing block ${this.headBlockNum}...`)

        const headBlock = Serializer.encode({
            type: "result",
            abi: this.shipAbi,
            object: ["get_blocks_result_v0", this.generateHeadBlockResponse(this.headBlockNum)]
        }).array;
        this.increaseBlock();

        for (const id in this.sessions) {
            const sesh = this.sessions[id];
            if (this.headBlockNum <= sesh.startBlock + sesh.ackBlocks) {
                sesh.ws.send(headBlock);
                console.log(`sent to session ${id}`)
            }
        }
    }

    getNextBlockTime(): Date {
        const now = new Date().getTime();
        const roundedNow = Math.ceil(now / 500) * 500;
        return new Date(roundedNow);
    }

    async waitNextBlock() {
        const now = new Date().getTime();
        const nextBlockTime = this.getNextBlockTime();
        await sleep(nextBlockTime.getTime() - now);
    }

    startProducer() {
        if (this.producerTaskRunning) {
            console.log(`WARNING!: tried to start second producer task, ignoring...`);
            return;
        }
        this.shouldProduce = true;
        setTimeout(async () => {
            this.producerTaskRunning = true;
            await this.waitNextBlock();
            while (this.shouldProduce) {
                await this.produceBlock();
                await this.waitNextBlock();
            }
            this.producerTaskRunning = false;
        }, 0);
    }

    stopProducer() {
        this.shouldProduce = false;
    }

    stopSession(sessionId: number) {
        if (this.sessions[sessionId].syncTask != null)
            clearInterval(this.sessions[sessionId].syncTask);

        delete this.sessions[sessionId];
        console.log(`stopped session ${sessionId}`)
    }

    initializeShipSession(ws) {
        const seshId: number = this.lastSessionId++;

        this.sessions[seshId] = {
            ws,
            syncTask: null,
            ackBlocks: 0,
            startBlock: -1,
            currentBlock: -1,
            reachedHead: false
        };

        return seshId;
    }

    sessionGetBlocks(
        sessionId: number,
        requestData: {
            start_block_num: number,
            end_block_num: number
        }
    ) {
        if (requestData.start_block_num < this.startBlock) {
            // requestData.end_block_num > this.endBlock) {
            console.log('WARNING!: trying to initialize ship session outside the range...');
            return;
        }

        if (!(sessionId in this.sessions)) {
            console.log(`WARNING!: get blocks with unknown session ${sessionId}`);
            return;
        }

        this.sessions[sessionId].startBlock = requestData.start_block_num;
        this.sessions[sessionId].currentBlock = requestData.start_block_num;

        if (requestData.start_block_num == this.headBlockNum) {
            this.sessions[sessionId].reachedHead = true;
        } else {
            this.sessions[sessionId].syncTask = setTimeout(async () => {
                console.log(`start sync task for session ${sessionId}`);
                while (this.sessions[sessionId].currentBlock < this.headBlockNum) {
                    let ackedBlock = this.sessions[sessionId].startBlock + this.sessions[sessionId].ackBlocks;
                    while (this.sessions[sessionId].currentBlock <= ackedBlock) {
                        const nextBlock = Serializer.encode({
                            type: "result",
                            abi: this.shipAbi,
                            object: [
                                "get_blocks_result_v0",
                                this.generateHeadBlockResponse(this.sessions[sessionId].currentBlock)
                            ]
                        }).array;
                        this.sessions[sessionId].ws.send(nextBlock);
                        if (this.sessions[sessionId].currentBlock % 100 == 0)
                            console.log(`session ${sessionId}: sent block ${this.sessions[sessionId].currentBlock}`)
                        this.sessions[sessionId].currentBlock++;
                    }
                    await sleep(20);
                }
                this.sessions[sessionId].reachedHead = true;
                console.log(`sync task for session ${sessionId} ended.`);
            }, 0);
        }
    }

    sessionAckBlocks(sessionId: number, amount: number) {
        if (!(sessionId in this.sessions)) {
            console.log(`WARNING!: sessionAckBlocks with unknown sessionId ${sessionId}`);
            return;
        }

        if (this.sessions[sessionId].currentBlock + 1 > this.endBlock)
            return;

        this.sessions[sessionId].ackBlocks += amount;
    }
}
