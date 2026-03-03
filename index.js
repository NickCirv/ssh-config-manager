#!/usr/bin/env node
// ssh-config-manager — manage SSH config hosts via TUI or CLI
// Zero dependencies — Node 18+ built-ins only

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { spawnSync } from 'child_process';

// ─── Paths ────────────────────────────────────────────────────────────────────

const SSH_DIR = path.join(os.homedir(), '.ssh');
const CONFIG_PATH = path.join(SSH_DIR, 'config');
const BACKUP_DIR = path.join(SSH_DIR, 'backups');

// ─── SSH Config Parser ────────────────────────────────────────────────────────

function readConfigRaw() {
  if (!fs.existsSync(CONFIG_PATH)) return '';
  return fs.readFileSync(CONFIG_PATH, 'utf8');
}

function parseConfig(raw) {
  const hosts = [];
  let current = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(\S+)\s+(.+)$/);
    if (!match) continue;

    const [, key, value] = match;
    if (key.toLowerCase() === 'host') {
      current = { Host: value };
      hosts.push(current);
    } else if (current) {
      current[key] = value;
    }
  }

  return hosts;
}

function serializeConfig(hosts) {
  const ORDER = ['HostName','User','Port','IdentityFile','IdentitiesOnly',
    'ForwardAgent','ServerAliveInterval','StrictHostKeyChecking','ProxyJump'];
  const SKIP = new Set(['Host']);

  const blocks = hosts.map(host => {
    const lines = [`Host ${host.Host}`];
    for (const key of ORDER) {
      if (host[key] !== undefined) lines.push(`  ${key} ${host[key]}`);
    }
    for (const [key, val] of Object.entries(host)) {
      if (!SKIP.has(key) && !ORDER.includes(key)) lines.push(`  ${key} ${val}`);
    }
    return lines.join('\n');
  });

  return blocks.join('\n\n') + (blocks.length ? '\n' : '');
}

function getHosts() { return parseConfig(readConfigRaw()); }

function findHost(alias) {
  return getHosts().find(h => h.Host.toLowerCase() === alias.toLowerCase());
}

// ─── Backup ───────────────────────────────────────────────────────────────────

function backup() {
  if (!fs.existsSync(CONFIG_PATH)) return;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(CONFIG_PATH, path.join(BACKUP_DIR, `config.${ts}.bak`));
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidHostname(val) {
  if (!val) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(val)) return true;  // IPv4
  if (/^[\da-fA-F:]+$/.test(val)) return true;             // IPv6
  return /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/.test(val); // hostname
}

// ─── Write ────────────────────────────────────────────────────────────────────

function saveHosts(hosts) {
  if (!fs.existsSync(SSH_DIR)) fs.mkdirSync(SSH_DIR, { recursive: true, mode: 0o700 });
  backup();
  fs.writeFileSync(CONFIG_PATH, serializeConfig(hosts), { mode: 0o600 });
}

// ─── Terminal Helpers ─────────────────────────────────────────────────────────

const R  = '\x1b[0m';
const BD = '\x1b[1m';
const DM = '\x1b[2m';
const CY = '\x1b[36m';
const GN = '\x1b[32m';
const YL = '\x1b[33m';
const RD = '\x1b[31m';
const BB = '\x1b[44m';

const col = (t, ...c) => c.join('') + t + R;
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

function printTable(hosts) {
  if (!hosts.length) { console.log(col('  No hosts found.', DM)); return; }
  const w = [20, 22, 12, 6, 28];
  const sep = col('─'.repeat(92), DM);
  const hdr = [col(pad('ALIAS',w[0]),BD,CY), col(pad('HOSTNAME',w[1]),BD,CY),
    col(pad('USER',w[2]),BD,CY), col(pad('PORT',w[3]),BD,CY), col(pad('IDENTITY',w[4]),BD,CY)].join('  ');
  console.log(sep); console.log(hdr); console.log(sep);
  for (const h of hosts) {
    const idPath = h.IdentityFile ? path.basename(h.IdentityFile) : '';
    console.log([col(pad(h.Host,w[0]),GN), pad(h.HostName??'',w[1]),
      pad(h.User??'',w[2]), pad(h.Port??'22',w[3]), col(pad(idPath,w[4]),DM)].join('  '));
  }
  console.log(sep);
  console.log(col(`  ${hosts.length} host(s)`, DM));
}

