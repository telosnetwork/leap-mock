import { Command } from 'commander';

import {ControllerConfig, loadControllerConfigFromFile} from './controller.js';
import * as process from "process";
import {ControllerContext} from "./controllerUtils.js";

let config: ControllerConfig = {
    controlPort: 6970
};

const program = new Command();

program
    .option('-c, --configFilePath [configFilePath]', 'Path to ControllerConfig json file')
    .option('-C, --controlPort [controlPort]', 'Control http port')
    .action(async (options) => {
        if (options.configFilePath)
            config = loadControllerConfigFromFile(options.configFilePath);

        if (options.controlPort)
            config.controlPort = parseInt(options.controlPort, 10);

        const context = new ControllerContext(config);
        await context.bootstrap();
    });

program.parse(process.argv);