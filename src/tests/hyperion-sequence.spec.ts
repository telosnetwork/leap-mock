import {ControllerContext} from "../controllerUtils.js";
import {ControllerConfig} from "../controller.js";
import {
    addressToChecksum160, addressToSHA256,
    assetQuantityToEvm,
    getRandomPort, randomByteArray,
} from "../utils.js";
import {expectSequence, getRPCClient} from "./utils.js";
import {assert} from "chai";
import {Asset, Name} from "@greymass/eosio";
import {AccountRow, TelosEVMCreate, TelosEVMOpenWallet} from "../action-mockers/telos.evm/index.js";
import {AccountsRow, AntelopeTransfer} from "../action-mockers/eosio.token/index.js";
import {Address} from "@ethereumjs/util";


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

    const testTransfer = 'simple token transfer';
    const quantity = '420.0000 TLOS';
    context.registerTestChain(testTransfer, {
        txs: {
            1: [new AntelopeTransfer({from: 'eosio', to: 'alice', quantity})]
        }
    });
    it(testTransfer, async function () {
        const chainInfo = context.getTestChain(testTransfer);
        await expectSequence(
            chainInfo,
            [1]
        );
        const runtime = context.controller.getRuntime(chainInfo.chainId);
        const balanceRows = runtime.chain.getDB().getTableRows('eosio.token', 'accounts', 'alice') as AccountsRow[];

        assert.equal(balanceRows.length, 1, 'Balance row not found for alice!');
        assert.equal(balanceRows[0].balance.toString(), quantity);

        const rpc = getRPCClient(`http://127.0.0.1:${chainInfo.httpPort}`);

        const balanceHttpRows = await rpc.get_table_rows({
            json: true,
            code: 'eosio.token',
            table: 'accounts',
            scope: 'alice'
        });

        assert.equal(
            JSON.stringify(balanceRows),
            JSON.stringify(balanceHttpRows.rows),
            'Rows fetched from http endpoint dont match internal'
        );
    });

    const testEvmDepositSimple = 'simple evm deposit';
    context.registerTestChain(testEvmDepositSimple, {
        txs: {
            1: [new TelosEVMCreate({account: 'alice0'})],
            2: [new TelosEVMCreate({account: 'alice1'})],
            3: [new TelosEVMCreate({account: 'alice2'})],
            4: [new AntelopeTransfer({from: 'alice1', to: 'eosio.evm', quantity})]
        }
    });
    it(testEvmDepositSimple, async function () {
        const chainInfo = context.getTestChain(testEvmDepositSimple);
        await expectSequence(
            chainInfo,
            [1, 2, 3, 4]
        );
        const runtime = context.controller.getRuntime(chainInfo.chainId);

        const getBalanceForAccount = (account: string) => runtime.chain.getDB().getTableRowsAPI({
            code: 'eosio.evm', table: 'account', scope: 'eosio.evm',
            key_type: 'i64',
            index_position: 2,
            lower_bound: Name.from(account).value.toString(),
            upper_bound: Name.from(account).value.toString(),
            limit: 1
        }) as AccountRow[];

        const alice0Balance = getBalanceForAccount('alice0');
        const alice1Balance = getBalanceForAccount('alice1');
        const alice2Balance = getBalanceForAccount('alice2');

        assert.equal(alice0Balance.length, 1, 'Balance row not found for alice0!');
        assert.equal(alice2Balance.length, 1, 'Balance row not found for alice2!');
        assert.equal(alice0Balance[0].balance, BigInt(0), 'Non zero balance for alice0!');
        assert.equal(alice2Balance[0].balance, BigInt(0), 'Non zero balance for alice2!');

        assert.equal(alice1Balance.length, 1, 'Balance row not found for alice1!');
        assert.equal(alice1Balance[0].balance, assetQuantityToEvm(Asset.from(quantity)), 'Balance row not found for alice1!');

        const rpc = getRPCClient(`http://127.0.0.1:${chainInfo.httpPort}`);

        const balanceHttpRows = (await rpc.get_table_rows({
            json: true,
            code: 'eosio.evm', table: 'account', scope: 'eosio.evm',
            key_type: 'i64',
            index_position: 2,
            lower_bound: Name.from('alice1').value.toString(),
            upper_bound: Name.from('alice1').value.toString(),
            limit: 1
        })).rows;

        assert.equal(BigInt(balanceHttpRows[0].balance), alice1Balance[0].balance, 'Internal get table rows doesnt match http api')
    });

    const testEvmDepositAddrInMemo = 'evm deposit address in memo';
    const testDepositAddr = Address.fromPublicKey(randomByteArray(64));
    context.registerTestChain(testEvmDepositAddrInMemo, {
        txs: {
            1: [new TelosEVMOpenWallet({account: 'alice', address: addressToChecksum160(testDepositAddr)})],
            2: [new AntelopeTransfer({from: 'alice', to: 'eosio.evm', quantity, memo: testDepositAddr.toString()})]
        }
    });
    it(testEvmDepositAddrInMemo, async function () {
        const chainInfo = context.getTestChain(testEvmDepositAddrInMemo);
        await expectSequence(
            chainInfo,
            [1, 2]
        );
        const runtime = context.controller.getRuntime(chainInfo.chainId);

        const getBalanceForAddress = (addr: Address) => runtime.chain.getDB().getTableRowsAPI({
            code: 'eosio.evm', table: 'account', scope: 'eosio.evm',
            key_type: 'sha256',
            index_position: 3,
            lower_bound: addressToSHA256(addr).toString(),
            upper_bound: addressToSHA256(addr).toString(),
            limit: 1
        });

        const addrBalance = getBalanceForAddress(testDepositAddr) as AccountRow[];

        assert.equal(addrBalance.length, 1, 'Balance row not found for deposit addr!');
        assert.equal(addrBalance[0].balance, assetQuantityToEvm(Asset.from(quantity)), 'Balance mismatch for deposit addr!');

        const rpc = getRPCClient(`http://127.0.0.1:${chainInfo.httpPort}`);

        const balanceHttpRows = (await rpc.get_table_rows({
            json: true,
            code: 'eosio.evm', table: 'account', scope: 'eosio.evm',
            key_type: 'sha256',
            index_position: 3,
            lower_bound: addressToSHA256(testDepositAddr).toString(),
            upper_bound: addressToSHA256(testDepositAddr).toString(),
            limit: 1
        })).rows;

        assert.equal(BigInt(balanceHttpRows[0].balance), addrBalance[0].balance, 'Internal get table rows doesnt match http api')
    });
});
