import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const score = parseInt(searchParams.get('score') || '0');
  const window = searchParams.get('window') || '';
  const location = searchParams.get('location') || 'Your area';
  const label = searchParams.get('label') || '';

  // Score color
  const col = score >= 80 ? '#3dd68c' : score >= 65 ? '#a8e060' : score >= 45 ? '#f0c040' : '#e05858';
  const scoreLabel = score >= 80 ? 'PERFECT' : score >= 65 ? 'GOOD' : score >= 45 ? 'FAIR' : 'SKIP IT';
  const hasScore = score > 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#050c08',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px 80px',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div style={{
          position: 'absolute', top: '-100px', left: '-100px',
          width: '500px', height: '500px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(61,214,140,0.12) 0%, transparent 70%)',
          display: 'flex',
        }}/>
        <div style={{
          position: 'absolute', bottom: '-80px', right: '-80px',
          width: '400px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(42,171,110,0.08) 0%, transparent 70%)',
          display: 'flex',
        }}/>

        {/* Top row: logo + location */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0px' }}>
            <span style={{ fontSize: '36px', fontWeight: '700', color: '#5a8a68', letterSpacing: '4px', textTransform: 'uppercase' }}>temp</span>
            <span style={{ fontSize: '64px', fontWeight: '900', color: '#3dd68c', letterSpacing: '2px', textTransform: 'uppercase', fontStyle: 'italic', lineHeight: '1', margin: '0 4px' }}>RUN</span>
            <span style={{ fontSize: '36px', fontWeight: '700', color: '#5a8a68', letterSpacing: '4px', textTransform: 'uppercase' }}>ture</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '18px', color: '#5a8a68', letterSpacing: '2px', fontFamily: 'monospace' }}>📍 {location}</div>
            {label && <div style={{ fontSize: '16px', color: '#1e3828', marginTop: '6px', fontFamily: 'monospace', letterSpacing: '1px' }}>{label.toUpperCase()}</div>}
          </div>
        </div>

        {hasScore ? (
          /* Score layout */
          <div style={{ display: 'flex', alignItems: 'center', gap: '80px', flex: '1' }}>
            {/* Score circle */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '220px', height: '220px', borderRadius: '50%',
                border: `12px solid ${col}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 60px ${col}40`,
                background: `${col}08`,
              }}>
                <div style={{ fontSize: '80px', fontWeight: '900', color: col, lineHeight: '1', fontFamily: 'monospace' }}>{score}</div>
                <div style={{ fontSize: '18px', color: '#5a8a68', fontFamily: 'monospace', letterSpacing: '2px' }}>/100</div>
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: col, letterSpacing: '4px', fontFamily: 'monospace' }}>{scoreLabel}</div>
            </div>

            {/* Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: '1' }}>
              <div>
                <div style={{ fontSize: '16px', color: '#5a8a68', letterSpacing: '3px', fontFamily: 'monospace', marginBottom: '12px' }}>BEST WINDOW</div>
                <div style={{ fontSize: '72px', fontWeight: '300', color: '#c8e8d0', lineHeight: '1', letterSpacing: '-2px' }}>{window || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {['Rain', 'Wind', 'Temp', 'Air Quality', 'Pollen'].map(f => (
                  <div key={f} style={{
                    background: 'rgba(61,214,140,0.08)', border: '1px solid rgba(61,214,140,0.2)',
                    borderRadius: '8px', padding: '8px 16px',
                    fontSize: '15px', color: '#3dd68c', fontFamily: 'monospace', letterSpacing: '1px',
                    display: 'flex',
                  }}>{f}</div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* No score — generic card */
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: '1', gap: '24px' }}>
            <div style={{ fontSize: '56px', fontWeight: '700', color: '#c8e8d0', lineHeight: '1.2', maxWidth: '800px' }}>
              Know exactly when to run.
            </div>
            <div style={{ fontSize: '28px', color: '#5a8a68', fontFamily: 'monospace', lineHeight: '1.6', maxWidth: '700px' }}>
              Scores every hour based on rain, wind, temp, air quality & pollen. Free. Works anywhere.
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
              {['⏰ Best window', '👕 What to wear', '🧭 Start direction', '💚 Air quality'].map(f => (
                <div key={f} style={{
                  background: 'rgba(61,214,140,0.08)', border: '1px solid rgba(61,214,140,0.2)',
                  borderRadius: '10px', padding: '12px 20px',
                  fontSize: '18px', color: '#3dd68c', fontFamily: 'monospace',
                  display: 'flex',
                }}>{f}</div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom: URL */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '32px' }}>
          <div style={{ fontSize: '18px', color: '#1e3828', fontFamily: 'monospace', letterSpacing: '2px' }}>temprunture.com</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
