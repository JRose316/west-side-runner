import { useState, useEffect } from "react";

// ── Weather Engine ────────────────────────────────────────────────────────────
const WEIGHTS = { precipitation: 0.35, wind: 0.25, temperature: 0.20, humidity: 0.12, uv: 0.08 };
const NYC_MONTHLY = {
  0:  { base: 34, swing: 6,  rainDays: 0.35, windBase: 13, humBase: 62, uvPeak: 2,  prevailDeg: 315 }, // NW
  1:  { base: 36, swing: 7,  rainDays: 0.32, windBase: 13, humBase: 60, uvPeak: 3,  prevailDeg: 300 }, // NNW
  2:  { base: 44, swing: 8,  rainDays: 0.38, windBase: 14, humBase: 58, uvPeak: 4,  prevailDeg: 270 }, // W
  3:  { base: 54, swing: 9,  rainDays: 0.38, windBase: 13, humBase: 55, uvPeak: 6,  prevailDeg: 250 }, // WSW
  4:  { base: 64, swing: 9,  rainDays: 0.35, windBase: 11, humBase: 57, uvPeak: 7,  prevailDeg: 230 }, // SW
  5:  { base: 73, swing: 8,  rainDays: 0.30, windBase: 10, humBase: 60, uvPeak: 9,  prevailDeg: 225 }, // SW
  6:  { base: 79, swing: 7,  rainDays: 0.35, windBase: 9,  humBase: 63, uvPeak: 10, prevailDeg: 220 }, // SW
  7:  { base: 77, swing: 7,  rainDays: 0.35, windBase: 9,  humBase: 64, uvPeak: 9,  prevailDeg: 225 }, // SW
  8:  { base: 71, swing: 8,  rainDays: 0.30, windBase: 9,  humBase: 63, uvPeak: 7,  prevailDeg: 240 }, // WSW
  9:  { base: 61, swing: 9,  rainDays: 0.32, windBase: 10, humBase: 61, uvPeak: 5,  prevailDeg: 270 }, // W
  10: { base: 51, swing: 8,  rainDays: 0.35, windBase: 12, humBase: 62, uvPeak: 3,  prevailDeg: 295 }, // WNW
  11: { base: 41, swing: 7,  rainDays: 0.35, windBase: 13, humBase: 63, uvPeak: 2,  prevailDeg: 315 }, // NW
};

