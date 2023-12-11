import {Controller, ControllerConfig, NewChainInfo} from "./controller.js";
import express, {Express} from "express";
import controllerRouter from "./controllerRoutes.js";
import console from "console";
import * as http from "http";
import process from "process";

process.on('unhandledRejection', error => {
    console.error('Unhandled Rejection');
    // @ts-ignore
    console.error(error.message);
    // @ts-ignore
    console.error(error.stack);
    throw error;
});

export class ControllerContext {
    config: ControllerConfig;
    controller: Controller;

    private app: Express;
    private server: http.Server;
    private connections = [];

    constructor(config: ControllerConfig) {
        this.config = config;
    }

    async bootstrap(): Promise<NewChainInfo[]> {
        this.controller = new Controller(this.config);
        const chainsInfo: NewChainInfo[] = [];
        for (const chainId in this.config.chains)
            chainsInfo.push(
                await this.controller.initializeChain(this.config.chains[chainId]));

        this.app = express();
        this.app.use('/', controllerRouter(this.controller));

        this.server = this.app.listen(this.config.controlPort, () => {
            console.log(`Controller http api running at port ${this.config.controlPort}`);
        });
        this.server.on('connection', connection => {
            this.connections.push(connection);
            connection.on('close', () => this.connections = this.connections.filter(curr => curr !== connection));
        });

        process.on('SIGINT', this.controller.exitHandler);
        process.on('SIGQUIT', this.controller.exitHandler);
        process.on('SIGTERM', this.controller.exitHandler);

        return chainsInfo;
    }

    async teardown() {
        this.connections.forEach(curr => curr.end());
        await new Promise<void>((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    console.error('Error closing the server', err);
                    reject(err);
                    return;
                }
                resolve();
            });
        });
        return await this.controller.fullStop();
    }
}