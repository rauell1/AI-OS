import { prisma } from "@/lib/db";
import env, { githubConfigured } from "@/lib/env";

/**
 * GitHub integration: repository stats, recent commits, open issues.
 * Token source: GITHUB_TOKEN env, or a stored integration token. Read-only.
 * Any future write action requires an explicit approval flow (not implemented
 * by design in V1).
 */

function token(): string | null {
  return env.GITHUB_TOKEN || null;
}

export function githubEnabled(): boolean {
  return githubConfigured();
}

async function gh<T>(path: string): Promise<T> {
  const t = token();
  if (!t) throw new Error("GitHub token not configured (set GITHUB_TOKEN)");
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${t}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "rauell-os",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
  return (await res.json()) as T;
}

export type RepoSummary = {
  fullName: string;
  description?: string;
  language?: string;
  pushedAt?: string;
  openIssues?: number;
  lastCommitAt?: string;
  recentCommits: { sha: string; message: string; date: string; author?: string }[];
};

export async function fetchRepoSummary(fullName: string): Promise<RepoSummary> {
  const repo = await gh<{ full_name: string; description?: string; language?: string; pushed_at?: string; open_issues_count?: number }>(`/repos/${fullName}`);
  let lastCommitAt: string | undefined;
  let recentCommits: RepoSummary["recentCommits"] = [];
  try {
    const commits = await gh<{ sha: string; commit: { message: string; author?: { date?: string; name?: string } } }[]>(`/repos/${fullName}/commits?per_page=5`);
    recentCommits = commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      date: c.commit.author?.date ?? "",
      author: c.commit.author?.name,
    }));
    lastCommitAt = commits[0]?.commit.author?.date;
  } catch {
    // empty repo or restricted; non-fatal
  }
  return {
    fullName: repo.full_name,
    description: repo.description,
    language: repo.language,
    pushedAt: repo.pushed_at,
    openIssues: repo.open_issues_count,
    lastCommitAt,
    recentCommits,
  };
}

/** Sync one project's linked repositories. */
export async function syncProjectRepositories(userId: string, projectId: string): Promise<{ updated: number; errors: string[] }> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new Error("Project not found");
  const repos = await prisma.projectRepository.findMany({ where: { projectId } });
  const errors: string[] = [];
  let updated = 0;
  for (const repo of repos) {
    try {
      const summary = await fetchRepoSummary(repo.fullName);
      await prisma.projectRepository.update({
        where: { id: repo.id },
        data: {
          description: summary.description,
          language: summary.language,
          lastCommitAt: summary.lastCommitAt ? new Date(summary.lastCommitAt) : undefined,
          openIssues: summary.openIssues,
          lastSyncAt: new Date(),
        },
      });
      updated++;
    } catch (err) {
      errors.push(`${repo.fullName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const lastActivity = await prisma.projectRepository.findFirst({
    where: { projectId, lastCommitAt: { not: null } },
    orderBy: { lastCommitAt: "desc" },
  });
  if (lastActivity?.lastCommitAt) {
    await prisma.project.update({
      where: { id: projectId },
      data: { lastActivityAt: lastActivity.lastCommitAt },
    });
  }
  return { updated, errors };
}

export async function syncAllGitHub(userId: string): Promise<{ summary: string; updated: number; errors: string[] }> {
  if (!githubEnabled()) {
    return { summary: "GitHub not configured (set GITHUB_TOKEN). Nothing synced.", updated: 0, errors: [] };
  }
  const projects = await prisma.project.findMany({
    where: { userId, status: { in: ["ACTIVE", "PAUSED"] }, repositories: { some: {} } },
    include: { repositories: true },
  });
  let updated = 0;
  const errors: string[] = [];
  for (const p of projects) {
    const r = await syncProjectRepositories(userId, p.id);
    updated += r.updated;
    errors.push(...r.errors);
  }
  return {
    summary: `Synced ${updated} repositor(ies) across ${projects.length} project(s).${errors.length ? ` ${errors.length} error(s).` : ""}`,
    updated,
    errors,
  };
}

/** Link repositories by full name (e.g. rauell1/safaricharge) to a project. */
export async function linkRepositories(userId: string, projectId: string, fullNames: string[]): Promise<number> {
  let linked = 0;
  for (const fullName of fullNames) {
    const clean = fullName.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "");
    if (!/^[\w.\-]+\/[\w.\-]+$/.test(clean)) continue;
    await prisma.projectRepository.upsert({
      where: { projectId_fullName: { projectId, fullName: clean } },
      create: { projectId, fullName: clean, url: `https://github.com/${clean}` },
      update: {},
    });
    linked++;
  }
  return linked;
}
