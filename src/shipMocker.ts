import * as console from "console";
import {ChainDescriptor, MockChain} from "./chain.js";
import express from "express";
import bodyParser from "body-parser";

let controlPort = 6970;

let chain = new MockChain();

// Control endpoint
const controlApp = express();
controlApp.use(bodyParser.json());

controlApp.post('/set_chain', async (req, res) => {
    const data: ChainDescriptor = req.body;
    const chainInfo = await chain.setChain(data);
    res.json({ result: chainInfo });
});

controlApp.listen(controlPort, () => {
    console.log(`Control server running on http://127.0.0.1:${controlPort}`);
    console.log('Ship mocker ready!');
});
