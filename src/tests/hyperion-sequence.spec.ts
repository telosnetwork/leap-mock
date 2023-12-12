import {ControllerContext} from "../controllerUtils.js";
import {ControllerConfig} from "../controller.js";
import {getRandomPort} from "../utils.js";
import {expectSequence} from "./utils.js";


describe('Hyperion In Order Sequence', async function () {
    const config: ControllerConfig = {controlPort: await getRandomPort()};
    const context = new ControllerContext(config);

    before(async function ()  {
        await context.bootstrap();
    });
    beforeEach(async function () {
       await context.startTest(this.currentTest.title);
    });
    afterEach(async function () {
        await context.endTest(this.currentTest.title);
    });
    after(async function () {
        await context.teardown();
    });

    const testForkName = 'simple fork';
    context.registerTestChain(testForkName, {jumps: [[5, 3]]});
    it(testForkName, async function () {
        const chainInfo = context.getTestChain(testForkName);
        return await expectSequence(
            chainInfo,
            [
                1, 2, 3, 4, 5,
                3, 4, 5, 6
            ]
        )
    });

    const testForkDoubleName = 'double fork';
    context.registerTestChain(testForkDoubleName, {
        jumps: [[5, 3], [6, 6]]});
    it(testForkDoubleName, async function () {
        const chainInfo = context.getTestChain(testForkDoubleName);
        return await expectSequence(
            chainInfo,
            [
                1, 2, 3, 4, 5,
                3, 4, 5, 6, 6, 7
            ]
        )
    });

    const testReconName = 'simple reconnect';
    context.registerTestChain(testReconName, {pauses: [[3, 2]]});
    it(testReconName, async function () {
        const chainInfo = context.getTestChain(testReconName);
        return await expectSequence(chainInfo, [1, 2, 3, 4]);
    });

    const testReconMultiName = 'multi reconnect';
    context.registerTestChain(testReconMultiName, {
        pauses: [[3, 2], [10, 2]]});
    it(testReconMultiName, async function () {
        const chainInfo = context.getTestChain(testReconMultiName);
        return await expectSequence(chainInfo, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });
});
