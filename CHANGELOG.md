# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-03-09

### Added

- First-run setup wizard for new installs.
- Bulk clip operations for selecting and managing multiple clips.
- Game detection and tagging for saved clips.
- Audio source selection and clip save sound feedback.

### Fixed

- Library/editor navigation regressions, including stale history state and settings-overlay back/forward behavior.
- Thumbnail generation and audio extraction validation for existing clips and clip IDs.
- Replay buffer lifecycle and save-state races during stop, shutdown, and repeated save requests.
- Export dropdown, first-run folder picker, and window-state persistence issues.

### Changed

- Packaging guidance now clearly distinguishes installer, portable, and unpacked smoke-test builds.
- Repo tooling, release templates, GPL/license packaging, and troubleshooting docs were cleaned up and aligned.
