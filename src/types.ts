export interface ActionReceipt {
    receiver: string;
    act_digest: string;
    global_sequence: number;
    recv_sequence: number;
    auth_sequence: {account: string, sequence: number}[];
    code_sequence: number;
    abi_sequence: number;
}

export interface ActionDescriptor {
    account: string;
    name: string;
    authorization?: {
        actor: string;
        permission: string
    }[];
    parameters: {[key: string]: any};
}

export interface ActionTrace {
    action_ordinal: number;
    creator_action_ordinal: number;
    receipt: ['action_receipt_v0', ActionReceipt];
    receiver: string;
    act: {
        account: string;
        name: string;
        authorization: {
            actor: string;
            permission: string
        }[];
        data: string;
    };
    context_free: boolean;
    elapsed: number;
    console: string;
    account_ram_deltas: [];
    except: null;
    error_code: null;
    return_value: string;
}

export interface PartialTransaction {
    expiration: string;
    ref_block_num: number;
    ref_block_prefix: number;
    max_net_usage_words: number;
    max_cpu_usage_ms: number;
    delay_sec: number;
    transaction_extensions: [];
    signatures: string[];
    context_free_data: [];
}

export interface TransactionTraceOptions {
    id?: string;
    status?: number;
    cpu_usage_us?: number;
    net_usage_words?: number;
    elapsed?: number;
    net_usage?: number;
    scheduled?: boolean;
    action_traces?: ['action_trace_v1', ActionTrace][];
    account_ram_delta?: null;
    except?: null;
    error_code?: null;
    failed_dtrx_trace?: null;
    partial?: PartialTransaction;
}

export interface TransactionTrace {
    id: string;
    status: number;
    cpu_usage_us: number;
    net_usage_words: number;
    elapsed: number;
    net_usage: number;
    scheduled: boolean;
    action_traces: ['action_trace_v1', ActionTrace][];
    account_ram_delta: null;
    except: null;
    error_code: null;
    failed_dtrx_trace: null;
    partial: ['partial_transaction_v0', PartialTransaction];
}
