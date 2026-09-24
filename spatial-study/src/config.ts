import config from '../bridge/config.json';
export const connectionDefaults={...config,wsUrl:`ws://${config.wsHost}:${config.wsPort}`};
