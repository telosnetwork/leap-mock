import {ChainDescriptorSchema, MockChain} from "../chain.js";
import {APIClient, FetchProvider} from "@wharfkit/antelope";
import fetch from 'node-fetch';

describe('Test encoding', () => {

    it ("should encode block", async () => {
        let chain = new MockChain();

        const descriptor = ChainDescriptorSchema.parse({
            jumps: [{from: 100, to: 90}]
        });

        await chain.setChain(descriptor);

        const sample = chain.generateHeadBlockResponse(16);
        console.log(JSON.stringify(sample, null, 4));

        const rpc = new APIClient({
            provider: new FetchProvider(`http://127.0.0.1:${descriptor.http_port}`, {fetch})
        });

        const block = await rpc.v1.chain.get_block(16);
        console.log(JSON.stringify(block, null, 4));
    });

});
