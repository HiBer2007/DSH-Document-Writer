import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readZip, readText, writeText, writeZip, listEntries } from '../src/core/zip.mjs'

test('zip 写入后能读回', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docwrite-zip-'))
  const file = join(dir, 'a.zip')
  try {
    const entries = {}
    writeText(entries, 'a.txt', '你好')
    writeText(entries, 'dir/b.txt', 'hello')
    writeZip(file, entries)

    const files = readZip(file)
    assert.deepEqual(listEntries(files), ['a.txt', 'dir/b.txt'])
    assert.equal(readText(files, 'a.txt'), '你好')
    assert.equal(readText(files, 'dir/b.txt'), 'hello')
    assert.equal(readText(files, 'missing.txt'), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
