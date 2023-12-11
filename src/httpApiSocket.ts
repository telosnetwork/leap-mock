import express, { Express, Request, Response } from 'express';
import bodyParser from "body-parser";
import {MockChain} from "./chain.js";

export class HTTPAPISocket {
    private chain: MockChain;
    private expApp: Express;
    private server;
    private port: number;
    private isListening: boolean = false;

    constructor(chain: MockChain, port: number) {
        this.chain = chain;
        this.port = port;
    }

    getPort(): number {
        return this.port;
    }

    listen() {
        if (this.isListening)
            throw new Error('socket already listening');

        this.expApp = express();
        this.expApp.use(bodyParser.json());
        this.expApp.use((req: Request, res: Response, next) => {
            let data = '';
            req.on('data', chunk => {
                data += chunk;
            });
            req.on('end', () => {
                // @ts-ignore
                req.rawBody = data;
                if (Object.keys(req.body).length == 0) {
                    req.body = {};
                    if (data.length != 0)
                        req.body = JSON.parse(data);
                }
                next();
            });
        });

        // Get Block
        this.expApp.get('/v1/chain/get_block/:block_num_or_id', (req: Request, res: Response) => {
            const blockNum = parseInt(req.params.block_num_or_id, 10);
            const block = this.chain.generateBlock(blockNum);
            res.json({
                ...block,
                id: this.chain.getBlockHash(blockNum),
                block_num: blockNum,
                ref_block_prefix: 0
            });
        });

        this.expApp.post('/v1/chain/get_block', (req: Request, res: Response) => {
            const data = req.body;
            const blockNum = parseInt(data.block_num_or_id, 10);
            const block = this.chain.generateBlock(blockNum);
            res.json({
                ...block,
                id: this.chain.getBlockHash(blockNum),
                block_num: blockNum,
                ref_block_prefix: 0
            });
        });


        // Get Info
        this.expApp.get('/v1/chain/get_info', (req: Request, res: Response) => {
            res.json(this.chain.generateChainInfo());
        });

        this.expApp.post('/v1/chain/get_info', (req: Request, res: Response) => {
            res.json(this.chain.generateChainInfo());
        });

        this.server = this.expApp.listen(this.port, () => {
            console.log(`Mock chain v1 api server running on http://127.0.0.1:${this.port}`);
            this.isListening = true;
        });
    }

    async close(): Promise<void> {
        if (!this.isListening)
            throw new Error('socket not listening');

        return new Promise((resolve, reject) => {
            this.server.close((error: any) => {
                if (error) {
                    console.error('Error closing Express server:', error);
                    reject(error);
                } else {
                    console.log('Express server closed');
                    resolve();
                }
                this.isListening = false;
            });
        });
    }
}