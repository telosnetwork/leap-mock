import {Asset, Checksum160, Name, NameType, UInt64} from "@greymass/eosio";
import {ActionMocker, ApplyContext, eosVMCheck} from "../abstract.js";
import {Address} from "@ethereumjs/util";
import {
    addressToChecksum160,
    addressTypeToSHA256,
    assetQuantityToEvm,
    hexToUint8Array,
    uint8ArrayToBigInt
} from "../../utils.js";
import {JsonSerializable, TableRow} from "../../chainbase.js";
import {SELF} from "./constants.js";

let evmPrimaryKey = 0;

export class AccountRowJSON {
    index: string | number;
    address: string;
    account: string;
    code: string;
    nonce: string | number;
    balance: string;
}

export class AccountRow extends TableRow {
    index: UInt64;
    address: Address;
    account: Name;
    code: Uint8Array;
    nonce: bigint;
    balance: bigint;

    constructor(opts: {
        index: UInt64,
        address: Address,
        account: Name,
        code: Uint8Array,
        nonce: bigint,
        balance: bigint
    }) {
        super();
        this.index = opts.index;
        this.address = opts.address;
        this.account = opts.account;
        this.code = opts.code;
        this.nonce = opts.nonce;
        this.balance = opts.balance;
    }

    static primaryKey(row: AccountRow): bigint {
        return BigInt(row.index.toString());
    }

    static byAddress(row: AccountRow): bigint {
        return uint8ArrayToBigInt(addressTypeToSHA256(row.address).array);
    }

    static byAccount(row: AccountRow): bigint {
        return BigInt(row.account.value.toString());
    }

    static validateJSON(obj: any): obj is AccountRowJSON {
        return (
            obj &&
            typeof obj === 'object' &&
            'index' in obj &&
            (typeof obj.index === 'string' || typeof obj.index === 'number') &&
            'address' in obj &&
            typeof obj.address === 'string' &&
            'account' in obj &&
            typeof obj.account === 'string' &&
            'code' in obj &&
            typeof obj.code === 'string' &&
            'nonce' in obj &&
            (typeof obj.nonce === 'string' || typeof obj.nonce === 'number') &&
            'balance' in obj &&
            typeof obj.balance === 'string'
        );
    }

    static fromJSON(obj: JsonSerializable): AccountRow {
        if (!AccountRow.validateJSON(obj))
            throw new Error(`TableRow fromJSON validation error!`);

        return new AccountRow({
            index: UInt64.from(obj.index),
            address: new Address(Checksum160.from(obj.address).array),
            account: Name.from(obj.account),
            code: hexToUint8Array(obj.code),
            nonce: BigInt(obj.nonce),
            balance: BigInt(obj.balance)
        });
    }

    toJSON(): JsonSerializable {
        return {
            index: this.index.toString(),
            address: addressToChecksum160(this.address).toString(),
            account: this.account.toString(),
            nonce: this.nonce.toString(),
            code: '',
            balance: this.balance.toString()
        }
    }
}

export type AddressType = Address | Checksum160;

export abstract class TEVMMocker extends ActionMocker {
    nextEvmPrimaryKey() {
        evmPrimaryKey += 1;
        return UInt64.from(evmPrimaryKey);
    }

    getAccountByName(ctx: ApplyContext, name: NameType) {
        const key = Name.from(name).value.toString();
        return ctx.db.find(
            SELF, 'account', 'eosio.evm',
            3, 'i64',
            key, key,
            1
        ) as AccountRow[];
    }

    getAccountByAddress(ctx: ApplyContext, addr: AddressType) {
        const addr256 = addressTypeToSHA256(addr).toString();
        return ctx.db.find(
            SELF, 'account', 'eosio.evm',
            2, 'sha256',
            addr256, addr256,
            1
        ) as AccountRow[];
    }

    createAccountRow(ctx: ApplyContext, opts: {address: Address, account?: string}): AccountRow {
        const row = new AccountRow( {
            index: this.nextEvmPrimaryKey(),
            address: opts.address,
            account: Name.from(opts.account ? opts.account : ''),
            code: new Uint8Array(),
            nonce: BigInt(1),
            balance: BigInt(0)
        });
        ctx.emplace('account', 'eosio.evm', row);
        return row;
    }

    addBalance(ctx: ApplyContext, address: Address, quantity: Asset) {
        const adjustedAmount = assetQuantityToEvm(quantity);
        if (adjustedAmount == BigInt(0)) return;

        const accountRow = this.getAccountByAddress(ctx, address);

        eosVMCheck(accountRow.length == 1, 'this address does not exist. Open one first.');
        eosVMCheck(adjustedAmount > BigInt(0), 'amount must not be negative');

        accountRow[0].balance += adjustedAmount;
        ctx.db.modify([SELF, 'account', SELF], accountRow[0]);
    }

    addBalanceByName(ctx: ApplyContext, user: Name, quantity: Asset) {
        const adjustedAmount = assetQuantityToEvm(quantity);
        if (adjustedAmount == BigInt(0)) return;

        const accountRow = this.getAccountByName(ctx, user);

        eosVMCheck(accountRow.length == 1, 'this address does not exist. Open one first.');
        eosVMCheck(adjustedAmount > BigInt(0), 'amount must not be negative');

        accountRow[0].balance += adjustedAmount;
        ctx.db.modify([SELF, 'account', SELF], accountRow[0]);
    }
    subBalance(ctx: ApplyContext, user: Name, quantity: Asset) {
        const adjustedAmount = assetQuantityToEvm(quantity);
        if (adjustedAmount == BigInt(0)) return;

        const accountRow = this.getAccountByName(ctx, user);

        eosVMCheck(accountRow.length == 1, 'account does not have a balance (sub_balance)..');
        eosVMCheck(adjustedAmount > BigInt(0), 'amount must not be negative');
        eosVMCheck(accountRow[0].balance >= adjustedAmount, 'account balance too low')

        accountRow[0].balance -= adjustedAmount;
        ctx.db.modify([SELF, 'account', SELF], accountRow[0]);
    }
}
