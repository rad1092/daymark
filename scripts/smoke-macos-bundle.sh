#!/usr/bin/env bash

set -euo pipefail

app_binary="${1:-src-tauri/target/release/bundle/macos/Daymark.app/Contents/MacOS/daymark}"
smoke_directory="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
smoke_log="${smoke_directory%/}/daymark-bundle-smoke.log"

if [[ ! -x "${app_binary}" ]]; then
  echo "Daymark bundle executable is missing: ${app_binary}" >&2
  exit 1
fi

: >"${smoke_log}"
"${app_binary}" >"${smoke_log}" 2>&1 &
app_pid=$!

cleanup() {
  if kill -0 "${app_pid}" 2>/dev/null; then
    kill "${app_pid}" 2>/dev/null || true
    wait "${app_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

sleep 3

if ! kill -0 "${app_pid}" 2>/dev/null; then
  echo "Daymark exited during startup." >&2
  sed -n '1,160p' "${smoke_log}" >&2
  exit 1
fi

if grep -Eiq 'panic|PluginInitialization|failed to start' "${smoke_log}"; then
  echo "Daymark reported a startup failure." >&2
  sed -n '1,160p' "${smoke_log}" >&2
  exit 1
fi

echo "Daymark bundle stayed running without startup errors."
