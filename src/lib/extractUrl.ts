/** Finds the first http(s) link in whatever a share sheet or clipboard hands us. */
export function extractUrl(...inputs: (string | null | undefined)[]): string | undefined {
  for (const input of inputs) {
    const match = input?.match(/https?:\/\/[^\s<>"']+/i)
    if (match) return match[0].replace(/[),.;!?]+$/, '')
  }
  return undefined
}
