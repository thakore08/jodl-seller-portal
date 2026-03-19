/**
 * invoiceMatchingService.js
 *
 * Matches extracted invoice line items against PO line items using
 * steel-product-specific attribute scoring (brand, grade, thickness/width
 * for flat products; brand, grade, diameter for TMT rebars).
 *
 * Exports:
 *   matchLineItems(extractedItems, poLineItems)  →  MatchResult[]
 */

'use strict';

const { parseProductAttributes } = require('./pdfExtractorService');

// ─── Scoring weights ──────────────────────────────────────────────────────────
const FLAT_WEIGHTS = {
  brand:     40,
  grade:     30,
  thickness: 20,
  width:     10,
};

const TMT_WEIGHTS = {
  brand:    40,
  grade:    40,
  diameter: 20,
};

// ─── Tolerances ───────────────────────────────────────────────────────────────
const THICKNESS_TOLERANCE_MM = 0.1;
const WIDTH_TOLERANCE_MM     = 0.1;
// Diameter is exact — no tolerance

// ─── Score thresholds ─────────────────────────────────────────────────────────
const FULL_MATCH_THRESHOLD    = 100;
const PARTIAL_MATCH_THRESHOLD =  60;

// ─── Levenshtein distance (fallback for unknown product types) ─────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase(), s2 = b.toLowerCase();
  if (s1 === s2) return 1;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return (maxLen - levenshtein(s1, s2)) / maxLen;
}

// ─── Score a single extracted item against a single PO item ──────────────────
/**
 * @param {object} invParsed   — from pdfExtractorService.parseProductAttributes
 * @param {object} poParsed    — from pdfExtractorService.parseProductAttributes
 * @param {'flat'|'tmt'|'unknown'} productType
 * @returns {{ score: number, matched: string[], missing: string[] }}
 */
function scoreAttributes(invParsed, poParsed, productType) {
  if (productType === 'flat') {
    return scoreFlatProduct(invParsed, poParsed);
  }
  if (productType === 'tmt') {
    return scoreTmtProduct(invParsed, poParsed);
  }
  // Unknown — use Levenshtein description similarity as a proxy (max 60 pts)
  return { score: 0, matched: [], missing: [] }; // handled in caller via description sim
}

function scoreFlatProduct(inv, po) {
  let score = 0;
  const matched = [], missing = [];

  // Brand
  if (inv.brand && po.brand) {
    if (inv.brand === po.brand) { score += FLAT_WEIGHTS.brand; matched.push('brand'); }
    else missing.push('brand');
  } else if (inv.brand || po.brand) {
    missing.push('brand');
  }

  // Grade
  if (inv.grade && po.grade) {
    if (inv.grade === po.grade) { score += FLAT_WEIGHTS.grade; matched.push('grade'); }
    else missing.push('grade');
  } else if (inv.grade || po.grade) {
    missing.push('grade');
  }

  // Thickness
  if (inv.thickness_mm != null && po.thickness_mm != null) {
    if (Math.abs(inv.thickness_mm - po.thickness_mm) <= THICKNESS_TOLERANCE_MM) {
      score += FLAT_WEIGHTS.thickness; matched.push('thickness');
    } else {
      missing.push('thickness');
    }
  } else if (inv.thickness_mm != null || po.thickness_mm != null) {
    missing.push('thickness');
  }

  // Width
  if (inv.width_mm != null && po.width_mm != null) {
    if (Math.abs(inv.width_mm - po.width_mm) <= WIDTH_TOLERANCE_MM) {
      score += FLAT_WEIGHTS.width; matched.push('width');
    } else {
      missing.push('width');
    }
  } else if (inv.width_mm != null || po.width_mm != null) {
    missing.push('width');
  }

  return { score, matched, missing };
}

function scoreTmtProduct(inv, po) {
  let score = 0;
  const matched = [], missing = [];

  // Brand
  if (inv.brand && po.brand) {
    if (inv.brand === po.brand) { score += TMT_WEIGHTS.brand; matched.push('brand'); }
    else missing.push('brand');
  } else if (inv.brand || po.brand) {
    missing.push('brand');
  }

  // Grade
  if (inv.grade && po.grade) {
    if (inv.grade === po.grade) { score += TMT_WEIGHTS.grade; matched.push('grade'); }
    else missing.push('grade');
  } else if (inv.grade || po.grade) {
    missing.push('grade');
  }

  // Diameter (exact — no tolerance for rebar sizes)
  if (inv.diameter_mm != null && po.diameter_mm != null) {
    if (inv.diameter_mm === po.diameter_mm) { score += TMT_WEIGHTS.diameter; matched.push('diameter'); }
    else missing.push('diameter');
  } else if (inv.diameter_mm != null || po.diameter_mm != null) {
    missing.push('diameter');
  }

  return { score, matched, missing };
}

