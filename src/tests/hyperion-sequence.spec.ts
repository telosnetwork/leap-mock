import {describeMockChainTests, getRPCClient} from "./utils.js";
import {AccountsRow, AntelopeTransfer} from "../action-mockers/eosio.token/index.js";
import {ControllerContext} from "../controllerUtils.js";
import {ChainRuntime, NewChainInfo} from "../controller.js";
import {assert} from "chai";
import {AccountRow, TelosEVMCreate, TelosEVMOpenWallet} from "../action-mockers/telos.evm/index.js";
import {Asset, Name} from "@greymass/eosio";
import {addressToChecksum160, addressToSHA256, assetQuantityToEvm, randomByteArray} from "../utils.js";
import {Address} from "@ethereumjs/util";

const quantity = '420.0000 TLOS'
const testDepositAddr = new Address(randomByteArray(20));

describeMockChainTests(
    'Hyperion In Order Sequence',
    {
        'simple fork': {
            sequence: [
                1, 2, 3, 4, 5,
                3, 4, 5, 6
            ],
            chainConfig: {jumps: [[5, 3]]}
        },
        'double fork': {
            sequence: [
                1, 2, 3, 4, 5,
                3, 4, 5, 6, 6, 7
            ],
            chainConfig: {jumps: [[5, 3], [6, 6]]}
        },
        'simple reconnect': {
            sequence: [1, 2, 3 ,4],
            chainConfig: {pauses: [[3, 2]]}
        },
        'multi reconnect': {
            sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            chainConfig: {pauses: [[3, 2], [10, 2]]}
        },
        'simple token transfer': {
            sequence: [1],
            chainConfig: {
                txs: {
                    1: [new AntelopeTransfer({from: 'eosio', to: 'alice', quantity})]
                }
            },
            testFn: async function (context: ControllerContext, chainInfo: NewChainInfo, runtime: ChainRuntime): Promise<void> {
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
            }
        },
        'simple evm deposit': {
            sequence: [1, 2, 3, 4],
            chainConfig: {
                txs: {
                    1: [new TelosEVMCreate({account: 'alice0'})],
                    2: [new TelosEVMCreate({account: 'alice1'})],
                    3: [new TelosEVMCreate({account: 'alice2'})],
                    4: [new AntelopeTransfer({from: 'alice1', to: 'eosio.evm', quantity})]
                }
            },
            testFn: async function (context: ControllerContext, chainInfo: NewChainInfo, runtime: ChainRuntime): Promise<void> {
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
            }
        },
        'evm deposit address in memo': {
            sequence: [1, 2],
            chainConfig: {
                txs: {
                    1: [new TelosEVMOpenWallet({account: 'alice', address: addressToChecksum160(testDepositAddr)})],
                    2: [new AntelopeTransfer({from: 'alice', to: 'eosio.evm', quantity, memo: testDepositAddr.toString()})]
                }
            },
            testFn: async function (context: ControllerContext, chainInfo: NewChainInfo, runtime: ChainRuntime): Promise<void> {
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
            }
        }
    }
);
