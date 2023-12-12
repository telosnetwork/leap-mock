import {ChainMap, Controller, ControllerConfig, NewChainInfo} from "./controller.js";
import express, {Express} from "express";
import controllerRouter from "./controllerRoutes.js";
import * as http from "http";
import process from "process";
import ControllerHTTPClient from "./controllerHTTPClient.js";
import {generateTestChainDescriptor} from "./tests/utils.js";
import logger from "./logging.js";

process.on('unhandledRejection', error => {
    logger.error('Unhandled Rejection');
    // @ts-ignore
    logger.error(error.message);
    // @ts-ignore
    logger.error(error.stack);
    throw error;
});

export class ControllerContext {
    chains: ChainMap;
    chainsInfo: {[key: string]: NewChainInfo} = {};
    testsMap: {[key: string]: string} = {};

    config: ControllerConfig;
    controller: Controller;
    client: ControllerHTTPClient;

    private app: Express;
    private server: http.Server;
    private connections = [];

    constructor(config: ControllerConfig) {
        this.config = config;
    }

    log(level: string, message: string) {
        logger[level](`context: ${message}`);
    }

    registerTestChain(
        testName: string,
        opts: {
            shipPort?: number,
            httpPort?: number,
            blocks?: string[][],
            jumps?: [number, number][],
            pauses?: [number, number][],
        }
    ) {
        const desc = generateTestChainDescriptor();
        const optedDesc = {...desc, ...opts};

        if (!this.config.chains)
            this.config.chains = {};
        this.config.chains[desc.chainId] = optedDesc;

        this.testsMap[testName] = desc.chainId;
    }

    getTestChain(name: string) {
        if (!(name in this.testsMap))
            throw new Error(`no chain for test named ${name}`);

        return this.chainsInfo[this.testsMap[name]];
    }

    async startTest(name: string) {
        const chainInfo = this.getTestChain(name);
        this.controller.chainNetworkUp(chainInfo.chainId);
        await this.client.start(chainInfo.chainId);
    }

    async endTest(name: string) {
        const chainInfo = this.getTestChain(name);
        await this.client.destroyChain(chainInfo.chainId);
    }

    async bootstrap(): Promise<void> {
        this.controller = new Controller(this.config);
        for (const chainId in this.config.chains)
            this.chainsInfo[chainId] = await this.controller.initializeChain(this.config.chains[chainId]);

        this.app = express();
        this.app.use('/', controllerRouter(this.controller));

        this.server = this.app.listen(this.config.controlPort, () => {
            this.log('debug', `control http api running at port ${this.config.controlPort}`);
        });
        this.server.on('connection', connection => {
            this.connections.push(connection);
            connection.on('close', () => this.connections = this.connections.filter(curr => curr !== connection));
        });

        const exitHandler = async () => {
            if (this.controller.isStopping())
                return;

            await this.controller.fullStop();
            await this.teardown();
        };

        process.on('SIGINT', exitHandler);
        process.on('SIGQUIT', exitHandler);
        process.on('SIGTERM', exitHandler);

        this.client = new ControllerHTTPClient(`http://127.0.0.1:${this.config.controlPort}`);
    }

    async teardown() {
        this.connections.forEach(curr => curr.end());
        await new Promise<void>((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    this.log('error', `Error closing the server: ${err.message}`);
                    reject(err);
                } else {
                    this.log('debug', `control http sock ${this.config.controlPort} closed.`)
                    resolve();
                }
            });
        });
        return await this.controller.fullStop();
    }
}