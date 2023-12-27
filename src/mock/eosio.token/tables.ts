import {Asset} from "@greymass/eosio";
import {JsonSerializable, TableRow} from "../../chainbase.js";

export interface AccountsRowJSON {
    balance: string;
}

export class AccountsRow extends TableRow {
    balance: Asset;

    constructor(balance: Asset) {
        super();
        this.balance = balance;
    }
    static primaryKey(row: AccountsRow): bigint {
        return BigInt(row.balance.symbol.code.value.toString())
    }

    static validateJSON(obj: any): obj is AccountsRowJSON {
        return (
            obj &&
            typeof obj === 'object' &&
            'balance' in obj &&
            typeof obj.balance === 'string'
        );
    }

    static fromJSON(obj: JsonSerializable): AccountsRow {
        if (!AccountsRow.validateJSON(obj))
            throw new Error(`TableRow fromJSON validation error!`);

        return new AccountsRow(Asset.from(obj.balance));
    }

    toJSON() {
        return {
            balance: this.balance.toString()
        }
    }
}