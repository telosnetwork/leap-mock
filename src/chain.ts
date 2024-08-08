import {randomHash} from "./utils.js";
import {ABI, Serializer} from "@greymass/eosio";
import console from "console";


const libOffset = 333;
const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';


export class MockChain {
    private startBlock: number;
    private endBlock: number;
    private shipAbi: ABI;
    private chainId: string;
    private startTime: string;
    private blockInfo: string[][];

    private jumps;
    private jumpIndex;

    public lastSent: number;
    private clientAckBlock: number;
    private forkDB = {
        block_id: ZERO_HASH,
        block_num: 0
    };

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
        this.lastSent = startBlock - 1;
        this.endBlock = endBlock;
        this.shipAbi = shipAbi;

        this.clientAckBlock = this.startBlock - 1;

        this.jumps = [];
        this.jumpIndex = 0;

        this.blockInfo = [];

        for (let j = 0; j < 2; j++) {
            const randBlocks = [];
            for (let i = startBlock - 1; i <= endBlock; i++)
                randBlocks.push(randomHash());

            this.setBlockInfo(randBlocks, j);
        }
    }

    setJumps(jumps: [number, number][], index: number) {
        this.jumpIndex = 0;
        this.jumps = jumps;
        console.log(`CONTROL: set jumps array of size ${jumps.length} index ${index}`);
    }

    setBlockInfo(blocks: string[], index: number) {
        if (index > this.blockInfo.length)
            throw new Error("Tried to set index out of order");

        if (index == this.blockInfo.length)
            this.blockInfo.push(blocks);
        else
            this.blockInfo[index] = blocks;

        console.log(`CONTROL: set blocks array of size ${blocks.length} index ${index}`);
    }

    getBlockHash(blockNum: number) {
        if (blockNum < (this.startBlock - 1) || blockNum > this.endBlock)
            throw new Error("Invalid range");

        return this.blockInfo[this.jumpIndex][blockNum - this.startBlock + 1];
    }

    getLibBlock(blockNum: number) : [number, string] {
        let libNum = blockNum - libOffset;
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

        const [libNum, libHash] = this.getLibBlock(blockNum);

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

    generateStatusResponse(blockNum: number) {
        const blockHash = this.getBlockHash(blockNum);
        const [libNum, libHash] = this.getLibBlock(blockNum);

        return {
            head: {
                block_num: blockNum,
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

    ackBlocks(ws, amount: number) {
        if (this.lastSent + 1 == this.endBlock)
            return;

        this.clientAckBlock += amount;

        while (this.lastSent + 1 < this.endBlock &&
               this.lastSent <= this.clientAckBlock) {

            if (this.jumpIndex < this.jumps.length &&
                this.lastSent == this.jumps[this.jumpIndex][0]) {
                this.setBlock(this.jumps[this.jumpIndex][1]);
            } else
                this.lastSent += 1;

            console.log(`send block ${this.lastSent}`);
            const response = Serializer.encode({
                type: "result",
                abi: this.shipAbi,
                object: ["get_blocks_result_v0", this.generateHeadBlockResponse(this.lastSent)]
            }).array;
            ws.send(response);
        }
    }

    setBlock(num: number) {
        this.clientAckBlock = num + 1;
        this.lastSent = num;
        this.forkDB.block_id = this.getBlockHash(num);
        this.forkDB.block_num = num;
        this.jumpIndex++;
        console.log(`CONTROL: set next block to ${num}`);
    }

    generateChainInfo(blockNum: number) {
        const headBlock = this.generateBlock(blockNum);
        const headHash = this.getBlockHash(blockNum);

        const [libNum, libHash] = this.getLibBlock(blockNum);
        let libTimestamp = new Date(0).toISOString().slice(0, -1);
        if (libNum > 0)
            libTimestamp = this.generateBlock(libNum).timestamp;

        return {
            server_version: 'cafebabe',
            chain_id: this.chainId,
            head_block_num: blockNum,
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
}
