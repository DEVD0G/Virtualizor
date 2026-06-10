import RFB from '@novnc/novnc';
import { useEffect, useRef, useState } from 'react';

interface Props {
  wsUrl: string;
  onClose: () => void;
}

type ConnState = 'connecting' | 'connected' | 'disconnected' | 'error';

export default function VncConsole({ wsUrl, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [connState, setConnState] = useState<ConnState>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const rfb = new RFB(containerRef.current, wsUrl, {
      wsProtocols: ['binary'],
    });
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.qualityLevel = 6;
    rfbRef.current = rfb;

    rfb.addEventListener('connect', () => setConnState('connected'));
    rfb.addEventListener('disconnect', (e: Event) => {
      const detail = (e as CustomEvent<{ clean: boolean }>).detail;
      setConnState(detail.clean ? 'disconnected' : 'error');
      if (!detail.clean) setErrorMsg('Verbindung unerwartet getrennt');
    });
    rfb.addEventListener('credentialsrequired', () => {
      rfb.sendCredentials({ password: '' });
    });

    return () => {
      rfb.disconnect();
      rfbRef.current = null;
    };
  }, [wsUrl]);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement && wrapperRef.current) {
      wrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => undefined);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => undefined);
    }
  }

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      rfbRef.current?.clipboardPasteFrom(text);
    } catch {
      // clipboard read denied — ignore
    }
  }

  return (
    <div ref={wrapperRef} className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Toolbar */}
      <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 border-b border-slate-700 flex-shrink-0">
        <span className="text-sm font-medium text-slate-200">Konsole</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
          connState === 'connected'  ? 'bg-emerald-500/20 text-emerald-400' :
          connState === 'connecting' ? 'bg-yellow-500/20 text-yellow-400'  :
          connState === 'error'      ? 'bg-red-500/20 text-red-400'        :
                                       'bg-slate-700 text-slate-400'
        }`}>
          {connState === 'connecting' ? 'Verbinde…' :
           connState === 'connected'  ? 'Verbunden' :
           connState === 'error'      ? 'Fehler'    : 'Getrennt'}
        </span>
        {connState === 'connected' && (
          <>
            <button
              className="ml-4 text-xs btn-secondary"
              onClick={() => rfbRef.current?.sendCtrlAltDel()}
              title="Ctrl+Alt+Del senden"
            >
              Ctrl+Alt+Del
            </button>
            <button
              className="text-xs btn-secondary"
              onClick={pasteClipboard}
              title="Zwischenablage in Konsole einfügen"
            >
              Einfügen
            </button>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <button
            className="text-xs btn-secondary"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
          >
            {isFullscreen ? '⛶ Vollbild beenden' : '⛶ Vollbild'}
          </button>
          <button className="text-xs btn-secondary" onClick={onClose}>Schließen</button>
        </div>
      </div>

      {/* noVNC canvas target */}
      {connState === 'error' && (
        <div className="flex flex-1 items-center justify-center text-red-400 text-sm">
          {errorMsg || 'Verbindungsfehler'}
        </div>
      )}
      {connState === 'disconnected' && (
        <div className="flex flex-1 items-center justify-center text-slate-400 text-sm">
          Verbindung getrennt
        </div>
      )}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden ${connState !== 'connected' && connState !== 'connecting' ? 'hidden' : ''}`}
      />
    </div>
  );
}
