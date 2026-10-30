import { zipSync, strToU8 } from 'fflate'
import { encodeText } from './xml.mjs'

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

export const DEFAULT_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`

/** 行内 markdown：**粗体** */
export function inlineRuns(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${encodeText(part.slice(2, -2))}</w:t></w:r>`
      }
      return `<w:r><w:t xml:space="preserve">${encodeText(part)}</w:t></w:r>`
    })
    .join('')
}

export function paragraphXml(text, { style, bold = false } = {}) {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''
  if (bold) {
    return `<w:p>${pPr}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${encodeText(text)}</w:t></w:r></w:p>`
  }
  return `<w:p>${pPr}${inlineRuns(text)}</w:p>`
}

export function tableXml(rows) {
  const trs = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map((cell) => `<w:tc><w:p>${inlineRuns(String(cell))}</w:p></w:tc>`)
          .join('')}</w:tr>`,
    )
    .join('')
  return `<w:tbl>${trs}</w:tbl>`
}

/** 生成最小可用 docx 字节 */
export function buildDocxBytes({ bodyXml, stylesXml = DEFAULT_STYLES }) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${bodyXml}<w:sectPr/></w:body>
</w:document>`

  return zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(ROOT_RELS),
      'word/_rels/document.xml.rels': strToU8(DOC_RELS),
      'word/document.xml': strToU8(documentXml),
      'word/styles.xml': strToU8(stylesXml),
    },
    { level: 6 },
  )
}
