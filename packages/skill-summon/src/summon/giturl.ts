/**
 * Port of `_parse_github_url` from gaia-skill-tree's `gaia_cli/install.py`
 * (the canonical `gaia install` implementation). Keep this in exact parity
 * with that function — see docs/SKILL-HELL.md "Install parity".
 */

export type ParsedGithubUrl = {
  repoUrl: string;
  branch: string | null;
  subpath: string;
};

// Patterns are start-anchored only (mirrors Python's re.match), not
// end-anchored — the trailing `(.*)` is greedy so it always consumes to the
// end of the (already trailing-slash-stripped) string anyway.
const BLOB_URL =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.*)/;
const TREE_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(.*)/;
const REPO_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)/;

/**
 * Parse a GitHub URL into { repoUrl, branch, subpath }.
 *
 * - blob/branch/path -> if path ends in `.md`, subpath is its dirname;
 *   otherwise the path is used verbatim.
 * - tree/branch[/path] -> subpath is the path verbatim (tree/ always points
 *   at a directory, never a dirname step).
 * - bare repo URL -> subpath is "".
 * - anything else -> passed through unchanged as { repoUrl: url, branch:
 *   null, subpath: "" }.
 */
export function parseGithubUrl(url: string): ParsedGithubUrl {
  // Stripped with a loop rather than `/\/+$/`: that regex backtracks
  // quadratically on a string of many `/` that does not end the match.
  let trimmed = url;
  while (trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);

  const blobMatch = BLOB_URL.exec(trimmed);
  if (blobMatch) {
    const [, owner, repo, branch, filePath] = blobMatch as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    const subpath = filePath.endsWith(".md") ? dirname(filePath) : filePath;
    return {
      repoUrl: `https://github.com/${owner}/${repo}.git`,
      branch,
      subpath,
    };
  }

  const treeMatch = TREE_URL.exec(trimmed);
  if (treeMatch) {
    const [, owner, repo, branch, rest] = treeMatch as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    return {
      repoUrl: `https://github.com/${owner}/${repo}.git`,
      branch,
      subpath: rest.replace(/^\/+/, ""),
    };
  }

  const repoMatch = REPO_URL.exec(trimmed);
  if (repoMatch) {
    const [, owner, repo] = repoMatch as unknown as [string, string, string];
    return {
      repoUrl: `https://github.com/${owner}/${repo}.git`,
      branch: null,
      subpath: "",
    };
  }

  return { repoUrl: trimmed, branch: null, subpath: "" };
}

function dirname(filePath: string): string {
  const index = filePath.lastIndexOf("/");
  return index === -1 ? "" : filePath.slice(0, index);
}
