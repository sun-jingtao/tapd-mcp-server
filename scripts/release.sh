#!/usr/bin/env bash
set -euo pipefail

# 版本约定（避免被反复误报为「版本号与 CHANGELOG 不一致」）：
# package.json 始终停留在「上一个已发布版本」，CHANGELOG.md 顶部预写「下一版」条目。
# 本脚本读取 package.json 的当前版本、自增为 NEXT_VERSION，再校验 CHANGELOG 是否已有对应标题：
# 有则同步 package.json/server.json/manifest.json 到该版本后发布，无则插入占位条目。
# 因此发布前 package.json 落后 CHANGELOG 一个版本是预期状态，请勿手动 bump package.json
# 去「对齐」——那会让本脚本算出再下一个版本号，发错版本。
#
# 也可显式指定版本（用于 minor/major，如 `pnpm release 1.0.0`）：此时不做 patch 自增，
# 直接以传入版本为 NEXT_VERSION（须大于当前版本），其余流程一致，同样要求 CHANGELOG 顶部已写好该版本条目。
#
# 发版顺序约定（务必在 main 分支上执行本脚本）：
# 1) 功能改动先合 PR 到 main，期间 package.json 保持落后一版、CHANGELOG 顶部预写下一版条目；
# 2) 切到 main、git pull 后再跑 pnpm release。脚本会自增版本、bump 元数据、提交、打 tag、push HEAD 并建 GitHub Release，
#    tag/Release 须指向 main 才不悬空。
# 切勿在发版前手动提交版本元数据 bump：脚本靠「git diff --cached 是否有元数据改动」来决定是否打 tag，
# 若改动已被提前提交，脚本会判定无改动而跳过 tag 与 GitHub Release（1.0.2 即因此漏打 tag——npm 已发但 GitHub 无 Release）。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
BACKUP_DIR="$(mktemp -d)"
NPMRC_FILE="$(mktemp)"
RELEASE_SUCCEEDED=false
NPM_PUBLISHED=false
BACKUP_READY=false
METADATA_FILES=(
  "package.json"
  "server.json"
  "mcpb/manifest.json"
  "CHANGELOG.md"
)

cleanup() {
  rm -f "$ROOT_DIR/manifest.json" "$ROOT_DIR/.mcpbignore" "$NPMRC_FILE"
  rm -rf "$BACKUP_DIR"
}

rollback() {
  if [ "$RELEASE_SUCCEEDED" = false ] && [ "$NPM_PUBLISHED" = false ] && [ "$BACKUP_READY" = true ]; then
    echo "Release failed. Rolling back release metadata..."
    for file in "${METADATA_FILES[@]}"; do
      cp "$BACKUP_DIR/$file" "$ROOT_DIR/$file"
    done
  elif [ "$RELEASE_SUCCEEDED" = false ] && [ "$NPM_PUBLISHED" = true ]; then
    echo "Release failed after npm publish. Keeping release metadata for the published version." >&2
  fi
  cleanup
}

trap rollback EXIT

if [ "$#" -gt 1 ]; then
  echo "Usage: pnpm release [version]   (version 形如 1.0.0；省略则在当前版本上 patch +1)" >&2
  exit 1
fi
EXPLICIT_VERSION="${1:-}"

cd "$ROOT_DIR"

for file in "${METADATA_FILES[@]}"; do
  mkdir -p "$BACKUP_DIR/$(dirname "$file")"
  cp "$file" "$BACKUP_DIR/$file"
done
BACKUP_READY=true

PACKAGE_NAME="$(node -p "require('./package.json').name")"
CURRENT_VERSION="$(node -p "require('./package.json').version")"
NEXT_VERSION="$(EXPLICIT_VERSION="$EXPLICIT_VERSION" node <<'NODE'
const { version } = require('./package.json');
const explicit = process.env.EXPLICIT_VERSION || '';

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

const cur = parse(version);
if (!cur) {
  console.error(`Cannot parse current version: ${version}`);
  process.exit(1);
}

if (explicit) {
  // 显式指定目标版本（用于 minor/major，如 1.0.0），脚本不再做 patch 自增
  const next = parse(explicit);
  if (!next) {
    console.error(`Invalid version argument: ${explicit}（需形如 1.0.0）`);
    process.exit(1);
  }
  // 必须严格大于当前版本，避免回退或误发
  const greater =
    next[0] > cur[0] ||
    (next[0] === cur[0] && next[1] > cur[1]) ||
    (next[0] === cur[0] && next[1] === cur[1] && next[2] > cur[2]);
  if (!greater) {
    console.error(`目标版本 ${explicit} 必须大于当前版本 ${version}`);
    process.exit(1);
  }
  console.log(explicit);
} else {
  // 默认在当前版本上 patch +1
  console.log(`${cur[0]}.${cur[1]}.${cur[2] + 1}`);
}
NODE
)"

echo "Current version: $CURRENT_VERSION"
echo "Next version: $NEXT_VERSION"

