/**
 * Superpowers-prepared plugin for OpenCode.ai
 *
 * Supports both host generations:
 *   V1 (opencode 1.x): discovered via the named export SuperpowersOptimizedPlugin.
 *     Registers the skills path in live config and injects the bootstrap into
 *     the first user message (experimental.chat.messages.transform).
 *   V2 (opencode 2.x): loaded via the default export { id, setup } by
 *     PluginSupervisor. Registers each skill as a native Skill.Info and injects
 *     the bootstrap through ctx.session.hook("context").
 *
 * Both paths skip bootstrap injection in task subagent (child) sessions, so a
 * worker does not restart the controller's design/approval cycle.
 *
 * Fork additions on top of upstream: a best-effort git-based auto-update once
 * per 24 hours (its notice rides along in the V1 bootstrap), and V1 safety
 * hooks that block dangerous commands and secret exposure via
 * tool.execute.before.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPDATE_CACHE_TTL_SECONDS = 86400;
const UPDATE_CONFIG_FILE = path.join('.config', 'superpowers', 'update.conf');

// Module scope: the V2 setup() path has no plugin context to derive it from.
const superpowersSkillsDir = path.resolve(__dirname, '../../skills');

// Frontmatter extraction (avoid dependency on skills-core for bootstrap).
// Handles block scalars and multi-line values: nearly every skill in this fork
// writes `description: >` across several lines, and a naive line-by-line parse
// keeps only the first of them.
const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content };

  const frontmatterStr = match[1];
  const body = match[2];
  const frontmatter = {};
  let lastKey = null;

  for (const rawLine of frontmatterStr.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && !/^\s/.test(line)) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      // Block scalar markers (>, |, optionally with +/- chomping) carry no
      // value themselves; the indented lines that follow do.
      frontmatter[key] = /^(>[+-]?|\|[+-]?)$/.test(value) ? '' : value;
      lastKey = key;
    } else if (lastKey !== null && line.trim() !== '') {
      // Continuation of a multi-line value: append rather than drop so long
      // descriptions survive parsing. Newlines collapse to spaces — good
      // enough for the single-line name/description fields consumed here.
      frontmatter[lastKey] = `${frontmatter[lastKey]} ${line.trim()}`.trim();
    }
  }

  // A quoted value may close on a continuation line, so unquote only once
  // the value is fully assembled: strip exactly one matching surrounding
  // pair and leave unbalanced quotes alone.
  for (const key of Object.keys(frontmatter)) {
    frontmatter[key] = frontmatter[key].replace(/^(["'])([\s\S]*)\1$/, '$2');
  }

  return { frontmatter, content: body };
};

// Normalize a path: trim whitespace, expand ~, resolve to absolute
const normalizePath = (p, homeDir) => {
  if (!p || typeof p !== 'string') return null;
  let normalized = p.trim();
  if (!normalized) return null;
  if (normalized.startsWith('~/')) {
    normalized = path.join(homeDir, normalized.slice(2));
  } else if (normalized === '~') {
    normalized = homeDir;
  }
  return path.resolve(normalized);
};

const runGit = (repoRoot, args, timeoutMs = 0) => {
  try {
    const result = spawnSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      timeout: timeoutMs > 0 ? timeoutMs : undefined
    });
    if (result.error) {
      return { ok: false, stdout: '', stderr: String(result.error.message || result.error) };
    }
    return {
      ok: result.status === 0,
      stdout: (result.stdout || '').trim(),
      stderr: (result.stderr || '').trim()
    };
  } catch (err) {
    return { ok: false, stdout: '', stderr: String(err) };
  }
};

const parseBooleanLike = (value) => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

const isAutoUpdateEnabled = (homeDir) => {
  const envSetting = parseBooleanLike(process.env.SUPERPOWERS_AUTO_UPDATE || '');
  if (envSetting !== null) return envSetting;

  const configFile = path.join(homeDir, UPDATE_CONFIG_FILE);
  if (!fs.existsSync(configFile)) return true;

  try {
    const lines = fs.readFileSync(configFile, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^auto_update\s*=\s*(.+)$/i);
      if (!match) continue;
      const parsed = parseBooleanLike(match[1] || '');
      if (parsed !== null) return parsed;
    }
  } catch {
    // Ignore parse/read failures and keep the default enabled behavior.
  }

  return true;
};

const readVersion = (pluginRoot) => {
  try {
    const versionPath = path.join(pluginRoot, 'VERSION');
    return fs.readFileSync(versionPath, 'utf8').trim();
  } catch {
    return '';
  }
};

const readWhatsNew = (pluginRoot, newVersion, oldVersion) => {
  const releaseNotesPath = path.join(pluginRoot, 'RELEASE-NOTES.md');
  if (!fs.existsSync(releaseNotesPath)) return '';

  let content = '';
  try {
    content = fs.readFileSync(releaseNotesPath, 'utf8');
  } catch {
    return '';
  }

  const lines = content.split(/\r?\n/);
  const startHeading = `## v${newVersion}`;
  const stopHeading = `## v${oldVersion}`;
  const startIndex = lines.findIndex((line) => line.startsWith(startHeading));
  if (startIndex < 0) return '';

  const extracted = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith(stopHeading)) break;
    extracted.push(line);
  }

  while (extracted.length > 0 && extracted[0].trim() === '') extracted.shift();
  while (extracted.length > 0 && extracted[extracted.length - 1].trim() === '') extracted.pop();

  if (extracted.length > 30) {
    return `${extracted.slice(0, 30).join('\n')}\n...\n\nSee RELEASE-NOTES.md for full details.`;
  }
  return extracted.join('\n');
};

const checkForUpdates = (pluginRoot, configDir, homeDir) => {
  const cacheDir = path.join(configDir, 'hooks-logs');
  const cacheFile = path.join(cacheDir, 'update-check.cache');
  const nowMs = Date.now();

  if (!isAutoUpdateEnabled(homeDir)) return '';

  // Must be a git repo to auto-update.
  const gitDir = runGit(pluginRoot, ['rev-parse', '--git-dir']);
  if (!gitDir.ok) return '';

  // Skip checks while cache is fresh.
  try {
    const stat = fs.statSync(cacheFile);
    const cacheAgeSeconds = Math.floor((nowMs - stat.mtimeMs) / 1000);
    if (cacheAgeSeconds < UPDATE_CACHE_TTL_SECONDS) return '';
  } catch {
    // Cache file doesn't exist or cannot be read; proceed with update check.
  }

  const fetchResult = runGit(pluginRoot, ['fetch', 'origin', '--quiet'], 3000);
  if (!fetchResult.ok) return '';

  const localHead = runGit(pluginRoot, ['rev-parse', 'HEAD']);
  const remoteHead = runGit(pluginRoot, ['rev-parse', 'origin/main']);
  if (!localHead.ok || !remoteHead.ok || !localHead.stdout || !remoteHead.stdout) return '';

  // Update cache timestamp regardless of whether an update was needed.
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, `${nowMs}\n`);
  } catch {
    // Cache write failure should never block normal plugin behavior.
  }

  if (localHead.stdout === remoteHead.stdout) return '';

  // Never auto-update if the plugin clone has local changes.
  const dirtyStatus = runGit(pluginRoot, ['status', '--porcelain']);
  if (!dirtyStatus.ok || dirtyStatus.stdout) return '';

  // Only fast-forward from local HEAD to origin/main.
  // Skip local-ahead/diverged states to avoid destructive sync.
  const mergeBase = runGit(pluginRoot, ['merge-base', 'HEAD', 'origin/main']);
  if (!mergeBase.ok || mergeBase.stdout !== localHead.stdout) return '';

  const oldVersion = readVersion(pluginRoot);
  const mergeResult = runGit(pluginRoot, ['merge', '--ff-only', 'origin/main']);
  if (!mergeResult.ok) return '';

  const newVersion = readVersion(pluginRoot);
  if (!oldVersion || !newVersion || oldVersion === newVersion) return '';

  const whatsNew = readWhatsNew(pluginRoot, newVersion, oldVersion);
  return `<important-reminder>IN YOUR FIRST REPLY AFTER SEEING THIS MESSAGE YOU MUST TELL THE USER:

**Superpowers Optimized has been updated to v${newVersion}** (was v${oldVersion})

**What's New:**
${whatsNew}</important-reminder>`;
};

// ---------------------------------------------------------------------------
// Safety: block dangerous commands (parity with Claude Code PreToolUse hooks)
// ---------------------------------------------------------------------------

const SAFETY_LEVEL = 'high';
const SAFETY_LEVELS = { critical: 1, high: 2, strict: 3 };
const SAFETY_EMOJIS = { critical: '🚨', high: '⛔', strict: '⚠️' };
const SECRETS_EMOJIS = { critical: '🔐', high: '🛡️', strict: '⚠️' };

// Dangerous shell command patterns (from block-dangerous-commands.js)
const DANGEROUS_PATTERNS = [
  // CRITICAL
  { level: 'critical', id: 'rm-home',          regex: /\brm\s+(-\S+\s+)*["']?~\/?["']?(\s|$|[;&|])/,                        reason: 'rm targeting home directory' },
  { level: 'critical', id: 'rm-home-var',      regex: /\brm\s+(-\S+\s+)*["']?\$HOME["']?(\s|$|[;&|])/,                      reason: 'rm targeting $HOME' },
  { level: 'critical', id: 'rm-home-trailing', regex: /\brm\s+.+\s+["']?(~\/?|\$HOME)["']?(\s*$|[;&|])/,                   reason: 'rm with trailing ~/ or $HOME' },
  { level: 'critical', id: 'rm-root',          regex: /\brm\s+(-\S+\s+)*\/(\*|\s|$|[;&|])/,                                 reason: 'rm targeting root filesystem' },
  { level: 'critical', id: 'rm-system',        regex: /\brm\s+(-\S+\s+)*\/(etc|usr|var|bin|sbin|lib|boot|dev|proc|sys)(\/|\s|$)/, reason: 'rm targeting system directory' },
  { level: 'critical', id: 'rm-cwd',           regex: /\brm\s+(-\S+\s+)*(\.\/?|\*|\.\/\*)(\s|$|[;&|])/,                     reason: 'rm deleting current directory contents' },
  { level: 'critical', id: 'dd-disk',          regex: /\bdd\b.+of=\/dev\/(sd[a-z]|nvme|hd[a-z]|vd[a-z]|xvd[a-z])/,         reason: 'dd writing to disk device' },
  { level: 'critical', id: 'mkfs',             regex: /\bmkfs(\.\w+)?\s+\/dev\/(sd[a-z]|nvme|hd[a-z]|vd[a-z])/,            reason: 'mkfs formatting disk' },
  { level: 'critical', id: 'fork-bomb',        regex: /:\(\)\s*\{.*:\s*\|\s*:.*&/,                                         reason: 'fork bomb detected' },
  // HIGH
  { level: 'high', id: 'curl-pipe-sh',   regex: /\b(curl|wget)\b.+\|\s*(ba)?sh\b/,                                        reason: 'piping URL to shell (RCE risk)' },
  { level: 'high', id: 'git-force-main', regex: /\bgit\s+push\b(?!.+--force-with-lease).+(--force|-f)\b.+\b(main|master)\b/, reason: 'force push to main/master' },
  { level: 'high', id: 'git-reset-hard', regex: /\bgit\s+reset\s+--hard/,                                                 reason: 'git reset --hard loses uncommitted work' },
  { level: 'high', id: 'git-clean-f',    regex: /\bgit\s+clean\s+(-\w*f|-f)/,                                             reason: 'git clean -f deletes untracked files' },
  { level: 'high', id: 'chmod-777',      regex: /\bchmod\b.+\b777\b/,                                                     reason: 'chmod 777 is a security risk' },
  { level: 'high', id: 'cat-secrets',    regex: /\b(cat|less|head|tail|more)\b.+(credentials|secrets?|\.pem|\.key|id_rsa|id_ed25519)/i, reason: 'reading secrets file' },
  { level: 'high', id: 'echo-secret',    regex: /\becho\b.+\$\w*(SECRET|KEY|TOKEN|PASSWORD|API_|PRIVATE)/i,               reason: 'echoing secret variable' },
  { level: 'high', id: 'docker-vol-rm',  regex: /\bdocker\s+volume\s+(rm|prune)/,                                         reason: 'docker volume deletion loses data' },
  { level: 'high', id: 'rm-ssh',         regex: /\brm\b.+\.ssh\/(id_|authorized_keys|known_hosts)/,                       reason: 'deleting SSH keys' },
  // STRICT
  { level: 'strict', id: 'git-force-any',    regex: /\bgit\s+push\b(?!.+--force-with-lease).+(--force|-f)\b/,              reason: 'force push (use --force-with-lease)' },
  { level: 'strict', id: 'git-checkout-dot', regex: /\bgit\s+checkout\s+\./,                                               reason: 'git checkout . discards changes' },
  { level: 'strict', id: 'sudo-rm',          regex: /\bsudo\s+rm\b/,                                                       reason: 'sudo rm has elevated privileges' },
  { level: 'strict', id: 'docker-prune',     regex: /\bdocker\s+(system|image)\s+prune/,                                   reason: 'docker prune removes images' },
  { level: 'strict', id: 'crontab-r',        regex: /\bcrontab\s+-r/,                                                      reason: 'removes all cron jobs' },
];

// Sensitive file path patterns (from protect-secrets.js)
const SENSITIVE_FILES = [
  // CRITICAL
  { level: 'critical', id: 'env-file',           regex: /(?:^|\/)\.env(?:\.[^/]*)?$/,                    reason: '.env file contains secrets' },
  { level: 'critical', id: 'envrc',              regex: /(?:^|\/)\.envrc$/,                              reason: '.envrc (direnv) contains secrets' },
  { level: 'critical', id: 'ssh-private-key',    regex: /(?:^|\/)\.ssh\/id_[^/]+$/,                      reason: 'SSH private key' },
  { level: 'critical', id: 'ssh-private-key-2',  regex: /(?:^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa)$/,  reason: 'SSH private key' },
  { level: 'critical', id: 'ssh-authorized',     regex: /(?:^|\/)\.ssh\/authorized_keys$/,               reason: 'SSH authorized_keys' },
  { level: 'critical', id: 'aws-credentials',    regex: /(?:^|\/)\.aws\/credentials$/,                   reason: 'AWS credentials file' },
  { level: 'critical', id: 'aws-config',         regex: /(?:^|\/)\.aws\/config$/,                        reason: 'AWS config may contain secrets' },
  { level: 'critical', id: 'kube-config',        regex: /(?:^|\/)\.kube\/config$/,                       reason: 'Kubernetes config contains credentials' },
  { level: 'critical', id: 'pem-key',            regex: /\.pem$/i,                                       reason: 'PEM key file' },
  { level: 'critical', id: 'key-file',           regex: /\.key$/i,                                       reason: 'Key file' },
  { level: 'critical', id: 'p12-key',            regex: /\.(p12|pfx)$/i,                                 reason: 'PKCS12 key file' },
  // HIGH
  { level: 'high', id: 'credentials-json',       regex: /(?:^|\/)credentials\.json$/i,                   reason: 'Credentials file' },
  { level: 'high', id: 'secrets-file',           regex: /(?:^|\/)(secrets?|credentials?)\.(json|ya?ml|toml)$/i, reason: 'Secrets configuration file' },
  { level: 'high', id: 'service-account',        regex: /service[_-]?account.*\.json$/i,                 reason: 'GCP service account key' },
  { level: 'high', id: 'gcloud-creds',           regex: /(?:^|\/)\.config\/gcloud\/.*(credentials|tokens)/i, reason: 'GCloud credentials' },
  { level: 'high', id: 'azure-creds',            regex: /(?:^|\/)\.azure\/(credentials|accessTokens)/i,  reason: 'Azure credentials' },
  { level: 'high', id: 'docker-config',          regex: /(?:^|\/)\.docker\/config\.json$/,               reason: 'Docker config may contain registry auth' },
  { level: 'high', id: 'netrc',                  regex: /(?:^|\/)\.netrc$/,                              reason: '.netrc contains credentials' },
  { level: 'high', id: 'npmrc',                  regex: /(?:^|\/)\.npmrc$/,                              reason: '.npmrc may contain auth tokens' },
  { level: 'high', id: 'pypirc',                 regex: /(?:^|\/)\.pypirc$/,                             reason: '.pypirc contains PyPI credentials' },
  { level: 'high', id: 'gem-creds',              regex: /(?:^|\/)\.gem\/credentials$/,                   reason: 'RubyGems credentials' },
  { level: 'high', id: 'vault-token',            regex: /(?:^|\/)(\.vault-token|vault-token)$/,          reason: 'Vault token file' },
  { level: 'high', id: 'keystore',               regex: /\.(keystore|jks)$/i,                            reason: 'Java keystore' },
  { level: 'high', id: 'htpasswd',               regex: /(?:^|\/)\.?htpasswd$/,                          reason: 'htpasswd contains hashed passwords' },
  { level: 'high', id: 'pgpass',                 regex: /(?:^|\/)\.pgpass$/,                             reason: 'PostgreSQL password file' },
  { level: 'high', id: 'my-cnf',                 regex: /(?:^|\/)\.my\.cnf$/,                            reason: 'MySQL config may contain password' },
  // STRICT
  { level: 'strict', id: 'database-config',      regex: /(?:^|\/)(?:config\/)?database\.(json|ya?ml)$/i, reason: 'Database config may contain passwords' },
  { level: 'strict', id: 'ssh-known-hosts',      regex: /(?:^|\/)\.ssh\/known_hosts$/,                   reason: 'SSH known_hosts reveals infrastructure' },
  { level: 'strict', id: 'gitconfig',            regex: /(?:^|\/)\.gitconfig$/,                          reason: '.gitconfig may contain credentials' },
  { level: 'strict', id: 'curlrc',               regex: /(?:^|\/)\.curlrc$/,                             reason: '.curlrc may contain auth' },
];

// Bash command patterns that expose or exfiltrate secrets (from protect-secrets.js)
const SECRET_BASH_PATTERNS = [
  // CRITICAL
  { level: 'critical', id: 'cat-env',            regex: /\b(cat|less|head|tail|more|bat|view)\s+[^|;]*\.env\b/i,           reason: 'Reading .env file exposes secrets' },
  { level: 'critical', id: 'cat-ssh-key',        regex: /\b(cat|less|head|tail|more|bat)\s+[^|;]*(id_rsa|id_ed25519|id_ecdsa|id_dsa|\.pem|\.key)\b/i, reason: 'Reading private key' },
  { level: 'critical', id: 'cat-aws-creds',      regex: /\b(cat|less|head|tail|more)\s+[^|;]*\.aws\/credentials/i,         reason: 'Reading AWS credentials' },
  // HIGH
  { level: 'high', id: 'env-dump',               regex: /\bprintenv\b|(?:^|[;&|]\s*)env\s*(?:$|[;&|])/,                    reason: 'Environment dump may expose secrets' },
  { level: 'high', id: 'echo-secret-var',        regex: /\becho\b[^;|&]*\$\{?[A-Za-z_]*(?:SECRET|KEY|TOKEN|PASSWORD|PASSW|CREDENTIAL|API_KEY|AUTH|PRIVATE)[A-Za-z_]*\}?/i, reason: 'Echoing secret variable' },
  { level: 'high', id: 'printf-secret-var',      regex: /\bprintf\b[^;|&]*\$\{?[A-Za-z_]*(?:SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL|API_KEY|AUTH|PRIVATE)[A-Za-z_]*\}?/i, reason: 'Printing secret variable' },
  { level: 'high', id: 'cat-secrets-file',       regex: /\b(cat|less|head|tail|more)\s+[^|;]*(credentials?|secrets?)\.(json|ya?ml|toml)/i, reason: 'Reading secrets file' },
  { level: 'high', id: 'source-env',             regex: /\bsource\s+[^|;]*\.env\b|(?:^|[;&|]\s*)\.\s+[^|;]*\.env\b|^\.\s+[^|;]*\.env\b/i, reason: 'Sourcing .env loads secrets' },
  { level: 'high', id: 'curl-upload-env',        regex: /\bcurl\b[^;|&]*(-d\s*@|-F\s*[^=]+=@|--data[^=]*=@)[^;|&]*(\.env|credentials|secrets|id_rsa|\.pem|\.key)/i, reason: 'Uploading secrets via curl' },
  { level: 'high', id: 'scp-secrets',            regex: /\bscp\b[^;|&]*(\.env|credentials|secrets|id_rsa|\.pem|\.key)[^;|&]+:/i, reason: 'Copying secrets via scp' },
  { level: 'high', id: 'rm-env',                 regex: /\brm\b.*\.env\b/i,                                                 reason: 'Deleting .env file' },
  { level: 'high', id: 'rm-aws-creds',           regex: /\brm\b[^;|&]*\.aws\/credentials/i,                                reason: 'Deleting AWS credentials' },
  { level: 'high', id: 'proc-environ',           regex: /\/proc\/[^/]*\/environ/,                                          reason: 'Reading process environment' },
  // STRICT
  { level: 'strict', id: 'grep-password',        regex: /\bgrep\b[^|;]*(-r|--recursive)[^|;]*(password|secret|api.?key|token|credential)/i, reason: 'Grep for secrets may expose them' },
  { level: 'strict', id: 'base64-secrets',       regex: /\bbase64\b[^|;]*(\.env|credentials|secrets|id_rsa|\.pem)/i,       reason: 'Base64 encoding secrets' },
];

// Hardcoded secret patterns — scans content being written (from protect-secrets.js)
const HARDCODED_SECRET_PATTERNS = [
  { id: 'aws-access-key',     regex: /AKIA[0-9A-Z]{16}/,                                                                    name: 'AWS access key',                envHint: 'AWS_ACCESS_KEY_ID' },
  { id: 'aws-secret-key',     regex: /(?:aws_secret_access_key|secret_key|aws_secret)\s*[:=]\s*['"]?[0-9a-zA-Z/+]{40}/,     name: 'AWS secret key',                envHint: 'AWS_SECRET_ACCESS_KEY' },
  { id: 'github-token',       regex: /gh[ps]_[A-Za-z0-9_]{36,}/,                                                            name: 'GitHub token',                  envHint: 'GITHUB_TOKEN' },
  { id: 'openai-key',         regex: /sk-[A-Za-z0-9]{32,}/,                                                                 name: 'OpenAI API key',                envHint: 'OPENAI_API_KEY' },
  { id: 'anthropic-key',      regex: /sk-ant-[A-Za-z0-9_-]{32,}/,                                                           name: 'Anthropic API key',             envHint: 'ANTHROPIC_API_KEY' },
  { id: 'stripe-key',         regex: /sk_(live|test)_[A-Za-z0-9]{24,}/,                                                     name: 'Stripe secret key',             envHint: 'STRIPE_SECRET_KEY' },
  { id: 'private-key-block',  regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,                                        name: 'private key PEM block',         envHint: 'PRIVATE_KEY (load from file)' },
  { id: 'generic-api-key',    regex: /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*['"][A-Za-z0-9]{16,}['"]/i,            name: 'hardcoded API key',             envHint: 'API_KEY' },
  { id: 'connection-string',  regex: /(?:postgres|mysql|mongodb|redis|amqp):\/\/[^:\s]+:[^@\s]+@/,                          name: 'connection string with password', envHint: 'DATABASE_URL' },
  { id: 'slack-token',        regex: /xox[bporas]-[A-Za-z0-9-]{10,}/,                                                       name: 'Slack token',                   envHint: 'SLACK_TOKEN' },
];

const FILE_ALLOWLIST = [
  /\.env\.example$/i, /\.env\.sample$/i, /\.env\.template$/i,
  /\.env\.schema$/i, /\.env\.defaults$/i, /env\.example$/i, /example\.env$/i,
];
const CONTENT_SCAN_ALLOWLIST = [
  /\.env(\..*)?$/i, /\.env\.example$/i, /\.env\.sample$/i, /\.env\.template$/i,
  /known-issues\.md$/i, /SKILL\.md$/i, /RELEASE-NOTES\.md$/i,
];

function safetyCheckBash(cmd) {
  const threshold = SAFETY_LEVELS[SAFETY_LEVEL] || 2;
  // Check dangerous command patterns
  for (const p of DANGEROUS_PATTERNS) {
    if (SAFETY_LEVELS[p.level] <= threshold && p.regex.test(cmd)) {
      return { blocked: true, pattern: p, emoji: SAFETY_EMOJIS[p.level] };
    }
  }
  // Check secret exposure patterns
  for (const p of SECRET_BASH_PATTERNS) {
    if (SAFETY_LEVELS[p.level] <= threshold && p.regex.test(cmd)) {
      return { blocked: true, pattern: p, emoji: SECRETS_EMOJIS[p.level] };
    }
  }
  return { blocked: false };
}

function safetyCheckFilePath(filePath) {
  if (!filePath) return { blocked: false };
  if (FILE_ALLOWLIST.some(p => p.test(filePath))) return { blocked: false };
  const threshold = SAFETY_LEVELS[SAFETY_LEVEL] || 2;
  for (const p of SENSITIVE_FILES) {
    if (SAFETY_LEVELS[p.level] <= threshold && p.regex.test(filePath)) {
      return { blocked: true, pattern: p, emoji: SECRETS_EMOJIS[p.level] };
    }
  }
  return { blocked: false };
}

function safetyCheckWriteContent(filePath, content) {
  if (!content || typeof content !== 'string') return { blocked: false };
  if (CONTENT_SCAN_ALLOWLIST.some(p => p.test(filePath || ''))) return { blocked: false };
  for (const p of HARDCODED_SECRET_PATTERNS) {
    if (p.regex.test(content)) {
      return {
        blocked: true,
        pattern: {
          level: 'critical',
          id: `hardcoded-${p.id}`,
          reason: `Hardcoded ${p.name} detected. Use an environment variable (e.g. process.env.${p.envHint}) instead.`,
        },
        emoji: SECRETS_EMOJIS.critical,
      };
    }
  }
  return { blocked: false };
}

// --- Tool mappings ----------------------------------------------------------

export const V1_MAPPING = `**Tool Mapping for OpenCode:**
When skills request actions, substitute OpenCode equivalents:
- Create or update todos → \`todowrite\`
- \`Subagent (general-purpose):\` → \`task\` with \`subagent_type: "general"\`
- Invoke a skill → OpenCode's native \`skill\` tool
- Read files → \`read\`
- Create, edit, or delete files → \`apply_patch\`
- Run shell commands → \`bash\`
- Search files → \`grep\`, \`glob\`
- Fetch a URL → \`webfetch\`

Use OpenCode's native \`skill\` tool to list and load skills.`;

// V2 built-ins: no todo tool at all; task → subagent (agent name in 'agent',
// continuation via sessionID); apply_patch → patch (patchText, same patch
// format); bash → shell. read, write, edit, grep, glob, webfetch, websearch,
// and skill all exist under those names (verified against the 2.0.4 and 2.0.7
// host contracts).
export const V2_MAPPING = `**Tool Mapping for OpenCode:**
When skills request actions, substitute OpenCode equivalents:
- Create or update todos → OpenCode v2 has no todo tool; track the plan in a markdown file (or the harness's plan facility) instead
- \`Subagent (general-purpose):\` → \`subagent\` with \`agent: "general"\` (give it \`description\` and \`prompt\`, optionally \`background\`; pass \`sessionID\` to continue a previous subagent)
- Invoke a skill → OpenCode's native \`skill\` tool
- Read files → \`read\`
- Create, edit, or delete files → use \`patch\` with \`patchText\` when available; otherwise use \`write\` to create or overwrite files, \`edit\` for targeted changes, and \`shell\` for deletion
- Run shell commands → \`shell\` (\`command\`, \`workdir\`, \`timeout\`, \`background\`)
- Search files → \`grep\`, \`glob\`
- Fetch a URL → \`webfetch\`
- Search the web → \`websearch\`

Use OpenCode's native \`skill\` tool to list and load skills.`;

// Module-level cache for bootstrap content, keyed by tool mapping (host
// flavor) plus this fork's update notice. SKILL.md does not change during a
// session, so parsing it once removes redundant fs + regex work on every
// agent step.
const _bootstrapCache = new Map();

const getBootstrapContent = (toolMapping, updateNotice = '') => {
  const cacheKey = `${toolMapping}\u0000${updateNotice}`;
  if (_bootstrapCache.has(cacheKey)) return _bootstrapCache.get(cacheKey);

  const skillPath = path.join(superpowersSkillsDir, 'using-superpowers', 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    _bootstrapCache.set(cacheKey, null);
    return null;
  }

  const { content } = extractAndStripFrontmatter(fs.readFileSync(skillPath, 'utf8'));
  const updateSection = updateNotice ? `\n\n${updateNotice}\n` : '';

  _bootstrapCache.set(cacheKey, `<EXTREMELY_IMPORTANT>
You have superpowers-prepared.

**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "using-superpowers" again - that would be redundant.**

${content}
${updateSection}
${toolMapping}
</EXTREMELY_IMPORTANT>`);

  return _bootstrapCache.get(cacheKey);
};

// --- Task-subagent (child session) detection --------------------------------
//
// The bootstrap drives controller workflows (brainstorming, planning, approval
// cycles). Injecting it into task subagent sessions makes workers restart
// design/approval cycles for work the parent already authorised. Detect child
// sessions structurally: a parentID on the session is the child signal on both
// flavors. Skills stay registered for every session.
//
// parentID never changes for a session, so the decision is cached; the
// injection hook fires on every agent step and would otherwise pay a client
// roundtrip each time. The cache is bounded because the V2 service process is
// long-lived: when full, drop the oldest quarter (Map iterates in insertion
// order).
const CHILD_SESSION_CACHE_MAX = 512;
const _childSessionCache = new Map();

const _cacheChildSession = (sessionID, isChild) => {
  if (_childSessionCache.size >= CHILD_SESSION_CACHE_MAX) {
    let toDrop = Math.ceil(CHILD_SESSION_CACHE_MAX / 4);
    for (const key of _childSessionCache.keys()) {
      if (toDrop-- <= 0) break;
      _childSessionCache.delete(key);
    }
  }
  _childSessionCache.set(sessionID, isChild);
};

const isChildSession = async (fetchSession, sessionID) => {
  if (!sessionID) return false; // unknown session: keep current behavior
  if (_childSessionCache.has(sessionID)) return _childSessionCache.get(sessionID);

  let isChild = false;
  try {
    const result = await fetchSession(sessionID);
    // V1 returns a successful SDK envelope while V2 returns a direct session
    // record. Validate both shapes before classifying or caching; resolved SDK
    // errors must follow the same fail-open path as rejections.
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('Session lookup returned no usable record');
    }
    if (result.error != null || result.response?.ok === false) {
      throw new Error('Session lookup was unsuccessful');
    }
    const session = 'data' in result ? result.data : result;
    if (!session || typeof session !== 'object' || Array.isArray(session) || session.id !== sessionID) {
      throw new Error('Session lookup returned an invalid session identity');
    }
    if (session.parentID !== undefined &&
        (typeof session.parentID !== 'string' || session.parentID.length === 0)) {
      throw new Error('Session lookup returned an invalid parent identity');
    }
    isChild = session.parentID !== undefined;
  } catch (err) {
    // Fail open: on lookup errors keep injecting (previous behavior) and do
    // not cache, so a transient failure can recover on the next step.
    console.error('[superpowers-prepared] session lookup failed, treating session as top-level:', err);
    return false;
  }
  _cacheChildSession(sessionID, isChild);
  return isChild;
};

// ---------------------------------------------------------------------------

/**
 * V1 Plugin Function (named export + default.server)
 *
 * Used by OpenCode 1.x: discovered via named export scanning.
 */
