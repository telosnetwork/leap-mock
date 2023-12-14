import * as winston from 'winston';
import process from "process";

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'warning',
    format: winston.format.simple(),
    transports: [
        new winston.transports.Console(),
    ],
});