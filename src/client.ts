import axios, { AxiosInstance } from 'axios';
import {ChainDescriptor} from "./chain.js";

export interface MockResponse<T> {
    result?: T;
    error?: string;
}

export class LeapMockError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LeapMockError';
    }

    static fromAxiosError(error: any): LeapMockError {
        if (error.response && error.response.data && error.response.data.error) {
            return new LeapMockError(error.response.data.error);
        }
        return new LeapMockError(error.message);
    }
}

export class LeapMockClient {
    private baseUrl: string;
    private client: AxiosInstance;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
        this.client = axios.create();
    }

    async setChain(params: ChainDescriptor): Promise<string> {
        try {
            const url = `${this.baseUrl}/set_chain`;
            const resp = await this.client.post<MockResponse<string>>(url, params);
            if (resp.data.result) {
                return resp.data.result;
            } else {
                throw new LeapMockError(resp.data.error || 'Unknown error');
            }
        } catch (error) {
            throw LeapMockError.fromAxiosError(error);
        }
    }
}
