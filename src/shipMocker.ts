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
    .option('-C, --controlPort [controlPort]', 'Control http port')
    .action((startBlock, endBlock, options) => {
        if (options.shipPort)
            shipPort = parseInt(options.shipPort, 10);

        if (options.controlPort)
            controlPort = parseInt(options.controlPort, 10);

        console.log(`startBlock: ${startBlock}`);
        console.log(`endBlock: ${endBlock}`);
        console.log(`startTime: ${options.startTime || 'None'}`);
        console.log(`chainId: ${options.chainId || 'None'}`);
        console.log(`shipPort: ${shipPort}`);
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
                console.log(`nextBlock: ${chain.nextBlock}`);
                console.log(`clientAckBlock: ${chain.clientAckBlock}`);
                break;
            default:
                console.warn(`unhandled type: ${requestType}`);
                break;
        }
    });
    ws.send(shipAbiString);
});

// Control endpoint
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

app.post('/set_block', (req: Request, res: Response) => {
    const data = req.body;
    chain.setBlock(data.num);
    res.json({ result: 'ok'});
});

app.post('/set_jumps', (req: Request, res: Response) => {
    const data = req.body;
    chain.setJumps(data.jumps, data.index);
    res.json({ result: 'ok'});
});

app.post('/set_block_info', (req: Request, res: Response) => {
    const data = req.body;
    chain.setBlockInfo(data.blocks, data.index);
    res.json({ result: 'ok'});
});

app.listen(controlPort, () => {
    console.log(`Control server running on http://localhost:${controlPort}`);
});

console.log('Ship mocker ready!');
