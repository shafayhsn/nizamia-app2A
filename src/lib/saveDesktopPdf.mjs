export async function saveDesktopPdf(html, filename) {
  const response = await fetch('/api/offline/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: html.replace(/^<!doctype html>\s*/i, ''), filename })
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Could not save PDF')
  return result
}
