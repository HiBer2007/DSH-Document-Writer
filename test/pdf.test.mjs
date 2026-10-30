import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportPdf, findSoffice } from '../src/core/pdf.mjs'

async function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'docwrite-pdf-'))
  try {
    return await fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('exportPdf：kit 后端写出文件', async () => {
  await withTemp(async (dir) => {
    const input = join(dir, 'a.docx')
    const output = join(dir, 'a.pdf')
    writeFileSync(input, 'fake-docx')

    const kitModule = {
      createConverter: async () => ({
        render: async ({ outputPath }) => writeFileSync(outputPath, '%PDF-1.4\n'),
        dispose: async () => {},
      }),
    }
    const result = await exportPdf(input, output, { backend: 'kit', kitModule })
    assert.equal(result.backend, 'kit')
    assert.ok(existsSync(output))
  })
})

test('exportPdf：没有可用后端 → exit 4', async () => {
  await withTemp(async (dir) => {
    const input = join(dir, 'a.docx')
    writeFileSync(input, 'fake-docx')
    await assert.rejects(
      () => exportPdf(input, join(dir, 'a.pdf'), { backend: 'kit', kitModule: null }),
      (err) => err.code === 4,
    )
  })
})

test('findSoffice：显式不存在的路径返回 null', () => {
  assert.equal(findSoffice('C:/definitely/not/here/soffice.exe'), null)
})
