import {LegacyTxData} from "@ethereumjs/tx";
import {TEVMTransaction} from "telos-evm-custom-ds";
import {addHexPrefix, Address} from "@ethereumjs/util";
import * as evm from "@ethereumjs/common";
import {APIClient, Name, NameType, UInt64} from "@wharfkit/antelope";
import {AccountRow} from "./tables.js";
import {ChainRuntime} from "../../controller.js";
import {addressToSHA256} from "../../utils.js";
import {JsonSerializable} from "../../chainbase.js";
import {SELF} from "./constants.js";

export let defaultCommon = evm.Common.custom({
    chainId: 40,
    defaultHardfork: evm.Hardfork.Istanbul
}, {baseChain: evm.Chain.Mainnet});

export function setCommon(common: evm.Common) {
    defaultCommon = common;
}

const defaultParams: LegacyTxData = {
    nonce: 1,
    gasPrice: 0,
    gasLimit: 21000,
    to: Address.zero(),
    value: 0,
    data: '0x'
};

export function removeHexPrefix(str: string) {
    if (str.startsWith('0x')) {
        return str.slice(2);
    } else {
        return str;
    }
}

export function generateUniqueVRS(
    blockHash: string,
    sender: string,
    trx_index: number
): [bigint, bigint, bigint] {
    const v = BigInt(42);  // why is v 42? well cause its the anwser to life

    const trxIndexBI = BigInt(trx_index);
    const blockHashBI = BigInt(addHexPrefix(blockHash.toLowerCase()));

    const r = blockHashBI + trxIndexBI;
    const s = BigInt(
        addHexPrefix(
            removeHexPrefix(sender.toLowerCase()).padEnd(64, '0')
        )
    );

    return [v, r, s];
}

export function buildEVMTx(opts: {
    senderKey?: Uint8Array,
    vrsParams?: {blockHash: string, senderAddr: string, trxIndex: number},
    txParams?: LegacyTxData,
    common?: evm.Common
}): TEVMTransaction {
    const txParams = {
        ...defaultParams,
        ...opts.txParams
    };
    if (opts.vrsParams) {
        const [v, r, s] = generateUniqueVRS(
            opts.vrsParams.blockHash, opts.vrsParams.senderAddr, opts.vrsParams.trxIndex
        );
        txParams.v =  v;
        txParams.r = r;
        txParams.s = s;
    }
    const common = opts.common ? opts.common : defaultCommon;
    let tx: TEVMTransaction = TEVMTransaction.fromTxData(txParams, {common});
    if (opts.senderKey)
        tx = tx.sign(opts.senderKey);

    return tx;
}

export function getEVMBalanceForAccount(runtime: ChainRuntime, account: NameType): AccountRow {
    const rows = runtime.chain.getDB().getTableRowsAPI({
        code: SELF, table: 'account', scope: SELF,
        key_type: 'i64',
        index_position: 3,
        lower_bound: Name.from(account).value.toString(),
        upper_bound: Name.from(account).value.toString(),
        limit: 1
    }) as AccountRow[];

    if (rows.length == 1)
        return rows[0];
    else
        return undefined;
}

export async function getEVMBalanceForAccountHTTP(rpc: APIClient, account: NameType): Promise<AccountRow | undefined> {
    const rows = (await rpc.v1.chain.get_table_rows({
        json: true,
        code: SELF.toString(), table: 'account', scope: SELF.toString(),
        key_type: 'i64',
        index_position: 'fourth',
        lower_bound: UInt64.from(account),
        upper_bound: UInt64.from(account),
        limit: 1
    })).rows as JsonSerializable[];

    if (rows.length == 1)
        return AccountRow.fromJSON(rows[0]);
    else
        return undefined;
}

export function getEVMBalanceForAddress(runtime: ChainRuntime, addr: Address): AccountRow {
    const rows = runtime.chain.getDB().getTableRowsAPI({
        code: SELF, table: 'account', scope: SELF,
        key_type: 'sha256',
        index_position: 2,
        lower_bound: addressToSHA256(addr).toString(),
        upper_bound: addressToSHA256(addr).toString(),
        limit: 1
    }) as AccountRow[];

    if (rows.length == 1)
        return rows[0];
    else
        return undefined;
}

export async function getEVMBalanceForAddressHTTP(rpc: APIClient, addr: Address): Promise<AccountRow | undefined> {
    const rows = (await rpc.v1.chain.get_table_rows({
        json: true,
        code: SELF, table: 'account', scope: SELF,
        key_type: 'sha256',
        index_position: 'tertiary',
        lower_bound: addressToSHA256(addr),
        upper_bound: addressToSHA256(addr),
        limit: 1
    })).rows as JsonSerializable[];

    if (rows.length == 1)
        return AccountRow.fromJSON(rows[0]);
    else
        return undefined;
}
