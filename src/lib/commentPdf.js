export function parseCommentPages(selection, pageCount) {
  const pages = new Set()
  for (const token of selection.trim().split(',')) {
    const match = token.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/)
    const start = Number(match?.[1])
    const end = Number(match?.[2] ?? match?.[1])
    if (!match || start < 1 || end < start || end > pageCount) {
      throw new Error(`Enter page numbers from 1 to ${pageCount}, such as 1, 3–4.`)
    }
    for (let page = start; page <= end; page++) pages.add(page)
  }
  return [...pages].sort((a,b)=>a-b)
}

export async function withCommentPdf(file, read) {
  const [{ getDocument, GlobalWorkerOptions }, { default:workerUrl }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs?url'),
  ])
  GlobalWorkerOptions.workerSrc = workerUrl
  const task = getDocument({ data:await file.arrayBuffer(), isEvalSupported:false, useSystemFonts:false })
  try {
    return await read(await task.promise)
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('Choose an unlocked copy of this PDF.')
    throw error
  } finally {
    await task.destroy()
  }
}

export async function readCommentPages(pdf, pages) {
  const sections = []
  const emptyPages = []
  for (const number of pages) {
    const page = await pdf.getPage(number)
    const { items } = await page.getTextContent()
    const text = items.filter(item=>typeof item.str === 'string')
      .map(item=>item.str + (item.hasEOL ? '\n' : ' ')).join('').trim()
    if (text) sections.push(text)
    else emptyPages.push(number)
    page.cleanup()
  }
  if (!sections.length) throw new Error('No selectable text was found. For a scanned PDF, paste the comments manually.')
  return {text:sections.join('\n\n'), emptyPages}
}
