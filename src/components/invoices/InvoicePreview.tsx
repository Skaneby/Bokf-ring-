import React, { useEffect, useRef, useState } from 'react';

// Fakturamallen är A4-bred (~800px). På smala skärmar (iPad/mobil) ser en 1:1-iframe
// hopklämd ut. Vi renderar därför fakturan i sin fulla logiska bredd och SKALAR ner
// den med CSS-transform så att hela sidan alltid får plats och ser ut som den ska —
// oavsett skärmstorlek och oavsett om fakturan är nyskapad eller arkiverad.
const LOGICAL_WIDTH = 800;

export function InvoicePreview({ html, className = '' }: { html: string; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [docHeight, setDocHeight] = useState(1120);

  // Skala = containerbredd / logisk bredd (aldrig över 1 → förstora inte små skärmar)
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setScale(Math.min(1, box.clientWidth / LOGICAL_WIDTH));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // Mät fakturans verkliga höjd när den laddats (srcdoc-iframe är same-origin)
  const measure = () => {
    const doc = iframeRef.current?.contentDocument;
    if (doc?.body) {
      setDocHeight(Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight ?? 0, 400));
    }
  };

  return (
    <div ref={boxRef} className={className} style={{ overflow: 'hidden' }}>
      {/* Yttre boxen har den SKALADE storleken → ingen tom yta under fakturan */}
      <div style={{ width: LOGICAL_WIDTH * scale, height: docHeight * scale, margin: '0 auto' }}>
        <iframe
          ref={iframeRef}
          title="Förhandsvisning av faktura"
          srcDoc={html}
          onLoad={measure}
          style={{
            width: LOGICAL_WIDTH,
            height: docHeight,
            border: 0,
            background: '#fff',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  );
}
