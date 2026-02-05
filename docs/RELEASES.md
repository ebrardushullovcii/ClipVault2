# Release Management

This document outlines how releases are managed for ClipVault.

## Versioning

We use [Semantic Versioning](https://semver.org/):
- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes

## Release Process

When creating a new release, agents should follow these steps:

### 1. Update Version

- Update version in `ui/package.json`
- Update version in root `package.json`

### 2. Update Changelog

- Add new version section to `CHANGELOG.md`
- Document changes (features, fixes, breaking changes)

### 3. Build Release

```powershell
npm install

# Build installer
npm run package:win

# Optional: build portable executable
npm run package:portable
```

### 4. Create Git Tag

```powershell
git add .
git commit -m "chore: bump version to X.Y.Z"
git push origin your-branch

# After merge to the default branch
git tag vX.Y.Z
git push origin vX.Y.Z
```

### 5. Create GitHub Release

Use the GitHub CLI to create the release and upload artifacts in one command:

```powershell
gh release create vX.Y.Z --title "ClipVault X.Y.Z" --notes-file CHANGELOG.md ./ui/release/*.exe
```

This creates the release and uploads the installer files automatically. No need to use the GitHub website.

**Files uploaded:**
- `ClipVault-Setup-X.Y.Z.exe`
- Optional: upload `ui\release\ClipVault-Portable.exe` for a portable download

## Automatic Upload (Future)

For automatic artifact upload, consider setting up GitHub Actions:
- Build on Windows runner
- Auto-attach artifacts to releases
- Generate release notes from CHANGELOG

This is not currently configured but would eliminate manual upload steps.
