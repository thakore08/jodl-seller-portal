/**
 * pdfExtractorService.js
 *
 * Extracts structured invoice data from a PDF buffer using pdf-parse.
 * Designed for Indian GST-compliant steel invoices (digital / text-based PDFs).
 *
 * Scanned PDFs (images) are detected and flagged — the caller should fall back
 * to manual entry in that case.
 *
 * Exports:
 *   extractFromBuffer(buffer, filename)   → ExtractionResult
 *   parseProductAttributes(description)   → ParsedAttributes
 */

'use strict';

const { ocrPdfBuffer } = require('./ocrService');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFile } = require('child_process');

// Minimal DOMMatrix/DOMPoint polyfill for pdfjs in Node (text extraction only)
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class {
    constructor(init = [1, 0, 0, 1, 0, 0]) {
      const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = init;
      this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
      this.is2D = true;
    }
    multiplySelf() { return this; }
    multiply() { return this; }
    translate() { return this; }
    scale() { return this; }
    rotate() { return this; }
    invertSelf() { return this; }
    transformPoint(p) { return p; }
  };
}

if (typeof global.DOMPoint === 'undefined') {
  global.DOMPoint = class {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    matrixTransform() { return this; }
  };
}

// Ensure globalThis mirrors the polyfills (pdfjs checks globalThis.DOMMatrix)
globalThis.DOMMatrix = global.DOMMatrix;
globalThis.DOMPoint  = global.DOMPoint;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function execFileAsync(cmd, args = []) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (error, stdout, stderr) => {
      if (error) return reject(Object.assign(error, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

async function extractTextWithPdfParse(buffer) {
  const pdfParseModule = require('pdf-parse');
  const pdfParse = pdfParseModule.default || pdfParseModule;
  if (typeof pdfParse !== 'function') throw new Error('pdf-parse export is not callable');
  const pdfData = await pdfParse(buffer, { pagerender: null });
  return {
    text: pdfData.text || '',
    pages: pdfData.numpages || 1,
  };
}

async function extractTextWithPoppler(buffer, filename = 'tmp.pdf') {
  const tmpPath = path.join(os.tmpdir(), `pdfextract_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmpPath, buffer);
  let pages = 1;
  try {
    const info = await execFileAsync('pdfinfo', [tmpPath]);
    const m = info.stdout.match(/Pages:\\s+(\\d+)/i);
    if (m) pages = parseInt(m[1], 10);
  } catch { /* ignore */ }

  let text = '';
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', tmpPath, '-']);
    text = stdout || '';
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }

  return { text, pages };
}

// ─── Brand normalization ──────────────────────────────────────────────────────
const BRAND_MAP = {
  'TATA STEEL':                  'TATA',
  'TATA STEEL LTD':              'TATA',
  'TATA STEELS':                 'TATA',
  'TSL':                         'TATA',
  'TATA':                        'TATA',
  'JSW STEEL':                   'JSW',
  'JSW STEEL LTD':               'JSW',
  'JSW':                         'JSW',
  'SAIL':                        'SAIL',
  'STEEL AUTHORITY OF INDIA':    'SAIL',
  'STEEL AUTHORITY':             'SAIL',
  'JSPL':                        'JSPL',
  'JINDAL STEEL':                'JSPL',
  'JINDAL STEEL AND POWER':      'JSPL',
  'JINDAL STEEL & POWER':        'JSPL',
  'AM/NS':                       'AMNS',
  'AMNS':                        'AMNS',
  'AMNS INDIA':                  'AMNS',
  'ARCELORMITTAL NIPPON':        'AMNS',
  'ARCELORMITTAL':               'AMNS',
  'RINL':                        'RINL',
  'RASHTRIYA ISPAT':             'RINL',
  'VIZAG STEEL':                 'RINL',
  'RASHTRIYA ISPAT NIGAM':       'RINL',
  'ESSAR STEEL':                 'ESSAR',
  'ESSAR':                       'ESSAR',
  'BHUSHAN STEEL':               'BHUSHAN',
  'BHUSHAN':                     'BHUSHAN',
  'ELECTROSTEEL':                'ELECTROSTEEL',
  'KAMDHENU':                    'KAMDHENU',
  'SHYAM STEEL':                 'SHYAM',
  'SHYAM':                       'SHYAM',
};

// ─── Grade normalization ──────────────────────────────────────────────────────
const GRADE_MAP = {
  // IS 2062 structural steel
  'IS 2062 E250':   'IS2062_E250',
  'IS2062 E250':    'IS2062_E250',
  'IS2062E250':     'IS2062_E250',
  'E250':           'IS2062_E250',
  'E 250':          'IS2062_E250',
  'IS 2062 E350':   'IS2062_E350',
  'IS2062 E350':    'IS2062_E350',
  'E350':           'IS2062_E350',
  'E 350':          'IS2062_E350',
  'IS 2062 E450':   'IS2062_E450',
  'IS2062 E450':    'IS2062_E450',
  'E450':           'IS2062_E450',
  // European structural grades
  'S355':           'S355',
  'S 355':          'S355',
  'S275':           'S275',
  'S 275':          'S275',
  'S235':           'S235',
  'S 235':          'S235',
  // SAILMA grades
  'SAILMA 350':     'SAILMA350',
  'SAILMA350':      'SAILMA350',
  'SAILMA 410':     'SAILMA410',
  'SAILMA410':      'SAILMA410',
  // HR/CR grades (often just the material class)
  'HRC':            'HR_HRC',
  'HR HRC':         'HR_HRC',
  'CRC':            'CR_CRC',
  'CR CRC':         'CR_CRC',
  // TMT / IS 1786 rebar grades
  'FE415':          'Fe415',
  'FE 415':         'Fe415',
  'FE500':          'Fe500',
  'FE 500':         'Fe500',
  'FE500D':         'Fe500D',
  'FE 500D':        'Fe500D',
  'FE 500 D':       'Fe500D',
  'FE550':          'Fe550',
  'FE 550':         'Fe550',
  'FE550D':         'Fe550D',
  'FE 550D':        'Fe550D',
  'FE 550 D':       'Fe550D',
  'FE600':          'Fe600',
  'FE 600':         'Fe600',
  'FE500CRS':       'Fe500CRS',
  'FE 500 CRS':     'Fe500CRS',
  'FE 500CRS':      'Fe500CRS',
};

// ─── Product type detection ───────────────────────────────────────────────────
const TMT_RE   = /\b(TMT|REBAR|RE-?BAR|THERMO[\s-]?MECH|TISCON|NEOSTEEL|CTDBAR|CTD\s*BAR|MS\s*ROD|ROUND\s*BAR|Fe\d{3})\b/i;
const FLAT_RE  = /\b(HR\b|HOT[\s-]ROLL|CR\b|COLD[\s-]ROLL|COIL|PLATE|SHEET|FLAT\s*BAR|HRC|CRC|STRUCTURAL|ANGLE|CHANNEL|BEAM|JOIST|CHEQUERED)\b/i;

// ─── Dimension extraction ─────────────────────────────────────────────────────
// Thickness: "6.0mm", "6MM thk", "6.0 x 1250" (thickness is first number before x)
const THICKNESS_RE = /(\d+(?:\.\d+)?)\s*mm\s*(?:thk|thick)?(?=\s*x\s*\d|\s|$)/i;
// Width: "x 1250mm", "x1250", "1250 wide", "width 1250"
const WIDTH_RE     = /(?:x\s*(\d+(?:\.\d+)?)\s*(?:mm)?|width\s+(\d+(?:\.\d+)?))/i;
// Diameter: "10mm dia", "dia 10mm", "#10", "Dia.10"
const DIA_RE       = /(?:(?:dia(?:meter)?\.?\s*|#)(\d+(?:\.\d+)?)\s*(?:mm)?|(\d+(?:\.\d+)?)\s*mm\s*dia(?:meter)?)/i;

// ─── GSTIN pattern ────────────────────────────────────────────────────────────
const GSTIN_RE = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/g;

// ─── Amount parsing ───────────────────────────────────────────────────────────
function parseAmount(str) {
  if (!str) return null;
  const clean = str.replace(/,/g, '').trim();
  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

// ─── Date normalisation ───────────────────────────────────────────────────────
const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function normaliseDate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // DD/MM/YY or DD-MM-YY or DD.MM.YY
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // DD MMM YYYY (e.g. 15 March 2024, 15-Mar-2024)
  m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,](\d{4})$/);
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase().slice(0,3)];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
  }
  // DD MMM YY — 2-digit year (e.g. 14-Mar-26 used in Indian e-invoices) → treat as 20YY
  m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,](\d{2})$/);
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase().slice(0, 3)];
    if (mo) return `20${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
  }
  // DD/MM/YY — 2-digit year
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

// ─── Field extraction helper ──────────────────────────────────────────────────
function extractField(text, patterns) {
  for (const { re, confidence } of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      return { value: m[1].trim(), confidence };
    }
  }
  return { value: null, confidence: 'low' };
}

function extractAmountField(text, patterns) {
  const field = extractField(text, patterns);
  return { value: parseAmount(field.value), confidence: field.confidence };
}

const INVOICE_STOPWORDS = new Set([
  'dated', 'date', 'delivery', 'note', 'mode', 'terms', 'payment', 'reference',
  'dispatch', 'buyer', 'seller', 'invoice', 'bill', 'ack', 'no',
]);

function looksLikeInvoiceNumber(value) {
  if (!value) return false;
  const v = String(value).trim();
  if (!v || v.length < 3) return false;
  if (/^\d{8,}$/.test(v)) return false; // e-way/ack style long pure number
  if (!/\d/.test(v)) return false;
  if (INVOICE_STOPWORDS.has(v.toLowerCase())) return false;
  return /[A-Za-z0-9]/.test(v);
}

function findNameNearGstin(text, gstin) {
  if (!gstin || !text) return null;
  const idx = text.indexOf(gstin);
  if (idx === -1) return null;

  const lines = text.slice(0, idx).split('\n').map(l => l.trim()).filter(Boolean);
  const tail = lines.slice(Math.max(0, lines.length - 14));
  const stopRe = /^(?:tax\s*invoice|e-invoice|irn|ack|invoice\s*no|delivery\s*note|reference|buyer.?s order|dispatch|bill of lading|terms of delivery|state name|e-mail|pan|gstin\/uin)/i;
  const companyRe = /\b(LLP|LTD|LIMITED|PVT|PRIVATE|STEEL|INDUSTRIES|METALS|ENTERPRISES|TRADERS|CORP|COMPANY|CO\.?)\b/i;
  const normalize = (line) => line.split(/\s{2,}/)[0].replace(/\s+/g, ' ').trim();

  for (let i = tail.length - 1; i >= 0; i--) {
    const line = tail[i];
    if (!line || stopRe.test(line)) continue;
    if (companyRe.test(line)) {
      const candidate = normalize(line);
      if (candidate && !stopRe.test(candidate)) return candidate;
    }
  }
  for (let i = tail.length - 1; i >= 0; i--) {
    const line = tail[i];
    if (!line || stopRe.test(line)) continue;
    if (/[A-Za-z]/.test(line) && !/:\s*$/.test(line)) {
      const candidate = normalize(line);
      if (candidate && !stopRe.test(candidate)) return candidate;
    }
  }
  return null;
}

function extractDateField(text, patterns) {
  const field = extractField(text, patterns);
  return { value: normaliseDate(field.value), confidence: field.confidence };
}

// ─── GSTIN-proximity company name extraction ──────────────────────────────────
// Indian invoices: company name appears above an address block, which ends with
// "GSTIN/UIN : <gstin>".  We walk backwards from the GSTIN label, skipping lines
// that look like addresses, and return the first non-address line = company name.
function extractCompanyNearGstin(text, gstinLabelIndex) {
  if (gstinLabelIndex < 0) return { value: null, confidence: 'low' };
  const block = text.slice(Math.max(0, gstinLabelIndex - 500), gstinLabelIndex);
  const lines  = block.split('\n').map(l => l.trim()).filter(l => l.length >= 2);

  const ADDRESS_RE  = /^\d|@|www\.|http|\b\d{6}\b|\b(?:ground|floor|road|street|nagar|park|phase|plot|building|tower|block|sector|mumbai|delhi|pune|kolkata|chennai|hyderabad|bangalore|surat|ahmedabad|gujarat|maharashtra|rajasthan|karnataka|tamilnadu|telangana)\b/i;
  const LABEL_RE    = /gstin|pan\b|cin\b|irn\b|ack\b|state\s*name|e-?mail|phone|fax|code\s*:/i;
  const ADDR_PUNCT  = /^[A-Z]-\d|^\d+-?[A-Z]?\s*[\/,]|^Near\b|^Opp\.|^Behind\b/i;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (ADDRESS_RE.test(line))  continue;
    if (LABEL_RE.test(line))    continue;
    if (ADDR_PUNCT.test(line))  continue;
    if (line.length < 3)        continue;
    return { value: line, confidence: 'high' };
  }
  return { value: null, confidence: 'low' };
}

// ─── Label-proximity value extraction ────────────────────────────────────────
// Finds labelRe in the text, then scans the NEXT 150 chars (including newlines)
// for valueRe.  This handles both same-line and next-line value placement —
// avoiding the \n+ requirement that breaks when pdf-parse collapses columns.
function extractValueNearLabel(text, labelRe, valueRe, confidence) {
  const labelMatch = text.match(labelRe);
  if (!labelMatch) return { value: null, confidence: 'low' };
  const searchStart = labelMatch.index + labelMatch[0].length;
  const window = text.slice(searchStart, searchStart + 150);
  const valMatch = window.match(valueRe);
  if (valMatch) return { value: (valMatch[1] || valMatch[0]).trim(), confidence };
  return { value: null, confidence: 'low' };
}

// ─── Header field extraction ──────────────────────────────────────────────────
function extractHeader(text) {
  const t = text;

  // Invoice number — use proximity search so it works whether the value is on the
  // same line or the next line after "Invoice No." (pdf-parse varies per PDF generator)
  const invoiceNumber = (() => {
    // Primary: scan 150 chars after "Invoice No." label for the first invoice-like token
    const near = extractValueNearLabel(t, /Invoice\s*No\.?\s*/i, /([A-Z0-9][A-Z0-9\-\/]{3,30})/, 'high');
    if (near.value) return near;
    // Fallbacks for other common label forms
    return extractField(t, [
      { re: /(?:invoice\s*(?:no|number|#)|bill\s*(?:no|number))[.\s:#]*([A-Z0-9][A-Z0-9\-\/]{2,30})/i, confidence: 'high' },
      { re: /^(INV|BILL|TI|SI|GST)[\/\-]?[\d]{4}[\/\-]?[\d]{1,6}/im,                                   confidence: 'medium' },
    ]);
  })();

  // Invoice date — scan 150 chars after "Dated" (skips any intervening invoice/e-way numbers)
  const invoiceDate = (() => {
    // Primary: proximity search after "Dated" label — handles same-line or next-line
    const rawDate = extractValueNearLabel(
      t,
      /\bDated\s*/i,
      /(\d{1,2}[\s\-][A-Za-z]{3,9}[\s\-,]\d{2,4})/,
      'high'
    );
    if (rawDate.value) {
      const normalised = normaliseDate(rawDate.value);
      if (normalised) return { value: normalised, confidence: 'high' };
    }
    // Fallback: standard "Invoice Date" / "Bill Date" labels
    return extractDateField(t, [
      { re: /(?:invoice\s*date|date\s*of\s*issue|bill\s*date)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,   confidence: 'high' },
      { re: /(?:invoice\s*date|date\s*of\s*issue|bill\s*date)[:\s]*(\d{1,2}[\s\-][A-Za-z]{3,9}[\s\-,]\d{4})/i, confidence: 'high' },
      { re: /\bDated[:\s]*(\d{1,2}[\s\-][A-Za-z]{3,9}[\s\-,]\d{2,4})/i,                                        confidence: 'high' },
      { re: /\bdate[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,                                              confidence: 'medium' },
    ]);
  })();

  // Due date
  const dueDate = extractDateField(t, [
    { re: /due\s*(?:date|on)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,                    confidence: 'medium' },
    { re: /payment\s*due[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,                        confidence: 'medium' },
  ]);

  // GSTINs (first = seller, second = buyer)
  // Some IRP-generated PDFs insert spaces within the GSTIN; allow optional spaces and strip them.
  const GSTIN_RE_SPACED = /\b([0-9]{2}\s*[A-Z]{5}\s*[0-9]{4}\s*[A-Z][1-9A-Z]Z[0-9A-Z])\b/g;
  const gstins = [];
  let gm;
  const gstReCopy = new RegExp(GSTIN_RE_SPACED.source, 'g');
  while ((gm = gstReCopy.exec(t)) !== null) {
    const clean = gm[1].replace(/\s+/g, '');
    if (!gstins.includes(clean)) gstins.push(clean);
    if (gstins.length === 2) break;
  }
  const sellerGstin = gstins[0] || null;
  const buyerGstin  = gstins[1] || null;

  // Company names near GSTINs — walk backwards from each "GSTIN/UIN" label
  const firstGstinLabelIdx  = t.search(/GSTIN\/UIN\s*[:\s]/i);
  const secondGstinLabelIdx = (() => {
    if (firstGstinLabelIdx < 0) return -1;
    const after  = t.slice(firstGstinLabelIdx + 10);
    const second = after.search(/GSTIN\/UIN\s*[:\s]/i);
    return second < 0 ? -1 : firstGstinLabelIdx + 10 + second;
  })();
  const sellerNameNearGstin = firstGstinLabelIdx >= 0
    ? extractCompanyNearGstin(t, firstGstinLabelIdx)?.value
    : null;
  const buyerNameNearGstin = secondGstinLabelIdx >= 0
    ? extractCompanyNearGstin(t, secondGstinLabelIdx)?.value
    : null;

  const sellerGstinField = { value: sellerGstin,
                             confidence: sellerGstin ? 'high' : 'low' };
  const buyerGstinField  = { value: buyerGstin,
                             confidence: buyerGstin ? 'high' : 'low' };

  // Seller / buyer name (lines near the GSTINs)
  const sellerName = extractField(t, [
    { re: /^([A-Za-z][A-Za-z0-9&.,()\- ]{2,80})\s*\n[\s\S]{0,220}?GSTIN\/UIN:/i, confidence: 'high' },
    { re: /\n([A-Za-z][A-Za-z0-9&.,()\- ]{2,80}(?:LLP|LTD|LIMITED|PVT|PRIVATE|STEEL|INDUSTRIES|METALS|ENTERPRISES))\s*\n[\s\S]{0,220}?GSTIN\/UIN/i, confidence: 'high' },
    { re: /(?:seller|from|supplier|vendor|consignor)\s*(?:name)?[:\s]*([A-Za-z][\w\s&.,()-]{2,60})/i, confidence: 'medium' },
    { re: /^([A-Z][A-Z\s&.,()-]{3,50}(?:LTD|LIMITED|PVT|PRIVATE|INDUSTRIES|STEEL|CORP|CO\.?))\b/im, confidence: 'low' },
  ]);
  const buyerName = extractField(t, [
    { re: /buyer\s*\(bill\s*to\)\s*\n\s*([^\n]{3,80})/i, confidence: 'high' },
    { re: /consignee\s*\(ship\s*to\)\s*\n\s*([^\n]{3,80})/i, confidence: 'high' },
    { re: /(?:buyer|bill\s*to|ship\s*to|sold\s*to|purchaser)\s*(?:name)?[:\s]*([A-Za-z][\w\s&.,()-]{2,60})/i, confidence: 'medium' },
    { re: /^([A-Z][A-Za-z&.\s]{3,60})$/m, confidence: 'low' },
  ]);

  // Place of supply
  const placeOfSupply = extractField(t, [
    // Indian GST invoice standard: "State Name : Maharashtra, Code : 27"
    { re: /State\s*Name\s*:\s*([A-Za-z][A-Za-z\s]{2,29})(?:,|\s*Code)/i, confidence: 'medium' },
    // Explicit "Place of Supply:" label (fallback)
    { re: /place\s*of\s*supply[:\s]*([A-Za-z\s]{3,30})/i,                confidence: 'medium' },
  ]);

  // Taxable value
  const taxableValue = extractAmountField(t, [
    { re: /(?:taxable\s*(?:value|amount)|total\s*taxable|sub[\s-]?total)[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
    { re: /(?:value\s*of\s*supply)[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'medium' },
    { re: /\n\s*([\d,]+\.\d{2})\s*\n\s*SGST\s*@/i, confidence: 'high' },
  ]);

  // GST amounts
  const igstAmount = extractAmountField(t, [
    { re: /IGST\s*Amt\s*[:\-]?\s*([\d,]+\.\d{2})/i, confidence: 'high' },
    { re: /IGST\s*(?:@\s*\d+(?:\.\d+)?\s*%)?[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
    { re: /IGST[\s\S]{0,100}?([\d,]+\.\d{2})/i, confidence: 'medium' },
  ]);
  const cgstAmount = extractAmountField(t, [
    { re: /CGST\s*Amt\s*[:\-]?\s*([\d,]+\.\d{2})/i, confidence: 'high' },
    { re: /CGST\s*(?:@\s*\d+(?:\.\d+)?\s*%)?[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
    { re: /CGST[\s\S]{0,40}?\d+(?:\.\d+)?\s*%[\s\S]{0,40}?([\d,]+\.\d{2})/i, confidence: 'medium' },
  ]);
  const sgstAmount = extractAmountField(t, [
    { re: /SGST\s*Amt\s*[:\-]?\s*([\d,]+\.\d{2})/i, confidence: 'high' },
    { re: /SGST\s*(?:@\s*\d+(?:\.\d+)?\s*%)?[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
    { re: /SGST[\s\S]{0,40}?\d+(?:\.\d+)?\s*%[\s\S]{0,40}?([\d,]+\.\d{2})/i, confidence: 'medium' },
  ]);
  const utgstAmount = extractAmountField(t, [
    { re: /UTGST\s*(?:@\s*\d+(?:\.\d+)?\s*%)?[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
  ]);

  // GST rates
  const igstRate = extractField(t, [
    { re: /IGST\s*@\s*(\d+(?:\.\d+)?)\s*%/i, confidence: 'high' },
    { re: /IGST[\s\S]{0,40}?(\d+(?:\.\d+)?)\s*%/i, confidence: 'medium' },
  ]);
  const cgstRate = extractField(t, [
    { re: /CGST\s*@\s*(\d+(?:\.\d+)?)\s*%/i, confidence: 'high' },
    { re: /CGST[\s\S]{0,40}?(\d+(?:\.\d+)?)\s*%/i, confidence: 'medium' },
  ]);
  const sgstRate = extractField(t, [
    { re: /SGST\s*@\s*(\d+(?:\.\d+)?)\s*%/i, confidence: 'high' },
    { re: /SGST[\s\S]{0,40}?(\d+(?:\.\d+)?)\s*%/i, confidence: 'medium' },
  ]);

  // Total invoice amount
  const totalAmount = extractAmountField(t, [
    { re: /\bTotal\b\s+[\d.,]+\s*(?:MTON|MT|KG|PCS|NOS|MTS)\s+([\d,]+\.\d{2})/i, confidence: 'high' },
    { re: /amount\s*chargeable[\s\S]{0,140}?([\d,]+(?:\.\d{2})?)(?!\s*(?:MTON|MT|KG|PCS|NOS)\b)/i, confidence: 'high' },
    { re: /(?:grand\s*total|total\s*(?:invoice\s*)?amount|net\s*payable|amount\s*payable|total\s*payable)[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
    { re: /\bTotal\b[:\s]*([\d,]+(?:\.\d{1,2})?)(?!\s*(?:MTON|MT|KG|PCS|NOS)\b)(?:\s*(?:only|INR|Rs))?/i, confidence: 'medium' },
  ]);

  // Order / PO reference
  const poRef = extractField(t, [
    { re: /(?:order|po)\s*(?:number|no|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,30})/i, confidence: 'medium' },
  ]);

  // Payment terms
  const paymentTerms = extractField(t, [
    { re: /\b(next\s*day|immediate|advance|cash|net\s*\d+\s*days?)\b/i, confidence: 'high' },
    { re: /mode\/terms\s*of\s*payment\s*\n\s*([^\n]{2,40})/i, confidence: 'medium' },
    { re: /payment\s*terms?[:\s]*([^\n]{3,40})/i, confidence: 'low' },
    { re: /(?:net|credit)\s*(\d+)\s*days?/i,     confidence: 'low' },
  ]);

  return {
    invoice_number:  invoiceNumber,
    invoice_date:    invoiceDate,
    due_date:        dueDate,
    seller_name:     sellerNameNearGstin ? { value: sellerNameNearGstin, confidence: 'high' } : sellerName,
    seller_gstin:    sellerGstinField,
    buyer_name:      buyerNameNearGstin ? { value: buyerNameNearGstin, confidence: 'high' } : buyerName,
    buyer_gstin:     buyerGstinField,
    place_of_supply: placeOfSupply,
    taxable_value:   taxableValue,
    igst_amount:     igstAmount,
    igst_rate:       { value: igstRate.value ? parseFloat(igstRate.value) : null, confidence: igstRate.confidence },
    cgst_amount:     cgstAmount,
    cgst_rate:       { value: cgstRate.value ? parseFloat(cgstRate.value) : null, confidence: cgstRate.confidence },
    sgst_amount:     sgstAmount,
    sgst_rate:       { value: sgstRate.value ? parseFloat(sgstRate.value) : null, confidence: sgstRate.confidence },
    utgst_amount:    utgstAmount,
    total_amount:    totalAmount,
    po_reference:    poRef,
    payment_terms:   paymentTerms,
  };
}

// ─── Line item table extraction ───────────────────────────────────────────────
const TABLE_HEADER_RE = /(?:description|particulars|item\s*(?:name|desc)).{0,80}(?:hsn|sac|h\.s\.n).{0,80}(?:qty|quantity|nos)/i;
const TABLE_END_RE    = /^\s*(?:sub[\s-]?total|taxable\s*value|total\s*(?:before|excl)|amount\s*before\s*gst|sgst\b|cgst\b|igst\b|amount\s*chargeable|continued\s+to\s+page|less\s*:|round\s*off)\b/im;
const SIMPLE_TABLE_HEADER_RE = /qty\s+rate\s+amount/i;

// A line item row has: description + HSN (4-8 digits) + qty + optional unit + rate + amount
const LINE_ITEM_RE = /^(.{5,60}?)\s{2,}(\d{4,8})\s+([\d.]+)\s+([A-Za-z]{1,5}\s+)?([\d,]+\.?\d*)\s+([\d,]+\.?\d*)(?:\s+([\d,]+\.?\d*))?/;
// Tally layout: row no + description + HSN + qty + unit + rate + unit + amount
const LINE_ITEM_TALLY_RE = /^\s*\d+\s+(.{3,90}?)\s{2,}(\d{4,8})\s+([\d.]+)\s*(MTON|MT|KG|PCS|NOS|NO|MTS)?\s+([\d,]+(?:\.\d{1,2})?)\s*(?:MTON|MT|KG|PCS|NOS|NO|MTS)?\s+([\d,]+(?:\.\d{1,2})?)\s*$/i;
// Simpler fallback: description + 2+ numeric columns
const LINE_ITEM_FALLBACK_RE = /^(.{5,60}?)\s{2,}([\d.]+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/;
// HSN code alone on a line (some PDFs split HSN to a separate sub-row)
const HSN_ALONE_RE  = /^\s*(\d{4,8})\s*$/;
// Simple layout: RowNo Description Qty Rate Amount (no HSN)
const LINE_ITEM_SIMPLE_RE = /^\s*\d+\s+(.{5,80}?)\s+([\d.]+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/;

function extractTallyStyleLineItems(rawLines) {
  const items = [];
  const lines = (rawLines || []).map(l => (l || '').trim());
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) { i++; continue; }

    // Typical Tally row starts with: "1 HR Coil- 6mm"
    const rowStart = line.match(/^(\d+)\s+(.+)$/);
    if (!rowStart) { i++; continue; }

    const descParts = [rowStart[2].trim()];
    let hsn = null;
    let qty = null;
    let unit = null;
    let rate = null;
    let amount = null;
    i++;

    while (i < lines.length) {
      const cur = lines[i];
      if (!cur) { i++; continue; }
      if (/^\d+\s+/.test(cur)) break; // next row
      if (/^(?:sgst|cgst|igst|round\s*off|less\b|amount\s*chargeable|total\b|continued\s+to\s+page|this\s+is\s+a\s+computer\s+generated\s+invoice)/i.test(cur)) break;

      const hsnMatch = cur.match(/^(\d{4,8})$/);
      if (hsnMatch && !hsn) {
        hsn = hsnMatch[1];
        i++;
        continue;
      }

      const qtyMatch = cur.match(/^([\d.]+)\s*(MTON|MT|KG|PCS|NOS|NO|MTR|MTS)?$/i);
      if (qtyMatch && qty == null) {
        qty = parseFloat(qtyMatch[1]);
        if (qtyMatch[2]) unit = qtyMatch[2].toUpperCase();
        i++;
        continue;
      }

      const amountWithUnitMatch = cur.match(/^([\d,]+\.\d{2})\s*(MTON|MT|KG|PCS|NOS|NO|MTR|MTS)?$/i);
      if (amountWithUnitMatch) {
        if (rate == null) {
          rate = parseAmount(amountWithUnitMatch[1]);
          if (!unit && amountWithUnitMatch[2]) unit = amountWithUnitMatch[2].toUpperCase();
        } else if (amount == null) {
          amount = parseAmount(amountWithUnitMatch[1]);
        }
        i++;
        continue;
      }

      if (/[A-Za-z]/.test(cur) && !/^(?:buyer|consignee|dispatch|delivery|bill\s+of|motor\s+vehicle|terms\s+of\s+delivery)$/i.test(cur)) {
        descParts.push(cur);
      }
      i++;
    }

    if (qty != null && rate != null && amount == null) amount = qty * rate;
    if (qty != null && rate != null) {
      const rawDescription = descParts.join(' ').replace(/\s+/g, ' ').trim();
      items.push({
        raw_description: rawDescription,
        hsn_code:        { value: hsn, confidence: hsn ? 'high' : 'low' },
        quantity:        { value: qty, confidence: 'high' },
        unit:            { value: unit, confidence: unit ? 'medium' : 'low' },
        unit_rate:       { value: rate, confidence: 'high' },
        taxable_amount:  { value: amount, confidence: amount != null ? 'high' : 'medium' },
        gst_percent:     { value: null, confidence: 'low' },
      });
    }
  }

  return items;
}

function extractLineItems(text) {
  const lines = text.split('\n');
  let tableStart = -1;
  let tableEnd   = lines.length;

  // Locate table header row
  for (let i = 0; i < lines.length; i++) {
    if (TABLE_HEADER_RE.test(lines[i]) || SIMPLE_TABLE_HEADER_RE.test(lines[i])) { tableStart = i + 1; break; }
  }
  if (tableStart === -1) return []; // No table found

  // Locate table end
  for (let i = tableStart; i < lines.length; i++) {
    if (TABLE_END_RE.test(lines[i])) { tableEnd = i; break; }
  }

  const items = [];
  let current = null;

  for (let i = tableStart; i < tableEnd; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Try full LINE_ITEM_RE first
    let m = line.match(LINE_ITEM_TALLY_RE);
    if (m) {
      if (current) items.push(current);
      current = {
        raw_description: m[1].trim(),
        hsn_code:        { value: m[2], confidence: 'high' },
        quantity:        { value: parseFloat(m[3]), confidence: 'high' },
        unit:            { value: m[4] ? m[4].trim().toUpperCase() : null, confidence: m[4] ? 'medium' : 'low' },
        unit_rate:       { value: parseAmount(m[5]), confidence: 'high' },
        taxable_amount:  { value: parseAmount(m[6]), confidence: 'high' },
        gst_percent:     { value: null, confidence: 'low' },
      };
      continue;
    }

    m = line.match(LINE_ITEM_RE);
    if (m) {
      if (current) items.push(current);
      const hasUnit = m[4] && /^[A-Za-z]{1,5}$/.test(m[4].trim());
      current = {
        raw_description: m[1].trim(),
        hsn_code:        { value: m[2], confidence: 'high' },
        quantity:        { value: parseFloat(m[3]),    confidence: 'high' },
        unit:            { value: hasUnit ? m[4].trim().toUpperCase() : null, confidence: hasUnit ? 'medium' : 'low' },
        unit_rate:       { value: parseAmount(hasUnit ? m[5] : m[5]), confidence: 'high' },
        taxable_amount:  { value: parseAmount(m[m.length - 1]), confidence: 'high' },
        gst_percent:     { value: null, confidence: 'low' },
      };
      continue;
    }

    // Fallback: fewer columns
    m = line.match(LINE_ITEM_FALLBACK_RE);
    if (m) {
      if (current) items.push(current);
      current = {
        raw_description: m[1].trim(),
        hsn_code:        { value: null, confidence: 'low' },
        quantity:        { value: parseFloat(m[2]), confidence: 'medium' },
        unit:            { value: null, confidence: 'low' },
        unit_rate:       { value: parseAmount(m[3]), confidence: 'medium' },
        taxable_amount:  { value: parseAmount(m[4]), confidence: 'medium' },
        gst_percent:     { value: null, confidence: 'low' },
      };
      continue;
    }

    // Simple layout without HSN column
    m = line.match(LINE_ITEM_SIMPLE_RE);
    if (m) {
      if (current) items.push(current);
      current = {
        raw_description: m[1].trim(),
        hsn_code:        { value: null, confidence: 'low' },
        quantity:        { value: parseFloat(m[2]), confidence: 'medium' },
        unit:            { value: null, confidence: 'low' },
        unit_rate:       { value: parseAmount(m[3]), confidence: 'medium' },
        taxable_amount:  { value: parseAmount(m[4]), confidence: 'medium' },
        gst_percent:     { value: null, confidence: 'low' },
      };
      continue;
    }

    // HSN on its own sub-row
    if (current && HSN_ALONE_RE.test(line)) {
      current.hsn_code = { value: line.trim(), confidence: 'high' };
      continue;
    }

    // GST rate on line
    if (current) {
      const gstM = line.match(/(?:GST|IGST|CGST\+SGST)\s*@?\s*(\d+(?:\.\d+)?)\s*%/i);
      if (gstM) { current.gst_percent = { value: parseFloat(gstM[1]), confidence: 'high' }; continue; }
    }

    // Multi-line description continuation: line has no numbers and looks like text
    if (current && /^[A-Za-z\s\-\/(),]{5,}$/.test(line.trim())) {
      current.raw_description += ' ' + line.trim();
    }
  }
  if (current) items.push(current);

  let extracted = items;
  if (extracted.length === 0) {
    extracted = extractTallyStyleLineItems(lines.slice(tableStart, tableEnd));
  }

  // Post-process: attach parsed product attributes
  return extracted.map(item => ({
    ...item,
    parsed: parseProductAttributes(item.raw_description),
  }));
}

// Fallback parser for stacked line-item layout (Qty / Rate / Amount on separate lines)
function extractStackedLineItem(text) {
  const m = text.match(/Qty[\s\r\n]*Rate[\s\r\n]*Amount[\s\r\n]*([\d.,]+)\s*(MT|KG|PCS|NOS)?[\s\r\n]*([\d,]+\.\d{2})[\s\r\n]*([\d,]+\.\d{2})/i);
  if (!m) return null;
  const qty    = parseFloat(m[1].replace(/,/g, ''));
  const unit   = m[2] ? m[2].trim().toUpperCase() : null;
  const rate   = parseAmount(m[3]);
  const amount = parseAmount(m[4]);
  return {
    raw_description: 'Invoice line item (stacked table)',
    hsn_code:        { value: null, confidence: 'low' },
    quantity:        { value: qty, confidence: 'medium' },
    unit:            { value: unit, confidence: unit ? 'medium' : 'low' },
    unit_rate:       { value: rate, confidence: 'medium' },
    taxable_amount:  { value: amount, confidence: 'medium' },
    gst_percent:     { value: null, confidence: 'low' },
    parsed:          parseProductAttributes(''),
  };
}

// ─── Product attribute parsing ────────────────────────────────────────────────
function normalizeBrand(raw) {
  const upper = raw.toUpperCase().trim();
  if (BRAND_MAP[upper]) return BRAND_MAP[upper];
  // Partial match (e.g. "Tata Steel Limited")
  for (const [key, val] of Object.entries(BRAND_MAP)) {
    if (upper.includes(key)) return val;
  }
  return null;
}

function normalizeGrade(raw) {
  const upper = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (GRADE_MAP[upper]) return GRADE_MAP[upper];
  // Strip common prefixes/suffixes
  const stripped = upper.replace(/\b(STEEL|GRADE|GR\.?|IS\s*\d{4})\b/g, '').trim();
  if (GRADE_MAP[stripped]) return GRADE_MAP[stripped];
  // Case-insensitive lookup
  for (const [key, val] of Object.entries(GRADE_MAP)) {
    if (upper === key.toUpperCase()) return val;
  }
  return null;
}

function parseProductAttributes(description) {
  const desc = description || '';

  const productType = TMT_RE.test(desc) ? 'tmt' : FLAT_RE.test(desc) ? 'flat' : 'unknown';

  // Brand — try each brand key as substring
  let brand = null;
  const descUpper = desc.toUpperCase();
  for (const [key, val] of Object.entries(BRAND_MAP)) {
    if (descUpper.includes(key)) { brand = val; break; }
  }

  // Grade — try each grade key as substring
  let grade = null;
  for (const [key, val] of Object.entries(GRADE_MAP)) {
    if (descUpper.includes(key.toUpperCase())) { grade = val; break; }
  }
  // Additional grade patterns inline
  if (!grade) {
    const gm = desc.match(/\b(Fe\s*\d{3}[D]?(?:CRS)?)\b/i);
    if (gm) grade = normalizeGrade(gm[1]);
  }

  // Dimensions
  let thickness_mm = null, width_mm = null, diameter_mm = null;

  if (productType === 'flat' || productType === 'unknown') {
    const tm = desc.match(THICKNESS_RE);
    if (tm) thickness_mm = parseFloat(tm[1]);
    const wm = desc.match(WIDTH_RE);
    if (wm) width_mm = parseFloat(wm[1] || wm[2]);
    // Handle "6.0 x 1250" without "mm" — infer thickness × width
    if (!thickness_mm || !width_mm) {
      const xm = desc.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
      if (xm) {
        thickness_mm = thickness_mm || parseFloat(xm[1]);
        width_mm     = width_mm     || parseFloat(xm[2]);
      }
    }
  }

  if (productType === 'tmt' || productType === 'unknown') {
    const dm = desc.match(DIA_RE);
    if (dm) diameter_mm = parseFloat(dm[1] || dm[2]);
    // "#12", "#16" format
    if (!diameter_mm) {
      const hm = desc.match(/#(\d+)\b/);
      if (hm) diameter_mm = parseFloat(hm[1]);
    }
  }

  return { product_type: productType, brand, grade, thickness_mm, width_mm, diameter_mm };
}

// ─── Extraction log ───────────────────────────────────────────────────────────
function buildLog(filename, pages, charsExtracted, isScanned, header, lineItems, extras = {}) {
  const log = {
    filename:           filename || 'unknown.pdf',
    pages,
    chars_extracted:    charsExtracted,
    chars_per_page_avg: pages > 0 ? Math.round(charsExtracted / pages) : 0,
    is_scanned:         isScanned,
    header_confidence_summary: { high: 0, medium: 0, low: 0 },
    line_items_found:   0,
    extraction_error:   null,
    extracted_at:       new Date().toISOString(),
  };

  if (header) {
    for (const field of Object.values(header)) {
      if (field && field.confidence) log.header_confidence_summary[field.confidence]++;
    }
  }
  if (lineItems) log.line_items_found = lineItems.length;

  return { ...log, ...extras };
}

function parseStructuredFromText(text) {
  const header = extractHeader(text);
  let lineItems = extractLineItems(text);
  if (lineItems.length === 0) {
    const fallbackItem = extractStackedLineItem(text);
    if (fallbackItem) lineItems = [fallbackItem];
  }
  return { header, lineItems };
}

function hasFieldValue(field) {
  return field && field.value !== null && field.value !== undefined && field.value !== '';
}

function mergeHeader(ocrHeader, fallbackHeader) {
  const keys = new Set([
    ...Object.keys(ocrHeader || {}),
    ...Object.keys(fallbackHeader || {}),
  ]);
  const merged = {};
  for (const key of keys) {
    const primary = ocrHeader?.[key];
    const fallback = fallbackHeader?.[key];
    const useFallbackForLowConfidence =
      hasFieldValue(primary) &&
      primary?.confidence === 'low' &&
      hasFieldValue(fallback);

    merged[key] = useFallbackForLowConfidence
      ? fallback
      : (hasFieldValue(primary) ? primary : (fallback || primary || { value: null, confidence: 'low' }));
  }
  return merged;
}

// ─── Public API ───────────────────────────────────────────────────────────────
async function extractFromBuffer(buffer, filename) {
  let rawText = '';
  let numpages = 1;
  try {
    ({ text: rawText, pages: numpages } = await extractTextWithPdfParse(buffer));
  } catch (err) {
    console.warn('[PDFExtract] pdf-parse failed, falling back to pdftotext:', err.message);
    try {
      ({ text: rawText, pages: numpages } = await extractTextWithPoppler(buffer, filename));
    } catch (popplerErr) {
      const error = Object.assign(
        new Error(`PDF parse failed: ${popplerErr.message || err.message}`),
        { status: 422 }
      );
      throw error;
    }
  }

  const charsPerPage = rawText.length / numpages;
  const baseText = rawText;

  // Heuristic: fewer than 100 chars/page → likely a scanned image PDF
  const isScanned = charsPerPage < 100;
  const forceOcr = ['true', '1', 'yes'].includes(String(process.env.FORCE_OCR || '').toLowerCase());
  const shouldRunOcr = isScanned || forceOcr;

  // ── OCR path (scanned docs or force mode) ───────────────────────────────────
  if (shouldRunOcr) {
    // Allow turning off OCR via env for environments without Poppler/Tesseract
    if (process.env.ENABLE_OCR === 'false') {
      return {
        is_scanned:     isScanned,
        ocr_used:       false,
        ocr_success:    false,
        header:         null,
        line_items:     [],
        raw_text:       rawText,
        extraction_log: buildLog(filename, numpages, rawText.length, isScanned, null, null, {
          ocr_attempted: false,
          ocr_success:   false,
          ocr_error:     'OCR disabled by ENABLE_OCR=false',
          ocr_forced:    forceOcr,
        }),
      };
    }

    const ocrResult = await ocrPdfBuffer(buffer, {
      lang:     process.env.OCR_LANGS || 'eng',
      maxPages: parseInt(process.env.OCR_MAX_PAGES || '2', 10),
      density:  parseInt(process.env.OCR_IMAGE_DPI || '200', 10),
    });

    if (ocrResult.error || !ocrResult.text) {
      // In force mode for non-scanned PDFs, keep the text-extraction result
      // so the user still gets parsed fields even when OCR fails.
      if (!isScanned && forceOcr) {
        const { header, lineItems } = parseStructuredFromText(rawText);

        return {
          is_scanned:     false,
          ocr_used:       true,
          ocr_success:    false,
          header,
          line_items:     lineItems,
          raw_text:       rawText,
          extraction_log: buildLog(filename, numpages, rawText.length, false, header, lineItems, {
            ocr_attempted: true,
            ocr_success:   false,
            ocr_error:     ocrResult.error || 'No text returned from OCR',
            ocr_pages:     ocrResult.pagesProcessed,
            ocr_forced:    true,
          }),
        };
      }

      return {
        is_scanned:     isScanned,
        ocr_used:       true,
        ocr_success:    false,
        header:         null,
        line_items:     [],
        raw_text:       rawText,
        extraction_log: buildLog(filename, numpages, rawText.length, isScanned, null, null, {
          ocr_attempted: true,
          ocr_success:   false,
          ocr_error:     ocrResult.error || 'No text returned from OCR',
          ocr_pages:     ocrResult.pagesProcessed,
          ocr_forced:    forceOcr,
        }),
      };
    }

    rawText = ocrResult.text;
    const { header: ocrHeader, lineItems: ocrLineItems } = parseStructuredFromText(rawText);
    let header = ocrHeader;
    let lineItems = ocrLineItems;

    // Force mode on digital PDFs: keep OCR active, but backfill weak OCR fields
    // from direct text extraction to preserve data quality.
    if (!isScanned && forceOcr) {
      const { header: baseHeader, lineItems: baseLineItems } = parseStructuredFromText(baseText);
      header = mergeHeader(ocrHeader, baseHeader);
      if (!Array.isArray(lineItems) || lineItems.length === 0) lineItems = baseLineItems;
    }

    return {
      is_scanned:     isScanned,
      ocr_used:       true,
      ocr_success:    true,
      header,
      line_items:     lineItems,
      raw_text:       rawText,
      extraction_log: buildLog(filename, numpages, rawText.length, isScanned, header, lineItems, {
        ocr_attempted: true,
        ocr_success:   true,
        ocr_pages:     ocrResult.pagesProcessed,
        ocr_duration_ms: ocrResult.durationMs,
        ocr_lang:      process.env.OCR_LANGS || 'eng',
        chars_after_ocr: rawText.length,
        ocr_forced:    forceOcr,
      }),
    };
  }

  const { header, lineItems } = parseStructuredFromText(rawText);

  return {
    is_scanned:     false,
    ocr_used:       false,
    ocr_success:    false,
    header,
    line_items:     lineItems,
    raw_text:       rawText,
    extraction_log: buildLog(filename, numpages, rawText.length, false, header, lineItems, {
      ocr_attempted: false,
      ocr_success:   false,
    }),
  };
}

module.exports = { extractFromBuffer, parseProductAttributes };