if npm view "${PACKAGE_NAME}@${NEXT_VERSION}" version >/dev/null 2>&1; then
  echo "${PACKAGE_NAME}@${NEXT_VERSION} already exists on npm. Please update package.json first." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing .env.local. Please create it with NODE_AUTH_TOKEN=your_npm_token." >&2
  exit 1
fi

NODE_AUTH_TOKEN="$(
  awk -F= '
    /^[[:space:]]*NODE_AUTH_TOKEN[[:space:]]*=/ {
      value = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^["'\''"]|["'\''"]$/, "", value)
      print value
      exit
    }
  ' "$ENV_FILE"
)"

if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  echo "Missing NODE_AUTH_TOKEN in .env.local." >&2
  exit 1
fi

echo "Running tests before release (含覆盖率门禁；任一失败即中断发布，此时版本号与 changelog 尚未改动)..."
pnpm test:cov

echo "Syncing release metadata..."
node - "$NEXT_VERSION" <<'NODE'
const fs = require('node:fs');

const version = process.argv[2];

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

const packageJson = readJson('package.json');
const iconUrl = `https://unpkg.com/${packageJson.name}@${version}/icon.png`;
packageJson.version = version;
writeJson('package.json', packageJson);

const serverJson = readJson('server.json');
serverJson.version = version;
if (Array.isArray(serverJson.icons)) {
  for (const icon of serverJson.icons) {
    icon.src = iconUrl;
  }
}
if (Array.isArray(serverJson.packages)) {
  for (const packageInfo of serverJson.packages) {
    if (packageInfo.identifier === packageJson.name) {
      packageInfo.version = version;
    }
  }
}
writeJson('server.json', serverJson);

const manifestJson = readJson('mcpb/manifest.json');
manifestJson.version = version;
writeJson('mcpb/manifest.json', manifestJson);

// npm publish 会清洗 bin 路径（如 ./dist/index.js → dist/index.js），提前对齐避免发布警告
const { execSync } = require('node:child_process');
execSync('npm pkg fix', { stdio: 'inherit' });

