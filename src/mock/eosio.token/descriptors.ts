import {ActionDescriptor} from "../../types";
import {SELF} from "./constants.js";
import {AssetType, NameType} from "@greymass/eosio";

export class AntelopeTransfer implements ActionDescriptor {
    account: NameType = SELF;
    name: NameType = 'transfer';
    parameters: {
        from: NameType;
        to: NameType;
        quantity: AssetType;
        memo: string;
    };

    constructor(opts: {
        from: NameType, to: NameType, quantity: AssetType,
        memo?: string
    }) {
        this.parameters = {
            ...opts,
            memo: opts.memo ? opts.memo : ''
        };
    }
}
