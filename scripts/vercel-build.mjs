import { spawn } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nextBuildCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
const useSqliteBuild = databaseUrl.startsWith('file:');

const steps = useSqliteBuild
  ? [
      {
        command: npmCommand,
        args: ['run', 'build'],
      },
    ]
  : [
      {
        command: npmCommand,
        args: ['run', 'db:generate'],
      },
      {
        command: npmCommand,
        args: ['run', 'db:migrate:deploy'],
      },
      {
        command: nextBuildCommand,
        args: ['next', 'build', '--webpack'],
      },
    ];

if (useSqliteBuild) {
  console.log('Using SQLite build path: skipping prisma migrate deploy during Vercel builds.');
}

const runStep = (index) => {
  const step = steps[index];

  if (!step) {
    process.exit(0);
  }

  const child = spawn(step.command, step.args, {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    if (code !== 0) {
      process.exit(code ?? 1);
      return;
    }

    runStep(index + 1);
  });
};

runStep(0);
