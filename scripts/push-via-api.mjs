#!/usr/bin/env node
/**
 * push-via-api —— 网络被墙时的 GitHub 备用推送：完全不碰 git 协议，
 * 走 api.github.com 的 Git Data API 逐提交重放本地未推送的提交。
 *
 * 用法：
 *   GITHUB_TOKEN=xxx node scripts/push-via-api.mjs            # 实际推送
 *   GITHUB_TOKEN=xxx node scripts/push-via-api.mjs --dry-run  # 只列出将推送的提交与文件
 *
 * Token 创建（一次性）：GitHub → Settings → Developer settings → Personal access tokens。
 *   - 细粒度（推荐）：Repository access 选本仓库；Permissions 里
 *     **Contents: Read and write**（必需）+ **Workflows: Read and write**
 *     （本仓库会改 .github/workflows/**，缺该项在创建 tree 时 403）
 *   - classic：同时勾 **repo** 与 **workflow**
 *
 * 前提：本地 `git` 可用（只读本地仓库状态，不访问网络）；api.github.com 可达。
 *
 * 设计要点：
 *   - 逐提交重放：远端历史与本地一一对应（不会把 N 个提交压成 1 个）。
 *   - 差异基线不要求"远端提交对象在本地存在"：对象缺失时按 tree 相同反查本地提交。
 *   - 已知限制：GitHub 会把提交时间统一成 UTC（本地 +08:00 → 远端 Z），而 Git 提交对象
 *     包含时区 offset，故**非 UTC 时区提交的 SHA 无法与本地一致**。内容（tree）、父提交、
 *     提交信息完全一致；脚本据此按 tree 反查基线，因此连续推送不受影响。
 *     注意：本地 `git log origin/main..HEAD` 会一直显示"未推送"（跟踪引用指向旧 SHA），
 *     判断是否已同步以 `--dry-run` 的输出为准。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
const DRY_RUN = process.argv.includes("--dry-run");

if (!TOKEN) {
  console.error("缺少 GITHUB_TOKEN 环境变量（GitHub → Settings → Developer settings → PAT）");
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function gitMaybe(args) {
  try {
    // 探测型调用：失败是预期分支，stderr 不该污染输出
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function gh(pathname, opts = {}, body) {
  return fetch(`https://api.github.com${pathname}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (res) => {
    const text = await res.text();
    if (!res.ok) throw new Error(`API ${opts.method ?? "GET"} ${pathname} → ${res.status}: ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : null;
  });
}

/** GET，404/403 返回 null（用于"远端是否存在该对象"的探测） */
async function ghExists(pathname) {
  try {
    await gh(pathname);
    return true;
  } catch {
    return false;
  }
}

/** 字节级复刻一个本地提交的 message/author/committer */
function commitMeta(sha) {
  return {
    message: git(["show", "-s", "--format=%B", sha])
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .join("\n"),
    author: {
      name: git(["show", "-s", "--format=%an", sha]),
      email: git(["show", "-s", "--format=%ae", sha]),
      date: git(["show", "-s", "--format=%aI", sha]),
    },
    committer: {
      name: git(["show", "-s", "--format=%cn", sha]),
      email: git(["show", "-s", "--format=%ce", sha]),
      date: git(["show", "-s", "--format=%cI", sha]),
    },
  };
}

/** 本地提交的父提交 SHAs */
function parentsOf(sha) {
  return git(["rev-list", "--parents", "-n", "1", sha]).split(/\s+/).slice(1);
}

function syncLocalRef(sha) {
  if (gitMaybe(["cat-file", "-e", `${sha}^{commit}`]) !== null) {
    git(["update-ref", "refs/remotes/origin/main", sha]);
    console.log(`已同步本地 origin/main → ${sha.slice(0, 7)}`);
    return true;
  }
  console.log("提示：远端提交对象本地不可见（由 API 重建），origin/main 跟踪引用未更新；");
  console.log("      下次推送会按 tree 自动反查基线，无需手工处理。");
  return false;
}

// ---- 解析远端 ----
const remoteUrl = git(["remote", "get-url", "origin"]);
const m = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
if (!m) {
  console.error(`无法从远端解析 owner/repo: ${remoteUrl}`);
  process.exit(1);
}
const [, owner, repo] = m;

const remoteRef = await gh(`/repos/${owner}/${repo}/git/refs/heads/main`);
const remoteHead = remoteRef.object.sha;
const remoteTreeSha = (await gh(`/repos/${owner}/${repo}/git/commits/${remoteHead}`)).tree.sha;
console.log(`远端 main: ${remoteHead}`);

const localHead = git(["rev-parse", "HEAD"]);
if (localHead === remoteHead) {
  console.log("本地与远端一致，无需推送");
  process.exit(0);
}

// ---- 差异基线：必须是本地可解析的提交 ----
// 远端提交对象可能在本地缺失（由 API 推送产生），此时按 tree 相同反查本地提交。
function resolveBase() {
  if (gitMaybe(["cat-file", "-e", `${remoteHead}^{commit}`]) !== null) return remoteHead;
  for (const line of git(["rev-list", "--all", "--format=%H %T"]).split("\n")) {
    const [sha, tree] = line.trim().split(/\s+/);
    if (sha && tree === remoteTreeSha) return sha;
  }
  return null;
}

