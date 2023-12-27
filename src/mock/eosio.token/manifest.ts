import {MockingManifest} from "../abstract.js";
import {loadAbi} from "../../abis/utils.js";
import {AccountsRow} from "./tables.js";
import {TransferMocker} from "./mockers.js";
import {SELF} from "./constants.js";

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
