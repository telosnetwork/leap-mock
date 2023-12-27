import {ActionMocker, ApplyContext} from "../abstract.js";
import {Asset} from "@greymass/eosio";
import {SELF, TOKEN_SYMBOL} from "./constants.js";
import {AccountsRow} from "./tables.js";

export class TransferMocker extends ActionMocker {
    handler(ctx: ApplyContext): void {
        const balanceRow = ctx.db.getTableRows(SELF, 'accounts', ctx.params.to);
        if (balanceRow.length == 0) {
            ctx.emplace('accounts', ctx.params.to, new AccountsRow(Asset.fromFloat(0, TOKEN_SYMBOL)))
        }

        const row = ctx.findByPrimaryKey('accounts', ctx.params.to, BigInt(TOKEN_SYMBOL.code.value.toString())) as AccountsRow;
        row.balance.units.add(Asset.from(ctx.params.quantity).units);
        ctx.modify('accounts', ctx.params.to, row);
    }
}
