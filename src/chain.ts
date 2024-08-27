import {randomHash, SHIP_ABI, SHIP_ABI_STR} from "./utils.js";
import {Serializer} from "@wharfkit/antelope";
import console from "console";


const libOffset = 333;
const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

import { z } from 'zod';
import * as WS from "ws";
import express, {Express, Request, Response} from "express";
import bodyParser from "body-parser";

export const JumpInfoSchema = z.object({
    from: z.number(),
    to: z.number()
});

export type JumpInfo = z.infer<typeof JumpInfoSchema>;

export const ChainDescriptorSchema = z.object({
    chain_id: z.string().default('0000000000000000000000000000deadbeef0000000000000000000000000000'),
    start_time: z.string().optional(),
    jumps: z.array(JumpInfoSchema).default([]),
    chain_start_block: z.number().default(1),
    chain_end_block: z.number().default(100),
    session_start_block: z.number().default(1),
    session_stop_block: z.number().default(100),
    http_port: z.number().default(8889),
    ship_port: z.number().default(18999)
});

export type ChainDescriptor = z.infer<typeof ChainDescriptorSchema>;

export const SetChainResponseSchema = z.object({
  blocks: z.record(z.array(z.tuple([z.number(), z.string()])))
});

export type SetChainResponse = z.infer<typeof SetChainResponseSchema>;


export class MockChain {
    private descriptor: ChainDescriptor;
    private startTime: number;
    private blockInfo: Map<number, Map<number, string>>;
    private jumps: Map<number, JumpInfo>;
    private jumpIndex;

    public lastSent: number;
    private clientAckBlock: number;
    private forkDB = {
        block_id: ZERO_HASH,
        block_num: 0
    };

    private networkUp: boolean = false;
    private shipWS: WS.WebSocketServer = null;
    private httpApp: Express = null;

    private async startNetwork() {
        if (this.networkUp)
            throw new Error('Network already up!');

        this.shipWS = new WS.WebSocketServer({port: this.descriptor.ship_port});

        this.shipWS.on('connection', (ws: WS.WebSocket) => {
            ws.on('message', async (message: WS.RawData) => {
                const request = Serializer.decode({
                    type: "request",
                    abi: SHIP_ABI,
                    data: message as Buffer
                });
                const requestType = request[0];
                const requestData = Serializer.objectify(request[1]);
                console.log(requestType, requestData);

                switch (requestType) {
                    case "get_blocks_request_v0":
                        this.ackBlocks(ws, 10);
                        break;

                    case "get_status_request_v0":
                        const statusResponse = Serializer.encode({
                            type: "result",
                            abi: SHIP_ABI,
                            object: [
                                "get_status_result_v0",
                                this.generateStatusResponse(this.lastSent + 1)
                            ]
                        }).array;
                        ws.send(statusResponse);
                        break;

                    case "get_blocks_ack_request_v0":
                        this.ackBlocks(ws, requestData.num_messages);
                        break;

                    default:
                        console.warn(`unhandled type: ${requestType}`);
                        break;
                }
            });
            ws.send(SHIP_ABI_STR);
        });
        await new Promise<void>(resolve => {
            this.shipWS.once('listening', () => resolve());
        });
        console.log(`Started SHIP mock endpoint @ ${this.descriptor.ship_port}`);

        this.httpApp = express();
        this.httpApp.use(bodyParser.json());

        this.httpApp.use((req: Request, _: Response, next) => {
            let data = '';
            req.on('data', chunk => {
                data += chunk;
            });
            req.on('end', () => {
                if (data.length > 0) {
                    // @ts-ignore
                    req.rawBody = data;
                    if (Object.keys(req.body).length == 0)
                        req.body = JSON.parse(data);
                }
                next();
            });
        });

        // Get Block
        this.httpApp.get('/v1/chain/get_block/:block_num_or_id', (req: Request, res: Response) => {
            const blockNum = parseInt(req.params.block_num_or_id, 10);
            const block = this.generateBlock(blockNum);
            res.json({
                ...block,
                id: this.getBlockHash(blockNum),
                block_num: blockNum,
                ref_block_prefix: 0
            });
        });

        this.httpApp.post('/v1/chain/get_block', (req: Request, res: Response) => {
            const data = req.body;
            const blockNum = parseInt(data.block_num_or_id, 10);
            const block = this.generateBlock(blockNum);
            block.header_extensions = null;
            block.block_extensions = null;
            res.json({
                ...block,
                id: this.getBlockHash(blockNum),
                block_num: blockNum,
                ref_block_prefix: 0
            });
        });

        // Get Info
        this.httpApp.get('/v1/chain/get_info', (req: Request, res: Response) => {
            res.json(this.generateChainInfo(this.lastSent));
        });

        this.httpApp.post('/v1/chain/get_info', (req: Request, res: Response) => {
            res.json(this.generateChainInfo(this.lastSent));
        });

        await new Promise<void>(resolve => {
            this.httpApp.listen(this.descriptor.http_port, () => {
                console.log(`Started HTTP mock endpoint @ ${this.descriptor.http_port}`);
                resolve();
            });
        });

        this.networkUp = true;
        console.log('Network is up');
    }

