import { mkdir, writeFile } from 'node:fs/promises';
import { createApplication } from './app.js';
import { readConfig } from './config.js';

const { app, document } = await createApplication(readConfig(), true);
try {
  const target = new URL('../../../docs/api/', import.meta.url);
  await mkdir(target, { recursive: true });
  await writeFile(new URL('openapi.json', target), JSON.stringify(document, null, 2) + '\n');
} finally {
  await app.close();
}
