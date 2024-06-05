import {ABI, Checksum256, Int64, Name, NameType, UInt64} from "@wharfkit/antelope";
import {nameToBigInt, uint8ArrayToBigInt} from "./utils.js";
import {eosVMCheck} from "./mock/abstract.js";
import {BufferedMap, MapLevel} from "./bufferedMap.js";


function lowerBoundForType(keyType: string) {
    if (keyType == 'i64') {
        return BigInt(Int64.min.toString());
    } else if (keyType == 'u64') {
        return BigInt(UInt64.min.toString());
    } else if (keyType == 'sha256') {
        return BigInt(0);
    }
    throw new Error(`lowerBound for ${keyType} not implemented!`)
}

function upperBoundForType(keyType: string) {
    if (keyType == 'i64') {
        return BigInt(Int64.max.toString());
    } else if (keyType == 'u64') {
        return BigInt(UInt64.max.toString());
    } else if (keyType == 'sha256') {
        return BigInt(2) ** BigInt(256);
    }
    throw new Error(`upperBound for ${keyType} not implemented!`)
}

function keyTypeToValue(val: any, keyType: string) {
    if (keyType == 'i64') {
        return BigInt(Int64.from(val).value.toString());
    } else if (keyType == 'u64') {
        return BigInt(UInt64.from(val).value.toString());
    } else if (keyType == 'sha256') {
        return uint8ArrayToBigInt(Checksum256.from(val as string).array);
    }
    throw new Error(`keyType to value for ${keyType} not implemented!`)
}

export type JsonSerializable = {
    [key: string]: string | number | boolean | null | JsonSerializable | JsonSerializableArray;
};

export interface JsonSerializableArray extends Array<string | number | boolean | null | JsonSerializable | JsonSerializableArray> { }

export abstract class TableRow {
    static primaryKey(row: TableRow): bigint {
        throw new Error('Called abstract primary key implementation...');
    }

    static validateJSON(obj: any): any {
        throw new Error('Called abstract validateJSON implementation...');
    }

    static fromJSON(obj: JsonSerializable): TableRow {
        throw new Error('Called abstract fromJSON implementation...');
    }

    abstract toJSON(): JsonSerializable;

}

export type TableIndex = (row: TableRow) => bigint;

export interface TableIndexMapping {
    [key: string]: TableIndex[];
}

export type TableRowMap = Map<bigint, TableRow>
export type ScopeMap = Map<bigint, TableRowMap>;
export type TableMap = Map<bigint, ScopeMap>;
export type GlobalDB = Map<bigint, TableMap>;

export interface ContractDefs {
    abi: ABI;
    indexes: Map<bigint, TableIndex[]>;
}
export type ContractsMap = Map<bigint, ContractDefs>;

export interface GetTableRowsOptions {
    code: NameType,
    table: NameType,
    scope: NameType,
    index_position?: number,
    limit?: number,
    key_type?: string,
    lower_bound?: string | number,
    upper_bound?: string | number
}

export type TableKey  = [
    code: NameType,
    table: NameType,
    scope: NameType
];

export class MockChainbase {
    private contracts: ContractsMap = new Map<bigint, ContractDefs>();

    // 4 level map: [contract, table, scope, row] bigint keys -> TableRow
    private db: BufferedMap<bigint, TableRow> = new BufferedMap<bigint, TableRow>();

    commit() {
        this.db.commit();
    }

    revert() {
        this.db.discard();
    }

    setContract(account: NameType, defs: ContractDefs) {
        this.contracts.set(nameToBigInt(account), defs);
    }

    getContract(account: NameType) {
        const key = nameToBigInt(account);
        if (!this.contracts.has(key))
            throw new Error(`Fail to retrive account for ${account}`);

        return this.contracts.get(key);
    }

    getTableIndex(code: NameType, table: NameType, position: number): TableIndex {
        const contract = this.getContract(code);
        const indexes = contract.indexes.get(nameToBigInt(table));
        if (position > indexes.length)
            throw new Error(`table index not found at position ${position}`);

        // index positions are always +1
        const idx = position - 1;

        return indexes[idx];
    }

    getTableRows(
        code: NameType, table: NameType, scope: NameType
    ): TableRow[] {
        const codeKey = nameToBigInt(code);
        const tableKey = nameToBigInt(table);
        const scopeKey = nameToBigInt(scope);

        const scopeRows = this.db.get([codeKey, tableKey, scopeKey]);
        if (!scopeRows)
            return [];

        return Array.from((scopeRows as MapLevel).values());
    }

