import {MockingManifest} from "../abstract.js";
import {SELF, TOKEN_CONTRACT} from "./constants.js";

import {
    TEVMCreateMocker,
    TEVMOpenWallet,

    TEVMRawMocker,

    TEVMTransferMocker,
    TEVMWithdrawMocker
} from "./mockers.js";

import {loadAbi} from "../../abis/utils.js";
import {AccountRow} from "./tables.js";
import {AccountsRow} from "../eosio.token/tables.js";

export const mockingManifest: MockingManifest = {
    contracts: {
        'eosio.evm': {
            abi: loadAbi('telos.evm'),
            tableMappings: {
                account: [
                    AccountRow.primaryKey,
                    AccountRow.byAccount,
                    AccountRow.byAddress
                ]
            }
        },
        'eosio.token': {
            abi: loadAbi('eosio.token'),
            tableMappings: {
                accounts: [AccountsRow.primaryKey]
            }
        }
    },
    actions: [
        new TEVMTransferMocker(TOKEN_CONTRACT, 'transfer'),
        new TEVMCreateMocker(SELF, 'create'),
        new TEVMRawMocker(SELF, 'raw'),
        new TEVMWithdrawMocker(SELF, 'withdraw'),
        new TEVMOpenWallet(SELF, 'openwallet')
    ]
}
