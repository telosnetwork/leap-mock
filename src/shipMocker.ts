import * as WebSocket from 'ws';
import {Serializer} from "@greymass/eosio";
import * as console from "console";
import {loadAbi, randomHash} from "./utils.js";
import {MockChain} from "./chain.js";
import * as process from "process";

const shipAbiString = loadAbi();
const shipAbi = JSON.parse(shipAbiString);

let shipPort = 18998;
let chainPort = 8889;
let controlPort = 6970;

let chain = new MockChain(
    process.env.MOCK_CHAIN_ID ?? randomHash(),
    process.env.MOCK_START_TIME ?? new Date().toISOString(),
    process.env.MOCK_START_BLOCK ? parseInt(process.env.MOCK_START_BLOCK, 10) : 1,
    process.env.MOCK_STOP_BLOCK ? parseInt(process.env.MOCK_STOP_BLOCK, 10) : 100,
    shipAbi
);

// Mock chain session endpoint

const chainWss = new WebSocket.WebSocketServer({port: shipPort});

console.log(`Opening mock ship websocket at ${shipPort}...`)
chainWss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const request = Serializer.decode({type: "request", abi: shipAbi, data: message as Buffer});
        const requestType = request[0];
        const requestData = Serializer.objectify(request[1]);
        console.log(requestType, requestData);

        switch (requestType) {
            case "get_blocks_request_v0":
                chain.ackBlocks(ws, 15);
                break;

            case "get_status_request_v0":
                const statusResponse = Serializer.encode({
                    type: "result",
                    abi: shipAbi,
                    object: ["get_status_result_v0", chain.generateStatusResponse()]
                }).array;
                ws.send(statusResponse);
                break;

            case "get_blocks_ack_request_v0":
                chain.ackBlocks(ws, requestData.num_messages);
                break;
            default:
                console.warn(`unhandled type: ${requestType}`);
                break;
        }
    });
    ws.send(shipAbiString);
});


import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';


// Chain Mock Api
const chainApp  = express();
chainApp.use(bodyParser.json());

chainApp.use((req: Request, res: Response, next) => {
    let data = '';
    req.on('data', chunk => {
        data += chunk;
    });
    req.on('end', () => {
        // @ts-ignore
        req.rawBody = data;
        if (Object.keys(req.body).length == 0)
            req.body = JSON.parse(data);
        next();
    });
});


// Get Block
chainApp.get('/v1/chain/get_block/:block_num_or_id', (req: Request, res: Response) => {
    const blockNum = parseInt(req.params.block_num_or_id, 10);
    const block = chain.generateBlock(blockNum);
    res.json({
        ...block,
        id: chain.getBlockHash(blockNum),
        block_num: blockNum,
        ref_block_prefix: 0
    });
});

chainApp.post('/v1/chain/get_block', (req: Request, res: Response) => {
    const data = req.body;
    const blockNum = parseInt(data.block_num_or_id, 10);
    const block = chain.generateBlock(blockNum);
    res.json({
        ...block,
        id: chain.getBlockHash(blockNum),
        block_num: blockNum,
        ref_block_prefix: 0
    });
});


// Get Info
chainApp.get('/v1/chain/get_info', (req: Request, res: Response) => {
    res.json(chain.generateChainInfo());
});

chainApp.post('/v1/chain/get_info', (req: Request, res: Response) => {
    res.json(chain.generateChainInfo());
});

chainApp.listen(chainPort, () => {
    console.log(`Mock chain v1 api server running on http://127.0.0.1:${chainPort}`);
});


// Control endpoint
const controlApp = express();
controlApp.use(bodyParser.json());

controlApp.post('/set_block', (req: Request, res: Response) => {
    const data = req.body;
    chain.setBlock(data.num);
    res.json({ result: 'ok'});
});

controlApp.post('/set_jumps', (req: Request, res: Response) => {
    const data = req.body;
    chain.setJumps(data.jumps, data.index);
    res.json({ result: 'ok'});
});

controlApp.post('/set_block_info', (req: Request, res: Response) => {
    const data = req.body;
    chain.setBlockInfo(data.blocks, data.index);
    res.json({ result: 'ok'});
});

controlApp.listen(controlPort, () => {
    console.log(`Control server running on http://127.0.0.1:${controlPort}`);
});

console.log('Ship mocker ready!');
