import {MockingManifest} from "../abstract.js";
import {TransferMocker} from "./mockers.js";
import {SELF} from "./constants.js";
import {AccountsRow} from "./tables.js";
import {loadAbi} from "../../abis/utils.js";

export * from './descriptors.js';
export * from './constants.js';
export * from './mockers.js';
export * from './tables.js';

export const mockingManifest: MockingManifest = {
    contracts: {
        'eosio.token': {
            abi: loadAbi('eosio.token'),
            tableMappings: {
                accounts: [AccountsRow.primaryKey]
            }
        }
    },
    actions: [
        new TransferMocker(SELF, 'transfer')
    ]
};
