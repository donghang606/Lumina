import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { extractFileText, isSupportedFile, SUPPORTED_EXTS } from './fileLoaders.js'

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-loaders-'))

beforeAll(() => {
  fs.writeFileSync(path.join(fixtureDir, 'sample.md'), '# 标题\n\n正文内容测试，包含关键词向量检索。\n\n- 列表项一\n- 列表项二\n', 'utf-8')
  fs.writeFileSync(path.join(fixtureDir, 'sample.txt'), 'plain text line1\nplain text line2\n', 'utf-8')
  fs.writeFileSync(
    path.join(fixtureDir, 'hello.pdf'),
    Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
        '4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 10 50 Td (HelloPDF) Tj ET\nendstream endobj\n' +
        '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
      'binary',
    ),
  )
})

import { beforeAll } from 'vitest'

describe('fileLoaders', () => {
  it('isSupportedFile 按扩展名判断', () => {
    expect(isSupportedFile('a.PDF')).toBe(true)
    expect(isSupportedFile('b.docx')).toBe(true)
    expect(isSupportedFile('c.epub')).toBe(true)
    expect(isSupportedFile('d.exe')).toBe(false)
    expect(isSupportedFile('e')).toBe(false)
    expect(SUPPORTED_EXTS).toContain('epub')
  })

  it('Markdown / 纯文本读取', async () => {
    const md = await extractFileText(path.join(fixtureDir, 'sample.md'))
    expect(md).toContain('正文内容测试')
    const txt = await extractFileText(path.join(fixtureDir, 'sample.txt'))
    expect(txt).toContain('plain text line2')
  })

  it('PDF 提取文本（真实 pdf-parse 解析）', async () => {
    const pdf = await extractFileText(path.join(fixtureDir, 'hello.pdf'))
    expect(pdf).toContain('HelloPDF')
  })

  it('不支持的扩展名抛错', async () => {
    const unsupported = path.join(fixtureDir, 'x.unknown')
    fs.writeFileSync(unsupported, 'data')
    await expect(extractFileText(unsupported)).rejects.toThrow('不支持的文件类型')
  })
})