    find(
        code: NameType, table: NameType, scope: NameType,
        indexPosition: number,
        keyType: string,
        upperBound: string | number | bigint,
        lowerBound: string | number | bigint,
        limit: number
    ): TableRow[] {
        let rows: TableRow[] = this.getTableRows(code, table, scope);
        const indexFunction = this.getTableIndex(code, table, indexPosition);

        let lowerBoundKey = lowerBound;
        if (typeof lowerBound !== 'bigint')
            lowerBoundKey = keyTypeToValue(lowerBound, keyType);

        let upperBoundKey = upperBound;
        if (typeof upperBound !== 'bigint')
            upperBoundKey = keyTypeToValue(upperBound, keyType);

        rows = rows.filter(
            // @ts-ignore
            row => (indexFunction(row) >= lowerBoundKey) && (indexFunction(row) <= upperBoundKey)
        );

        return rows.slice(0, limit);
    }

    primaryKeyForRow(row: TableRow): bigint {
        const rowClass = row.constructor;
        // @ts-ignore
        return rowClass.primaryKey(row);
    }

    findByPrimaryKey(target: TableKey, key: bigint): TableRow | undefined {
        const [code, table, scope] = target;
        const rows = this.find(
            code, table, scope, 1, 'i64',
            key, key,
            1
        );
        return rows.length == 1 ? rows[0] : undefined;
    }
    getTableRowsAPI(opts: GetTableRowsOptions, jsonify: boolean = false): TableRow[] | JsonSerializable[] {
        const abiTable = this.getContract(opts.code).abi.tables.find(
            t => Name.from(t.name).equals(opts.table));

        if (!abiTable)
            throw new Error(`Table ${opts.table} is not specified in the ABI`);

        const limit = opts.limit ? opts.limit : 1000;
        let rows: TableRow[] = [];
        if (opts.lower_bound || opts.upper_bound) {

            let lowerBound = lowerBoundForType(opts.key_type);
            if (opts.lower_bound)
                lowerBound = keyTypeToValue(opts.lower_bound, opts.key_type);

            let upperBound = upperBoundForType(opts.key_type);
            if (opts.upper_bound)
                upperBound = keyTypeToValue(opts.lower_bound, opts.key_type);

            rows = this.find(
                opts.code, opts.table, opts.scope,
                opts.index_position ? opts.index_position : 1,
                opts.key_type ? opts.key_type : 'i64',
                lowerBound,
                upperBound,
                opts.limit ? opts.limit : 1000
            )
        } else
            rows = this.getTableRows(opts.code, opts.table, opts.scope).slice(0, limit);

        if (jsonify) {
            const jsonRows: JsonSerializable[] = [];
            rows.forEach((row) => jsonRows.push(row.toJSON()));
            return jsonRows;
        }

        return rows;
    }

    emplace(target: TableKey, row: TableRow) {
        const [code, table, scope] = target;
        // this.maybeCreateMaps(code, table, scope);
        const codeKey = nameToBigInt(code);
        const tableKey = nameToBigInt(table);
        const scopeKey = nameToBigInt(scope);


        const rowKey = this.primaryKeyForRow(row);
        const existingRow = this.findByPrimaryKey(target, rowKey);
        eosVMCheck(existingRow == undefined, 'tried to emplace but row exists');

        this.db.set([codeKey, tableKey, scopeKey, rowKey], row);
    }

    modify(target: TableKey, row: TableRow) {
        const [code, table, scope] = target;
        const codeKey = nameToBigInt(code);
        const tableKey = nameToBigInt(table);
        const scopeKey = nameToBigInt(scope);

        const rowKey = this.primaryKeyForRow(row);
        const existingRow = this.findByPrimaryKey(target, rowKey);
        eosVMCheck(existingRow != undefined, 'tried to modify but row not found');

        this.db.set([codeKey, tableKey, scopeKey, rowKey], row);
    }

    erase(target: TableKey, row: TableRow) {
        const [code, table, scope] = target;
        const codeKey = nameToBigInt(code);
        const tableKey = nameToBigInt(table);
        const scopeKey = nameToBigInt(scope);

        const rowKey = this.primaryKeyForRow(row);
        const existingRow = this.findByPrimaryKey(target, rowKey);
        eosVMCheck(existingRow != undefined, 'tried to erase but row not found');

        this.db.delete([codeKey, tableKey, scopeKey, rowKey]);
    }
}