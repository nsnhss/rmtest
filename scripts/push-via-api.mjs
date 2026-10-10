#!/usr/bin/env node
/**
 * push-via-api —— 网络被墙时的 GitHub 备用推送：完全不碰 git 协议，
 * 走 api.github.com 的 Git Data API 上传本地未推送的提交。
 *
 * 用法：
 *   GITHUB_TOKEN=ghp_xxx node scripts/push-via-api.mjs            # 实际推送
 *   GITHUB_TOKEN=ghp_xxx node scripts/push-via-api.mjs --dry-run  # 只列出将推送的文件
 *
 * Token 创建（一次性）：GitHub → Settings → Developer settings →
 * Personal access tokens → classic → 勾选 repo 权限。
 *
 * 前提：本地 `git` 可用（只读本地仓库状态，不访问网络）；api.github.com 可达。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
const DRY_RUN = process.argv.includes("--dry-run");

if (!TOKEN) {
  console.error("缺少 GITHUB_TOKEN 环境变量（GitHub → Settings → Developer settings → PAT → 勾选 repo）");
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
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

// ---- 解析远端 ----
const remoteUrl = git(["remote", "get-url", "origin"]);
const m = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
if (!m) {
  console.error(`无法从远端解析 owner/repo: ${remoteUrl}`);
  process.exit(1);
}
const [, owner, repo] = m;

// ---- 远端真实 HEAD（走 API，不经 git 网络）----
const remoteRef = await gh(`/repos/${owner}/${repo}/git/refs/heads/main`);
const remoteHead = remoteRef.object.sha;
const remoteCommit = await gh(`/repos/${owner}/${repo}/git/commits/${remoteHead}`);
const remoteTreeSha = remoteCommit.tree.sha;
console.log(`远端 main: ${remoteHead}`);

const localHead = git(["rev-parse", "HEAD"]);
if (localHead === remoteHead) {
  console.log("本地与远端一致，无需推送");
  process.exit(0);
}

// ---- 本地差异（remoteHead..HEAD）----
let changed;
try {
  changed = git(["diff", "--name-status", "-z", `${remoteHead}..HEAD`]).split("\0").filter(Boolean);
} catch {
  console.error(`本地仓库缺少远端提交 ${remoteHead} 的对象（远端可能被他人更新）。`);
  console.error("请先让仓库同步：在能连上的环境 git fetch origin 一次，或用网页上传。");
  process.exit(1);
}

const files = [];
for (let i = 0; i < changed.length; i += 2) files.push({ status: changed[i], name: changed[i + 1] });
console.log(`待推送文件 ${files.length} 个`);
for (const f of files) console.log(`  ${f.status}\t${f.name}`);

if (DRY_RUN) {
  console.log("[dry-run] 未做任何修改");
  process.exit(0);
}

// ---- 上传 blob / 构建 tree ----
const root = process.cwd();
const treeEntries = [];
for (const f of files) {
  if (f.status === "D") {
    treeEntries.push({ path: f.name, mode: "100644", type: "blob", sha: null });
    continue;
  }
  const full = path.join(root, f.name);
  const content = readFileSync(full).toString("base64");
  if (content.length > 100 * 1024 * 1024) {
    console.error(`文件超过 API blob 上限(100MB): ${f.name}`);
    process.exit(1);
  }
  const blob = await gh(`/repos/${owner}/${repo}/git/blobs`, { method: "POST" }, {
    content,
    encoding: "base64",
  });
  treeEntries.push({ path: f.name, mode: "100644", type: "blob", sha: blob.sha });
  console.log(`blob ${blob.sha.slice(0, 7)}  ${f.name}`);
}

const tree = await gh(`/repos/${owner}/${repo}/git/trees`, { method: "POST" }, {
  base_tree: remoteTreeSha,
  tree: treeEntries,
});

// 复用本地提交信息与作者
const message = git(["show", "-s", "--format=%B", localHead]).split(/\r?\n/).filter((l) => l.trim().length > 0).join("\n") || `push-via-api ${new Date().toISOString()}`;
const authorName = git(["show", "-s", "--format=%an", localHead]);
const authorEmail = git(["show", "-s", "--format=%ae", localHead]);

const commit = await gh(`/repos/${owner}/${repo}/git/commits`, { method: "POST" }, {
  message,
  tree: tree.sha,
  parents: [remoteHead],
  author: { name: authorName, email: authorEmail, date: new Date().toISOString() },
});

await gh(`/repos/${owner}/${repo}/git/refs/heads/main`, { method: "PATCH" }, {
  sha: commit.sha,
  force: false,
});

console.log(`已推送: ${commit.sha}`);
console.log(`https://github.com/${owner}/${repo}/commit/${commit.sha}`);