function printHost(h) {
  const ORDER = ['HostName','User','Port','IdentityFile','IdentitiesOnly',
    'ForwardAgent','ServerAliveInterval','StrictHostKeyChecking','ProxyJump'];
  console.log(col(`\n  Host: ${h.Host}`, BD, CY));
  for (const key of ORDER) {
    if (h[key] !== undefined) console.log(`  ${col(pad(key,24),DM)} ${h[key]}`);
  }
  for (const [key, val] of Object.entries(h)) {
    if (key !== 'Host' && !ORDER.includes(key)) console.log(`  ${col(pad(key,24),DM)} ${val}`);
  }
  console.log();
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdList() { printTable(getHosts()); }

function cmdAdd(args) {
  const opts = parseArgs(args);
  const alias = opts.host || opts._[0];
  if (!alias) die('Usage: sshcm add --host <alias> --hostname <ip/domain> [options]');
  if (findHost(alias)) die(`Host "${alias}" already exists. Use edit to modify.`);
  if (opts.hostname && !isValidHostname(opts.hostname)) die(`Invalid hostname: "${opts.hostname}"`);

  const hosts = getHosts();
  const entry = { Host: alias };
  if (opts.hostname)  entry.HostName     = opts.hostname;
  if (opts.user)      entry.User         = opts.user;
  if (opts.port)      entry.Port         = opts.port;
  if (opts.identity)  entry.IdentityFile = opts.identity;
  hosts.push(entry);
  saveHosts(hosts);
  console.log(col(`  Added host "${alias}"`, GN));
}

async function cmdEdit(args) {
  const alias = args[0];
  if (!alias) die('Usage: sshcm edit <alias>');
  const hosts = getHosts();
  const idx = hosts.findIndex(h => h.Host.toLowerCase() === alias.toLowerCase());
  if (idx === -1) die(`Host "${alias}" not found.`);

  const h = hosts[idx];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, res));
  const FIELDS = ['HostName','User','Port','IdentityFile','IdentitiesOnly',
    'ForwardAgent','ServerAliveInterval','StrictHostKeyChecking','ProxyJump'];

  console.log(col(`\n  Editing "${alias}" — press Enter to keep current value\n`, BD));
  for (const field of FIELDS) {
    const cur = h[field] ?? '';
    const hint = cur ? col(` [${cur}]`, DM) : '';
    const ans = (await ask(`  ${col(pad(field,20),CY)}${hint}: `)).trim();
    if (ans) {
      if (field === 'HostName' && !isValidHostname(ans)) {
        console.log(col(`  Invalid hostname — keeping "${cur}"`, YL));
      } else {
        h[field] = ans;
      }
    }
  }

  rl.close();
  hosts[idx] = h;
  saveHosts(hosts);
  console.log(col(`\n  Saved changes to "${alias}"`, GN));
}

