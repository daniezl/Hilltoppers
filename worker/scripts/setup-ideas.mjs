/**
 * One-shot setup for the ideas board backend.
 *
 * Run from worker/:  npm run setup:ideas
 *
 * Safe to run more than once: every step checks whether it already happened
 * before doing anything.
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tomlPath = path.join(workerDir, 'wrangler.toml');

const DB_NAME = 'hilltoppers-ideas';
const WORKER_URL = 'https://schedule-admin-api.danielzhang089.workers.dev';

let step = 0;

function heading(text) {
  step += 1;
  console.log(`\n\x1b[1m[${step}] ${text}\x1b[0m`);
}

function ok(text) {
  console.log(`    \x1b[32m✓\x1b[0m ${text}`);
}

function info(text) {
  console.log(`    ${text}`);
}

function fail(text, hint) {
  console.error(`\n\x1b[31m✗ ${text}\x1b[0m`);
  if (hint) {
    console.error(`\n${hint}\n`);
  }
  process.exit(1);
}

/** Runs wrangler and returns stdout. Throws on non-zero exit. */
function wrangler(args, { quiet = true } = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: workerDir,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
}

/** Runs wrangler attached to the terminal, so it can prompt for input. */
function wranglerInteractive(args) {
  execFileSync('npx', ['wrangler', ...args], { cwd: workerDir, stdio: 'inherit' });
}

// ---------------------------------------------------------------------------

console.log('\n\x1b[1mHilltoppers ideas board — backend setup\x1b[0m');

heading('Checking you are logged in to Cloudflare');
let whoami = '';
try {
  whoami = wrangler(['whoami']);
} catch (error) {
  whoami = String(error.stdout ?? '');
}
// whoami exits 0 whether or not you are signed in, so the text is the only
// reliable signal here.
if (!whoami || /not authenticated/i.test(whoami)) {
  fail('Not logged in to Cloudflare.', 'Run this first:\n\n    npx wrangler login');
}
const account = whoami.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
ok(account ? `Logged in as ${account}` : 'Logged in');

heading(`Creating the D1 database (${DB_NAME})`);
let databaseId = null;

function findDatabaseId() {
  try {
    const list = JSON.parse(wrangler(['d1', 'list', '--json']));
    return list.find((db) => db.name === DB_NAME)?.uuid ?? null;
  } catch {
    return null;
  }
}

databaseId = findDatabaseId();
if (databaseId) {
  ok(`Already exists (${databaseId})`);
} else {
  info('Creating…');
  try {
    wrangler(['d1', 'create', DB_NAME]);
  } catch (error) {
    fail('Could not create the D1 database.', String(error.stderr ?? error.message ?? error));
  }
  databaseId = findDatabaseId();
  if (!databaseId) {
    fail(
      'Created the database but could not read its id back.',
      `Run "npx wrangler d1 list" and paste the uuid into database_id in wrangler.toml.`
    );
  }
  ok(`Created (${databaseId})`);
}

heading('Writing database_id into wrangler.toml');
const toml = readFileSync(tomlPath, 'utf8');
if (toml.includes(`database_id = "${databaseId}"`)) {
  ok('Already set');
} else if (toml.includes('REPLACE_WITH_D1_DATABASE_ID')) {
  writeFileSync(tomlPath, toml.replace('REPLACE_WITH_D1_DATABASE_ID', databaseId));
  ok('Set');
} else {
  info('database_id is already set to something else — leaving it alone.');
  info('If the board cannot read votes, check that it matches:');
  info(`  ${databaseId}`);
}

heading('Creating the votes table');
try {
  // Re-runnable: schema.sql uses CREATE TABLE IF NOT EXISTS.
  wrangler(['d1', 'execute', DB_NAME, '--file=schema.sql', '--remote']);
  ok('Table ready');
} catch (error) {
  fail('Could not apply schema.sql.', String(error.stderr ?? error.message ?? error));
}

heading('Checking the GitHub token');
let hasToken = false;
try {
  // `secret list` already prints JSON by default; there is no --json flag.
  const secrets = JSON.parse(wrangler(['secret', 'list']));
  hasToken = secrets.some((secret) => secret.name === 'GITHUB_TOKEN');
} catch {
  // A worker that has never been deployed has no secret list yet.
}

if (hasToken) {
  ok('GITHUB_TOKEN is set');
} else {
  console.log(`
    Not set yet. Create a fine-grained token first:

      https://github.com/settings/personal-access-tokens/new

      Resource owner ......... daniezl
      Repository access ...... Only select repositories → Hilltoppers
      Repository permissions . Issues: Read and write
`);
  // Pasting a token needs a real terminal. Without one, wrangler's prompt would
  // fail with something unhelpful, so say what to run instead.
  if (!process.stdin.isTTY) {
    fail(
      'GITHUB_TOKEN is not set, and there is no terminal to paste it into.',
      'Run these two commands in your own terminal:\n\n' +
        `    cd ${workerDir}\n` +
        '    npx wrangler secret put GITHUB_TOKEN\n\n' +
        'Then run "npm run setup:ideas" again to finish.'
    );
  }
  info('Paste it at the prompt below.');
  try {
    wranglerInteractive(['secret', 'put', 'GITHUB_TOKEN']);
    ok('GITHUB_TOKEN saved');
  } catch {
    fail('Token was not saved.', 'Run "npx wrangler secret put GITHUB_TOKEN" and try again.');
  }
}

heading('Deploying the Worker');
try {
  wrangler(['deploy']);
  ok('Deployed');
} catch (error) {
  fail('Deploy failed.', String(error.stderr ?? error.message ?? error));
}

heading('Testing the live endpoint');
try {
  const response = await fetch(`${WORKER_URL}/api/ideas`);
  const text = await response.text();

  if (!response.ok) {
    fail(
      `The endpoint returned HTTP ${response.status}.`,
      text.slice(0, 400) +
        '\n\nIf that looks like a login page, Cloudflare Access is covering /api/ideas.\nIt needs to stay public — only /api/admin/* should be behind Access.'
    );
  }

  const { ideas } = JSON.parse(text);
  if (!Array.isArray(ideas)) {
    fail('Unexpected response shape.', text.slice(0, 400));
  }

  if (ideas.length === 0) {
    console.log(`
    \x1b[33m!\x1b[0m The endpoint works, but no ideas came back.

      The board only shows issues labelled "enhancement". Check that
      issues #9, #10 and #11 still carry it.
`);
  } else {
    ok(`${ideas.length} ideas loaded:`);
    for (const idea of ideas) {
      console.log(`      ${String(idea.votes).padStart(3)} votes  #${idea.number}  ${idea.title}`);
    }
  }
} catch (error) {
  fail('Could not reach the endpoint.', String(error.message ?? error));
}

console.log(`
\x1b[1;32mBackend is up.\x1b[0m

Next, the website — that part is in the Cloudflare dashboard, not here:

  1. Workers & Pages → Create → Pages → connect this repo
       Project name ....... hilltoppers-ideas
       Root directory ..... ideas-site
       Build command ...... npm run build
       Output directory ... dist
       Do NOT put it behind Cloudflare Access.

  2. Add the build variables from ideas-site/.env.example
       (copy the VITE_FIREBASE_* values out of chrome-extension/.env.local)

  3. Firebase console → Authentication → Settings → Authorized domains
       add: hilltoppers-ideas.pages.dev
       Skipping this makes Google sign-in fail silently.

Then rebuild the extension:  cd ../chrome-extension && npm run build
`);
