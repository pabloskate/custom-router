#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const checks = [
  {
    name: 'Node.js version (>=20)',
    run: () => {
      const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
      return {
        pass: major >= 20,
        detail: `Detected ${process.versions.node}`,
      };
    },
  },
  {
    name: 'Required env file (.env.local) exists',
    run: () => {
      const envPath = resolve('.env.local');
      return {
        pass: existsSync(envPath),
        detail: existsSync(envPath) ? 'Found .env.local' : 'Missing .env.local (copy from .env.example)',
      };
    },
  },
  {
    name: 'BYOK_ENCRYPTION_SECRET configured',
    run: () => {
      const envPath = resolve('.env.local');
      if (!existsSync(envPath)) {
        return { pass: false, detail: 'Cannot check secret because .env.local is missing' };
      }

      const content = readFileSync(envPath, 'utf8');
      const hasSecret = /^BYOK_ENCRYPTION_SECRET=(.+)$/m.test(content);
      return {
        pass: hasSecret,
        detail: hasSecret
          ? 'BYOK_ENCRYPTION_SECRET found in .env.local'
          : 'BYOK_ENCRYPTION_SECRET missing in .env.local',
      };
    },
  },
  {
    name: 'D1 schema file exists',
    run: () => {
      const schemaPath = resolve('infra/d1/schema.sql');
      return {
        pass: existsSync(schemaPath),
        detail: existsSync(schemaPath) ? 'Found infra/d1/schema.sql' : 'Missing infra/d1/schema.sql',
      };
    },
  },
  {
    name: 'Workspace health check (typecheck)',
    run: () => {
      const result = spawnSync('npm', ['run', 'typecheck'], {
        stdio: 'pipe',
        encoding: 'utf8',
      });

      return {
        pass: result.status === 0,
        detail: result.status === 0 ? 'npm run typecheck passed' : 'npm run typecheck failed',
      };
    },
  },
  {
    name: 'Workspace health check (tests)',
    run: () => {
      const result = spawnSync('npm', ['run', 'test'], {
        stdio: 'pipe',
        encoding: 'utf8',
      });

      return {
        pass: result.status === 0,
        detail: result.status === 0 ? 'npm run test passed' : 'npm run test failed',
      };
    },
  },
];

let failures = 0;

console.log('CustomRouter Agent Diagnose Report');
console.log('================================');

for (const check of checks) {
  const result = check.run();
  const icon = result.pass ? '✅' : '❌';
  if (!result.pass) {
    failures += 1;
  }
  console.log(`${icon} ${check.name}`);
  console.log(`   ${result.detail}`);
}

console.log('--------------------------------');
if (failures === 0) {
  console.log('✅ All checks passed.');
  process.exit(0);
}

console.log(`❌ ${failures} check(s) failed. See details above.`);
process.exit(1);
