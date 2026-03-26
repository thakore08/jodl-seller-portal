import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {
  ZoomIn, ZoomOut, Maximize2, Download, AlertTriangle, FileX, Loader2,
} from 'lucide-react';

// ── Configure PDF.js worker via Vite's ?url import ─────────────────────────
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * PDFViewerPane
 *
 * Left pane of the split-screen invoice modal.
 * Renders the uploaded PDF using react-pdf with:
 *   - Vertical scroll (all pages)
 *   - Toolbar: page counter, zoom±, fit-width toggle, download
 *   - Amber banner for scanned PDFs
 *   - Text-layer highlighting via activeSearchTerm prop
 *   - Error fallback with download button
 *
 * Props:
 *   file              File | null   — raw File object from file picker
 *   activeSearchTerm  string        — text to highlight in PDF text layer
 *   isScanned         boolean       — shows amber scanned banner
 */
export default function PDFViewerPane({ file, activeSearchTerm, isScanned }) {
  const [numPages, setNumPages]       = useState(null);
  const [scale, setScale]             = useState(1.2);
  const [fitWidth, setFitWidth]       = useState(true);
  const [hasError, setHasError]       = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const containerRef = useRef(null);

  // ── Measure container width for fit-to-width ───────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width - 16); // 8px padding each side
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Text-layer highlight ───────────────────────────────────────────────────
  useEffect(() => {
    // Clear previous highlights
    document.querySelectorAll('.pdf-highlight').forEach(el => {
      el.classList.remove('pdf-highlight');
    });
    const term = activeSearchTerm?.trim().toLowerCase();
    if (!term || term.length < 2) return;

    // Small delay to allow react-pdf text layer to finish rendering
    const timer = setTimeout(() => {
      document.querySelectorAll('.react-pdf__Page__textContent span').forEach(span => {
        if (span.textContent.toLowerCase().includes(term)) {
          span.classList.add('pdf-highlight');
        }
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [activeSearchTerm, numPages]);

  // ── Download handler ───────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name || 'invoice.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [file]);
  // Revoke fallback URL when file changes
  useEffect(() => {
    if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
    setFallbackUrl(null);
    setHasError(false);
    setNumPages(null);
  }, [file]);

  const zoomIn  = () => setScale(s => Math.min(3.0, parseFloat((s + 0.15).toFixed(2))));
  const zoomOut = () => setScale(s => Math.max(0.4, parseFloat((s - 0.15).toFixed(2))));

  // ── No file state ─────────────────────────────────────────────────────────
  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 dark:text-gray-500 px-6">
        <FileX className="h-12 w-12" />
        <p className="text-sm text-center">Upload an invoice PDF to preview it here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 shrink-0 text-xs text-gray-600 dark:text-gray-400">
        <span className="font-medium mr-1">
          {numPages ? `${numPages} page${numPages !== 1 ? 's' : ''}` : '…'}
        </span>

        <div className="flex items-center gap-0.5 ml-auto">
          <button
            onClick={zoomOut}
            title="Zoom out"
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center text-xs">{Math.round((fitWidth ? 100 : scale * 100))}%</span>
          <button
            onClick={zoomIn}
            title="Zoom in"
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setFitWidth(f => !f)}
            title={fitWidth ? 'Use fixed zoom' : 'Fit to width'}
            className={`p-1 rounded transition-colors ml-1 ${
              fitWidth
                ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={handleDownload}
            title="Download original"
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ml-1"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Scanned banner */}
      {isScanned && (
        <div className="mx-3 mt-2 shrink-0 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Scanned document detected — OCR used for extraction. Confidence may be lower.
        </div>
      )}

      {/* PDF scroll area */}
      {hasError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
          {fallbackUrl ? (
            <object
              data={fallbackUrl}
              type="application/pdf"
              className="w-full h-full min-h-[400px] rounded border border-gray-200 dark:border-gray-700 bg-white"
            >
              <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-6">
                PDF preview fallback is unavailable in this browser.
              </p>
            </object>
          ) : (
            <FileX className="h-10 w-10 text-gray-400 dark:text-gray-500" />
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Preview unavailable — rendering fallback shown below.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!file) return;
                const url = URL.createObjectURL(file);
                setFallbackUrl(url);
              }}
              className="btn-outline text-xs"
            >
              <Download className="h-3.5 w-3.5" /> Load Fallback
            </button>
            <button onClick={handleDownload} className="btn-outline text-xs">
              <Download className="h-3.5 w-3.5" /> Download Original
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 bg-gray-100 dark:bg-gray-900"
        >
          <Document
            file={file}
            onLoadSuccess={({ numPages }) => { setNumPages(numPages); setHasError(false); }}
            onLoadError={() => setHasError(true)}
            loading={
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-xs">Loading PDF…</p>
              </div>
            }
          >
            {numPages && Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
              <div key={pageNum} className="mb-3 shadow-md">
                <Page
                  pageNumber={pageNum}
                  width={fitWidth ? containerWidth : undefined}
                  scale={fitWidth ? undefined : scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                  loading={
                    <div style={{ width: containerWidth, height: 200 }}
                         className="flex items-center justify-center bg-white dark:bg-gray-800">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                  }
                />
              </div>
            ))}
          </Document>
        </div>
      )}
    </div>
  );
}
