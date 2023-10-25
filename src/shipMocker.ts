import * as WebSocket from 'ws';
import {Serializer} from "@greymass/eosio";
import * as console from "console";
import {loadAbi, randomHash} from "./utils.js";
import {MockChain} from "./chain.js";
import * as process from "process";
import { Command, Option } from 'commander';

const shipAbiString = loadAbi();
const shipAbi = JSON.parse(shipAbiString);

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
    .action((startBlock, endBlock, options) => {
        console.log(`startBlock: ${startBlock}`);
        console.log(`endBlock: ${endBlock}`);
        console.log(`startTime: ${options.startTime || 'None'}`);
        console.log(`chainId: ${options.chainId || 'None'}`);
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

const chainWss = new WebSocket.WebSocketServer({ port: 29999 });

console.log('opening websocket...')
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
    switch (data.method) {
        case "setBlock":
            chain.setBlock(data.args.num);
            break;
    }
    res.json({ result: 'ok'});
});

app.listen(6970, () => {
    console.log('Control server running on http://localhost:6970');
});