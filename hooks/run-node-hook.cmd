: << 'CMDBLOCK'
@echo off
REM Cross-platform polyglot wrapper for Node.js hook scripts.
REM On Windows: cmd.exe runs the batch portion, which calls node.
REM On Unix: the shell interprets this as a script (: is a no-op in bash).
REM
REM Usage: run-node-hook.cmd <script-name> [args...]

if "%~1" == "" (
    echo run-node-hook.cmd: missing script name >&2
    exit /b 1
)

set "HOOK_DIR=%~dp0"
node "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%
CMDBLOCK

# Unix: run the named Node script directly
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"
shift
exec node "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
