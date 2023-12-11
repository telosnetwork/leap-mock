import {assert} from 'chai';
import {ControllerContext} from "../src/controllerUtils.js";
import {ControllerConfig, NewChainInfo} from "../src/controller.js";
import {getRandomPort} from "../src/utils.js";
import {expectSequence, generateTestChainsInfo} from "./utils.js";
import ControllerHTTPClient from "../src/controllerHTTPClient.js";


describe('Reconnect', async function () {
    const [chainId, chains] = generateTestChainsInfo();
    chains[chainId].pauses = [[3, 4]];
    const config: ControllerConfig = {
        controlPort: await getRandomPort(),
        chains
    };
    const context = new ControllerContext(config);
    let client: ControllerHTTPClient;
    let chainsInfo: NewChainInfo[];
    let chainInfo: NewChainInfo;

    const blockSequence = [
        1, 2, 3, 4
    ];

    before(async () => {
        chainsInfo = await context.bootstrap();
        chainInfo = chainsInfo[0];
        client = new ControllerHTTPClient(`http://127.0.0.1:${config.controlPort}`);
        await client.start(chainId);
    });
    after(async () => {
        await context.teardown();
    });
    it('simple reconnect', async function () {
        const receivedSequence = await expectSequence(
            chainInfo.shipPort,
            chainInfo.httpPort,
            blockSequence,
        );
        return assert.deepStrictEqual(
            receivedSequence, blockSequence, 'Received wrong sequence from ship');
    });
});
