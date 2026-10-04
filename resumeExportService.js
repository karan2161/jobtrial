import { OWN } from './ownership.js';
import { AppError } from '../utils/errors.js';
import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(input) {
  let c = 0xffffffff;
  for (const b of input) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

// Small ZIP writer sufficient for a standards-compliant DOCX package.
function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const filename = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const compressed = deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);
    const local = Buffer.concat([
      Buffer.from('504b0304', 'hex'), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(crc), u32(compressed.length), u32(raw.length), u16(filename.length), u16(0), filename, compressed,
    ]);
    locals.push(local);
    const central = Buffer.concat([
      Buffer.from('504b0102', 'hex'), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(crc), u32(compressed.length), u32(raw.length), u16(filename.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), filename,
    ]);
    centrals.push(central);
    offset += local.length;
  }
  const body = Buffer.concat(locals);
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([
    Buffer.from('504b0506', 'hex'), Buffer.alloc(4), u16(0), u16(files.length), u32(central.length), u32(body.length), u16(0),
  ]);
  return Buffer.concat([body, central, end]);
}

function xmlEscape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function docxXml(content, title) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const sectionWords = new Set(['SUMMARY', 'PROFILE', 'EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS', 'CERTIFICATIONS', 'ACHIEVEMENTS', 'INTERNSHIPS', 'OBJECTIVE', 'CONTACT', 'LANGUAGES']);
  const paragraphs = [];
  paragraphs.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${xmlEscape(title)}</w:t></w:r></w:p>`);
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) { paragraphs.push('<w:p/>'); continue; }
    const heading = sectionWords.has(clean.toUpperCase().replace(/[:\-]/g, '')) || (clean.length < 55 && /^[A-Z][A-Z\s&\/\-]+:?$/.test(clean));
    paragraphs.push(`<w:p><w:r><w:rPr>${heading ? '<w:b/><w:sz w:val="24"/>' : '<w:sz w:val="21"/>'}</w:rPr><w:t xml:space="preserve">${xmlEscape(clean)}</w:t></w:r></w:p>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
}

function makeDocx(content, title) {
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`],
    ['word/document.xml', docxXml(content, title)],
  ];
  return zipStore(files);
}

function pdfEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, '?');
}

function makePdf(content, title) {
  const pageW = 612, pageH = 792, margin = 54, fontSize = 10.5, lineH = 15;
  const maxChars = 92;
  const rawLines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const lines = [];
  for (const raw of rawLines) {
    if (!raw.trim()) { lines.push(''); continue; }
    let s = raw.trim();
    while (s.length > maxChars) { let cut = s.lastIndexOf(' ', maxChars); if (cut < 20) cut = maxChars; lines.push(s.slice(0, cut)); s = s.slice(cut).trim(); }
    lines.push(s);
  }
  const pages = [];
  let current = [];
  let y = pageH - margin;
  const pushPage = () => { pages.push(current); current = []; y = pageH - margin; };
  current.push({ text: title, x: margin, y, size: 18, bold: true }); y -= 30;
  for (const line of lines) {
    if (y < margin) pushPage();
    current.push({ text: line, x: margin, y, size: fontSize, bold: false });
    y -= lineH;
  }
  if (!pages.length || current.length) pages.push(current);

  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const catalog = add('');
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  for (const page of pages) {
    const commands = ['BT'];
    for (const item of page) {
      commands.push(`/F1 ${item.size} Tf 1 0 0 1 ${item.x} ${item.y} Tm (${pdfEscape(item.text)}) Tj`);
    }
    commands.push('ET');
    const stream = commands.join('\n');
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets[i + 1] = Buffer.byteLength(out, 'binary'); out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(out, 'binary');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'binary');
}

export const resumeExportService = {
  async getVersion(db, userId, id) {
    return OWN.version(db, id, userId, 'id, resume_id, version_name, content, ats_score, target_company, target_role');
  },

  async export(db, userId, id, format) {
    if (!['docx', 'pdf'].includes(format)) throw new AppError(400, 'INVALID_FORMAT', 'Format must be docx or pdf.');
    const version = await this.getVersion(db, userId, id);
    const title = version.version_name || 'Tailored Resume';
    const safe = title.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'Tailored_Resume';
    if (format === 'docx') return { buffer: makeDocx(version.content, title), contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: `${safe}.docx` };
    return { buffer: makePdf(version.content, title), contentType: 'application/pdf', filename: `${safe}.pdf` };
  },
};