const base = resolveBase();
if (base === null) {
  console.error(`本地缺少远端提交 ${remoteHead}，且没有 tree 匹配的本地提交。`);
  console.error("请在能连上网络的环境执行 git fetch origin 后再推，或用网页上传。");
  process.exit(1);
}
if (base !== remoteHead) console.log(`基线（按 tree 反查本地提交）: ${base}`);

// ---- 内容已同步、仅提交 SHA 不同 ----
// 用本地 HEAD 的元数据与其真实父提交在远端重建该提交：SHA 与本地一致，从而实现指针对齐。
if (base === localHead) {
  if (DRY_RUN) {
    console.log("[dry-run] 内容与远端一致，仅提交 SHA 不同：将在远端重建本地 HEAD 并强推指针");
    process.exit(0);
  }
  const localParents = parentsOf(localHead);
  const allParentsExist = (await Promise.all(localParents.map((p) => ghExists(`/repos/${owner}/${repo}/git/commits/${p}`)))).every(Boolean);
  const parents = allParentsExist && localParents.length > 0 ? localParents : [remoteHead];
  const meta = commitMeta(localHead);
  const commit = await gh(`/repos/${owner}/${repo}/git/commits`, { method: "POST" }, {
    message: meta.message,
    tree: remoteTreeSha,
    parents,
    author: meta.author,
    committer: meta.committer,
  });
  await gh(`/repos/${owner}/${repo}/git/refs/heads/main`, { method: "PATCH" }, { sha: commit.sha, force: true });
  console.log(
    commit.sha === localHead
      ? `已在远端重建本地 HEAD（SHA 一致）：${commit.sha.slice(0, 7)}`
      : `已在远端重建等价提交：${commit.sha.slice(0, 7)}（SHA 与本地 ${localHead.slice(0, 7)} 不同）`,
  );
  syncLocalRef(commit.sha);
  console.log(`https://github.com/${owner}/${repo}/commit/${commit.sha}`);
  process.exit(0);
}

// ---- 逐个未推送提交重放 ----
const commits = git(["rev-list", "--reverse", `${base}..${localHead}`]).split("\n").filter(Boolean);
console.log(`待推送 ${commits.length} 个提交:`);
for (const c of commits) console.log(`  ${c.slice(0, 7)}  ${git(["show", "-s", "--format=%s", c])}`);

const root = process.cwd();
const plan = [];
for (const c of commits) {
  const changed = git(["diff", "--name-status", "-z", `${c}^`, c]).split("\0").filter(Boolean);
  const files = [];
  for (let i = 0; i < changed.length; i += 2) files.push({ status: changed[i], name: changed[i + 1] });
  plan.push({ commit: c, files });
}

if (DRY_RUN) {
  for (const p of plan) {
    console.log(`\n${p.commit.slice(0, 7)}  ${git(["show", "-s", "--format=%s", p.commit])}`);
    for (const f of p.files) console.log(`  ${f.status}\t${f.name}`);
  }
  console.log("\n[dry-run] 未做任何修改");
  process.exit(0);
}

let parentSha = remoteHead;
let parentTree = remoteTreeSha;
let created = 0;

for (const p of plan) {
  const treeEntries = [];
  for (const f of p.files) {
    if (f.status === "D") {
      treeEntries.push({ path: f.name, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const content = readFileSync(path.join(root, f.name)).toString("base64");
    if (content.length > 100 * 1024 * 1024) {
      console.error(`文件超过 API blob 上限(100MB): ${f.name}`);
      process.exit(1);
    }
    const blob = await gh(`/repos/${owner}/${repo}/git/blobs`, { method: "POST" }, { content, encoding: "base64" });
    treeEntries.push({ path: f.name, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await gh(`/repos/${owner}/${repo}/git/trees`, { method: "POST" }, {
    base_tree: parentTree,
    tree: treeEntries,
  });

  // 父提交取自本地（存在时）→ SHA 与本地提交相同；否则挂到远端 HEAD 之后
  const localParents = parentsOf(p.commit);
  const parents = localParents.length > 0 && localParents[0] === parentSha ? localParents : [parentSha];
  const meta = commitMeta(p.commit);

  const commit = await gh(`/repos/${owner}/${repo}/git/commits`, { method: "POST" }, {
    message: meta.message,
    tree: tree.sha,
    parents,
    author: meta.author,
    committer: meta.committer,
  });

  const note = commit.sha === p.commit ? "（SHA 与本地一致）" : `（远端 SHA ${commit.sha.slice(0, 7)}，与本地不同）`;
  console.log(`  已重放 ${p.commit.slice(0, 7)} → ${commit.sha.slice(0, 7)} ${note}`);
  parentSha = commit.sha;
  parentTree = tree.sha;
  created++;
}

await gh(`/repos/${owner}/${repo}/git/refs/heads/main`, { method: "PATCH" }, { sha: parentSha, force: false });
syncLocalRef(parentSha);
console.log(`已推送 ${created} 个提交，远端 main → ${parentSha}`);
console.log(`https://github.com/${owner}/${repo}/commit/${parentSha}`);
