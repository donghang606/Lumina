import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/**
 * 多格式文件 loader：统一转纯文本供向量化/检索。
 * 支持：PDF / Word(doc,docx) / Excel(xls,xlsx) / PPT(ppt,pptx) / EPUB / Markdown / 纯文本。
 * 全部依赖均可商用（Apache-2.0 / BSD-2 / MIT / ISC）。
 */

export const SUPPORTED_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'epub', 'md', 'markdown', 'txt', 'text'] as const

export function isSupportedFile(fileName: string): boolean {
  return (SUPPORTED_EXTS as readonly string[]).includes(path.extname(fileName).toLowerCase().slice(1))
}

async function loadPdf(filePath: string): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(await fsp.readFile(filePath)) })
  const result = await parser.getText()
  const text = result.text ?? ''
  await parser.destroy?.()
  return text
}

async function loadWord(filePath: string): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value ?? ''
}

async function loadOffice(filePath: string): Promise<string> {
  const { parseOffice } = await import('officeparser')
  const result = await parseOffice(filePath)
  return typeof result === 'string' ? result : JSON.stringify(result)
}

async function loadEpub(filePath: string): Promise<string> {
  const EPub = (await import('epub2')).default
  const epub = await EPub.createAsync(filePath)
  const parts: string[] = []
  for (const chapter of epub.flow ?? []) {
    const id = (chapter as { id?: string }).id
    if (!id) continue
    const html = epub.getChapter?.(id) ?? epub.getChapterRaw?.(id) ?? ''
    if (html) parts.push(String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  }
  return parts.filter(Boolean).join('\n\n')
}

function loadPlainText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

/** 提取文件文本（按扩展名分派）。失败抛错由调用方决定跳过/上报。 */
export async function extractFileText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase().slice(1)
  switch (ext) {
    case 'pdf':
      return await loadPdf(filePath)
    case 'doc':
    case 'docx':
      return await loadWord(filePath)
    case 'xls':
    case 'xlsx':
    case 'ppt':
    case 'pptx':
      return await loadOffice(filePath)
    case 'epub':
      return await loadEpub(filePath)
    case 'md':
    case 'markdown':
    case 'txt':
    case 'text':
      return loadPlainText(filePath)
    default:
      throw new Error(`不支持的文件类型: ${ext}`)
  }
}