export const SuperpowersOptimizedPlugin = async ({ client } = {}) => {
  const homeDir = os.homedir();
  const pluginRoot = path.resolve(__dirname, '../..');
  const envConfigDir = normalizePath(process.env.OPENCODE_CONFIG_DIR, homeDir);
  const configDir = envConfigDir || path.join(homeDir, '.config/opencode');
  const updateNotice = checkForUpdates(pluginRoot, configDir, homeDir);

  return {
    // Inject skills path into live config so OpenCode discovers our skills
    // without requiring manual symlinks or config file edits.
    config: async (config) => {
      // V2: skills is a flat array — skip, setup() handles V2 registration.
      if (Array.isArray(config.skills)) return;

      // V1: skills is { paths: [...] }
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(superpowersSkillsDir)) {
        config.skills.paths.push(superpowersSkillsDir);
      }
    },

    // Inject bootstrap into the first user message of each top-level session.
    // A user message rather than a system message avoids token bloat from a
    // system message repeated every turn, and avoids multiple system messages
    // breaking Qwen and other models.
    //
    // The hook fires on every agent step (not just every turn) because
    // opencode reloads messages from the DB each step, so fresh message arrays
    // may need injection again — getBootstrapContent() must not do repeated
    // disk work.
    'experimental.chat.messages.transform': async (_input, output) => {
      const bootstrap = getBootstrapContent(V1_MAPPING, updateNotice);
      if (!bootstrap || !output.messages.length) return;
      const firstUser = output.messages.find(m => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;

      // Guard: skip if the first user message already carries the bootstrap.
      if (firstUser.parts.some(p => p.type === 'text' && p.text.includes('EXTREMELY_IMPORTANT'))) return;

      // Never restart the controller workflow inside a task subagent (child)
      // session. V1 passes no input to this hook, so take the sessionID from
      // the message record itself.
      if (client && await isChildSession(
        (id) => client.session.get({ path: { id } }),
        firstUser.info.sessionID,
      )) return;

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
    },

    // Block dangerous commands and secret exposure before tool execution
    'tool.execute.before': async (input, output) => {
      const tool = input.tool;
      const args = output.args;

      if (tool === 'bash') {
        const cmd = args?.command || '';
        const result = safetyCheckBash(cmd);
        if (result.blocked) {
          const p = result.pattern;
          throw new Error(`${result.emoji} [${p.id}] ${p.reason}`);
        }
      }

      if (tool === 'read' || tool === 'edit' || tool === 'write') {
        const filePath = args?.filePath || args?.path || '';
        const fileResult = safetyCheckFilePath(filePath);
        if (fileResult.blocked) {
          const p = fileResult.pattern;
          const action = { read: 'read', edit: 'modify', write: 'write to' }[tool];
          throw new Error(`${fileResult.emoji} [${p.id}] Cannot ${action}: ${p.reason}`);
        }

        // Scan content being written for hardcoded secrets
        if (tool === 'write' || tool === 'edit') {
          const content = args?.content || args?.newContent || args?.new_string || '';
          const contentResult = safetyCheckWriteContent(filePath, content);
          if (contentResult.blocked) {
            const p = contentResult.pattern;
            throw new Error(`${contentResult.emoji} [${p.id}] ${p.reason}`);
          }
        }
      }
    },
  };
};

