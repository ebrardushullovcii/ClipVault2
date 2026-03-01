# Future Fixes Backlog

This document tracks follow-up fixes identified during a full code review.

Priority legend:
- P1: high-impact security/stability issues (address first)
- P2: correctness/reliability issues
- P3: hardening and maintenance follow-ups

## P1 - Security and Stability

- [ ] Harden `clipvault://` protocol path handling to block traversal
  - Files: `ui/src/main/main.ts:3838`, `ui/src/main/main.ts:3878`
  - Fix: normalize/resolve path and enforce root-bound checks before serving files.

- [ ] Validate and sanitize `clipId` for filesystem IPC handlers
  - Files: `ui/src/main/main.ts:1571`, `ui/src/main/main.ts:1600`, `ui/src/main/main.ts:1628`, `ui/src/main/main.ts:1674`
  - Fix: enforce strict allowlist for IDs and safe-join checks for all read/write/delete operations.

- [ ] Constrain export filenames to `exported-clips` only
  - Files: `ui/src/main/main.ts:3468`, `ui/src/main/main.ts:3511`
  - Fix: reject path separators and validate resolved output path is inside export root.

- [ ] Re-enable Electron web hardening defaults
  - Files: `ui/src/main/main.ts:539`, `ui/src/main/main.ts:653`
  - Fix: remove `bypassCSP: true` and avoid `webSecurity: false` unless absolutely required.

- [ ] Remove `eval` usage for FPS parsing
  - File: `ui/src/main/main.ts:1896`
  - Fix: parse rational strings (for example `30000/1001`) with explicit numeric validation.

- [ ] Fix OBS settings double-release in capture fallback path
  - File: `src/capture.cpp:108`
  - Fix: ensure each `obs_data_t*` allocation is released exactly once.

## P2 - Correctness and Reliability

- [ ] Add URL allowlist for `openExternal`
  - File: `ui/src/main/main.ts:2940`
  - Fix: permit only safe schemes/domains (for example `https`) and reject others.

- [ ] Fix navigation history branch behavior
  - File: `ui/src/renderer/App.tsx:90`
  - Fix: when adding a new history entry after going back, truncate forward history correctly.

- [ ] Make replay state flags thread-safe
  - Files: `src/replay.h:67`, `src/replay.cpp:390`, `src/replay.cpp:676`
  - Fix: use atomics or a mutex for `active_` and `save_pending_` access.

## P3 - Hardening Follow-ups

- [ ] Introduce shared safe path utility in Electron main process
  - Scope: all file-path IPC/protocol entry points.

- [ ] Add regression tests for path traversal rejection
  - Scope: `clips:*`, `editor:*`, export output path validation, `clipvault://` protocol mapping.

- [ ] Add Electron security baseline checks in CI
  - Scope: secure defaults for CSP, protocol privileges, and renderer isolation settings.
