import { execFileSync } from 'node:child_process';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = new URL('../.local/', import.meta.url);
const lock = new URL('active-agent.json', directory);
const [command = 'status', agent, task] = process.argv.slice(2);
function git(...args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '(no commit yet)';
  }
}
async function readLock() {
  try {
    return JSON.parse(await readFile(lock, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

try {
  if (command === 'status') {
    console.log(
      JSON.stringify(
        {
          branch: git('branch', '--show-current'),
          commit: git('rev-parse', '--short', 'HEAD'),
          activeAgent: await readLock(),
          changes: git('status', '--short'),
        },
        null,
        2,
      ),
    );
  } else if (command === 'claim') {
    if (!['codex', 'claude'].includes(agent) || !task)
      throw new Error('Use handoff:claim -- codex|claude TASK-ID');
    await mkdir(directory, { recursive: true });
    const handle = await open(lock, 'wx');
    try {
      await handle.writeFile(
        JSON.stringify(
          {
            agent,
            task,
            startedAt: new Date().toISOString(),
            baseCommit: git('rev-parse', '--short', 'HEAD'),
          },
          null,
          2,
        ) + '\n',
      );
    } finally {
      await handle.close();
    }
    console.log(`${agent} claimed ${task}. This advisory lock applies only to this checkout.`);
  } else if (command === 'release') {
    const current = await readLock();
    if (!current) throw new Error('No active agent claim exists.');
    if (current.agent !== agent)
      throw new Error(
        'Only the recorded agent may release this claim; do not take over a running checkout.',
      );
    await unlink(lock);
    console.log('Claim released. Ensure docs/HANDOFF.md describes the actual state.');
  } else throw new Error('Unknown command. Use status, claim, or release.');
} catch (error) {
  console.error(
    error.code === 'EEXIST'
      ? 'Another claim exists. Inspect handoff:status and confirm the previous agent has stopped before recovery.'
      : error.message,
  );
  process.exitCode = 1;
}