async function cmdRemove(args) {
  const alias = args[0];
  if (!alias) die('Usage: sshcm remove <alias>');
  const hosts = getHosts();
  const idx = hosts.findIndex(h => h.Host.toLowerCase() === alias.toLowerCase());
  if (idx === -1) die(`Host "${alias}" not found.`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise(res => rl.question(col(`  Remove "${alias}"? [y/N] `, YL), res));
  rl.close();

  if (ans.trim().toLowerCase() !== 'y') { console.log(col('  Cancelled.', DM)); return; }
  hosts.splice(idx, 1);
  saveHosts(hosts);
  console.log(col(`  Removed "${alias}"`, RD));
}

function cmdShow(args) {
  const alias = args[0];
  if (!alias) die('Usage: sshcm show <alias>');
  const h = findHost(alias);
  if (!h) die(`Host "${alias}" not found.`);
  printHost(h);
}

function cmdSearch(args) {
  const q = (args[0] || '').toLowerCase();
  if (!q) die('Usage: sshcm search <query>');
  const results = getHosts().filter(h =>
    h.Host.toLowerCase().includes(q) || (h.HostName||'').toLowerCase().includes(q));
  if (!results.length) { console.log(col(`  No hosts matching "${args[0]}"`, DM)); return; }
  printTable(results);
}

function cmdTest(args) {
  const alias = args[0];
  if (!alias) die('Usage: sshcm test <alias>');
  const h = findHost(alias);
  if (!h) die(`Host "${alias}" not found.`);

  const target = h.HostName || h.Host;
  const user   = h.User || os.userInfo().username;
  const port   = h.Port || '22';

  console.log(col(`  Testing ${user}@${target}:${port} ...`, DM));

  // spawnSync only — never exec() — prevents shell injection
  const result = spawnSync('ssh', [
    '-T', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'BatchMode=yes', '-p', String(port), `${user}@${target}`
  ], { timeout: 8000 });

  if (result.status === 0 || result.status === 1) {
    console.log(col(`  Connection successful (exit ${result.status})`, GN));
  } else {
    console.log(col(`  Connection failed (exit ${result.status ?? 'timeout'})`, RD));
    if (result.stderr) {
      const firstLine = result.stderr.toString().split('\n')[0];
      if (firstLine) console.log(col(`  ${firstLine}`, DM));
    }
  }
}

function cmdCopy(args) {
  const [src, dest] = args;
  if (!src || !dest) die('Usage: sshcm copy <source> <newAlias>');
  const hosts = getHosts();
  const srcHost = hosts.find(h => h.Host.toLowerCase() === src.toLowerCase());
  if (!srcHost) die(`Host "${src}" not found.`);
  if (hosts.find(h => h.Host.toLowerCase() === dest.toLowerCase())) die(`Host "${dest}" already exists.`);
  hosts.push({ ...srcHost, Host: dest });
  saveHosts(hosts);
  console.log(col(`  Copied "${src}" → "${dest}"`, GN));
}

function cmdExport(args) {
  const opts = parseArgs(args);
  if ((opts.format || 'json') !== 'json') die('Supported formats: json');
  const safe = getHosts().map(h => {
    const out = {};
    for (const [k, v] of Object.entries(h)) out[k] = v;
    return out; // IdentityFile: path only, never contents
  });
  console.log(JSON.stringify(safe, null, 2));
}

function cmdImport(args) {
  const file = args[0];
  if (!file) die('Usage: sshcm import <file.json>');
  if (!fs.existsSync(file)) die(`File not found: ${file}`);

  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { die(`Invalid JSON: ${e.message}`); }
  if (!Array.isArray(data)) die('Expected a JSON array of host objects.');

  const hosts = getHosts();
  let added = 0, skipped = 0;

  for (const entry of data) {
    if (!entry.Host) { skipped++; continue; }
    if (entry.HostName && !isValidHostname(entry.HostName)) {
      console.log(col(`  Skipping "${entry.Host}" — invalid hostname`, YL));
      skipped++; continue;
    }
    if (hosts.find(h => h.Host === entry.Host)) {
      console.log(col(`  Skipping "${entry.Host}" — already exists`, DM));
      skipped++; continue;
    }
    hosts.push({ ...entry });
    added++;
  }

  if (added > 0) saveHosts(hosts);
  console.log(col(`  Imported ${added} host(s), skipped ${skipped}`, GN));
}

// ─── Interactive TUI ──────────────────────────────────────────────────────────

async function runTUI() {
  let hosts = getHosts();
  let cursor = 0;
  let mode = 'list';

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  const cls = () => process.stdout.write('\x1b[2J\x1b[H');

  function renderList() {
    cls();
    const bar = col(' ssh-config-manager ', BD, BB) +
      col('  ↑↓ navigate  Enter show  n new  e edit  d delete  t test  q quit', DM);
    console.log(bar + '\n');
    if (!hosts.length) { console.log(col('  No hosts. Press n to add one.', DM)); return; }
    hosts.forEach((h, i) => {
      const sel = i === cursor;
      const pfx  = sel ? col('▶ ', CY) : '  ';
      const name = sel ? col(pad(h.Host,20),BD,CY) : col(pad(h.Host,20),GN);
      console.log(`${pfx}${name}  ${pad(h.HostName??'',22)}  ${col(pad(h.User??'',12),DM)}  ${col(pad(h.Port??'22',6),DM)}`);
    });
    console.log(col(`\n  ${hosts.length} host(s)  `, DM));
  }

  function renderDetail(h) {
    cls();
    console.log(col(' ssh-config-manager ', BD, BB) + col('  Esc back  e edit  d delete  t test', DM) + '\n');
    printHost(h);
  }

  function refresh() {
    hosts = getHosts();
    if (cursor >= hosts.length) cursor = Math.max(0, hosts.length - 1);
  }

  renderList();

  await new Promise(resolve => {
    process.stdin.on('data', async key => {
      if (key === '\u0003' || (mode === 'list' && key === 'q')) {
        cls();
        process.stdout.write('\n');
        process.stdin.setRawMode(false);
        rl.close();
        return resolve();
      }

      if (mode === 'list') {
        if (key === '\u001B[A' || key === 'k') { cursor = Math.max(0, cursor - 1); renderList(); }
        else if (key === '\u001B[B' || key === 'j') { cursor = Math.min(hosts.length - 1, cursor + 1); renderList(); }
        else if (key === '\r' || key === '\n') { if (hosts[cursor]) { mode = 'detail'; renderDetail(hosts[cursor]); } }
        else if (key === 'n') {
          process.stdin.setRawMode(false); cls();
          await tuiAdd(rl); refresh();
          process.stdin.setRawMode(true); mode = 'list'; renderList();
        } else if (key === 'e') {
          if (!hosts[cursor]) return;
          process.stdin.setRawMode(false); cls();
          await cmdEdit([hosts[cursor].Host]); refresh();
          process.stdin.setRawMode(true); renderList();
        } else if (key === 'd') {
          if (!hosts[cursor]) return;
          process.stdin.setRawMode(false); cls();
          await cmdRemove([hosts[cursor].Host]); refresh();
          process.stdin.setRawMode(true); renderList();
        } else if (key === 't') {
          if (!hosts[cursor]) return;
          process.stdin.setRawMode(false); cls();
          cmdTest([hosts[cursor].Host]);
          await new Promise(r => rl.question(col('\n  Press Enter to continue...', DM), r));
          process.stdin.setRawMode(true); renderList();
        }
      } else if (mode === 'detail') {
        if (key === '\u001B' || key === 'q') { mode = 'list'; renderList(); }
        else if (key === 'e') {
          process.stdin.setRawMode(false); cls();
          await cmdEdit([hosts[cursor].Host]); refresh();
          process.stdin.setRawMode(true); mode = 'list'; renderList();
        } else if (key === 'd') {
          process.stdin.setRawMode(false); cls();
          await cmdRemove([hosts[cursor].Host]); refresh();
          process.stdin.setRawMode(true); mode = 'list'; renderList();
        } else if (key === 't') {
          process.stdin.setRawMode(false); cls();
          cmdTest([hosts[cursor].Host]);
          await new Promise(r => rl.question(col('\n  Press Enter to continue...', DM), r));
          process.stdin.setRawMode(true);
          if (hosts[cursor]) renderDetail(hosts[cursor]);
        }
      }
    });
  });
}

async function tuiAdd(rl) {
  const ask = q => new Promise(res => rl.question(q, res));
  console.log(col('\n  Add New Host\n', BD, CY));

  const alias = (await ask(col('  Alias:               ', CY))).trim();
  if (!alias) { console.log(col('  Cancelled.', DM)); return; }
  if (findHost(alias)) { console.log(col(`  Host "${alias}" already exists.`, YL)); return; }

  const hostname = (await ask(col('  HostName:            ', CY))).trim();
  if (hostname && !isValidHostname(hostname)) { console.log(col('  Invalid hostname.', RD)); return; }

  const user     = (await ask(col('  User:                ', CY))).trim();
  const portIn   = (await ask(col('  Port [22]:           ', CY))).trim();
  const identity = (await ask(col('  IdentityFile (path): ', CY))).trim();

  const hosts  = getHosts();
  const entry  = { Host: alias };
  if (hostname)  entry.HostName     = hostname;
  if (user)      entry.User         = user;
  if (portIn && portIn !== '22') entry.Port = portIn;
  if (identity)  entry.IdentityFile = identity;

  hosts.push(entry);
  saveHosts(hosts);
  console.log(col(`\n  Added "${alias}"`, GN));
}

// ─── Arg Parser ───────────────────────────────────────────────────────────────

function parseArgs(args) {
  const opts = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      opts[key] = (args[i+1] && !args[i+1].startsWith('--')) ? args[++i] : true;
    } else {
      opts._.push(args[i]);
    }
  }
  return opts;
}

