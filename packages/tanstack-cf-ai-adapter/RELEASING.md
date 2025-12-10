# Release Guide

This document describes the release process for `@harshil1712/tanstack-cf-ai-adapter`.

## Overview

This project uses:
- **Changesets** for version management
- **GitHub Actions** for automated publishing
- **Trusted Publishers** for secure npm authentication (no tokens needed!)
- **Pre-release mode** for alpha/beta versions

## Branch Strategy

- `main` - Stable releases (e.g., `0.1.0`, `0.2.0`)
- `alpha` - Alpha pre-releases (e.g., `0.1.0-alpha.0`, `0.1.0-alpha.1`)
- `beta` - Beta pre-releases (if needed)
- `rc` - Release candidates (if needed)

## Alpha Releases (Pre-release)

Alpha releases are published from the `alpha` branch for testing and early adopters.

### Step 1: Make Changes

On the `alpha` branch, make your code changes:

```bash
git checkout alpha
git pull origin alpha

# Make your code changes
# Edit files, add features, fix bugs, etc.
```

### Step 2: Create a Changeset

After making changes, create a changeset to describe what changed:

```bash
npx changeset
```

This will prompt you for:
1. **Which packages changed?** - Select `@harshil1712/tanstack-cf-ai-adapter`
2. **What type of change?**
   - `patch` - Bug fixes (0.0.1-alpha.0 → 0.0.1-alpha.1)
   - `minor` - New features (0.0.1-alpha.0 → 0.1.0-alpha.0)
   - `major` - Breaking changes (0.0.1-alpha.0 → 1.0.0-alpha.0)
3. **Summary** - Describe the change

This creates a `.changeset/[random-id].md` file.

### Step 3: Commit and Push Changeset

```bash
git add .
git commit -m "feat: describe your changes"
git push origin alpha
```

### Step 4: GitHub Actions Automation

When you push to `alpha`, GitHub Actions automatically:

1. **Detects changesets** in the `.changeset/` directory
2. **Creates a PR** titled "Version Packages"
   - Updates `package.json` version (e.g., `0.0.1-alpha.1`)
   - Updates `CHANGELOG.md`
   - Consumes (deletes) the changeset files
3. **Waits for you** to review and merge the PR

### Step 5: Merge the Version PR

Review the "Version Packages" PR:
- Check the version numbers are correct
- Review the changelog entries
- Merge the PR

### Step 6: Automatic Publishing

After merging, GitHub Actions automatically:
1. **Builds** the package
2. **Publishes** to npm with `alpha` dist-tag
3. **Uses Trusted Publishers** (OIDC authentication - no tokens!)

### Step 7: Verify Publication

Check that your package is published:

```bash
npm view @harshil1712/tanstack-cf-ai-adapter dist-tags
```

Should show:
```
{ alpha: '0.0.1-alpha.1', latest: '0.0.1' }
```

Users can install with:
```bash
npm install @harshil1712/tanstack-cf-ai-adapter@alpha
```

---

## Stable Releases

Stable releases are published from the `main` branch.

### Step 1: Exit Pre-release Mode on Alpha

When you're ready to promote alpha changes to stable:

```bash
git checkout alpha
git pull origin alpha

# Exit pre-release mode
npx changeset pre exit
```

This removes `.changeset/pre.json` and prepares for stable versioning.

### Step 2: Version for Stable

```bash
npm run changeset:version
```

This:
- Updates version to stable (e.g., `0.0.1-alpha.5` → `0.0.1`)
- Updates CHANGELOG.md
- Consumes remaining changesets

### Step 3: Create Merge PR to Main

```bash
git add .
git commit -m "chore: prepare stable release v0.0.1"
git push origin alpha

# Create a PR from alpha → main
```

Review the PR:
- Verify version numbers
- Review all changes since last stable release
- Ensure all tests pass

### Step 4: Merge to Main

Merge the PR to `main`. GitHub Actions automatically:
1. **Detects** the merge to main
2. **Builds** the package
3. **Publishes** with `latest` dist-tag
4. **Tags** the release on GitHub

### Step 5: Re-enter Pre-release Mode

After stable release, re-enter pre-release mode on alpha:

```bash
git checkout alpha
git pull origin alpha

npx changeset pre enter alpha

git add .changeset/pre.json
git commit -m "chore: re-enter alpha pre-release mode"
git push origin alpha
```

Now future changes on `alpha` will be versioned as `0.0.2-alpha.0`, etc.

---

## Manual Publishing (Emergency)

If GitHub Actions fails or you need to publish manually:

### For Alpha:

```bash
git checkout alpha

# Build
npm run build

# Publish with alpha tag and public access
npm publish --tag alpha --access public

# Tag in git
git tag v0.0.1-alpha.X
git push origin v0.0.1-alpha.X
```

### For Stable:

```bash
git checkout main

# Build
npm run build

# Publish (becomes latest)
npm publish --access public

# Tag in git
git tag v0.0.1
git push origin v0.0.1
```

**Note:** Manual publishing won't include npm provenance. Consider this only for emergencies.

---

## Changeset Commands Reference

```bash
# Create a new changeset
npx changeset

# Or use the script
npm run changeset

# Version packages (manual - usually done by CI)
npm run changeset:version

# Publish (manual - usually done by CI)
npm run changeset:publish

# Enter pre-release mode
npx changeset pre enter alpha

# Exit pre-release mode
npx changeset pre exit

# Check status
npx changeset status
```

---

## GitHub Actions Workflows

### Release Workflow (`.github/workflows/release.yml`)

**Triggers on push to:**
- `main` - Stable releases
- `alpha` - Alpha releases
- `beta` - Beta releases (if configured)
- `rc` - Release candidates (if configured)

**Actions:**
1. Checks out repository
2. Sets up Node.js 20
3. Installs dependencies
4. Builds package
5. Runs `changesets/action@v1`:
   - If changesets exist → Creates "Version Packages" PR
   - If no changesets exist → Publishes to npm

**Authentication:**
- Uses Trusted Publishers (OIDC)
- No NPM_TOKEN secret required
- Includes npm provenance for supply chain security

### CI Workflow (`.github/workflows/ci.yml`)

**Triggers on:**
- Pull requests
- Pushes to `main`

**Actions:**
1. Installs dependencies
2. Builds package
3. Runs TypeScript type checking

---

## npm Dist Tags

- `latest` - Current stable version (from `main` branch)
- `alpha` - Current alpha version (from `alpha` branch)
- `beta` - Current beta version (from `beta` branch, if used)
- `rc` - Current release candidate (from `rc` branch, if used)

Users can install specific tags:
```bash
npm install @harshil1712/tanstack-cf-ai-adapter@latest   # Stable
npm install @harshil1712/tanstack-cf-ai-adapter@alpha    # Alpha
npm install @harshil1712/tanstack-cf-ai-adapter@0.0.1-alpha.5  # Specific version
```

---

## Trusted Publishers Configuration

**Location:** https://www.npmjs.com/package/@harshil1712/tanstack-cf-ai-adapter/access

**Current configuration:**
- Repository: `harshil1712/tanstack-cf-ai-adapter`
- Workflow: `release.yml`
- Uses OIDC (OpenID Connect) for authentication
- No long-lived tokens stored in GitHub

**Benefits:**
- ✅ More secure (no token secrets)
- ✅ Automatic rotation
- ✅ Granular permissions
- ✅ Includes npm provenance

---

## Troubleshooting

### "Version Packages" PR Not Created

**Possible causes:**
1. No changesets in `.changeset/` directory
   - **Solution:** Create a changeset with `npx changeset`

2. Workflow didn't trigger
   - **Solution:** Check GitHub Actions tab for errors

3. No changes detected
   - **Solution:** Ensure you pushed the changeset files

### Publishing Fails

**Check:**
1. Trusted Publishers is configured correctly on npm
2. Workflow has correct permissions (`id-token: write`)
3. Package name matches in Trusted Publishers config
4. Build succeeds (`npm run build`)

**View logs:**
- GitHub Actions: https://github.com/harshil1712/tanstack-cf-ai-adapter/actions

### Wrong Version Published

**For alpha:**
- Ensure you're in pre-release mode (`.changeset/pre.json` exists)
- Check the changeset type (patch/minor/major)

**For stable:**
- Ensure you exited pre-release mode (`npx changeset pre exit`)

### Manual Fix Required

If automation fails completely:
1. Manually version with `npm run changeset:version`
2. Commit changes
3. Manually publish with `npm publish --tag alpha --access public`
4. Tag release: `git tag v0.0.1-alpha.X && git push origin v0.0.1-alpha.X`

---

## Quick Reference

### Publish New Alpha

```bash
git checkout alpha
# Make changes
npx changeset       # Create changeset
git add .
git commit -m "feat: description"
git push origin alpha
# Wait for "Version Packages" PR
# Merge PR → Auto-publishes
```

### Promote Alpha to Stable

```bash
git checkout alpha
npx changeset pre exit
npm run changeset:version
git add .
git commit -m "chore: prepare stable release"
# Create PR: alpha → main
# Merge PR → Auto-publishes
# Re-enter pre-release mode on alpha
```

### Emergency Manual Publish

```bash
npm run build
npm publish --tag alpha --access public
git tag v0.0.1-alpha.X
git push origin v0.0.1-alpha.X
```

---

## Additional Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Changesets GitHub Action](https://github.com/changesets/action)
- [npm Trusted Publishers](https://docs.npmjs.com/generating-provenance-statements)
- [Semantic Versioning](https://semver.org/)