    private async stopNetwork() {
        if (!this.networkUp)
            throw new Error('Network isn\'t up!');

        // close all ship connections
        this.shipWS.clients.forEach((ws: WS.WebSocket) => {
            if (ws.readyState == WS.WebSocket.OPEN)
                ws.close();
        });

        // close ship server and await close cb
        await new Promise(resolve => this.shipWS.close(resolve));

        this.networkUp = false;
        console.log('Network is down');
    }

    async setChain(descriptor: ChainDescriptor): Promise<SetChainResponse> {
        descriptor = ChainDescriptorSchema.parse(descriptor);

        if (this.networkUp)
            await this.stopNetwork();

        this.descriptor = descriptor;
        this.startTime = descriptor.start_time ? new Date(descriptor.start_time).getTime() : new Date().getTime();

        this.jumpIndex = 0;
        this.jumps = new Map(descriptor.jumps.entries());

        this.blockInfo = new Map();
        const resp = {};

        for(let j = 0; j <= descriptor.jumps.length; j++) {
            const blocks: Map<number, string> = new Map();
            const blocks_resp = [];
            for (let blockNum = descriptor.chain_start_block; blockNum <= descriptor.chain_end_block; blockNum++) {
                const block: [number, string] = [blockNum, randomHash()]
                blocks.set(blockNum, block[1]);
                blocks_resp.push(block)
            }

            this.blockInfo.set(j, blocks);
            resp[j] = blocks_resp;
        }
        console.log(`CONTROL: set chain to:\n${JSON.stringify(descriptor, null, 4)}`);

        this.clientAckBlock = this.descriptor.session_start_block - 1;
        this.lastSent = this.clientAckBlock;
        console.log(`CONTROL: set session to ${descriptor.session_start_block}-${descriptor.session_stop_block}`);

        await this.startNetwork();

        return SetChainResponseSchema.parse({blocks: resp});
    }

    getBlockHash(blockNum: number) {
        if ((blockNum < this.descriptor.chain_start_block) || blockNum > this.descriptor.chain_end_block)
            throw new Error(`${blockNum} not in block range`);

        const hash = this.blockInfo.get(this.jumpIndex).get(blockNum);
        if (!hash)
            throw new Error(`Invalid access ${this.jumpIndex}::${blockNum}`);
        return hash;
    }

    getLibBlock(blockNum: number) : [number, string] {
        let libNum = blockNum - libOffset;
        let libHash = ZERO_HASH;
        if (this.descriptor.chain_start_block <= libNum && this.descriptor.chain_end_block >= libNum)
            libHash = this.getBlockHash(libNum);
        else
            libNum = 0;

        return [libNum, libHash];
    }

    generateBlock(blockNum: number) {
        if (isNaN(this.startTime)) {
            throw new Error('Invalid startTime');
        }
        const blockTimestampMs = this.startTime + (blockNum * 500);
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
                {type: 'signed_block', abi: SHIP_ABI, object: this.generateBlock(blockNum)}),
            traces: Serializer.encode(
                {type: 'action_trace[]', abi: SHIP_ABI, object: []}),
            deltas: Serializer.encode(
                {type: 'table_delta[]', abi: SHIP_ABI, object: []})
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
            trace_begin_block: 1,
            trace_end_block: this.descriptor.chain_end_block,
            chain_state_begin_block: 1,
            chain_state_end_block: this.descriptor.chain_end_block,
            chain_id: this.descriptor.chain_id
        }
    }

    ackBlocks(ws, amount: number) {
        if (this.lastSent == this.descriptor.session_stop_block)
            return;

        this.clientAckBlock += amount;

        while (this.lastSent < this.descriptor.session_stop_block &&
               this.lastSent <= this.clientAckBlock) {

            if (this.jumpIndex < this.jumps.size &&
                this.lastSent == this.jumps.get(this.jumpIndex).from) {
                this.setBlock(this.jumps.get(this.jumpIndex).to);
            } else
                this.lastSent += 1;

            console.log(`send block ${this.lastSent}`);
            const response = Serializer.encode({
                type: "result",
                abi: SHIP_ABI,
                object: ["get_blocks_result_v0", this.generateHeadBlockResponse(this.lastSent)]
            }).array;
            ws.send(response);
        }
    }

    setBlock(num: number) {
        this.clientAckBlock = num + (this.lastSent - num);
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
            chain_id: this.descriptor.chain_id,
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
            earliest_available_block_num: this.descriptor.chain_start_block,
            last_irreversible_block_time: libTimestamp
        };
    }
}
