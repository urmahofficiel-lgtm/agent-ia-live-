// Lance le robot de rendu des vidéos animées (GitHub Actions) avec le jeton
// GITHUB_RENDU_TOKEN (limité au dépôt, permission Actions seulement).
export async function reveillerRobotRendu() {
  const jeton = process.env.GITHUB_RENDU_TOKEN;
  if (!jeton) return;
  const r = await fetch("https://api.github.com/repos/urmahofficiel-lgtm/agent-ia-live-/actions/workflows/rendu-video.yml/dispatches", {
    method: "POST",
    headers: { Authorization: `Bearer ${jeton}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
}
