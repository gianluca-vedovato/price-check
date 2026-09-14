const WORKFLOW = 'price-worker.yml'

/** The browser worker is available when Netlify can start the GitHub workflow. */
export function browserWorkerEnabled(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO)
}

/**
 * Starts the browser worker. The workflow's concurrency group keeps at most one run
 * going and one queued, so calling this often is harmless.
 */
export async function dispatchBrowserWorker(): Promise<boolean> {
  const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH } = process.env
  if (!GITHUB_TOKEN || !GITHUB_REPO) return false
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({ ref: GITHUB_BRANCH || 'main' }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.error('worker dispatch failed', res.status, await res.text())
    return res.ok
  } catch (e) {
    console.error('worker dispatch failed', e)
    return false
  }
}
