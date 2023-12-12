import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {ChainDescriptor, NewChainInfo} from "./controller";

export interface ControllerResponse {
    result?: any;
    error?: any;
}

export class ControllerHTTPClient {
    private axiosInstance: AxiosInstance;

    constructor(baseURL: string) {
        this.axiosInstance = axios.create({
            baseURL: baseURL
        });

        this.initializeResponseInterceptor();
    }

    private initializeResponseInterceptor() {
        this.axiosInstance.interceptors.response.use(
            this.handleResponse,
            this.handleError
        );
    }

    private handleResponse({ data }: AxiosResponse) {
        const response = data as ControllerResponse;
        if (response.error)
            throw new Error(response.error);

        return response.result;
    }

    private handleError(error: any) {
        // You can add error logging or handling here
        return Promise.reject(error);
    }

    public post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        // @ts-ignore
        return this.axiosInstance.post<T>(url, data, {
            headers: {
                'Content-Type': 'application/json'
            },
            ...config
        });
    }

    public createChain(desc: ChainDescriptor): Promise<NewChainInfo> {
        return this.post('/create_chain', desc).then((response) => {
            return response as NewChainInfo;
        });
    }

    public start(chainId: string): Promise<string> {
        return this.post('/start', {chainId}).then((response) => {
            return response as string;
        });
    }

    public stop(chainId: string): Promise<string> {
        return this.post('/stop', {chainId}).then((response) => {
            return response as string;
        });
    }

    public restartNetwork(chainId: string, sleepTime?: number): Promise<string> {
        return this.post('/restart_chain_network', {chainId, sleepTime}).then((response) => {
            return response as string;
        });
    }

    public destroyChain(chainId: string): Promise<string> {
        return this.post('/destroy_chain', {chainId}).then((response) => {
            return response as string;
        });
    }
}

export default ControllerHTTPClient;