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
  // DD MMM YYYY (e.g. 15 March 2024, 15-Mar-2024)
  m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,](\d{4})$/);
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase().slice(0,3)];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
  }
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

function extractDateField(text, patterns) {
  const field = extractField(text, patterns);
  return { value: normaliseDate(field.value), confidence: field.confidence };
}

// ─── Header field extraction ──────────────────────────────────────────────────
function extractHeader(text) {
  const t = text;

  // Invoice number
  const invoiceNumber = extractField(t, [
    { re: /(?:invoice\s*(?:no|number|#)|bill\s*(?:no|number))[.\s:#]*([A-Z0-9][A-Z0-9\-\/]{2,30})/i, confidence: 'high' },
    { re: /(?:tax\s*invoice)\s*(?:no|#)?[.:\s]*([A-Z0-9][A-Z0-9\-\/]{2,30})/i,                       confidence: 'high' },
    { re: /^(INV|BILL|TI|SI|GST)[\/\-]?[\d]{4}[\/\-]?[\d]{1,6}/im,                                   confidence: 'medium' },
  ]);

  // Invoice date
  const invoiceDate = extractDateField(t, [
    { re: /(?:invoice\s*date|date\s*of\s*issue|bill\s*date)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i, confidence: 'high' },
    { re: /(?:invoice\s*date|date\s*of\s*issue|bill\s*date)[:\s]*(\d{1,2}[\s\-][A-Za-z]{3,9}[\s\-,]\d{4})/i, confidence: 'high' },
    { re: /\bdate[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,                                            confidence: 'medium' },
  ]);

  // Due date
  const dueDate = extractDateField(t, [
    { re: /due\s*(?:date|on)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,                    confidence: 'medium' },
    { re: /payment\s*due[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,                        confidence: 'medium' },
  ]);

  // GSTINs (first = seller, second = buyer)
  const gstins = [];
  let gm;
  const gstReCopy = new RegExp(GSTIN_RE.source, 'g');
  while ((gm = gstReCopy.exec(t)) !== null) {
    if (!gstins.includes(gm[1])) gstins.push(gm[1]);
    if (gstins.length === 2) break;
  }
  const sellerGstin = { value: gstins[0] || null, confidence: gstins[0] ? 'high' : 'low' };
  const buyerGstin  = { value: gstins[1] || null, confidence: gstins[1] ? 'high' : 'low' };

  // Seller / buyer name (lines near the GSTINs)
  const sellerName = extractField(t, [
    { re: /(?:seller|from|supplier|vendor|consignor)\s*(?:name)?[:\s]*([A-Za-z][\w\s&.,()-]{2,60})/i, confidence: 'medium' },
    { re: /^([A-Z][A-Z\s&.,()-]{3,50}(?:LTD|LIMITED|PVT|PRIVATE|INDUSTRIES|STEEL|CORP|CO\.?))\b/im, confidence: 'low' },
  ]);
  const buyerName = extractField(t, [
    { re: /(?:buyer|bill\s*to|ship\s*to|sold\s*to|purchaser)\s*(?:name)?[:\s]*([A-Za-z][\w\s&.,()-]{2,60})/i, confidence: 'medium' },
  ]);

  // Place of supply
  const placeOfSupply = extractField(t, [
    { re: /place\s*of\s*supply[:\s]*([A-Za-z\s]{3,30})/i, confidence: 'medium' },
  ]);

  // Taxable value
  const taxableValue = extractAmountField(t, [
    { re: /(?:taxable\s*(?:value|amount)|total\s*taxable|sub[\s-]?total)[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
    { re: /(?:value\s*of\s*supply)[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'medium' },
  ]);

  // GST amounts
  const igstAmount = extractAmountField(t, [
    { re: /IGST\s*(?:@\s*\d+(?:\.\d+)?\s*%)?[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
  ]);
  const cgstAmount = extractAmountField(t, [
    { re: /CGST\s*(?:@\s*\d+(?:\.\d+)?\s*%)?[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
  ]);
  const sgstAmount = extractAmountField(t, [
    { re: /SGST\s*(?:@\s*\d+(?:\.\d+)?\s*%)?[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
  ]);
  const utgstAmount = extractAmountField(t, [
    { re: /UTGST\s*(?:@\s*\d+(?:\.\d+)?\s*%)?[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
  ]);

  // GST rates
  const igstRate = extractField(t, [
    { re: /IGST\s*@\s*(\d+(?:\.\d+)?)\s*%/i, confidence: 'high' },
  ]);
  const cgstRate = extractField(t, [
    { re: /CGST\s*@\s*(\d+(?:\.\d+)?)\s*%/i, confidence: 'high' },
  ]);
  const sgstRate = extractField(t, [
    { re: /SGST\s*@\s*(\d+(?:\.\d+)?)\s*%/i, confidence: 'high' },
  ]);

  // Total invoice amount
  const totalAmount = extractAmountField(t, [
    { re: /(?:grand\s*total|total\s*(?:invoice\s*)?amount|net\s*payable|amount\s*payable|total\s*payable)[:\s]*([\d,]+(?:\.\d{1,2})?)/i, confidence: 'high' },
    { re: /\bTotal\b[:\s]*([\d,]+(?:\.\d{1,2})?)(?:\s*(?:only|INR|Rs))?/i, confidence: 'medium' },
  ]);

  // Payment terms
  const paymentTerms = extractField(t, [
    { re: /payment\s*terms?[:\s]*([^\n]{3,40})/i, confidence: 'low' },
    { re: /(?:net|credit)\s*(\d+)\s*days?/i,     confidence: 'low' },
  ]);

  return {
    invoice_number:  invoiceNumber,
    invoice_date:    invoiceDate,
    due_date:        dueDate,
    seller_name:     sellerName,
    seller_gstin:    sellerGstin,
    buyer_name:      buyerName,
    buyer_gstin:     buyerGstin,
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
    payment_terms:   paymentTerms,
  };
}

// ─── Line item table extraction ───────────────────────────────────────────────
const TABLE_HEADER_RE = /(?:description|particulars|item\s*(?:name|desc)).{0,80}(?:hsn|sac|h\.s\.n).{0,80}(?:qty|quantity|nos)/i;
const TABLE_END_RE    = /^\s*(?:sub[\s-]?total|taxable\s*value|total\s*(?:before|excl)|amount\s*before\s*gst)\b/im;

// A line item row has: description + HSN (4-8 digits) + qty + optional unit + rate + amount
const LINE_ITEM_RE = /^(.{5,60}?)\s{2,}(\d{4,8})\s+([\d.]+)\s+([A-Za-z]{1,5}\s+)?([\d,]+\.?\d*)\s+([\d,]+\.?\d*)(?:\s+([\d,]+\.?\d*))?/;
// Simpler fallback: description + 2+ numeric columns
const LINE_ITEM_FALLBACK_RE = /^(.{5,60}?)\s{2,}([\d.]+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/;
// HSN code alone on a line (some PDFs split HSN to a separate sub-row)
const HSN_ALONE_RE  = /^\s*(\d{4,8})\s*$/;

function extractLineItems(text) {
  const lines = text.split('\n');
  let tableStart = -1;
  let tableEnd   = lines.length;

  // Locate table header row
  for (let i = 0; i < lines.length; i++) {
    if (TABLE_HEADER_RE.test(lines[i])) { tableStart = i + 1; break; }
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
    let m = line.match(LINE_ITEM_RE);
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

  // Post-process: attach parsed product attributes
  return items.map(item => ({
    ...item,
    parsed: parseProductAttributes(item.raw_description),
  }));
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
function buildLog(filename, pages, charsExtracted, isScanned, header, lineItems) {
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

  return log;
}

// ─── Public API ───────────────────────────────────────────────────────────────
async function extractFromBuffer(buffer, filename) {
  let pdfData;
  try {
    // pdf-parse can log warnings to stderr on some PDFs — suppress with custom renderer
    const pdfParse = require('pdf-parse');
    pdfData = await pdfParse(buffer, { pagerender: null });
  } catch (err) {
    const error = Object.assign(
      new Error(`PDF parse failed: ${err.message}`),
      { status: 422 }
    );
    throw error;
  }

  const rawText  = pdfData.text || '';
  const numpages = pdfData.numpages || 1;
  const charsPerPage = rawText.length / numpages;

  // Heuristic: fewer than 100 chars/page → likely a scanned image PDF
  const isScanned = charsPerPage < 100;

  if (isScanned) {
    return {
      is_scanned:     true,
      header:         null,
      line_items:     [],
      raw_text:       rawText,
      extraction_log: buildLog(filename, numpages, rawText.length, true, null, null),
    };
  }

  const header    = extractHeader(rawText);
  const lineItems = extractLineItems(rawText);

  return {
    is_scanned:     false,
    header,
    line_items:     lineItems,
    raw_text:       rawText,
    extraction_log: buildLog(filename, numpages, rawText.length, false, header, lineItems),
  };
}

module.exports = { extractFromBuffer, parseProductAttributes };
