/**
 * ocrService.js
 *
 * Converts PDF pages to images and runs Tesseract OCR (tesseract.js).
 * Designed as a best-effort fallback for scanned invoices.
 *
 * Exports:
 *   ocrPdfBuffer(buffer, options) → { text, pagesProcessed, durationMs, error }
 *
 * Notes:
 * - Relies on pdf2pic, which requires Poppler (pdftoppm/pdftocairo) on the host.
 * - If the host lacks Poppler, the service returns { error } and lets callers
 *   fall back to manual entry instead of throwing.
 */

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { fromBuffer } = require('pdf2pic');
const { createWorker } = require('tesseract.js');
const { execFile } = require('child_process');
const axios = require('axios');

async function runPaddle(imagePath, lang = 'en') {
  // Prefer external PaddleOCR HTTP endpoint if provided
  if (process.env.PADDLE_OCR_URL) {
    const fileData = fs.readFileSync(imagePath, { encoding: 'base64' });
    const resp = await axios.post(process.env.PADDLE_OCR_URL, {
      image: fileData,
      lang,
    }, { timeout: 20000 });
    if (resp.data?.text) return resp.data.text;
    if (Array.isArray(resp.data)) return resp.data.map(l => l.text || l).join('\n');
    throw new Error('PaddleOCR HTTP response missing text');
  }
  throw new Error('PaddleOCR not configured (set PADDLE_OCR_URL)');
}

async function ocrPdfBuffer(buffer, {
  lang = process.env.OCR_LANGS || 'eng',
  maxPages = parseInt(process.env.OCR_MAX_PAGES || '2', 10),
  density = parseInt(process.env.OCR_IMAGE_DPI || '200', 10),
  engineOrder = (process.env.OCR_ENGINE_ORDER || 'paddle,tesseract').split(',').map(s => s.trim().toLowerCase()),
} = {}) {
  const start = Date.now();
  const tmpDir = os.tmpdir();
  const saveFilename = `ocr_${uuidv4()}`;

  let pagesProcessed = 0;
  const chunks = [];

  // Convert PDF pages to PNG images
  let convert;
  try {
    convert = fromBuffer(buffer, {
      density,
      format: 'png',
      savePath: tmpDir,
      saveFilename,
    });
  } catch (err) {
    return { text: '', pagesProcessed, durationMs: Date.now() - start, error: `pdf2pic init failed: ${err.message}` };
  }

  let worker = null;

  // Helper to run tesseract on a page
  async function runTesseractOnImage(imgPath) {
    if (!worker) {
      worker = await createWorker();
      await worker.loadLanguage(lang);
      await worker.initialize(lang);
    }
    const { data: { text } } = await worker.recognize(imgPath);
    return text || '';
  }

  const engines = engineOrder.filter(e => ['paddle', 'tesseract'].includes(e));
  if (engines.length === 0) engines.push('paddle', 'tesseract');

  try {
    for (let page = 1; page <= maxPages; page++) {
      let img;
      try {
        // Default response type is most compatible across pdf2pic versions.
        img = await convert(page);
      } catch (err) {
        if (page === 1) {
          return { text: '', pagesProcessed, durationMs: Date.now() - start, error: `pdf2pic conversion failed: ${err.message}` };
        }
        break;
      }
      if (!img) break;
      const imgPath = img.path || (img.name ? path.join(tmpDir, img.name) : null);
      if (!imgPath) break;

      let text = '';
      let lastErr = null;
      for (const engine of engines) {
        try {
          if (engine === 'paddle') {
            text = await runPaddle(imgPath, lang.startsWith('en') ? 'en' : 'en'); // Paddle supported langs vary; default en
          } else {
            text = await runTesseractOnImage(imgPath);
          }
          if (text) break;
        } catch (err) {
          lastErr = err;
          continue;
        }
      }

      if (!text && lastErr) {
        return { text: '', pagesProcessed, durationMs: Date.now() - start, error: `OCR failed: ${lastErr.message}` };
      }

      chunks.push(text || '');
      pagesProcessed++;

      try { fs.unlinkSync(imgPath); } catch { /* ignore */ }
    }
  } catch (err) {
    return { text: '', pagesProcessed, durationMs: Date.now() - start, error: `OCR failed: ${err.message}` };
  } finally {
    if (worker) await worker.terminate();
  }

  const text = chunks.join('\n\n').trim();
  return { text, pagesProcessed, durationMs: Date.now() - start, error: null };
}

module.exports = { ocrPdfBuffer };
