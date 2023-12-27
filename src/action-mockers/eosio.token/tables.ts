import {Asset} from "@greymass/eosio";
import {TableRow} from "../../chainbase.js";

export class AccountsRow extends TableRow {
    balance: Asset;

    constructor(balance: Asset) {
        super();
        this.balance = balance;
    }
    static primaryKey(row: AccountsRow): bigint {
        return BigInt(row.balance.symbol.code.value.toString())
    }

    toJSON() {
        return {
            balance: this.balance.toString()
        }
    }
}