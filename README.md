![Banner](banner.svg)

# ssh-config-manager

> Manage SSH hosts. Add, edit, remove, and search via interactive TUI or CLI commands. Zero dependencies.

```
  ssh-config-manager v1.0.0

  ┌──────────────────────────────────────────────────────────────┐
  │  ssh-config-manager  ↑↓ navigate  Enter show  n new  q quit │
  │                                                              │
  │  ▶ prod        192.168.1.1       deploy   22    id_rsa      │
  │    staging     staging.acme.com  ubuntu   22    id_ed25519  │
  │    bastion     10.0.0.1          admin    2222  id_rsa      │
  │                                                              │
  │  3 host(s)                                                   │
  └──────────────────────────────────────────────────────────────┘
```

## Install

```bash
# Run without installing
npx ssh-config-manager [command]

# Install globally
npm install -g ssh-config-manager
```

## Quick Start

```bash
# Interactive TUI (no arguments)
sshcm

# Add a host
sshcm add --host prod --hostname 192.168.1.1 --user deploy --port 22 --identity ~/.ssh/id_rsa

# List all hosts
sshcm list

# Show a specific host
sshcm show prod

# Test a connection
sshcm test prod

# Search hosts
sshcm search web

# Edit interactively
sshcm edit prod

# Remove a host
sshcm remove prod
```

## Commands

| Command | Description |
|---------|-------------|
| `sshcm` | Launch interactive TUI |
| `sshcm list` | Table of all hosts |
| `sshcm add [options]` | Add a new host entry |
| `sshcm edit <alias>` | Edit host interactively |
| `sshcm remove <alias>` | Remove with confirmation |
| `sshcm show <alias>` | Show all settings for a host |
| `sshcm search <query>` | Search by alias or hostname |
| `sshcm test <alias>` | Test SSH connection |
| `sshcm copy <src> <dest>` | Duplicate a host entry |
| `sshcm export [--format json]` | Export all hosts as JSON |
| `sshcm import <file.json>` | Import hosts from JSON |

## Add Options

```
--host       Alias (e.g. prod)
--hostname   IP or domain
--user       SSH user
--port       Port (default 22)
--identity   Path to identity file
```

## TUI Keys

| Key | Action |
|-----|--------|
| `↑` / `k` | Move up |
| `↓` / `j` | Move down |
| `Enter` | Show host details |
| `n` | New host |
| `e` | Edit selected host |
| `d` | Delete selected host |
| `t` | Test connection |
| `q` / `Esc` | Quit / back |

## Features

- **Zero dependencies** — only Node.js built-ins (`fs`, `path`, `os`, `readline`, `child_process`)
- **Automatic backups** — `~/.ssh/backups/` before every write
- **Hostname validation** — validates IP/domain before writing
- **Security-first** — uses `spawnSync` only, never `exec`; shows key paths, never contents
- **Preserves formatting** — reads and writes SSH config cleanly
- **Export/Import** — JSON round-trip for portable host lists
- **Alias**: `ssh-config-manager` and `sshcm`

## Supported Config Keys

`Host`, `HostName`, `User`, `Port`, `IdentityFile`, `IdentitiesOnly`, `ForwardAgent`, `ServerAliveInterval`, `StrictHostKeyChecking`, `ProxyJump` — plus any other valid SSH options.

## Config Location

```
~/.ssh/config     ← managed by sshcm
~/.ssh/backups/   ← automatic backups before every write
```

---

Built with Node.js · Zero dependencies · MIT License
