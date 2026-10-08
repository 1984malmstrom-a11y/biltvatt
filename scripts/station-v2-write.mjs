// Fixed launch SQL only. Return a small result; never print Wrangler output.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const mode = process.argv[2];
const reply = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
if (!['lock','unlock'].includes(mode)) {
  reply({ ok: false, stage: 'input', errorType: 'invalid_operation' });
  process.exitCode = 2;
} else {
  const cli = resolve('node_modules/wrangler/wrangler-dist/cli.js');
  const file = resolve(`scripts/station-v2-${mode}.sql`);
  const child = spawnSync(process.execPath, [
    '--no-warnings', cli, 'd1', 'execute', 'tvattligan', '--remote',
    '--config', 'wrangler.jsonc', '--file', file, '--yes', '--json',
  ], { encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
  if (child.status === 0) {
    reply({ ok: true, stage: mode });
  } else {
    const status = child.status === null ? null : child.status >>> 0;
    const output = `${child.stderr ?? ''}\n${child.stdout ?? ''}`;
    const errorType = child.error?.code === 'ETIMEDOUT' ? 'timeout'
      : status === 0xC0000409 ? 'native_process_crash'
      : /authentication|not authenticated|log in/i.test(output) ? 'authentication'
      : /permission|forbidden|unauthorized/i.test(output) ? 'permission'
      : /timeout|timed out|ETIMEDOUT/i.test(output) ? 'timeout'
      : /ENOTFOUND|DNS/i.test(output) ? 'dns'
      : /certificate|TLS|SSL/i.test(output) ? 'tls' : 'wrangler_error';
    reply({ ok: false, stage: mode, errorType, exitCode: child.status });
    process.exitCode = 1;
  }
}
