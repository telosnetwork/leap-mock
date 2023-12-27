import * as winston from 'winston';
import process from "process";

// Define a custom format that adds '[LEAP-MOCK]: ' in bold to the beginning of each log message
const leapMockFormat = winston.format.printf(({ level, message }) => {
    return `\x1b[1m[LEAP-MOCK]: \x1b[0m ${level}: ${message}`;
});

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'warning',
    format: winston.format.combine(
        winston.format.colorize(),
        leapMockFormat
    ),
    transports: [
        new winston.transports.Console(),
    ],
});
