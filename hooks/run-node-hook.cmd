: << 'CMDBLOCK'
@echo off
REM Cross-platform polyglot wrapper for Node.js hook scripts.
REM Works with any agent: Claude Code, Codex, Cursor, Qwen Code.
REM
REM On Windows: cmd.exe runs this batch portion, which calls node.
REM On Unix: the shell interprets the heredoc as a no-op and falls through.
REM
REM Resolution strategy (first match wins):
REM   1. CLAUDE_PLUGIN_ROOT env var (Claude Code)
REM   2. CURSOR_PLUGIN_ROOT env var (Cursor)
REM   3. QWEN_PLUGIN_ROOT env var (Qwen Code)
REM   4. CODEX_PLUGIN_ROOT env var (Codex)
REM   5. Resolve from this script's own directory (hooks/ -> parent = plugin root)
REM
REM Usage: run-node-hook.cmd <script-name> [args...]

if "%~1" == "" (
    echo run-node-hook.cmd: missing script name 1>&2
    exit /b 1
)

set "HOOK_DIR=%~dp0"
set "HOOK_DIR=%HOOK_DIR:~0,-1%"

REM Check agent-specific environment variables in priority order
if defined CLAUDE_PLUGIN_ROOT (
    node "%CLAUDE_PLUGIN_ROOT%\hooks\%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if defined CURSOR_PLUGIN_ROOT (
    node "%CURSOR_PLUGIN_ROOT%\hooks\%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if defined QWEN_PLUGIN_ROOT (
    node "%QWEN_PLUGIN_ROOT%\hooks\%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if defined CODEX_PLUGIN_ROOT (
    node "%CODEX_PLUGIN_ROOT%\hooks\%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM Fallback: resolve from this script's own directory.
REM %HOOK_DIR% is the directory containing this .cmd file (the hooks/ directory).
REM The plugin root is the parent of hooks/, so we use %HOOK_DIR%\..
for %%I in ("%HOOK_DIR%\..") do set "PLUGIN_ROOT=%%~fI"
node "%PLUGIN_ROOT%\hooks\%~1" %2 %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%
CMDBLOCK

# Unix: run the named Node script directly
# Resolution strategy mirrors Windows batch section above.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Try agent-specific env vars first
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    exec node "${CLAUDE_PLUGIN_ROOT}/hooks/${1}" "${@:2}"
elif [ -n "${CURSOR_PLUGIN_ROOT:-}" ]; then
    exec node "${CURSOR_PLUGIN_ROOT}/hooks/${1}" "${@:2}"
elif [ -n "${QWEN_PLUGIN_ROOT:-}" ]; then
    exec node "${QWEN_PLUGIN_ROOT}/hooks/${1}" "${@:2}"
elif [ -n "${CODEX_PLUGIN_ROOT:-}" ]; then
    exec node "${CODEX_PLUGIN_ROOT}/hooks/${1}" "${@:2}"
fi

# Fallback: resolve from this script's own directory
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
exec node "${PLUGIN_ROOT}/hooks/${1}" "${@:2}"
