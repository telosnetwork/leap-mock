import {describeMockChainTests} from "./utils.js";
import {AccountsRow, AntelopeTransfer} from "../mock/eosio.token/index.js";
import {ControllerContext} from "../controllerUtils.js";
import {ChainRuntime, NewChainInfo} from "../controller.js";
import {assert, expect} from "chai";
import {
    buildEVMTx,
    getEVMBalanceForAccount, getEVMBalanceForAccountHTTP,
    getEVMBalanceForAddress, getEVMBalanceForAddressHTTP,
    TelosEVMCreate,
    TelosEVMOpenWallet,
    TelosEVMRaw, TelosEVMWithdraw
} from "../mock/telos.evm/index.js";
import {addressToChecksum160, assetQuantityToEvm, randomByteArray} from "../utils.js";
import {Address} from "@ethereumjs/util";
import {getBalanceForAccount, getBalanceForAccountHTTP} from "../mock/eosio.token/utils.js";
import {Name, Serializer} from "@greymass/eosio";

const quantity = '420.0000 TLOS'

const testPrivateKeys = [];
const testAddresses = [];
for (let i = 0; i < 10; i++) {
    const priv = randomByteArray(32);
    testPrivateKeys.push(priv);
    testAddresses.push(Address.fromPrivateKey(priv));
}

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
                const balanceRows = getBalanceForAccount(runtime, 'alice');

                expect(balanceRows, 'Balance row not found for alice!').to.not.be.undefined;
                expect(
                    balanceRows.balance.toString() == quantity,
                    'Balance mistmach for alice!'
                ).to.be.true;

                const rpc = context.controller.getRPC(chainInfo.chainId);
                const balanceHttpRows = await getBalanceForAccountHTTP(rpc, 'alice') as AccountsRow;

                expect(
                    balanceRows.balance.equals(balanceHttpRows.balance),
                    'Rows fetched from http endpoint dont match internal'
                ).to.be.true;
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
                const alice0Balance = getEVMBalanceForAccount(runtime, 'alice0');
                const alice1Balance = getEVMBalanceForAccount(runtime, 'alice1');
                const alice2Balance = getEVMBalanceForAccount(runtime, 'alice2');

                expect(alice0Balance, 'Balance row not found for alice0!').to.not.be.undefined;
                expect(alice2Balance, 'Balance row not found for alice2!').to.not.be.undefined;
                assert.equal(alice0Balance.balance, BigInt(0), 'Non zero balance for alice0!');
                assert.equal(alice2Balance.balance, BigInt(0), 'Non zero balance for alice2!');

                expect(alice1Balance, 'Balance row not found for alice1!').to.not.be.undefined;
                assert.equal(alice1Balance.balance, assetQuantityToEvm(quantity), 'Balance row not found for alice1!');

                const rpc = context.controller.getRPC(chainInfo.chainId);
                const balanceHttpRow = await getEVMBalanceForAccountHTTP(rpc, 'alice1');

                expect(balanceHttpRow, 'Balance row not found over http!').to.not.be.undefined;
                assert.equal(balanceHttpRow.balance, alice1Balance.balance, 'Internal get table rows doesnt match http api')
            }
        },
        'evm deposit address in memo': {
            sequence: [1, 2],
            chainConfig: {
                txs: {
                    1: [new TelosEVMOpenWallet({account: 'alice', address: addressToChecksum160(testAddresses[0])})],
                    2: [new AntelopeTransfer({from: 'alice', to: 'eosio.evm', quantity, memo: testAddresses[0].toString()})]
                }
            },
            testFn: async function (context: ControllerContext, chainInfo: NewChainInfo, runtime: ChainRuntime): Promise<void> {
                const addrBalance = getEVMBalanceForAddress(runtime, testAddresses[0]);

                expect(addrBalance, 'Balance row not found for deposit addr!').to.not.be.undefined;
                assert.equal(addrBalance.balance, assetQuantityToEvm(quantity), 'Balance mismatch for deposit addr!');

                const rpc = context.controller.getRPC(chainInfo.chainId);
                const balanceHttpRow = await getEVMBalanceForAddressHTTP(rpc, testAddresses[0]);

                expect(balanceHttpRow, 'Balance row not found over http!').to.not.be.undefined;
                assert.equal(balanceHttpRow.balance, addrBalance.balance, 'Internal get table rows doesnt match http api')
            }
        },
        'simple raw evm tx': {
            sequence: [1, 2, 3],
            chainConfig: {
                txs: {
                    1: [new TelosEVMOpenWallet({account: 'alice', address: addressToChecksum160(testAddresses[0])})],
                    2: [new AntelopeTransfer({from: 'alice', to: 'eosio.evm', quantity, memo: testAddresses[0].toString()})],
                    3: [new TelosEVMRaw({
                            ram_payer: 'alice',
                            tx: buildEVMTx({
                                senderKey: testPrivateKeys[0],
                                txParams: {
                                    nonce: 1,
                                    gasPrice: BigInt(0),
                                    gasLimit: BigInt(21000),
                                    to: testAddresses[1],
                                    value: assetQuantityToEvm(quantity),
                                    data: '0x'
                                }
                            }),
                            estimate_gas: false
                    })]
                }
            },
            testFn: async function (context: ControllerContext, chainInfo: NewChainInfo, runtime: ChainRuntime) {
                const addr0Balance = getEVMBalanceForAddress(runtime, testAddresses[0]);
                const addr1Balance = getEVMBalanceForAddress(runtime, testAddresses[1]);

                expect(addr0Balance, 'Balance row not found for address 0!').to.not.be.undefined;
                expect(addr1Balance, 'Balance row not found for address 1!').to.not.be.undefined;

                assert.equal(addr0Balance.balance, BigInt(0), 'Non zero balance for address 0!');
                assert.equal(addr1Balance.balance, assetQuantityToEvm(quantity), 'Balance mismatch for secondary deposit addr!');

                const rpc = context.controller.getRPC(chainInfo.chainId);
                const balanceHttpRow = await getEVMBalanceForAddressHTTP(rpc, testAddresses[1]);
                assert.equal(balanceHttpRow.balance, addr1Balance.balance, 'Internal get table rows doesnt match http api')
            }
        },
        'simple evm withdraw': {
            sequence: [1, 2, 3],
            chainConfig: {
                txs: {
                    1: [new TelosEVMCreate({account: 'alice'})],
                    2: [new AntelopeTransfer({from: 'alice', to: 'eosio.evm', quantity})],
                    3: [new TelosEVMWithdraw({to: 'alice', quantity})]
                }
            },
            testFn: async function (context: ControllerContext, chainInfo: NewChainInfo, runtime: ChainRuntime): Promise<void> {
                const aliceEVMBalance = getEVMBalanceForAccount(runtime, 'alice');
                const aliceBalance = getBalanceForAccount(runtime, 'alice');

                expect(aliceEVMBalance, 'EVM Balance row not found for alice!').to.not.be.undefined;
                expect(aliceBalance, 'Balance row not found for alice!').to.not.be.undefined;

                assert.equal(aliceEVMBalance.balance, BigInt(0), 'Non zero balance for alice!');
                expect(
                    aliceBalance.balance.equals(quantity),
                    'Balance mismatch for alice!'
                ).to.be.true;

                // assert subaction produces correct trace
                const block = runtime.chain.generateHeadBlockResponse(3);
                const traces = Serializer.decode({
                    data: block.traces,
                    type: 'transaction_trace[]',
                    abi: runtime.chain.shipAbi
                })[0][1];

                // console.log(JSON.stringify(traces, null, 4));

                expect(traces.action_traces.length).to.be.eq(3);
                expect(traces.action_traces[0][1].receiver.toString()).to.be.eq('eosio.evm');
                expect(traces.action_traces[1][1].receiver.toString()).to.be.eq('eosio.token');
                expect(traces.action_traces[2][1].receiver.toString()).to.be.eq('eosio.evm');
            }
        }
    }
);