// Cardinal compass label from degrees (direction wind is COMING FROM)
function compassLabel(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// North-south component: positive = wind blowing northward (from south), negative = blowing southward (from north)
// windDeg = direction wind is coming FROM
function nsComponent(windDeg) {
  // Convert "coming from" to "going toward" vector, extract N/S component
  const goingDeg = (windDeg + 180) % 360;
  return Math.sin((goingDeg * Math.PI) / 180); // positive = northward
}

function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function generateDay(date) {
  const m = NYC_MONTHLY[date.getMonth()];
  const rand = seededRand(date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate());
  const isRainy = rand() < m.rainDays;
  const rainIntensity = isRainy ? 0.4 + rand() * 0.6 : 0;
  const windMod = 0.7 + rand() * 0.6;
  const tempOffset = (rand() - 0.5) * m.swing * 2;
  // Daily wind direction: prevailing ± up to 45° variation
  const windDeg = Math.round((m.prevailDeg + (rand() - 0.5) * 90 + 360) % 360);

  const hours = Array.from({ length: 17 }, (_, i) => {
    const hr = i + 5;
    const tempCurve = -Math.cos(((hr - 6) / 9) * Math.PI) * m.swing;
    const temp = Math.round(m.base + tempOffset + tempCurve);
    const rainCurve = isRainy ? 30 + rainIntensity * 50 * Math.sin(((hr - 8) / 13) * Math.PI) : 5 + rand() * 8;
    const pp = Math.round(Math.max(0, Math.min(95, rainCurve)));
    const wind = Math.round(Math.max(3, m.windBase * windMod * (0.7 + 0.3 * Math.sin(((hr - 8) / 13) * Math.PI))));
    const humBase = m.humBase + (isRainy ? 12 : 0);
    const hum = Math.round(Math.max(30, Math.min(95, humBase - (temp - m.base) * 0.4)));
    const uvCurve = hr >= 7 && hr <= 19 ? Math.sin(((hr - 7) / 12) * Math.PI) : 0;
    const uv = isRainy ? 0 : parseFloat((m.uvPeak * uvCurve).toFixed(1));
    return { hr, t: temp, p: pp, w: wind, h: hum, u: uv };
  });

  return { hours, windDeg, windLabel: compassLabel(windDeg) };
}

function scoreHour(h) {
  const p = Math.max(0, 100 - h.p * 0.8);
  const w = Math.max(0, 100 - h.w * 4);
  const t = Math.max(0, 100 - Math.abs(h.t - 62.5) * 3.5);
  const hm = Math.max(0, 100 - h.h * 0.9);
  const u = Math.max(0, 100 - h.u * 9);
  return {
    total: Math.round(p * WEIGHTS.precipitation + w * WEIGHTS.wind + t * WEIGHTS.temperature + hm * WEIGHTS.humidity + u * WEIGHTS.uv),
    bd: { precipitation: Math.round(p), wind: Math.round(w), temperature: Math.round(t), humidity: Math.round(hm), uv: Math.round(u) },
  };
}

function processHours(arr) {
  const hours = arr.map(h => { const s = scoreHour(h); return { ...h, score: s.total, bd: s.bd }; });
  let best = null;
  for (let i = 0; i < hours.length - 1; i++) {
    const avg = Math.round((hours[i].score + hours[i + 1].score) / 2);
    if (!best || avg > best.avgScore) best = { startIdx: i, avgScore: avg };
  }
  return { hours, best };
}

function fmt12(h) {
  if (h === 0 || h === 24) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

// ── Direction Logic ───────────────────────────────────────────────────────────
// West Side Highway runs roughly N-S. We want to START into the wind.
// If wind is blowing northward (from south) → start heading SOUTH (into wind)
// If wind is blowing southward (from north) → start heading NORTH (into wind)
// If wind is mostly east/west → pick whichever makes best scenic use (default North for Hudson views)
function getDirectionRec(windDeg, windSpeed) {
  const ns = nsComponent(windDeg); // positive=northward wind, negative=southward wind
  const absNS = Math.abs(ns);

  if (windSpeed < 6) {
    return {
      startDir: "EITHER",
      arrow: "↕",
      headline: "Wind is calm",
      sub: "No strong preference — start whichever direction you like.",
      detail: "Light winds mean both directions feel the same. Enjoy the run!",
      color: null, // use accent
    };
  }

  if (absNS < 0.35) {
    // Predominantly east/west wind — minimal N/S impact
    return {
      startDir: "NORTH",
      arrow: "↑",
      headline: "Head North first",
      sub: `${compassLabel(windDeg)} wind has little N/S push — start north for the best scenery.`,
      detail: "The cross-wind won't matter much on the WSH. Starting north gives you the George Washington Bridge views on the return.",
      color: null,
    };
  }

  if (ns < 0) {
    // Wind blowing southward → headwind going south → start SOUTH (into wind while fresh)
    return {
      startDir: "SOUTH",
      arrow: "↓",
      headline: "Head South first",
      sub: `${compassLabel(windDeg)} wind is pushing south — run into it while you're fresh.`,
      detail: "You'll fight the headwind on the way out when your legs are strong, then cruise back north with the wind at your back.",
      color: null,
    };
  } else {
    // Wind blowing northward → headwind going north → start NORTH (into wind while fresh)
    return {
      startDir: "NORTH",
      arrow: "↑",
      headline: "Head North first",
      sub: `${compassLabel(windDeg)} wind is pushing north — run into it while you're fresh.`,
      detail: "You'll fight the headwind heading uptown while your legs are strong, then get a tailwind boost on the way back south.",
      color: null,
    };
  }
}

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg: "#050c08", surface: "#08120a", surface2: "#0d1a10",
  border: "#142018", border2: "#1e3024",
  green: "#3dd68c", greenBright: "#56f0a4", greenMid: "#2aab6e",
  greenDim: "#165c38", greenDeep: "#0a3320",
  text: "#c8e8d0", muted: "#4a7a58", dim: "#1e3828",
  great: "#3dd68c", good: "#a8e060", fair: "#f0c040", skip: "#e05858",
};
function scoreColor(s) {
  if (s >= 80) return C.great; if (s >= 65) return C.good;
  if (s >= 45) return C.fair; return C.skip;
}
function scoreLabel(s) {
  if (s >= 80) return "PERFECT"; if (s >= 65) return "GOOD";
  if (s >= 45) return "FAIR"; return "SKIP IT";
}

// ── Score Arc ─────────────────────────────────────────────────────────────────
function ScoreArc({ score, color, animate }) {
  const R = 88, CX = 100, CY = 100, startAngle = -220, totalAngle = 260;
  const toRad = d => d * Math.PI / 180;
  const ptOn = d => ({ x: CX + R * Math.cos(toRad(d)), y: CY + R * Math.sin(toRad(d)) });
  const arcPath = (from, to) => {
    const s = ptOn(from), e = ptOn(to);
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${Math.abs(to - from) > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
  };
  const circ = 2 * Math.PI * R;
  const filled = (totalAngle / 360) * circ * (score / 100);
  return (
    <svg width="200" height="200" style={{ overflow: "visible" }}>
      <defs>
        <filter id="glow2"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d={arcPath(startAngle, startAngle + totalAngle)} fill="none" stroke={C.border2} strokeWidth="5" strokeLinecap="round"/>
      <path d={arcPath(startAngle, startAngle + totalAngle)} fill="none" stroke={C.greenDeep} strokeWidth="12" strokeLinecap="round" opacity="0.5"/>
      <path d={arcPath(startAngle, startAngle + totalAngle)} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`} filter="url(#glow2)"
        style={{ transition: animate ? "stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)" : "none" }}/>
      {[0,20,40,60,80,100].map(pct => {
        const angle = startAngle + totalAngle * pct / 100;
        const inn = { x: CX + (R-8)*Math.cos(toRad(angle)), y: CY + (R-8)*Math.sin(toRad(angle)) };
        const out = { x: CX + (R+4)*Math.cos(toRad(angle)), y: CY + (R+4)*Math.sin(toRad(angle)) };
        return <line key={pct} x1={inn.x} y1={inn.y} x2={out.x} y2={out.y} stroke={C.border2} strokeWidth="1.5"/>;
      })}
    </svg>
  );
}

function AnimNum({ value, duration = 1200 }) {
  const [d, setD] = useState(0);
  useEffect(() => {
    let start = null;
    const step = ts => {
      if (!start) start = ts;
      const pct = Math.min((ts - start) / duration, 1);
      setD(Math.round((1 - Math.pow(1 - pct, 3)) * value));
      if (pct < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <span>{d}</span>;
}

// ── Wind Rose Mini ────────────────────────────────────────────────────────────
function WindRose({ windDeg, windSpeed, accentColor }) {
  const toRad = d => d * Math.PI / 180;
  // Arrow points in direction wind is GOING (opposite of "from")
  const goingDeg = (windDeg + 180) % 360;
  const arrowAngle = toRad(goingDeg - 90);
  const cx = 36, cy = 36, r = 26;
  const tipX = cx + r * Math.cos(arrowAngle);
  const tipY = cy + r * Math.sin(arrowAngle);
  const tailX = cx - (r * 0.6) * Math.cos(arrowAngle);
  const tailY = cy - (r * 0.6) * Math.sin(arrowAngle);
  const perpX = Math.cos(arrowAngle + Math.PI / 2) * 6;
  const perpY = Math.sin(arrowAngle + Math.PI / 2) * 6;

  return (
    <svg width="72" height="72" style={{ flexShrink: 0 }}>
      <defs>
        <filter id="wglow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={r+4} fill="none" stroke={C.border2} strokeWidth="1"/>
      {/* Cardinal tick marks */}
      {[0,90,180,270].map(deg => {
        const a = toRad(deg - 90);
        const i1x = cx + (r-2)*Math.cos(a), i1y = cy + (r-2)*Math.sin(a);
        const o1x = cx + (r+4)*Math.cos(a), o1y = cy + (r+4)*Math.sin(a);
        return <line key={deg} x1={i1x} y1={i1y} x2={o1x} y2={o1y} stroke={C.border2} strokeWidth="1.5"/>;
      })}
      {/* N/S/E/W labels */}
      {[["N",0],["E",90],["S",180],["W",270]].map(([lbl,deg]) => {
        const a = toRad(deg - 90);
        const lx = cx + (r+12)*Math.cos(a) - 3;
        const ly = cy + (r+12)*Math.sin(a) + 3;
        return <text key={lbl} x={lx} y={ly} fill={C.dim} fontSize="7" fontFamily="JetBrains Mono, monospace" textAnchor="middle">{lbl}</text>;
      })}
      {/* Arrow */}
      <polygon
        points={`${tipX},${tipY} ${tailX + perpX},${tailY + perpY} ${tailX - perpX},${tailY - perpY}`}
        fill={accentColor} filter="url(#wglow)"
      />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r="3" fill={C.surface2} stroke={accentColor} strokeWidth="1.5"/>
    </svg>
  );
}

// ── Direction Tile ────────────────────────────────────────────────────────────
function DirectionTile({ windDeg, windSpeed, windLabel, accentColor, visible }) {
  const rec = getDirectionRec(windDeg, windSpeed);
  const tileColor = rec.startDir === "EITHER" ? accentColor : accentColor;
  const mono = { fontFamily: "'JetBrains Mono', monospace" };
  const cond = { fontFamily: "'Barlow Condensed', sans-serif" };
  const serif = { fontFamily: "'Cormorant Garamond', serif" };

  // Simple WSH path graphic — two endpoints with directional arrow
  const isNorth = rec.startDir === "NORTH";
  const isSouth = rec.startDir === "SOUTH";
  const isEither = rec.startDir === "EITHER";

  return (
    <div style={{
      background: C.surface, borderRadius: 16,
      border: `1px solid ${C.border2}`,
      padding: "20px",
      position: "relative", overflow: "hidden",
    }}>
      {/* Top edge glow */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${tileColor}40, transparent)` }} />

      <div style={{ ...mono, fontSize: 8, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
        Route Direction · West Side Highway
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>

        {/* WSH Route graphic */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, width: 56 }}>
          {/* North label */}
          <div style={{ ...mono, fontSize: 8, color: isNorth ? tileColor : C.dim, letterSpacing: 1, marginBottom: 4, fontWeight: isNorth ? 500 : 300 }}>
            N
          </div>
          {/* North dot */}
          <div style={{
            width: isNorth ? 12 : 8, height: isNorth ? 12 : 8,
            borderRadius: "50%",
            background: isNorth ? tileColor : C.border2,
            border: isNorth ? `2px solid ${tileColor}` : `1px solid ${C.border2}`,
            boxShadow: isNorth ? `0 0 10px ${tileColor}80` : "none",
            transition: "all 0.3s",
            flexShrink: 0,
          }} />
          {/* Route line with arrow */}
          <div style={{ position: "relative", width: 2, height: 64, background: `linear-gradient(180deg, ${isNorth ? tileColor : C.border2}, ${isSouth ? tileColor : C.border2})`, margin: "4px 0" }}>
            {/* Directional arrow on the line */}
            {!isEither && (
              <div style={{
                position: "absolute",
                left: "50%", top: isNorth ? "30%" : "60%",
                transform: "translate(-50%, -50%)",
                color: tileColor, fontSize: 14, lineHeight: 1,
              }}>
                {isNorth ? "▲" : "▼"}
              </div>
            )}
            {isEither && (
              <>
                <div style={{ position: "absolute", left: "50%", top: "25%", transform: "translate(-50%, -50%)", color: C.muted, fontSize: 10 }}>▲</div>
                <div style={{ position: "absolute", left: "50%", top: "75%", transform: "translate(-50%, -50%)", color: C.muted, fontSize: 10 }}>▼</div>
              </>
            )}
          </div>
          {/* South dot */}
          <div style={{
            width: isSouth ? 12 : 8, height: isSouth ? 12 : 8,
            borderRadius: "50%",
            background: isSouth ? tileColor : C.border2,
            border: isSouth ? `2px solid ${tileColor}` : `1px solid ${C.border2}`,
            boxShadow: isSouth ? `0 0 10px ${tileColor}80` : "none",
            transition: "all 0.3s",
            flexShrink: 0,
          }} />
          {/* South label */}
          <div style={{ ...mono, fontSize: 8, color: isSouth ? tileColor : C.dim, letterSpacing: 1, marginTop: 4, fontWeight: isSouth ? 500 : 300 }}>
            S
          </div>
        </div>

        {/* Wind rose */}
        <WindRose windDeg={windDeg} windSpeed={windSpeed} accentColor={tileColor} />

        {/* Text */}
        <div style={{ flex: 1 }}>
          <div style={{ ...cond, fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: 2, lineHeight: 1, textTransform: "uppercase" }}>
            {rec.headline}
          </div>
          <div style={{ ...mono, fontSize: 9, color: tileColor, marginTop: 6, letterSpacing: 0.5, lineHeight: 1.6 }}>
            {windLabel} wind · {windSpeed} mph
          </div>
          <div style={{ ...mono, fontSize: 9, color: C.muted, marginTop: 8, lineHeight: 1.7 }}>
            {rec.detail}
          </div>
        </div>
      </div>

      {/* Logic pill */}
      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`,
        ...mono, fontSize: 8, color: C.text, letterSpacing: 1, lineHeight: 1.8,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: C.greenDim, fontSize: 10 }}>⚡</span>
        Strategy: run into the headwind while your legs are fresh — earn your tailwind on the way home.
      </div>
    </div>
  );
}

// ── Outfit Engine ─────────────────────────────────────────────────────────────
function windChill(tempF, windMph) {
  if (tempF > 50 || windMph < 3) return tempF;
  return Math.round(35.74 + 0.6215*tempF - 35.75*Math.pow(windMph,0.16) + 0.4275*tempF*Math.pow(windMph,0.16));
}

function getOutfit(h) {
  const feel = windChill(h.t, h.w);
  const rainy = h.p > 40;
  const misty = h.p > 20 && h.p <= 40;
  const humid = h.h > 75;
  const uvHigh = h.u > 6;
  const windy = h.w > 15;

  const layers = [];

  // ── Top layer ──
  if (feel <= 25) {
    layers.push({ slot: "Top", icon: "🧥", item: "Heavy insulated jacket", note: "windproof shell essential" });
  } else if (feel <= 35) {
    layers.push({ slot: "Top", icon: "🧥", item: "Thermal running jacket", note: "full zip, wind resistant" });
  } else if (feel <= 45) {
    layers.push({ slot: "Top", icon: "🫙", item: "Running half-zip + base layer", note: "moisture-wicking base underneath" });
  } else if (feel <= 55) {
    layers.push({ slot: "Top", icon: "👕", item: "Long sleeve running shirt", note: feel < 50 ? "consider a light vest" : "lightweight fabric" });
  } else if (feel <= 65) {
    layers.push({ slot: "Top", icon: "👕", item: "Short sleeve + arm warmers", note: "easy to strip arm warmers mid-run" });
  } else if (feel <= 75) {
    layers.push({ slot: "Top", icon: "👕", item: "Short sleeve tech shirt", note: "breathable, light color if sunny" });
  } else {
    layers.push({ slot: "Top", icon: "🎽", item: "Singlet or racerback", note: "max ventilation, stay cool" });
  }

  // ── Rain layer ──
  if (rainy) {
    layers.push({ slot: "Shell", icon: "🌧", item: "Waterproof running jacket", note: "packable, taped seams if possible" });
  } else if (misty) {
    layers.push({ slot: "Shell", icon: "💧", item: "Water-resistant windbreaker", note: "light enough to tie around waist" });
  } else if (windy && feel < 50) {
    layers.push({ slot: "Shell", icon: "💨", item: "Wind shell", note: "blocks chill without overheating" });
  }

  // ── Bottom ──
  if (feel <= 30) {
    layers.push({ slot: "Bottom", icon: "🩲", item: "Thermal tights", note: "full length, wind-blocking front panel" });
  } else if (feel <= 45) {
    layers.push({ slot: "Bottom", icon: "🩲", item: "Running tights", note: "full length" });
  } else if (feel <= 58) {
    layers.push({ slot: "Bottom", icon: "🩲", item: "3/4 tights or capris", note: "or shorts + calf sleeves" });
  } else {
    layers.push({ slot: "Bottom", icon: "🩳", item: "Running shorts", note: humid ? "moisture-wicking liner essential" : "your call on liner vs split" });
  }

  // ── Hands ──
  if (feel <= 35) {
    layers.push({ slot: "Hands", icon: "🧤", item: "Running gloves", note: "thin wind-resistant pair" });
  } else if (feel <= 45) {
    layers.push({ slot: "Hands", icon: "🧤", item: "Light gloves", note: "you'll likely pull these off mid-run" });
  }

  // ── Head ──
  if (feel <= 30) {
    layers.push({ slot: "Head", icon: "🧣", item: "Beanie + neck gaiter", note: "protect ears and neck" });
  } else if (feel <= 42) {
    layers.push({ slot: "Head", icon: "🧢", item: "Running beanie", note: "keeps ears warm" });
  } else if (rainy || misty) {
    layers.push({ slot: "Head", icon: "🧢", item: "Cap with brim", note: "keeps rain off your face" });
  } else if (uvHigh) {
    layers.push({ slot: "Head", icon: "🧢", item: "Running cap", note: "shade your face from UV" });
  }

  // ── Socks ──
  if (rainy) {
    layers.push({ slot: "Socks", icon: "🧦", item: "Moisture-wicking socks", note: "wool blend dries faster when wet" });
  } else if (feel <= 40) {
    layers.push({ slot: "Socks", icon: "🧦", item: "Thermal running socks", note: "slightly thicker for cold" });
  } else {
    layers.push({ slot: "Socks", icon: "🧦", item: "No-show running socks", note: "standard" });
  }

  // ── Extras ──
  if (uvHigh && !rainy) {
    layers.push({ slot: "Skin", icon: "🌞", item: "Sunscreen SPF 30+", note: "reapply if running over 90 min" });
  }
  if (rainy) {
    layers.push({ slot: "Shoes", icon: "👟", item: "Trail or water-resistant shoes", note: "or just accept wet feet — regular trainers fine" });
  }

  // Feel-like summary phrase
  let feelPhrase;
  if (feel <= 25) feelPhrase = "Bitterly cold";
  else if (feel <= 35) feelPhrase = "Very cold";
  else if (feel <= 45) feelPhrase = "Cold";
  else if (feel <= 55) feelPhrase = "Chilly";
  else if (feel <= 65) feelPhrase = "Cool & comfortable";
  else if (feel <= 75) feelPhrase = "Comfortable";
  else if (feel <= 82) feelPhrase = "Warm";
  else feelPhrase = "Hot";

  return { layers, feel, feelPhrase, rainy, misty, windy, uvHigh };
}

// ── Outfit Tile ───────────────────────────────────────────────────────────────
function OutfitTile({ h, accentColor }) {
  const { layers, feel, feelPhrase, rainy, windy, uvHigh } = getOutfit(h);
  const mono = { fontFamily: "'JetBrains Mono', monospace" };
  const cond = { fontFamily: "'Barlow Condensed', sans-serif" };

  const tags = [];
  if (rainy) tags.push({ label: "RAIN EXPECTED", color: "#6ab0e8" });
  if (windy) tags.push({ label: "WINDY", color: "#a0d8b0" });
  if (uvHigh) tags.push({ label: "HIGH UV", color: "#e8c84a" });

  return (
    <div style={{
      background: C.surface, borderRadius: 16,
      border: `1px solid ${C.border2}`,
      padding: "20px",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${accentColor}40, transparent)` }} />

      <div style={{ ...mono, fontSize: 8, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
        What to Wear · Best Window
      </div>

      {/* Feel-like + tags row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ ...cond, fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: 1 }}>
          Feels like {feel}°F
        </div>
        <div style={{ ...mono, fontSize: 9, color: accentColor, letterSpacing: 1 }}>
          {feelPhrase}
        </div>
        {tags.map(t => (
          <span key={t.label} style={{
            ...mono, fontSize: 8, color: t.color,
            background: `${t.color}18`, border: `1px solid ${t.color}40`,
            borderRadius: 4, padding: "2px 8px", letterSpacing: 1,
          }}>{t.label}</span>
        ))}
      </div>

      {/* Gear list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {layers.map(({ slot, icon, item, note }) => (
          <div key={slot} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontSize: 18, width: 26, flexShrink: 0, lineHeight: 1.2 }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...mono, fontSize: 8, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", width: 52, flexShrink: 0 }}>{slot}</span>
                <span style={{ ...mono, fontSize: 11, color: C.text, fontWeight: 400 }}>{item}</span>
              </div>
              <div style={{ ...mono, fontSize: 8, color: C.muted, marginTop: 2, marginLeft: 60, letterSpacing: 0.5 }}>{note}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom tip */}
      <div style={{
        marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}`,
        ...mono, fontSize: 8, color: C.text, letterSpacing: 1, lineHeight: 1.8,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: C.greenDim, fontSize: 10 }}>💡</span>
        Rule of thumb: dress for 15–20° warmer than the feel-like temp — your body heat will do the rest.
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("tomorrow");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=JetBrains+Mono:wght@300;400;500&family=Barlow+Condensed:wght@300;400;600;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: ${C.bg}; }
      .wsr-fade { opacity: 0; transform: translateY(14px); transition: opacity 0.55s ease, transform 0.55s ease; }
      .wsr-fade.in { opacity: 1; transform: translateY(0); }
      @keyframes breathe { 0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.1);opacity:.7} }
      @keyframes breathe2 { 0%,100%{transform:scale(1) rotate(0deg);opacity:.3}50%{transform:scale(1.05) rotate(-4deg);opacity:.45} }
      .tog-btn { transition: all .18s ease; }
      .tog-btn:hover { opacity: .8; }
      .hbar { transition: filter .2s; cursor: default; }
      .hbar:hover { filter: brightness(1.4); }
      .chip { transition: all .18s ease; }
      .chip:hover { border-color: ${C.greenMid} !important; background: ${C.greenDeep} !important; }
      tr.dr { transition: background .15s; }
      tr.dr:hover { background: ${C.greenDeep}30 !important; }
      ::-webkit-scrollbar { width: 3px; height: 3px; }
      ::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 2px; }
    `;
    document.head.appendChild(style);
    setTimeout(() => setVisible(true), 60);
  }, []);

  const now = new Date();
  const tom = new Date(now); tom.setDate(now.getDate() + 1);
  const fmtLabel = d => d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
  const targetDate = view === "today" ? now : tom;

  const { hours: rawHours, windDeg, windLabel } = generateDay(targetDate);
  const { hours, best } = processHours(rawHours);
  const dateLabel = fmtLabel(targetDate);
  const bh = best ? hours[best.startIdx] : null;
  const col = bh ? scoreColor(best.avgScore) : C.green;

  const mono  = { fontFamily: "'JetBrains Mono', monospace" };
  const serif = { fontFamily: "'Cormorant Garamond', serif" };
  const cond  = { fontFamily: "'Barlow Condensed', sans-serif" };
  const d = ms => ({ transitionDelay: `${ms}ms` });

  return (
    <div style={{ background: C.bg, minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <div style={{ position:"fixed", top:"-25%", left:"-15%", width:"65vw", height:"65vw", borderRadius:"50%", pointerEvents:"none", zIndex:0, background:`radial-gradient(circle, ${C.green}12 0%, transparent 65%)`, animation:"breathe 14s ease-in-out infinite" }} />
      <div style={{ position:"fixed", bottom:"-20%", right:"-10%", width:"55vw", height:"55vw", borderRadius:"50%", pointerEvents:"none", zIndex:0, background:`radial-gradient(circle, ${C.greenMid}0e 0%, transparent 65%)`, animation:"breathe2 20s ease-in-out infinite" }} />
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0, opacity:0.03, backgroundImage:`linear-gradient(${C.green} 1px, transparent 1px), linear-gradient(90deg, ${C.green} 1px, transparent 1px)`, backgroundSize:"40px 40px" }} />

      <div style={{ position:"relative", zIndex:1, maxWidth:520, margin:"0 auto", padding:"36px 20px 64px" }}>

        {/* Header */}
        <div className={`wsr-fade ${visible?"in":""}`} style={{ marginBottom:28, ...d(0) }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ ...mono, fontSize:8, color:C.greenDim, letterSpacing:3, textTransform:"uppercase", marginBottom:8 }}>West Side Hwy · 96th St · NYC</div>
              <div style={{ ...cond, fontSize:36, fontWeight:700, color:C.text, letterSpacing:5, textTransform:"uppercase", lineHeight:1 }}>Run Forecast</div>
            </div>
            <div style={{ textAlign:"right", paddingTop:2 }}>
              <div style={{ ...mono, fontSize:8, color:C.muted, letterSpacing:1, lineHeight:2 }}>
                {dateLabel.toUpperCase().split(",")[0]}<br/>
                <span style={{ color:C.dim }}>{dateLabel.split(",").slice(1).join(",").trim().toUpperCase()}</span>
              </div>
            </div>
          </div>
          <div style={{ display:"inline-flex", gap:2, marginTop:20, background:C.surface, borderRadius:8, padding:3, border:`1px solid ${C.border2}` }}>
            {[{id:"tomorrow",label:"Tomorrow"},{id:"today",label:"Today"}].map(({id,label})=>(
              <button key={id} className="tog-btn" onClick={()=>setView(id)} style={{
                padding:"7px 20px", borderRadius:6, border:"none", cursor:"pointer",
                background: view===id ? C.green : "transparent",
                color: view===id ? C.bg : C.muted,
                ...mono, fontSize:10, fontWeight: view===id ? 500 : 300,
                letterSpacing:1.5, textTransform:"uppercase",
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Hero */}
        {bh && (
          <div className={`wsr-fade ${visible?"in":""}`} style={{ ...d(120), marginBottom:16 }}>
            <div style={{ background:C.surface, borderRadius:20, border:`1px solid ${C.border2}`, padding:"28px 24px 24px", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, transparent, ${col}50, transparent)` }} />
              <div style={{ position:"absolute", top:0, right:0, width:120, height:120, background:`radial-gradient(circle at top right, ${col}10, transparent 70%)`, pointerEvents:"none" }} />
              <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                <div style={{ position:"relative", width:200, height:200, flexShrink:0, margin:"-20px -16px -20px -16px" }}>
                  <ScoreArc score={best.avgScore} color={col} animate={visible}/>
                  <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-48%)", textAlign:"center" }}>
                    <div style={{ ...cond, fontSize:44, fontWeight:700, color:col, lineHeight:1, letterSpacing:1 }}><AnimNum value={best.avgScore}/></div>
                    <div style={{ ...mono, fontSize:8, color:C.muted, letterSpacing:2, marginTop:1 }}>/ 100</div>
                    <div style={{ ...mono, fontSize:9, color:col, letterSpacing:2, marginTop:7, fontWeight:500 }}>{scoreLabel(best.avgScore)}</div>
                  </div>
                </div>
                <div style={{ flex:1, minWidth:130 }}>
                  <div style={{ ...mono, fontSize:8, color:C.muted, letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>Best Window</div>
                  <div style={{ ...serif, fontSize:54, fontWeight:300, color:C.text, lineHeight:0.9, letterSpacing:-1 }}>{fmt12(bh.hr)}</div>
                  <div style={{ ...mono, fontSize:11, color:C.greenDim, marginTop:6, letterSpacing:1 }}>— {fmt12(bh.hr+2)}</div>
                  <div style={{ marginTop:16, display:"flex", flexWrap:"wrap", gap:6 }}>
                    {[{icon:"🌡",val:`${bh.t}°F`},{icon:"🌧",val:`${bh.p}%`},{icon:"💨",val:`${bh.w} mph`}].map(({icon,val})=>(
                      <span key={val} className="chip" style={{ ...mono, fontSize:10, color:C.text, background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:6, padding:"4px 10px", display:"inline-flex", alignItems:"center", gap:5 }}>{icon} {val}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ marginTop:26, paddingTop:22, borderTop:`1px solid ${C.border}` }}>
                {[
                  {key:"precipitation",label:"Rain",icon:"🌧",weight:35},
                  {key:"wind",label:"Wind",icon:"💨",weight:25},
                  {key:"temperature",label:"Temp",icon:"🌡",weight:20},
                  {key:"humidity",label:"Humidity",icon:"💧",weight:12},
                  {key:"uv",label:"UV",icon:"☀️",weight:8},
                ].map(({key,label,icon,weight},fi)=>{
                  const sc = bh.bd[key]; const fc = scoreColor(sc);
                  return (
                    <div key={key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:9 }}>
                      <div style={{ fontSize:12, width:18, flexShrink:0 }}>{icon}</div>
                      <div style={{ ...mono, fontSize:9, color:C.muted, width:62, letterSpacing:1, flexShrink:0 }}>{label}</div>
                      <div style={{ flex:1, background:C.surface2, borderRadius:2, height:3, overflow:"hidden" }}>
                        <div style={{ width:visible?`${sc}%`:"0%", height:"100%", background:`linear-gradient(90deg, ${C.greenDeep}, ${fc})`, borderRadius:2, boxShadow:`0 0 8px ${fc}50`, transition:"width 1.1s cubic-bezier(0.4,0,0.2,1)", transitionDelay:`${300+fi*80}ms` }}/>
                      </div>
                      <div style={{ ...mono, fontSize:9, color:fc, width:22, textAlign:"right", fontWeight:500 }}>{sc}</div>
                      <div style={{ ...mono, fontSize:8, color:C.dim, width:28, textAlign:"right" }}>{weight}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Direction Tile */}
        {bh && (
          <div className={`wsr-fade ${visible?"in":""}`} style={{ ...d(210), marginBottom:16 }}>
            <DirectionTile
              windDeg={windDeg}
              windSpeed={bh.w}
              windLabel={windLabel}
              accentColor={col}
              visible={visible}
            />
          </div>
        )}

        {/* Outfit Tile */}
        {bh && (
          <div className={`wsr-fade ${visible?"in":""}`} style={{ ...d(290), marginBottom:16 }}>
            <OutfitTile h={bh} accentColor={col} />
          </div>
        )}

        {/* Hourly Chart */}
        <div className={`wsr-fade ${visible?"in":""}`} style={{ ...d(370), marginBottom:16 }}>
          <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border2}`, padding:"20px 20px 14px" }}>
            <div style={{ ...mono, fontSize:8, color:C.muted, letterSpacing:2, textTransform:"uppercase", marginBottom:14 }}>Hourly Score · 5am – 9pm</div>
            <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:60 }}>
              {hours.map((h,i)=>{
                const isBest = best && (i===best.startIdx || i===best.startIdx+1);
                const fc = scoreColor(h.score);
                const barH = Math.max(4, (h.score/100)*50);
                return (
                  <div key={h.hr} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                    <div className="hbar" title={`${fmt12(h.hr)}: ${h.score}/100`} style={{ width:"100%", height:barH, background:isBest?`linear-gradient(180deg,${fc},${fc}80)`:`${fc}25`, borderRadius:"2px 2px 0 0", boxShadow:isBest?`0 0 10px ${fc}50`:"none" }}/>
                    <div style={{ ...mono, fontSize:7, color:isBest?C.text:C.dim, whiteSpace:"nowrap" }}>{h.hr%4===1?fmt12(h.hr):""}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Full Table */}
        <div className={`wsr-fade ${visible?"in":""}`} style={{ ...d(390) }}>
          <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border2}`, padding:"20px" }}>
            <div style={{ ...mono, fontSize:8, color:C.muted, letterSpacing:2, textTransform:"uppercase", marginBottom:16 }}>Full Hourly Breakdown</div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", ...mono, fontSize:11 }}>
                <thead>
                  <tr>{["TIME","SCORE","°F","RAIN","WIND","HUM","UV"].map(c=>(
                    <th key={c} style={{ textAlign:"left", padding:"0 8px 10px 0", color:C.dim, fontWeight:400, letterSpacing:1.5, fontSize:8 }}>{c}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {hours.map((h,i)=>{
                    const isBest = best && (i===best.startIdx || i===best.startIdx+1);
                    const fc = scoreColor(h.score);
                    return (
                      <tr key={h.hr} className="dr" style={{ borderTop:`1px solid ${C.border}`, background:isBest?`${fc}08`:"transparent" }}>
                        <td style={{ padding:"7px 8px 7px 0", color:isBest?C.text:C.muted, fontWeight:isBest?500:300 }}>{fmt12(h.hr)}{isBest&&i===best.startIdx&&<span style={{ color:fc, marginLeft:5, fontSize:8 }}>●</span>}</td>
                        <td style={{ padding:"7px 8px 7px 0" }}><span style={{ color:fc, fontWeight:500 }}>{h.score}</span></td>
                        <td style={{ padding:"7px 8px 7px 0", color:C.text }}>{h.t}°</td>
                        <td style={{ padding:"7px 8px 7px 0", color:h.p>40?C.skip:h.p>20?C.fair:C.muted }}>{h.p}%</td>
                        <td style={{ padding:"7px 8px 7px 0", color:h.w>18?C.skip:h.w>10?C.fair:C.muted }}>{h.w}</td>
                        <td style={{ padding:"7px 8px 7px 0", color:h.h>75?C.fair:C.muted }}>{h.h}%</td>
                        <td style={{ padding:"7px 8px 7px 0", color:h.u>7?C.skip:h.u>4?C.fair:C.muted }}>{h.u.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className={`wsr-fade ${visible?"in":""}`} style={{ ...d(460), marginTop:22, display:"flex", gap:16, justifyContent:"center", flexWrap:"wrap" }}>
          {[[C.great,"80+ · Perfect"],[C.good,"65+ · Good"],[C.fair,"45+ · Fair"],[C.skip,"0+ · Skip"]].map(([fc,lbl])=>(
            <div key={lbl} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:fc, boxShadow:`0 0 5px ${fc}` }}/>
              <span style={{ ...mono, fontSize:8, color:C.dim, letterSpacing:1 }}>{lbl}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign:"center", marginTop:12, ...mono, fontSize:7, color:C.dim, letterSpacing:2, opacity:0.4 }}>
          40.794°N · 73.992°W · SEASONAL FORECAST
        </div>
      </div>
    </div>
  );
}