function die(msg) { console.error(col(`\n  Error: ${msg}\n`, RD)); process.exit(1); }

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${col('  ssh-config-manager', BD, CY)} ${col('v1.0.0', DM)}

  ${col('Commands:', BD)}
    ${col('sshcm', GN)}                                   Interactive TUI (no args)
    ${col('sshcm list', GN)}                              List all hosts in a table
    ${col('sshcm add', GN)} ${col('--host <alias> --hostname <ip>', DM)}  Add a host entry
    ${col('sshcm edit', GN)} ${col('<alias>', DM)}                    Edit host interactively
    ${col('sshcm remove', GN)} ${col('<alias>', DM)}                  Remove a host (with confirm)
    ${col('sshcm show', GN)} ${col('<alias>', DM)}                    Show all settings for a host
    ${col('sshcm search', GN)} ${col('<query>', DM)}                  Search by alias or hostname
    ${col('sshcm test', GN)} ${col('<alias>', DM)}                    Test SSH connection
    ${col('sshcm copy', GN)} ${col('<src> <newAlias>', DM)}           Duplicate a host entry
    ${col('sshcm export', GN)} ${col('[--format json]', DM)}          Export all hosts as JSON
    ${col('sshcm import', GN)} ${col('<file.json>', DM)}              Import hosts from JSON

  ${col('Add options:', BD)}
    ${col('--host', CY)}       Alias (e.g. prod)
    ${col('--hostname', CY)}   IP or domain
    ${col('--user', CY)}       SSH user
    ${col('--port', CY)}       Port (default 22)
    ${col('--identity', CY)}   Path to identity file

  ${col('Config:', BD)}   ${col(CONFIG_PATH, DM)}
  ${col('Backups:', BD)}  ${col(BACKUP_DIR, DM)}
`);
}

// ─── Entry ────────────────────────────────────────────────────────────────────

const [,, cmd, ...rest] = process.argv;

switch (cmd) {
  case 'list':              cmdList(); break;
  case 'add':               cmdAdd(rest); break;
  case 'edit':              await cmdEdit(rest); break;
  case 'remove': case 'rm': await cmdRemove(rest); break;
  case 'show':              cmdShow(rest); break;
  case 'search':            cmdSearch(rest); break;
  case 'test':              cmdTest(rest); break;
  case 'copy':              cmdCopy(rest); break;
  case 'export':            cmdExport(rest); break;
  case 'import':            cmdImport(rest); break;
  case '--help': case '-h': case 'help': printHelp(); break;
  case undefined:           await runTUI(); break;
  default: die(`Unknown command: ${cmd}. Run sshcm --help`);
}
