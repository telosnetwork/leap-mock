import {ApplyContext, eosVMCheck, sendAction} from "../abstract.js";
import {Checksum160} from "@greymass/eosio";
import {Address} from "@ethereumjs/util";
import {randomByteArray} from "../../utils.js";
import {TEVMTransaction} from "telos-evm-custom-ds";
import {AccountRow, TEVMMocker} from "./tables.js";
import {SELF, TOKEN_SYMBOL} from "./constants.js";
import {AntelopeTransfer} from "../eosio.token/index.js";


export class TEVMTransferMocker extends TEVMMocker {
    handler(ctx: ApplyContext): void {
        const outgoing: boolean = SELF.equals(ctx.params.from);
        const systemDeposit: boolean = ctx.params.from in [
            'eosio', 'eosio.ram', 'eosio.stake'
        ];
        if (outgoing || systemDeposit)
            return;

        const validSym: boolean = ctx.params.quantity.symbol.equals(TOKEN_SYMBOL);
        const validTo: boolean = ctx.params.to.equals(SELF);
        eosVMCheck(validSym && validTo, 'Invalid Deposit')

        let addressInMemo = false;
        let address: Address;
        try {
            address = Address.fromString(ctx.params.memo);
            addressInMemo = true;
        } catch (e) {}

        if (addressInMemo)
            this.addBalance(ctx, address, ctx.params.quantity);
        else
            this.addBalanceByName(ctx, ctx.params.from, ctx.params.quantity);
    }
}

export class TEVMCreateMocker extends TEVMMocker {
    handler(ctx: ApplyContext): void {
        let row = this.getAccountByName(ctx, ctx.params.account);
        eosVMCheck(row.length == 0, 'an EVM account is already linked to this Telos account.');

        const newAddr = new Address(randomByteArray(20));
        row = this.getAccountByAddress(ctx, newAddr);
        eosVMCheck(row.length == 0, 'an EVM account with this address already exists.');

        this.createAccountRow(
            ctx, {address: newAddr, account: ctx.params.account});
    };
}

export class TEVMOpenWallet extends TEVMMocker {
    handler(ctx: ApplyContext) {
        let row = this.getAccountByAddress(ctx, ctx.params.address);
        eosVMCheck(row.length == 0, 'this address already exists.');
        this.createAccountRow(ctx, {address: new Address(ctx.params.address.array)});
    }
}

export class TEVMRawMocker extends TEVMMocker {
    handler(ctx: ApplyContext) {
        const tx: TEVMTransaction = TEVMTransaction.fromSerializedTx(ctx.params.tx);
        const maxGasCost = tx.gasPrice * tx.gasLimit;

        let callerRow: AccountRow;
        if (!tx.isSigned()) {
            eosVMCheck(ctx.params.sender, 'Invalid Transaction: no signature in transaction and no sender address was provided.');
            const senderAddr = new Address((ctx.params.sender as Checksum160).array);
            const callerRows = this.getAccountByAddress(ctx, senderAddr);
            eosVMCheck(callerRows.length == 1, 'Invalid Transaction: sender address does not exist (without signature).');
            callerRow = callerRows[0];
        } else {
            const callerRows = this.getAccountByAddress(ctx, tx.getSenderAddress())
            eosVMCheck(callerRows.length == 1, 'Invalid Transaction: sender address does not exist (with signature).');
            callerRow = callerRows[0];
        }

        eosVMCheck(callerRow.nonce == tx.nonce, `Invalid Transaction: incorrect nonce, received ${tx.nonce} and expected ${callerRow.nonce}`);
        eosVMCheck(((callerRow.balance - maxGasCost - tx.value) >= BigInt(0)), 'Invalid Transaction: Sender balance too low for value specified');

        callerRow.nonce += BigInt(1);
        callerRow.balance -= maxGasCost + tx.value;
        ctx.modify('accounts', 'eosio.evm', callerRow);

        if (tx.to) {
            const recipientRows = this.getAccountByAddress(ctx, tx.to);
            let recipientRow: AccountRow;
            if (recipientRows.length == 0)
                recipientRow = this.createAccountRow(ctx, {address: tx.to});
            else
                recipientRow = recipientRows[0];

            recipientRow.balance += tx.value;
            ctx.modify('accounts', 'eosio.evm', recipientRow);
        }

        // TODO: smart contract calls
    }
}

export class TEVMWithdrawMocker extends TEVMMocker {
    handler(ctx: ApplyContext) {
        this.subBalance(ctx, ctx.params.to, ctx.params.quantity);

        sendAction(
            ctx,
            new AntelopeTransfer({
                from: this.code.toString(),
                to: ctx.params.to,
                quantity: ctx.params.quantity,
                memo: `Withdraw balance for: ${ctx.params.to}`
            })
        );
    }
}