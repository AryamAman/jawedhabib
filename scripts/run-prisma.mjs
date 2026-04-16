import { spawn } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });

const args = process.argv.slice(2);
const env = { ...process.env };
const isMigrateDeploy = args[0] === 'migrate' && args[1] === 'deploy';

if (isMigrateDeploy && env.DIRECT_URL) {
  env.DATABASE_URL = env.DIRECT_URL;
}

const prismaBinary = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);

const child = spawn(prismaBinary, args, {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