const changelogPath = 'CHANGELOG.md';
const changelog = fs.readFileSync(changelogPath, 'utf8');
const releaseHeading = `## ${version}`;
// 按整行精确匹配，避免子串误判（includes 会让「## 0.1.14」被当成已含「## 0.1.1」）。
const headingExists = changelog.split('\n').some((line) => line.trim() === releaseHeading);
if (!headingExists) {
  const entry = [
    releaseHeading,
    '',
    '- 做了一些细微的优化。',
    '',
    '',
  ].join('\n');

  fs.writeFileSync(changelogPath, changelog.replace(/^# Changelog\s*\n/, `# Changelog\n\n${entry}`));
}
NODE

echo "Building package..."
pnpm build

echo "Previewing npm package contents..."
npm pack --dry-run

echo "Validating MCP Registry metadata..."
npx mcp-registry-validator validate server.json

echo "Validating MCPB manifest..."
# 读取 icon.png 尺寸用于强校验与下方良性提示过滤。sips 仅 macOS 提供：
# 取不到尺寸时跳过强校验（仅告警，不误杀发版），并保持 ICON_IS_512=false 不做过滤。
ICON_IS_512=false
if command -v sips >/dev/null 2>&1; then
  ICON_WIDTH="$(sips -g pixelWidth icon.png 2>/dev/null | awk '/pixelWidth:/ { print $2 }')"
  ICON_HEIGHT="$(sips -g pixelHeight icon.png 2>/dev/null | awk '/pixelHeight:/ { print $2 }')"
  if [ -n "${ICON_WIDTH:-}" ] && [ -n "${ICON_HEIGHT:-}" ]; then
    if [ "$ICON_WIDTH" != "512" ] || [ "$ICON_HEIGHT" != "512" ]; then
      echo "icon.png must be 512×512 for MCPB/Claude Desktop, got ${ICON_WIDTH}×${ICON_HEIGHT}." >&2
      exit 1
    fi
    ICON_IS_512=true
  else
    echo "WARN: 无法读取 icon.png 尺寸，跳过 512×512 强校验。"
  fi
else
  echo "WARN: 未找到 sips（非 macOS 环境），跳过 icon.png 512×512 强校验。"
fi
cp mcpb/manifest.json manifest.json
cp mcpb/.mcpbignore .mcpbignore
MCPB_VALIDATE_OUTPUT="$(npx @anthropic-ai/mcpb validate manifest.json 2>&1)" || {
  echo "$MCPB_VALIDATE_OUTPUT"
  exit 1
}
# 仅当 icon.png 已确认 512×512 时，过滤掉 MCPB 对任意合法 PNG 都打印的那条良性「passed」提示；
# 同一警告块内的其余行原样保留（若块内仅剩该提示则连标题一并去掉，避免悬空标题）。
# 尺寸未知时不过滤，避免误掩真实告警。
if [ "$ICON_IS_512" = true ]; then
  MCPB_VALIDATE_OUTPUT="$(printf '%s\n' "$MCPB_VALIDATE_OUTPUT" | awk '
    /^Icon validation warnings:$/ { inblock = 1; header = $0; nbuf = 0; next }
    inblock {
      if ($0 ~ /^$/) {
        if (nbuf > 0) { print header; for (i = 1; i <= nbuf; i++) print buf[i]; print "" }
        inblock = 0; next
      }
      if ($0 ~ /^  - Icon validation passed\. Recommended size is 512×512 pixels/) { next }
      buf[++nbuf] = $0; next
    }
    { print }
    END { if (inblock && nbuf > 0) { print header; for (i = 1; i <= nbuf; i++) print buf[i] } }
  ')"
fi
if [ -n "$(printf '%s' "$MCPB_VALIDATE_OUTPUT" | tr -d '[:space:]')" ]; then
  printf '%s\n' "$MCPB_VALIDATE_OUTPUT"
fi

printf '%s\n' "registry=https://registry.npmjs.org/" > "$NPMRC_FILE"
printf '%s\n' "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}" >> "$NPMRC_FILE"

# Unset pnpm-injected npm env vars that override --userconfig.
unset "${!npm_config_@}" 2>/dev/null || true

echo "Checking npm authentication..."
npm --userconfig "$NPMRC_FILE" whoami

echo "Publishing ${PACKAGE_NAME}@${NEXT_VERSION}..."
npm --userconfig "$NPMRC_FILE" publish --access public
NPM_PUBLISHED=true

if ! command -v mcp-publisher >/dev/null 2>&1; then
  echo "Missing mcp-publisher. Install it and run: mcp-publisher publish" >&2
  exit 1
fi

echo "Publishing MCP Registry metadata..."
mcp-publisher publish

RELEASE_SUCCEEDED=true
cleanup
trap - EXIT

# ── 打 tag 并创建 GitHub Release（附加步骤）──
# npm 与 MCP Registry 已发布成功，此处任一步失败都不影响发布结果，仅打印告警、提示手动补做。
RELEASE_TAG="v${NEXT_VERSION}"
echo "Tagging ${RELEASE_TAG} and creating GitHub Release..."

if command -v gh >/dev/null 2>&1; then
  # 提交本次发布的版本元数据，让 tag 指向「含新版本号」的提交；仅 add 发布元数据，不波及其他改动
  git add "${METADATA_FILES[@]}" >/dev/null 2>&1 || true
  if git diff --cached --quiet; then
    echo "WARN: 没有待提交的版本元数据改动，跳过 tag 与 GitHub Release（请确认元数据是否已被提交）。"
  elif ! git commit -m "chore: release ${RELEASE_TAG}"; then
    # commit 失败则不打 tag，避免 tag 指向「不含新版本号」的旧提交
    echo "WARN: 提交版本元数据失败，已跳过 tag 与 GitHub Release。请手动提交后执行：git tag -a ${RELEASE_TAG} -m ${RELEASE_TAG} && git push origin HEAD ${RELEASE_TAG} && gh release create ${RELEASE_TAG}。"
  else
    # 仅在 commit 成功后打 tag，确保 tag 指向含新版本号的提交
    git tag -a "${RELEASE_TAG}" -m "${RELEASE_TAG}" || echo "WARN: tag ${RELEASE_TAG} 可能已存在。"
    git push origin HEAD || echo "WARN: git push 失败，请手动推送当前分支。"
    git push origin "${RELEASE_TAG}" || echo "WARN: tag 推送失败，请手动 git push origin ${RELEASE_TAG}。"
    # 从 CHANGELOG 提取「## <版本>」到下一个「## 」之间的内容作为 release notes
    RELEASE_NOTES="$(awk -v ver="## ${NEXT_VERSION}" '
      { line = $0; gsub(/^[ \t]+|[ \t]+$/, "", line) }  # 去首尾空格，与插入判断的 trim 保持一致
      line == ver { flag = 1; next }
      /^## / && flag { exit }
      flag { print }
    ' CHANGELOG.md)"
    if [ -z "$(printf '%s' "${RELEASE_NOTES}" | tr -d '[:space:]')" ]; then
      RELEASE_NOTES="本版更新见 CHANGELOG.md。"
    fi
    printf '%s\n' "${RELEASE_NOTES}" | gh release create "${RELEASE_TAG}" --title "${RELEASE_TAG}" --notes-file - \
      || echo "WARN: GitHub Release 创建失败，请手动：gh release create ${RELEASE_TAG} --notes-file -（粘贴 CHANGELOG 对应段落）。"
  fi
else
  echo "WARN: 未找到 gh CLI，跳过 GitHub Release。安装后可手动：git tag -a ${RELEASE_TAG} -m ${RELEASE_TAG} && git push origin ${RELEASE_TAG} && gh release create ${RELEASE_TAG}。"
fi

echo "Release succeeded. Version is now $NEXT_VERSION."
