#!/usr/bin/env bash
set -euo pipefail

BUMP=${1:-patch}

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "用法: $0 [patch|minor|major]"
  exit 1
fi

CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac

NEXT="${MAJOR}.${MINOR}.${PATCH}"

echo "版本升级：${CURRENT} → ${NEXT}"

# 更新 package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${NEXT}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# 更新 src-tauri/tauri.conf.json
node -e "
const fs = require('fs');
const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
conf.version = '${NEXT}';
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');
"

# 更新 src-tauri/Cargo.toml
sed -i '' "s/^version = \"${CURRENT}\"/version = \"${NEXT}\"/" src-tauri/Cargo.toml

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: 版本升级至 ${NEXT}"
git tag "v${NEXT}"

echo ""
echo "完成。执行以下命令触发发布："
echo "  git push && git push origin v${NEXT}"