/**
 * V2 Setup Function (default.setup)
 *
 * Called by the V2 PluginSupervisor. Does two things:
 *
 * 1. Registers every skills/<name>/SKILL.md as a native Skill.Info via
 *    ctx.skill.transform((draft) => draft.add(info)). V2 removed the old
 *    draft.source() directory registration; the draft API is now
 *    { list, add, update, remove } and add() decodes plain objects against
 *    the host's Skill.Info schema: { id, name, description?, autoinvoke?,
 *    path, content }. The file field is `path` — renamed from `location` in
 *    OpenCode v2.0.4.
 * 2. Injects the bootstrap via ctx.session.hook("context"), the V2 equivalent
 *    of V1's experimental.chat.messages.transform.
 *
 * Note: this fork's safety hooks (tool.execute.before) remain V1-only — the V2
 * host exposes a different tool-interception contract, and shipping an
 * unverified port of a *blocking* guard is worse than not shipping one. The V2
 * path therefore registers skills and bootstrap, not the command blocker.
 */
async function setup(ctx) {
  // V1 also invokes default.setup, but with a V1-shaped ctx that lacks the
  // skill/session domains. Detect it and return quietly — V1 is served
  // entirely by the SuperpowersOptimizedPlugin named export.
  if (!ctx || !ctx.skill || typeof ctx.skill.transform !== 'function' ||
      !ctx.session || typeof ctx.session.hook !== 'function') {
    return;
  }

  // 1. Register skills (one transform; one draft.add per skill)
  try {
    const skills = [];
    if (fs.existsSync(superpowersSkillsDir)) {
      for (const entry of fs.readdirSync(superpowersSkillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const skillPath = path.join(superpowersSkillsDir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillPath)) continue;
        const { frontmatter, content } = extractAndStripFrontmatter(fs.readFileSync(skillPath, 'utf8'));
        skills.push({
          id: entry.name,
          name: frontmatter.name || entry.name,
          ...(frontmatter.description ? { description: frontmatter.description } : {}),
          path: skillPath,
          content,
        });
      }
    }
    await ctx.skill.transform((draft) => {
      // draft.add() decodes against the host's Skill.Info schema and throws
      // synchronously on a mismatch. A throw escaping this callback is what
      // the host escalates into an asynchronous hard-disable of the whole
      // plugin — the try/catch around ctx.skill.transform never sees it, and
      // the bootstrap hook is torn down as collateral. Contain failures per
      // skill so one rejected payload skips that skill instead of killing
      // skills AND bootstrap.
      for (const skill of skills) {
        try {
          draft.add(skill);
        } catch (err) {
          console.error(`[superpowers-prepared] skill "${skill.id}" rejected by host, skipping:`, err);
        }
      }
    });
  } catch (err) {
    // Never break plugin activation: one failing plugin takes down the whole
    // V2 generation (including provider/catalog plugins => no models in TUI).
    console.error('[superpowers-prepared] skill registration failed:', err);
  }

  // 2. Inject bootstrap into the first user message via the V2 context hook.
  // The update notice is a V1-path concern (it is computed from the plugin
  // context there); V2 gets the plain bootstrap.
  try {
    await ctx.session.hook('context', async (event) => {
      try {
        const bootstrap = getBootstrapContent(V2_MAPPING);
        if (!bootstrap || !event.messages || !event.messages.length) return;
        const firstUser = event.messages.find(m => m.role === 'user');
        if (firstUser && (!firstUser.content || !firstUser.content.length)) return;
        if (firstUser?.content.some(p => p.type === 'text' && p.text && p.text.includes('EXTREMELY_IMPORTANT'))) return;

        // The context event carries the sessionID directly. Skip the
        // controller bootstrap when this prompt belongs to a task subagent
        // (child) session. Skills registered above stay available to workers.
        if (typeof ctx.session.get === 'function' && await isChildSession(
          (id) => ctx.session.get({ sessionID: id }),
          event.sessionID,
        )) return;

        // Native compaction can leave only an opaque checkpoint. Keep it
        // intact and append the transient bootstrap as a user message.
        if (firstUser) {
          firstUser.content.unshift({ type: 'text', text: bootstrap });
        } else {
          event.messages.push({ role: 'user', content: [{ type: 'text', text: bootstrap }] });
        }
      } catch (err) {
        // Never let hook callback errors break the request pipeline.
        console.error('[superpowers-prepared] context hook failed:', err);
      }
    });
  } catch (err) {
    console.error('[superpowers-prepared] session hook registration failed:', err);
  }
}

/**
 * Default Export: { id, server, setup }
 *
 * V2 PluginSupervisor reads { id, setup }.
 * V1 reads the named export SuperpowersOptimizedPlugin.
 * server() is exported for V1 compatibility.
 */
export default {
  id: 'superpowers-prepared',
  server: SuperpowersOptimizedPlugin,
  setup,
};
