import * as WebSocket from 'ws';
import {Serializer} from "@greymass/eosio";
import * as console from "console";
import {loadAbi, randomHash} from "./utils.js";
import {MockChain} from "./chain.js";
import * as process from "process";
import { Command, Option } from 'commander';

const shipAbiString = loadAbi();
const shipAbi = JSON.parse(shipAbiString);

let shipPort = 29999;
let chainPort = 8888;
let controlPort = 6970;

const program = new Command();

const isoDateOption = new Option('-s, --startTime <startTime>', 'Start time in ISO format')
    .argParser((value) => {
        if (!value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(([+-]\d{2}:\d{2})|Z)?$/)) {
            throw new Error('Invalid ISO date format');
        }
        return value;
    });

let chain;
program
    .command('run <startBlock> <endBlock>')
    .addOption(isoDateOption)
    .option('-c, --chainId [chainId]', 'Chain ID')
    .option('-S, --shipPort [shipPort]', 'Mock state history websocket port')
    .option('-a, --chainPort [chainPort]', 'Mock v1 chain port')
    .option('-C, --controlPort [controlPort]', 'Control http port')
    .action((startBlock, endBlock, options) => {
        if (options.shipPort)
            shipPort = parseInt(options.shipPort, 10);

        if (options.chainPort)
            chainPort = parseInt(options.chainPort, 10);

        if (options.controlPort)
            controlPort = parseInt(options.controlPort, 10);

        console.log(`startBlock: ${startBlock}`);
        console.log(`endBlock: ${endBlock}`);
        console.log(`startTime: ${options.startTime || 'None'}`);
        console.log(`chainId: ${options.chainId || 'None'}`);
        console.log(`shipPort: ${shipPort}`);
        console.log(`chainPort: ${chainPort}`);
        console.log(`controlPort: ${controlPort}`);
        chain = new MockChain(
            options.chainId ? options.chainId : randomHash(),
            options.startTime ? options.startTime : new Date().toISOString(),
            parseInt(startBlock, 10),
            parseInt(endBlock, 10),
            shipAbi
        );
    });

program.parse(process.argv);

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
                chain.startProduction(ws);
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
                chain.ackBlocks(requestData.num_messages);
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
