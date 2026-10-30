import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { previewStatus, startPreview, stopPreview } from '../src/core/preview.mjs'

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

test('preview：启动、状态、重复启动被拒、停止', async () => {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-preview-'))
  const projectDir = join(root, 'p')
  mkdirSync(join(projectDir, '.run'), { recursive: true })

  const port = await freePort()
  const script = `require('http').createServer((req,res)=>res.end('ok')).listen(${port},'127.0.0.1')`

  const info = await startPreview(projectDir, {
    command: process.execPath,
    args: ['-e', script],
    port,
    timeoutMs: 15000,
  })

  try {
    assert.equal(info.port, port)
    assert.match(info.url, /^http:\/\/127\.0\.0\.1:\d+$/)
    assert.equal(previewStatus(projectDir).running, true)

    await assert.rejects(
      () =>
        startPreview(projectDir, {
          command: process.execPath,
          args: ['-e', script],
          port,
          timeoutMs: 5000,
        }),
      (err) => err.code === 3,
    )
  } finally {
    const stopped = stopPreview(projectDir)
    assert.equal(stopped.stopped, true)
  }

  assert.equal(previewStatus(projectDir).running, false)
  rmSync(root, { recursive: true, force: true })
})
