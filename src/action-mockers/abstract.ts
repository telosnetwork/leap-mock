import {ActionDescriptor, ActionTrace} from "../types.js";
import {generateActionTrace} from "../utils.js";
import {ABI, Name, NameType} from "@greymass/eosio";
import {MockChainbase, TableIndexMapping, TableRow} from "../chainbase.js";


export interface MockingManifest {
    contracts: {
        [key: string]: {
            abi: ABI;
            tableMappings: TableIndexMapping;
        }
    };
    actions: ActionMocker[];
}

export class ApplyContext {
    globalSequence: number;
    actionOrdinal: number;
    db: MockChainbase;
    contractABI: ABI;
    contractAccount: Name;
    params: any;
    console: string;
    subActions: ActionTrace[];

    constructor(
        globalSequence: number,
        actionOrdinal: number,
        db: MockChainbase,
        contractABI: ABI,
        contractAccount: Name,
        params: any
    ) {
        this.globalSequence = globalSequence;
        this.actionOrdinal = actionOrdinal;
        this.db = db;
        this.contractABI = contractABI;
        this.contractAccount = contractAccount;
        this.params = params;
        this.console = '';
        this.subActions = [];
    }


    emplace(table: NameType, scope: NameType, row: TableRow) {
        this.db.emplace([this.contractAccount, table, scope], row);
    }

    modify(table: NameType, scope: NameType, row: TableRow) {
        this.db.modify([this.contractAccount, table, scope], row);
    }

    erase(table: NameType, scope: NameType, row: TableRow) {
        this.db.erase([this.contractAccount, table, scope], row);
    }

    find(
        table: NameType, scope: NameType,
        indexPosition: number,
        keyType: string,
        upperBound: string | number | bigint,
        lowerBound: string | number | bigint,
        limit: number
    ): TableRow[] {
        return this.db.find(this.contractAccount, table, scope, indexPosition, keyType, upperBound, lowerBound, limit);
    }

    findByPrimaryKey(table: NameType, scope: NameType, key: bigint): TableRow | undefined {
        return this.db.findByPrimaryKey([this.contractAccount, table, scope], key);
    }
}
export class EOSVMAssertionError extends Error {}

export function eosVMCheck(condition: boolean, errorMessage: string) {
    if (!condition)
        throw new EOSVMAssertionError(errorMessage);
}

export function sendAction(ctx: ApplyContext, action: ActionDescriptor) {
    ctx.subActions.push(
        generateActionTrace(
            ctx.actionOrdinal,
            ctx.globalSequence,
            ctx.contractABI,
            action
        )[1]
    );
}


export abstract class ActionMocker {
    code: Name;
    action: Name;

    constructor(code: NameType, action: NameType) {
        this.code = Name.from(code);
        this.action = Name.from(action);
    }

    handler(ctx: ApplyContext): void {}
}