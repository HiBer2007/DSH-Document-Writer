import { zipSync, strToU8 } from 'fflate'

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>`

const PRESENTATION = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst/>
</p:presentation>`

function escapeXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function paragraphs(text) {
  return String(text)
    .split('\n')
    .map(
      (line) =>
        `<a:p><a:r><a:t xml:space="preserve">${escapeXml(line)}</a:t></a:r></a:p>`,
    )
    .join('')
}

function slideXml(text) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs(text)}</p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
}

function notesXml(text) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs(text)}</p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`
}

/** 生成最小 pptx（用于测试文本层） */
export function buildPptx({ slides = [], notes = [] }) {
  const files = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    'ppt/presentation.xml': strToU8(PRESENTATION),
  }
  slides.forEach((text, index) => {
    files[`ppt/slides/slide${index + 1}.xml`] = strToU8(slideXml(text))
  })
  notes.forEach((text, index) => {
    files[`ppt/notesSlides/notesSlide${index + 1}.xml`] = strToU8(notesXml(text))
  })
  return zipSync(files, { level: 6 })
}
