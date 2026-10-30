import { readFileSync, writeFileSync } from 'node:fs'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { CliError, EXIT } from './errors.mjs'

/** 读取 zip/docx，返回 { 路径: Uint8Array } */
export function readZip(filePath) {
  let buf
  try {
    buf = readFileSync(filePath)
  } catch (err) {
    throw new CliError(`读不到文件：${filePath}（${err.code ?? err.message}）`, EXIT.IO)
  }
  try {
    return unzipSync(new Uint8Array(buf))
  } catch {
    throw new CliError(`不是有效的 zip/docx：${filePath}`, EXIT.IO)
  }
}

/** 写出 zip/docx */
export function writeZip(filePath, entries) {
  const data = zipSync(entries, { level: 6 })
  writeFileSync(filePath, data)
}

/** 读 zip 内文本条目，不存在返回 null */
export function readText(files, name) {
  const entry = files[name]
  return entry ? strFromU8(entry) : null
}

/** 写文本条目 */
export function writeText(files, name, text) {
  files[name] = strToU8(text)
}

/** 列出 zip 内所有条目名 */
export function listEntries(files) {
  return Object.keys(files).sort()
}
