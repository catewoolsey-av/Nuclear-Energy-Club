import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { authFetch } from '../../supabase';

// Document viewer modal. Loads the PDF through the watermark proxy
// (/api/doc-view?id=<material_id>), wraps the bytes in a blob URL, and
// renders them in an iframe. The blob URL is revoked on close.
//
// Chrome:
//   - Header with title, fullscreen toggle, close button
//   - Resizable corner (CSS resize: both) constrained to a min size
//   - Fullscreen via the Fullscreen API (true OS-level)
//   - Esc closes the modal (browser handles fullscreen Esc first)
//   - Click on backdrop closes
//   - Right-click on the iframe area suppressed
export const DocumentModal = ({ isOpen, materialId, directUrl, title, onClose }) => {
  const [blobUrl, setBlobUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalRef = useRef(null);
  const blobUrlRef = useRef('');

  // Fetch watermarked PDF bytes and turn into a blob URL.
  useEffect(() => {
    if (!isOpen) return;
    if (!materialId && !directUrl) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setBlobUrl('');

    // Legacy fallback: no material id, only a raw URL. Skip the proxy and
    // iframe the URL directly. No watermark protection in this branch.
    if (!materialId && directUrl) {
      setBlobUrl(`${directUrl}#toolbar=0&navpanes=0&statusbar=0`);
      setLoading(false);
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const res = await authFetch(`/api/doc-view?id=${encodeURIComponent(materialId)}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to load (${res.status}): ${text.slice(0, 200)}`);
        }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        // Append PDF viewer hints — Chrome honors these to suppress the
        // built-in toolbar; Safari ignores them but it doesn't hurt.
        setBlobUrl(`${url}#toolbar=0&navpanes=0&statusbar=0`);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load document');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = '';
      }
    };
  }, [isOpen, materialId, directUrl]);

  // Esc to close — browser handles Esc-while-fullscreen first.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  // Track fullscreen state to swap icon.
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const close = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch {}
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = '';
    }
    setBlobUrl('');
    onClose?.();
  };

  const toggleFullscreen = async () => {
    if (!modalRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await modalRef.current.requestFullscreen();
      }
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div
      className="doc-modal-backdrop fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        ref={modalRef}
        className="doc-modal bg-white rounded-xl shadow-2xl flex flex-col"
        style={{
          width: 'min(1100px, 92vw)',
          height: 'min(820px, 88vh)',
          minWidth: 420,
          minHeight: 320,
          resize: isFullscreen ? 'none' : 'both',
          overflow: 'hidden',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
          <h2 className="text-base font-semibold text-gray-900 truncate pr-3">{title}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              onClick={close}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Close"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div
          className="flex-1 relative bg-gray-50"
          onContextMenu={(e) => { e.preventDefault(); return false; }}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
              Loading document…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 px-6 text-center">
              {error}
            </div>
          )}
          {blobUrl && !error && (
            <iframe
              src={blobUrl}
              title={title}
              className="w-full h-full border-0"
              style={{ display: 'block' }}
            />
          )}
        </div>
      </div>

      <style>{`
        .doc-modal:fullscreen {
          width: 100vw !important;
          height: 100vh !important;
          max-width: 100vw !important;
          max-height: 100vh !important;
          border-radius: 0 !important;
          resize: none !important;
        }
      `}</style>
    </div>
  );
};