// ─── Rate / qty delta helpers ─────────────────────────────────────────────────
function deltaPct(invVal, poVal) {
  if (poVal == null || poVal === 0 || invVal == null) return null;
  return parseFloat((((invVal - poVal) / poVal) * 100).toFixed(2));
}

function buildWarnings(invItem, poItem, rateDelta, qtyDelta) {
  const warnings = [];
  if (rateDelta != null && Math.abs(rateDelta) > 0.5) {
    const invRate = invItem.unit_rate?.value;
    const poRate  = parseFloat(poItem.rate);
    warnings.push({
      field:   'rate',
      message: `Rate ₹${(invRate || 0).toLocaleString('en-IN')} vs ₹${(poRate || 0).toLocaleString('en-IN')} on PO (${rateDelta > 0 ? '+' : ''}${rateDelta}%)`,
    });
  }
  if (qtyDelta != null && Math.abs(qtyDelta) > 0.5) {
    const invQty = invItem.quantity?.value;
    const poQty  = parseFloat(poItem.quantity);
    warnings.push({
      field:   'quantity',
      message: `Qty ${invQty} vs ${poQty} on PO (${qtyDelta > 0 ? '+' : ''}${qtyDelta}%)`,
    });
  }
  return warnings;
}

// ─── Main matching function ───────────────────────────────────────────────────
/**
 * Match each extracted invoice line item to the best PO line item.
 *
 * @param {object[]} extractedItems  — from pdfExtractorService (has .parsed, .unit_rate, .quantity, .raw_description)
 * @param {object[]} poLineItems     — Zoho Books PO line items ({ item_id, name, description, rate, quantity, unit })
 * @returns {MatchResult[]}
 */
function matchLineItems(extractedItems, poLineItems) {
  if (!Array.isArray(extractedItems) || !Array.isArray(poLineItems)) return [];

  // Pre-parse PO item descriptions
  const poParsed = poLineItems.map(item =>
    parseProductAttributes((item.description || item.name || ''))
  );

  return extractedItems.map((invItem, invIdx) => {
    const invParsed = invItem.parsed || parseProductAttributes(invItem.raw_description || '');
    const productType = invParsed.product_type !== 'unknown'
      ? invParsed.product_type
      : (poParsed.some(p => p.product_type !== 'unknown') ? 'unknown' : 'unknown');

    let bestScore    = -1;
    let bestPoIdx    = null;
    let bestMatched  = [];
    let bestMissing  = [];

    for (let poIdx = 0; poIdx < poLineItems.length; poIdx++) {
      const poParsedItem = poParsed[poIdx];

      let score, matched, missing;

      if (productType !== 'unknown') {
        const result = scoreAttributes(invParsed, poParsedItem, productType);
        score   = result.score;
        matched = result.matched;
        missing = result.missing;
      } else {
        // Fallback: Levenshtein on raw description vs PO name/description
        const poDesc = (poLineItems[poIdx].description || poLineItems[poIdx].name || '').toLowerCase();
        const invDesc = (invItem.raw_description || '').toLowerCase();
        const sim = stringSimilarity(invDesc, poDesc);
        score   = Math.round(sim * 100);
        matched = [];
        missing = [];
      }

      if (score > bestScore) {
        bestScore   = score;
        bestPoIdx   = poIdx;
        bestMatched = matched;
        bestMissing = missing;
      }
    }

    // Determine match type
    let matchType;
    if (poLineItems.length === 0) {
      matchType = 'no_match';
      bestPoIdx = null;
    } else if (bestScore >= FULL_MATCH_THRESHOLD) {
      matchType = 'full_match';
    } else if (bestScore >= PARTIAL_MATCH_THRESHOLD) {
      matchType = 'partial_match';
    } else {
      // For unknown product type with low Levenshtein score, still partial if > 60
      matchType = bestScore >= PARTIAL_MATCH_THRESHOLD ? 'partial_match' : 'no_match';
      if (matchType === 'no_match') bestPoIdx = null;
    }

    // Rate and qty deltas against best-matched PO item
    const matchedPoItem = bestPoIdx != null ? poLineItems[bestPoIdx] : null;
    const rateDelta = matchedPoItem
      ? deltaPct(invItem.unit_rate?.value, parseFloat(matchedPoItem.rate))
      : null;
    const qtyDelta = matchedPoItem
      ? deltaPct(invItem.quantity?.value, parseFloat(matchedPoItem.quantity))
      : null;

    const warnings = matchedPoItem
      ? buildWarnings(invItem, matchedPoItem, rateDelta, qtyDelta)
      : [];

    return {
      invoice_item_index:    invIdx,
      po_item_index:         bestPoIdx,
      match_type:            matchType,
      score:                 bestScore,
      matched_attributes:    bestMatched,
      missing_attributes:    bestMissing,
      rate_delta_pct:        rateDelta,
      qty_delta_pct:         qtyDelta,
      warnings,
      confirmed:             false,
      acknowledged:          false,
      manual_mapping_po_index: null,
    };
  });
}

module.exports = { matchLineItems };
