import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const local = fileURLToPath(new URL('../.local/', import.meta.url));
const data = `${local}pgdata`;
const password = 'local-development-only';
const env = { ...process.env, PGPASSWORD: password };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', ...options });
  if (result.error)
    throw new Error(`${command} is unavailable. Install PostgreSQL or use Docker Compose.`);
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

try {
  mkdirSync(local, { recursive: true });
  const command = process.argv[2];
  if (!['start', 'stop'].includes(command)) throw new Error('Use start or stop.');
  if (command === 'stop') {
    if (existsSync(`${data}/PG_VERSION`)) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    console.log('Project database stopped. Its data is retained in .local/pgdata.');
  } else {
    if (!existsSync(`${data}/PG_VERSION`)) {
      const pwfile = `${local}init-password`;
      writeFileSync(pwfile, password, { mode: 0o600 });
      try {
        run('initdb', [
          '-D',
          data,
          '-U',
          'family_menu',
          '--auth=scram-sha-256',
          '--pwfile',
          pwfile,
          '--encoding=UTF8',
          '--locale=C',
        ]);
      } finally {
        unlinkSync(pwfile);
      }
    }
    const status = spawnSync('pg_ctl', ['-D', data, 'status'], { encoding: 'utf8' });
    if (status.status !== 0) {
      run('pg_ctl', [
        '-D',
        data,
        '-l',
        `${local}postgres.log`,
        '-o',
        '-h 127.0.0.1 -p 55432 -k /tmp',
        '-w',
        'start',
      ]);
    }
    for (const name of ['family_menu', 'family_menu_test']) {
      const found = run('psql', [
        '-h',
        '127.0.0.1',
        '-p',
        '55432',
        '-U',
        'family_menu',
        '-d',
        'postgres',
        '-tAc',
        `select 1 from pg_database where datname = '${name}'`,
      ]);
      if (found.trim() !== '1')
        run('createdb', ['-h', '127.0.0.1', '-p', '55432', '-U', 'family_menu', name]);
    }
    console.log(
      'Isolated project databases ready on 127.0.0.1:55432. No system PostgreSQL service was modified.',
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
