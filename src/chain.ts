import {randomHash} from "./utils.js";
import {ABI, Serializer} from "@greymass/eosio";
import console from "console";

const libOffset = 333;
export class MockChain {
    private startBlock: number;
    private endBlock: number;
    private shipAbi: ABI;
    private chainId: string;
    private startTime: string;
    private blockInfo: string[];

    public jumps;

    private clientAckBlock: number;
    private nextBlock: number;
    private _produceTask: any;

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

        this.clientAckBlock = this.startBlock - 1;
        this.nextBlock = this.startBlock;

        this.jumps = {};
        this.blockInfo = [];
        for (let i = startBlock - 1; i <= endBlock; i++)
            this.blockInfo.push(randomHash());
    }

    getBlockHash(blockNum: number) {
        if (blockNum < (this.startBlock - 1) || blockNum > this.endBlock)
            throw new Error("Invalid range");

        return this.blockInfo[blockNum - this.startBlock + 1];
    }

    getLibBlock(blockNum: number) {
        let libNum = blockNum - libOffset;
        let libHash = "0000000000000000000000000000000000000000000000000000000000000000";
        if (this.startBlock <= libNum && this.endBlock >= libNum)
            libHash = this.getBlockHash(libNum);
        else
            libNum = 0;

        return [libNum, libHash];
    }

    generateBlock(blockNum: number) {
        const blockTimestamp = new Date(this.startTime);
        blockTimestamp.setSeconds(blockTimestamp.getSeconds() + (blockNum / 2));

        const prevHash = this.getBlockHash(blockNum);

        return {
            "timestamp": blockTimestamp.toISOString().slice(0, -1),
            "producer": "eosio",
            "confirmed": 0,
            "previous": prevHash,
            "transaction_mroot": "0000000000000000000000000000000000000000000000000000000000000000",
            "action_mroot": "0000000000000000000000000000000000000000000000000000000000000000",
            "schedule_version": 0,
            "new_producers": null,
            "header_extensions": [],
            "producer_signature": "SIG_K1_KZDYebJdphZ5Pdk6WtjtDuY3BN4gPwiVvbHozwjdu587HBjCskEwfhub24xx33eavDGnapFFQ357jSciQEPvG9FcGhgBKA",
            "transactions": [],
            "block_extensions": []
        };
    }

    generateHeadBlockResponse(blockNum: number) {
        const blockHash = this.getBlockHash(blockNum);

        const prevBlockNum = blockNum - 1;
        const prevHash = this.getBlockHash(prevBlockNum);

        const [libNum, libHash] = this.getLibBlock(blockNum);

        return {
            "head": {
                "block_num": blockNum,
                "block_id": blockHash
            },
            "last_irreversible": {
                "block_num": libNum,
                "block_id": libHash
            },
            "this_block": {
                "block_num": blockNum,
                "block_id": blockHash
            },
            "prev_block": {
                "block_num": prevBlockNum,
                "block_id": prevHash
            },
            "block": Serializer.encode({type: 'signed_block', abi: this.shipAbi, object: this.generateBlock(blockNum)}),
            "traces": Serializer.encode({type: 'action_trace[]', abi: this.shipAbi, object: []}),
            "deltas": Serializer.encode({type: 'table_delta[]', abi: this.shipAbi, object: []})
        }
    }

    generateStatusResponse() {
        const blockNum = this.nextBlock - 1;
        const blockHash = this.getBlockHash(blockNum);
        const [libNum, libHash] = this.getLibBlock(blockNum);

        return {
            "head": {
                "block_num": blockNum,
                "block_id": blockHash
            },
            "last_irreversible": {
                "block_num": libNum,
                "block_id": libHash
            },
            "trace_begin_block": this.startBlock,
            "trace_end_block": this.endBlock,
            "chain_state_begin_block": this.startBlock,
            "chain_state_end_block": this.endBlock,
            "chain_id": this.chainId
        }
    }

    ackBlocks(amount: number) {
        if (this.nextBlock + 1 > this.endBlock)
            return;

        this.clientAckBlock += amount;
    }

    setBlock(num: number) {
        this.nextBlock = num;
        this.clientAckBlock = num;
        console.log(`CONTROL: set next block to ${num}`);
    }

    increaseBlock() {
        if (this.nextBlock + 1 > this.endBlock)
            return;

        this.nextBlock++;

        if (this.nextBlock in this.jumps) {
            const currBlock = this.nextBlock;
            this.setBlock(this.jumps[currBlock]);
            delete this.jumps[currBlock];
        }
    }

    produceBlock(ws) {
        if (this.nextBlock > this.endBlock)
            return;

        if (this.nextBlock <= this.clientAckBlock) {
            console.log('sending one block...')
            const response = Serializer.encode({
                type: "result",
                abi: this.shipAbi,
                object: ["get_blocks_result_v0", this.generateHeadBlockResponse(this.nextBlock)]
            }).array;
            this.increaseBlock();
            ws.send(response);
        }
    }

    startProduction(ws) {
        console.log('starting production...');
        this._produceTask = setInterval(() => {
            this.produceBlock(ws)
        }, 500);
    }

    stopProduction() {
        clearInterval(this._produceTask);
    }
}
