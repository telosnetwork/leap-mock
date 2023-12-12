import express, {Request, Response, Router} from 'express';
import bodyParser from 'body-parser';
import {ChainDescriptor, Controller} from './controller.js';
import {sleep} from './utils.js';

// Control endpoint
const controllerRouter = (controller: Controller): Router => {
    const controlApp = express.Router();
    controlApp.use(bodyParser.json());

    controlApp.post('/create_chain', async (req: Request, res: Response) => {
        const descriptor: ChainDescriptor = req.body;
        try {
            const infoObj = await controller.initializeChain(descriptor);
            res.json({result: infoObj});
        } catch (e) {
            res.json({error: e.message});
        }
    })

    controlApp.post('/restart_chain_network', async (req: Request, res: Response) => {
        const params: {chainId: string, sleepTime?: number} = req.body;
        try {
            await controller.chainNetworkDown(params.chainId);
            await sleep(params.sleepTime ? params.sleepTime : 100);
            controller.chainNetworkUp(params.chainId);
            res.json({result: 'ok'});
        } catch (e) {
            res.json({error: e.message});
        }
    })

    controlApp.post('/destroy_chain', async (req: Request, res: Response) => {
        const chainId: string = req.body.chainId;
        try {
            await controller.destroyChain(chainId);
            res.json({result: 'ok'});
        } catch (e) {
            res.json({error: e.message});
        }
    })

    controlApp.post('/start', (req: Request, res: Response) => {
        const data = req.body;
        try {
            const runtime = controller.getRuntime(data.chainId);
            if (!runtime.network.isUp)
                controller.chainNetworkUp(data.chainId);
            runtime.chain.startProducer();
            res.json({result: 'ok'});
        } catch (e) {
            res.json({error: e.message});
        }
    })

    controlApp.post('/stop', async (req: Request, res: Response) => {
        const chainId: string = req.body.chainId;
        try {
            const runtime = controller.getRuntime(chainId);
            await runtime.chain.stopProducer();
            res.json({result: 'ok'});
        } catch (e) {
            res.json({error: e.message});
        }
    })

    return controlApp;
}

export default controllerRouter;