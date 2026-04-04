import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import api from '../services/api';

/**
 * WAChatLog
 * Shows the WhatsApp conversation history with the seller for a given PO.
 * Messages are fetched from GET /api/purchase-orders/:id/whatsapp-chat
 * and displayed as chat bubbles (outgoing = right/blue, incoming = left/gray).
 *
 * @param {{ po: object }} props
 */
export default function WAChatLog({ po }) {
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const bottomRef = useRef(null);

  const fetchMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const params = po?.vendor_id ? `?vendor_id=${encodeURIComponent(po.vendor_id)}` : '';
      const res = await api.get(`/purchase-orders/${po.purchaseorder_id}/whatsapp-chat${params}`);
      setMessages(res.data?.messages || []);
    } catch (err) {
      setError('Could not load WhatsApp messages.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (po?.purchaseorder_id) fetchMessages();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      if (po?.purchaseorder_id) fetchMessages(true);
    }, 30_000);
    return () => clearInterval(interval);
  }, [po?.purchaseorder_id]);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!po?.purchaseorder_id) return null;

  return (
    <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-green-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            WhatsApp Chat
          </span>
          {messages.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ({messages.length} message{messages.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <button
          onClick={() => fetchMessages(true)}
          disabled={refreshing}
          title="Refresh"
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Chat body ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 px-4 py-4 max-h-96 overflow-y-auto bg-[#ece5dd] dark:bg-gray-900/60">

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full" />
          </div>
        )}

        {!loading && error && (
          <p className="text-center text-sm text-red-500 py-4">{error}</p>
        )}

        {!loading && !error && messages.length === 0 && (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
            No WhatsApp messages yet.
          </p>
        )}

        {!loading && !error && messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Single message bubble ────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isOut = msg.direction === 'out';

  const timeStr = (() => {
    try {
      const d = new Date(msg.timestamp);
      return d.toLocaleString('en-IN', {
        day:    '2-digit',
        month:  'short',
        hour:   '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  })();

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm text-sm whitespace-pre-wrap break-words',
          isOut
            ? 'bg-[#dcf8c6] dark:bg-green-800 text-gray-800 dark:text-gray-100 rounded-br-sm'
            : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm',
        ].join(' ')}
      >
        {/* Direction label for outgoing */}
        {isOut && (
          <p className="text-[10px] font-semibold text-green-700 dark:text-green-300 mb-0.5 uppercase tracking-wide">
            JODL
          </p>
        )}

        {/* Message body */}
        <p>{msg.body}</p>

        {/* Timestamp */}
        <p className={`text-[10px] mt-1 text-right ${isOut ? 'text-green-700 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
          {timeStr}
        </p>
      </div>
    </div>
  );
}
