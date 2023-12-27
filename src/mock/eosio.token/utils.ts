import {ChainRuntime} from "../../controller.js";
import {JsonRpc} from "eosjs";
import {NameType} from "@greymass/eosio";
import {AccountsRow} from "./tables.js";
import {JsonSerializable} from "../../chainbase.js";
import {SELF} from "./constants.js";

export function getBalanceForAccount(runtime: ChainRuntime, account: NameType): AccountsRow | undefined {
    const rows = runtime.chain.getDB().getTableRows(
        SELF, 'accounts', account) as AccountsRow[];

    if (rows.length == 1)
        return rows[0]
    else
        return undefined;
}

export async function getBalanceForAccountHTTP(rpc: JsonRpc, account: NameType): Promise<AccountsRow | undefined> {
    const rows = (await rpc.get_table_rows({
        json: true,
        code: SELF.toString(), table: 'accounts', scope: account.toString(),
    })).rows as JsonSerializable[];

    if (rows.length == 1)
        return AccountsRow.fromJSON(rows[0]);
    else
        return undefined;
}
