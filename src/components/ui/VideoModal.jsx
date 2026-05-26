import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';

// Converts share URLs (YouTube / Vimeo / Loom) into their embeddable form.
// Anything that doesn't match falls through unchanged.
const toEmbedUrl = (raw) => {
  if (!raw) return raw;
  let url;
  try { url = new URL(raw); } catch { return raw; }
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    return `https://www.youtube.com/embed/${url.pathname.replace(/^\//, '')}`;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const v = url.searchParams.get('v');
    if (v) return `https://www.youtube.com/embed/${v}`;
    if (url.pathname.startsWith('/embed/')) return raw;
    if (url.pathname.startsWith('/shorts/')) {
      return `https://www.youtube.com/embed/${url.pathname.replace('/shorts/', '')}`;
    }
  }
  if (host === 'vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    if (id) return `https://player.vimeo.com/video/${id}`;
  }
  if (host === 'loom.com') {
    return raw.replace('/share/', '/embed/');
  }
  return raw;
};

export const VideoModal = ({ isOpen, src, title, onClose }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement) close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const close = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch {}
    }
    onClose?.();
  };

  const toggleFullscreen = async () => {
    if (!modalRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await modalRef.current.requestFullscreen();
    } catch {}
  };

  if (!isOpen) return null;
  const embedSrc = toEmbedUrl(src);

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

        <div className="flex-1 relative bg-black">
          {embedSrc && (
            <iframe
              src={embedSrc}
              title={title}
              className="w-full h-full border-0"
              style={{ display: 'block' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
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
