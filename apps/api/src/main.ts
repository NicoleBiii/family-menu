import { createApplication } from './app.js';
import { readConfig } from './config.js';

const config = readConfig();
const { app } = await createApplication(config);
app.enableShutdownHooks();
await app.listen(config.port, config.host);
console.log(`Family Menu listening on http://${config.host}:${config.port}`);
