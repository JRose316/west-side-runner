import { useState, useEffect, useCallback } from "react";

// ─── Config ────────────────────────────────────────────────────────────────────
const API_KEY = "ENu4XXZ57XWQUSkwSQ1iYw7waGmDXhWV";
const W = { precipitation:0.28, wind:0.20, temperature:0.18, humidity:0.08, uv:0.06, aqi:0.15, pollen:0.05 };
const DEFAULT_LOC = { lat:40.794, lon:-73.9916, name:"Upper West Side, NYC" };
const DEFAULT_SETTINGS = { distance:5, pace:9, daylightOnly:false };

const SEA = {
  0:{base:34,sw:6,rain:.35,wind:13,hum:62,uv:2,prev:315,aqi:35,pol:0},
  1:{base:36,sw:7,rain:.32,wind:13,hum:60,uv:3,prev:300,aqi:35,pol:5},
  2:{base:44,sw:8,rain:.38,wind:14,hum:58,uv:4,prev:270,aqi:40,pol:60},
  3:{base:54,sw:9,rain:.38,wind:13,hum:55,uv:6,prev:250,aqi:45,pol:90},
  4:{base:64,sw:9,rain:.35,wind:11,hum:57,uv:7,prev:230,aqi:50,pol:70},
  5:{base:73,sw:8,rain:.30,wind:10,hum:60,uv:9,prev:225,aqi:60,pol:50},
  6:{base:79,sw:7,rain:.35,wind:9, hum:63,uv:10,prev:220,aqi:65,pol:30},
  7:{base:77,sw:7,rain:.35,wind:9, hum:64,uv:9, prev:225,aqi:60,pol:25},
  8:{base:71,sw:8,rain:.30,wind:9, hum:63,uv:7, prev:240,aqi:45,pol:60},
  9:{base:61,sw:9,rain:.32,wind:10,hum:61,uv:5, prev:270,aqi:40,pol:40},
  10:{base:51,sw:8,rain:.35,wind:12,hum:62,uv:3,prev:295,aqi:38,pol:5},
  11:{base:41,sw:7,rain:.35,wind:13,hum:63,uv:2,prev:315,aqi:35,pol:0},
};

async function fetchLiveWeather(lat, lon) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzEnc = encodeURIComponent(tz);
  const [tRes, aRes, sRes] = await Promise.all([
    fetch(`https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&timesteps=1h&units=imperial&apikey=${API_KEY}`),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=us_aqi,grass_pollen,birch_pollen,ragweed_pollen&timezone=${tzEnc}&forecast_days=2`).catch(()=>null),
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&timezone=${tzEnc}&forecast_days=2`).catch(()=>null),
  ]);
  if (!tRes.ok) { const e = await tRes.json().catch(()=>({})); throw new Error(e?.message||`HTTP ${tRes.status}`); }
  const tData = await tRes.json();
  const aData = aRes?.ok ? await aRes.json() : null;
  const sData = sRes?.ok ? await sRes.json() : null;
  const hourlyArr = tData?.timelines?.hourly;
  if (!Array.isArray(hourlyArr)) throw new Error("Bad API response");
  const aqMap = {};
  aData?.hourly?.time?.forEach((t,i) => {
    aqMap[t.slice(0,13)] = { aqi: aData.hourly.us_aqi?.[i]??40, pollen: (aData.hourly.grass_pollen?.[i]??0)+(aData.hourly.birch_pollen?.[i]??0)+(aData.hourly.ragweed_pollen?.[i]??0) };
  });
  const parseSun = s => { if (!s) return null; const d=new Date(s); return d.getHours()+d.getMinutes()/60; };
  const now = new Date(), tom = new Date(now); tom.setDate(now.getDate()+1);
  const toDS = d => d.toLocaleDateString("en-CA");
  const getSun = ds => { const i=sData?.daily?.time?.indexOf(ds)??-1; if(i<0) return {sunrise:6.5,sunset:19.5}; return {sunrise:parseSun(sData.daily.sunrise[i])??6.5,sunset:parseSun(sData.daily.sunset[i])??19.5}; };
  const buildDay = ds => {
    const hrs = [];
    for (const entry of hourlyArr) {
      const t = entry.time;
      if (!t.startsWith(ds)) continue;
      const hr = parseInt(t.slice(11,13)), v = entry.values, aq = aqMap[t.slice(0,13)]||{aqi:40,pollen:0};
      hrs.push({ hr, t:Math.round(v.temperature??60), p:Math.round(v.precipitationProbability??10), w:Math.round(v.windSpeed??8), wd:Math.round(v.windDirection??270), h:Math.round(v.humidity??60), u:parseFloat((v.uvIndex??0).toFixed(1)), aqi:Math.round(aq.aqi), pollen:Math.round(aq.pollen) });
    }
    const mid = hrs.filter(h=>h.hr>=10&&h.hr<=14);
    return { hrs, windDeg: mid.length ? Math.round(mid.reduce((s,h)=>s+h.wd,0)/mid.length) : 270 };
  };
  const fmtL = d => d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
  const td=buildDay(toDS(now)), tm=buildDay(toDS(tom));
  return { isLive:true, fetchedAt:Date.now(), today:{label:fmtL(now),hours:td.hrs,windDeg:td.windDeg,sunTimes:getSun(toDS(now))}, tomorrow:{label:fmtL(tom),hours:tm.hrs,windDeg:tm.windDeg,sunTimes:getSun(toDS(tom))} };
}

async function getLocationName(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=12`,{headers:{"Accept-Language":"en"}});
    const d = await r.json(), a = d.address;
    return a.neighbourhood||a.suburb||a.city_district||a.quarter||a.city||a.town||`${lat.toFixed(2)}N`;
  } catch { return `${lat.toFixed(2)}N`; }
}

function seededRand(seed) { let s=seed; return ()=>{ s=(s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; }; }
function makeFallbackDay(date) {
  const m=SEA[date.getMonth()], rand=seededRand(date.getFullYear()*10000+date.getMonth()*100+date.getDate());
  const isR=rand()<m.rain, ri=isR?0.4+rand()*0.6:0, wm=0.7+rand()*0.6, to=(rand()-0.5)*m.sw*2;
  const wd=Math.round((m.prev+(rand()-0.5)*90+360)%360), aqO=(rand()-0.5)*20, mo=date.getMonth();
  const sunrises=[7.2,6.8,6.1,5.3,4.7,4.4,4.6,5.2,5.9,6.6,7.2,7.5];
  const sunsets=[16.7,17.3,18.0,18.7,19.4,19.9,19.8,19.2,18.3,17.4,16.7,16.4];
  const hours=Array.from({length:17},(_,i)=>{
    const hr=i+5, tc=-Math.cos(((hr-6)/9)*Math.PI)*m.sw, temp=Math.round(m.base+to+tc);
    const rc=isR?30+ri*50*Math.sin(((hr-8)/13)*Math.PI):5+rand()*8;
    const wind=Math.round(Math.max(3,m.wind*wm*(0.7+0.3*Math.sin(((hr-8)/13)*Math.PI))));
    const hum=Math.round(Math.max(30,Math.min(95,m.hum+(isR?12:0)-(temp-m.base)*0.4)));
    const uc=hr>=7&&hr<=19?Math.sin(((hr-7)/12)*Math.PI):0;
    const uv=isR?0:parseFloat((m.uv*uc).toFixed(1));
    const aqi=Math.max(0,Math.round(m.aqi+aqO+(hr>=12&&hr<=17?10:0)));
    const pc=hr>=8&&hr<=16?Math.sin(((hr-8)/8)*Math.PI):0;
    return {hr,t:temp,p:Math.round(Math.max(0,Math.min(95,rc))),w:wind,wd,h:hum,u:uv,aqi,pollen:Math.round(m.pol*pc)};
  });
  return {label:date.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}),hours,windDeg:wd,sunTimes:{sunrise:sunrises[mo],sunset:sunsets[mo]}};
}

const sAQI=v=>v<=50?100:v<=100?Math.round(100-(v-50)*0.5):v<=150?Math.round(75-(v-100)*0.7):v<=200?Math.round(40-(v-150)*0.6):0;
const sPollen=v=>v<=0?100:v<=30?Math.round(100-v*0.5):v<=100?Math.round(85-(v-30)*0.35):v<=200?Math.round(60-(v-100)*0.3):Math.max(0,Math.round(30-(v-200)*0.15));
function scoreHour(h) {
  const p=Math.max(0,100-(h.p??0)*0.8), ww=Math.max(0,100-(h.w??0)*4), t=Math.max(0,100-Math.abs((h.t??62)-62.5)*3.5);
  const hm=Math.max(0,100-(h.h??0)*0.9), u=Math.max(0,100-(h.u??0)*9), aq=sAQI(h.aqi??40), po=sPollen(h.pollen??0);
  return { total:Math.round(p*W.precipitation+ww*W.wind+t*W.temperature+hm*W.humidity+u*W.uv+aq*W.aqi+po*W.pollen), bd:{precipitation:Math.round(p),wind:Math.round(ww),temperature:Math.round(t),humidity:Math.round(hm),uv:Math.round(u),aqi:Math.round(aq),pollen:Math.round(po)} };
}
function processHours(arr, sunTimes, daylightOnly) {
  const hours=arr.map(h=>{ const s=scoreHour(h); return {...h,score:s.total,bd:s.bd}; });
  let best=null;
  for (let i=0;i<hours.length-1;i++) {
    if (daylightOnly&&sunTimes) { if (hours[i].hr<sunTimes.sunrise||hours[i+1].hr>=sunTimes.sunset) continue; }
    const avg=Math.round((hours[i].score+hours[i+1].score)/2);
    if (!best||avg>best.avgScore) best={startIdx:i,avgScore:avg};
  }
  if (best&&best.avgScore<35) best=null;
  return {hours,best};
}

const fmt12=h=>h===0||h===24?"12am":h<12?`${h}am`:h===12?"12pm":`${h-12}pm`;
const compassLabel=deg=>["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(deg/22.5)%16];
const windChill=(t,w)=>t>50||w<3?t:Math.round(35.74+0.6215*t-35.75*Math.pow(w,0.16)+0.4275*t*Math.pow(w,0.16));
const sl=s=>s>=80?"PERFECT":s>=65?"GOOD":s>=45?"FAIR":"SKIP IT";

function getDirRec(wd,ws) {
  const ns=Math.sin(((wd+180)%360)*Math.PI/180);
  if(ws<6) return {dir:"EITHER",headline:"Wind is calm",detail:"No strong preference — both directions feel the same."};
  if(Math.abs(ns)<0.35) return {dir:"NORTH",headline:"Head North first",detail:"Cross-wind minimal. Starting north gives you the bridge views on the return."};
  if(ns<0) return {dir:"SOUTH",headline:"Head South first",detail:"Fight the headwind while fresh — then cruise back with wind at your back."};
  return {dir:"NORTH",headline:"Head North first",detail:"Headwind heading uptown while your legs are strong — earn the tailwind coming back."};
}

function getOutfit(h) {
  const feel=windChill(h.t,h.w), rainy=h.p>40, misty=h.p>20&&h.p<=40, uvHigh=h.u>6, windy=h.w>15;
  const L=[];
  if(feel<=25)      L.push({slot:"Top",   icon:"🧥",item:"Heavy insulated jacket",     note:"windproof shell essential"});
  else if(feel<=35) L.push({slot:"Top",   icon:"🧥",item:"Thermal running jacket",      note:"full zip, wind resistant"});
  else if(feel<=45) L.push({slot:"Top",   icon:"🫙",item:"Half-zip + base layer",       note:"moisture-wicking base underneath"});
  else if(feel<=55) L.push({slot:"Top",   icon:"👕",item:"Long sleeve running shirt",   note:feel<50?"consider a light vest":"lightweight fabric"});
  else if(feel<=65) L.push({slot:"Top",   icon:"👕",item:"Short sleeve + arm warmers",  note:"easy to strip mid-run"});
  else if(feel<=75) L.push({slot:"Top",   icon:"👕",item:"Short sleeve tech shirt",     note:"breathable"});
  else              L.push({slot:"Top",   icon:"🎽",item:"Singlet or racerback",        note:"max ventilation"});
  if(rainy)         L.push({slot:"Shell", icon:"🌧",item:"Waterproof running jacket",   note:"packable, taped seams if possible"});
  else if(misty||(windy&&feel<50)) L.push({slot:"Shell",icon:"💨",item:"Wind shell",   note:"light enough to tie around waist"});
  if(feel<=30)      L.push({slot:"Bottom",icon:"🩲",item:"Thermal tights",             note:"full length, wind-blocking"});
  else if(feel<=45) L.push({slot:"Bottom",icon:"🩲",item:"Running tights",             note:"full length"});
  else if(feel<=58) L.push({slot:"Bottom",icon:"🩲",item:"3/4 tights or capris",       note:"or shorts + calf sleeves"});
  else              L.push({slot:"Bottom",icon:"🩳",item:"Running shorts",             note:"moisture-wicking liner"});
  if(feel<=35)      L.push({slot:"Hands", icon:"🧤",item:"Running gloves",             note:"thin wind-resistant pair"});
  else if(feel<=45) L.push({slot:"Hands", icon:"🧤",item:"Light gloves",               note:"you'll likely pull these off mid-run"});
  if(feel<=30)      L.push({slot:"Head",  icon:"🧣",item:"Beanie + neck gaiter",        note:"protect ears and neck"});
  else if(feel<=42) L.push({slot:"Head",  icon:"🧢",item:"Running beanie",             note:"keeps ears warm"});
  else if(rainy||uvHigh) L.push({slot:"Head",icon:"🧢",item:"Cap with brim",           note:rainy?"keeps rain off your face":"shade from UV"});
  if(feel<=40)      L.push({slot:"Socks", icon:"🧦",item:"Thermal running socks",      note:"slightly thicker for cold"});
  else if(rainy)    L.push({slot:"Socks", icon:"🧦",item:"Wool blend socks",           note:"dries faster when wet"});
  else              L.push({slot:"Socks", icon:"🧦",item:"No-show running socks",      note:"standard"});
  if(uvHigh&&!rainy) L.push({slot:"Skin", icon:"🌞",item:"Sunscreen SPF 30+",          note:"reapply if out over 90 min"});
  const fp=feel<=25?"Bitterly cold":feel<=35?"Very cold":feel<=45?"Cold":feel<=55?"Chilly":feel<=65?"Cool & comfortable":feel<=75?"Comfortable":feel<=82?"Warm":"Hot";
  return {layers:L,feel,feelPhrase:fp,rainy,uvHigh};
}

function getWhyExplainer(bh,best) {
  const reasons=[];
  if(bh.p<=10) reasons.push("no rain in the forecast");
  else if(bh.p<=25) reasons.push(`only ${bh.p}% chance of rain`);
  if(bh.w<=7) reasons.push("wind is barely noticeable");
  else if(bh.w<=12) reasons.push(`light ${bh.w} mph breeze`);
  const feel=windChill(bh.t,bh.w);
  if(feel>=55&&feel<=70) reasons.push(`${feel}F feels perfect for running`);
  else if(feel>=48&&feel<55) reasons.push(`crisp ${feel}F — ideal race-day feel`);
  else if(feel>70&&feel<=78) reasons.push(`${feel}F is warm but manageable`);
  if((bh.aqi||40)<=50) reasons.push("air quality is excellent");
  if((bh.pollen||0)<=20) reasons.push("pollen is low");
  if(bh.u<=3) reasons.push("UV is minimal");
  if(reasons.length===0) reasons.push(best.avgScore>=65?"conditions are decent across the board":"this is the best window available today");
  const top=reasons.slice(0,3);
  if(top.length===1) return top[0].charAt(0).toUpperCase()+top[0].slice(1)+".";
  if(top.length===2) return top[0].charAt(0).toUpperCase()+top[0].slice(1)+" and "+top[1]+".";
  return top[0].charAt(0).toUpperCase()+top[0].slice(1)+", "+top[1]+", and "+top[2]+".";
}

async function doShare(bh,best,dateLabel,locationName) {
  const win=`${fmt12(bh.hr)} - ${fmt12(bh.hr+2)}`;
  const text=`Run Forecast - ${locationName}\n${dateLabel}\nBest window: ${win}\nScore: ${best.avgScore}/100 (${sl(best.avgScore)})\n\n${bh.t}F  ${bh.p}% rain  ${bh.w} mph wind\n\ntemprunture.com`;
  try {
    if(navigator.share){await navigator.share({title:"My Run Forecast",text,url:"https://temprunture.com"});return "shared";}
    await navigator.clipboard.writeText(text);return "copied";
  } catch(e) { if(e.name!=="AbortError"){try{await navigator.clipboard.writeText(text);return "copied";}catch{}}return null; }
}

const C={bg:"#050c08",surface:"#08120a",surface2:"#0d1a10",border:"#142018",border2:"#1e3024",green:"#3dd68c",greenMid:"#2aab6e",greenDim:"#165c38",greenDeep:"#0a3320",text:"#c8e8d0",muted:"#4a7a58",dim:"#1e3828",great:"#3dd68c",good:"#a8e060",fair:"#f0c040",skip:"#e05858"};
const sc=s=>s>=80?C.great:s>=65?C.good:s>=45?C.fair:C.skip;
const mono={fontFamily:"'JetBrains Mono',monospace"};
const serif={fontFamily:"'Cormorant Garamond',serif"};
const cond={fontFamily:"'Barlow Condensed',sans-serif"};
const dd=ms=>({transitionDelay:`${ms}ms`});
const bg={background:C.bg,fontFamily:"'DM Sans',sans-serif",color:C.text};
const aqiInfo=v=>v<=50?{l:"Good",c:C.great}:v<=100?{l:"Moderate",c:C.good}:v<=150?{l:"Sensitive",c:C.fair}:{l:"Unhealthy",c:C.skip};
const pollenInfo=v=>v<=0?{l:"None",c:C.great}:v<=30?{l:"Low",c:C.good}:v<=100?{l:"Medium",c:C.fair}:{l:"High",c:C.skip};

const BAD_DAY_MSGS=[
  {emoji:"🛋️",title:"Take a day off.",sub:"You've earned it."},
  {emoji:"☕",title:"Rest day confirmed.",sub:"Your legs will thank you tomorrow."},
  {emoji:"🧘",title:"Nature says no.",sub:"Stretch, hydrate, try again tomorrow."},
  {emoji:"📚",title:"A great day to not run.",sub:"Seriously. Stay inside. Read something."},
  {emoji:"🍕",title:"Rest day protocol activated.",sub:"Treat yourself. The miles will be there tomorrow."},
];

function ScoreArc({score,color,animate}) {
  const R=88,CX=100,CY=100,sa=-220,ta=260;
  const rad=deg=>deg*Math.PI/180, pt=deg=>({x:CX+R*Math.cos(rad(deg)),y:CY+R*Math.sin(rad(deg))});
  const arc=(f,t)=>{const s=pt(f),e=pt(t);return `M ${s.x} ${s.y} A ${R} ${R} 0 ${Math.abs(t-f)>180?1:0} 1 ${e.x} ${e.y}`;};
  const circ=2*Math.PI*R, filled=(ta/360)*circ*(score/100);
  return (
    <svg width="200" height="200" style={{overflow:"visible"}}>
      <defs><filter id="ga"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <path d={arc(sa,sa+ta)} fill="none" stroke={C.border2} strokeWidth="5" strokeLinecap="round"/>
      <path d={arc(sa,sa+ta)} fill="none" stroke={C.greenDeep} strokeWidth="12" strokeLinecap="round" opacity="0.5"/>
      <path d={arc(sa,sa+ta)} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${filled} ${circ}`} filter="url(#ga)" style={{transition:animate?"stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)":"none"}}/>
      {[0,25,50,75,100].map(p=>{const a=sa+ta*p/100,ii={x:CX+(R-8)*Math.cos(rad(a)),y:CY+(R-8)*Math.sin(rad(a))},oi={x:CX+(R+4)*Math.cos(rad(a)),y:CY+(R+4)*Math.sin(rad(a))};return <line key={p} x1={ii.x} y1={ii.y} x2={oi.x} y2={oi.y} stroke={C.border2} strokeWidth="1.5"/>;})}
    </svg>
  );
}

function AnimNum({value,dur=1200}) {
  const [v,setV]=useState(0);
  useEffect(()=>{let s=null;const f=ts=>{if(!s)s=ts;const p=Math.min((ts-s)/dur,1);setV(Math.round((1-Math.pow(1-p,3))*value));if(p<1)requestAnimationFrame(f);};requestAnimationFrame(f);},[value,dur]);
  return <span>{v}</span>;
}

function WindRose({windDeg,color}) {
  const rad=d=>d*Math.PI/180,going=(windDeg+180)%360,aa=rad(going-90),cx=36,cy=36,r=26;
  const tx=cx+r*Math.cos(aa),ty=cy+r*Math.sin(aa),bx=cx-(r*0.6)*Math.cos(aa),by=cy-(r*0.6)*Math.sin(aa),px=Math.cos(aa+Math.PI/2)*6,py=Math.sin(aa+Math.PI/2)*6;
  return (
    <svg width="72" height="72">
      <defs><filter id="wg"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <circle cx={cx} cy={cy} r={r+4} fill="none" stroke={C.border2} strokeWidth="1"/>
      {[0,90,180,270].map(deg=>{const a=rad(deg-90);return <line key={deg} x1={cx+(r-2)*Math.cos(a)} y1={cy+(r-2)*Math.sin(a)} x2={cx+(r+4)*Math.cos(a)} y2={cy+(r+4)*Math.sin(a)} stroke={C.border2} strokeWidth="1.5"/>;}) }
      {[["N",0],["E",90],["S",180],["W",270]].map(([l,deg])=>{const a=rad(deg-90);return <text key={l} x={cx+(r+12)*Math.cos(a)-3} y={cy+(r+12)*Math.sin(a)+3} fill={C.dim} fontSize="7" fontFamily="JetBrains Mono,monospace" textAnchor="middle">{l}</text>;})}
      <polygon points={`${tx},${ty} ${bx+px},${by+py} ${bx-px},${by-py}`} fill={color} filter="url(#wg)"/>
      <circle cx={cx} cy={cy} r="3" fill={C.surface2} stroke={color} strokeWidth="1.5"/>
    </svg>
  );
}

function WeatherBg({hours}) {
  const day=hours.filter(h=>h.hr>=8&&h.hr<=18);
  const avgRain=day.length?day.reduce((s,h)=>s+h.p,0)/day.length:0;
  const avgWind=day.length?day.reduce((s,h)=>s+h.w,0)/day.length:0;
  if(avgRain>45) return <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>{Array.from({length:18}).map((_,i)=><div key={i} style={{position:"absolute",top:"-5%",left:`${(i*5.8)%100}%`,width:1.5,height:`${12+i%3*8}px`,background:`${C.green}18`,borderRadius:1,animation:`rain ${1.4+i*0.12}s linear infinite`,animationDelay:`${i*0.18}s`}}/>)}</div>;
  if(avgWind>18) return <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>{Array.from({length:7}).map((_,i)=><div key={i} style={{position:"absolute",top:`${8+i*13}%`,left:"-5%",width:`${60+i*25}px`,height:1,background:`${C.green}14`,animation:`windStreak ${2.5+i*0.5}s ease-in-out infinite`,animationDelay:`${i*0.6}s`}}/>)}</div>;
  return <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}><div style={{position:"absolute",top:"-25%",left:"-15%",width:"65vw",height:"65vw",borderRadius:"50%",background:`radial-gradient(circle,${C.green}12 0%,transparent 65%)`,animation:"breathe 14s ease-in-out infinite"}}/><div style={{position:"absolute",bottom:"-20%",right:"-10%",width:"55vw",height:"55vw",borderRadius:"50%",background:`radial-gradient(circle,${C.greenMid}0e 0%,transparent 65%)`,animation:"breathe2 20s ease-in-out infinite"}}/><div style={{position:"absolute",inset:0,opacity:0.03,backgroundImage:`linear-gradient(${C.green} 1px,transparent 1px),linear-gradient(90deg,${C.green} 1px,transparent 1px)`,backgroundSize:"40px 40px"}}/></div>;
}

function Dots() {
  const [v,setV]=useState(".");
  useEffect(()=>{const t=setInterval(()=>setV(p=>p.length>=3?".":p+"."),500);return()=>clearInterval(t);},[]);
  return <span style={{...mono,color:C.greenDeep,fontSize:22}}>{v}</span>;
}

function PWABanner({onDismiss}) {
  const ua=navigator.userAgent;
  const isIOS=/iphone|ipad|ipod/i.test(ua), isAndroid=/android/i.test(ua);
  const isStandalone=window.matchMedia("(display-mode: standalone)").matches;
  if(isStandalone||(!isIOS&&!isAndroid)) return null;
  const msg=isIOS?"Tap Share then Add to Home Screen":"Tap Menu then Add to Home Screen";
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,padding:"12px 16px",background:C.surface,borderTop:`1px solid ${C.border2}`,display:"flex",alignItems:"center",gap:12,boxShadow:"0 -4px 24px rgba(0,0,0,0.4)"}}>
      <div style={{fontSize:22,flexShrink:0}}>📲</div>
      <div style={{flex:1}}><div style={{...mono,fontSize:10,color:C.text}}>Add to your home screen</div><div style={{...mono,fontSize:8,color:C.muted,marginTop:2}}>{msg} for daily forecasts</div></div>
      <button onClick={onDismiss} style={{...mono,fontSize:9,color:C.muted,background:"none",border:`1px solid ${C.border2}`,borderRadius:6,padding:"6px 12px",cursor:"pointer"}}>Dismiss</button>
    </div>
  );
}

function LocationScreen({onGrant,onSkip}) {
  const [asking,setAsking]=useState(false);
  const hasGeo=!!navigator.geolocation;
  const handleGrant=()=>{setAsking(true);navigator.geolocation.getCurrentPosition(pos=>onGrant(pos.coords.latitude,pos.coords.longitude),()=>{setAsking(false);onSkip();},{timeout:12000,enableHighAccuracy:false});};
  return (
    <div style={{...bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:"40px 24px",textAlign:"center"}}>
      <div style={{...mono,fontSize:9,color:C.greenDim,letterSpacing:3,textTransform:"uppercase",marginBottom:16}}>temprunture.com</div>
      <div style={{fontSize:52,marginBottom:16}}>🏃</div>
      <div style={{...cond,fontSize:34,fontWeight:700,color:C.text,letterSpacing:4,textTransform:"uppercase",lineHeight:1,marginBottom:12}}>Run Forecast</div>
      <div style={{...mono,fontSize:10,color:C.muted,marginBottom:40,lineHeight:1.9,maxWidth:300}}>Live scored run windows with outfit picks, wind direction, air quality and pollen — for wherever you are.</div>
      {hasGeo&&<button onClick={handleGrant} disabled={asking} style={{...mono,fontSize:11,color:C.bg,background:C.green,border:"none",borderRadius:10,padding:"14px 36px",cursor:asking?"default":"pointer",letterSpacing:1.5,marginBottom:14,opacity:asking?0.7:1,width:"100%",maxWidth:280}}>{asking?"Locating you...":"Use My Location"}</button>}
      <button onClick={onSkip} style={{...mono,fontSize:10,color:C.muted,background:"none",border:"none",cursor:"pointer",letterSpacing:1,textDecoration:"underline"}}>{hasGeo?"Use New York City instead":"Continue with New York City"}</button>
    </div>
  );
}

const DIST_ITEMS=Array.from({length:26},(_,i)=>`${i+1} mi`);
const PACE_ITEMS=["5:00","5:30","6:00","6:30","7:00","7:30","8:00","8:30","9:00","9:30","10:00","10:30","11:00","11:30","12:00","13:00","14:00","15:00"];

function StepperPicker({label,value,items,onChange,unit=""}) {
  const idx=items.indexOf(value), si=idx<0?0:idx;
  const btnSt=disabled=>({...mono,fontSize:20,color:disabled?C.dim:C.green,background:"none",border:`1px solid ${disabled?C.border:C.border2}`,borderRadius:8,width:40,height:40,cursor:disabled?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0});
  return (
    <div>
      <div style={{...mono,fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:12,background:C.surface2,borderRadius:10,border:`1px solid ${C.border2}`,padding:"12px 16px"}}>
        <button onClick={()=>{if(si>0)onChange(items[si-1]);}} disabled={si<=0} style={btnSt(si<=0)}>-</button>
        <div style={{flex:1,textAlign:"center"}}><span style={{...cond,fontSize:26,fontWeight:700,color:C.green,letterSpacing:1}}>{items[si]}</span>{unit&&<span style={{...mono,fontSize:10,color:C.muted,marginLeft:6}}>{unit}</span>}</div>
        <button onClick={()=>{if(si<items.length-1)onChange(items[si+1]);}} disabled={si>=items.length-1} style={btnSt(si>=items.length-1)}>+</button>
      </div>
    </div>
  );
}

function SettingsPanel({settings,locationName,onSave,onClose,onResetLocation}) {
  const [loc,setLoc]=useState({...settings});
  const distVal=`${loc.distance} mi`;
  const paceVal=PACE_ITEMS.find(p=>p.startsWith(String(loc.pace)+":")) || "9:00";
  const mins=loc.distance*loc.pace, hrs=Math.floor(mins/60), rem=mins%60;
  const dur=hrs>0?`${hrs}h ${rem}m`:`${rem} min`;
  return (
    <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",justifyContent:"flex-end"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)"}}/>
      <div style={{position:"relative",width:"min(340px,90vw)",background:C.surface,borderLeft:`1px solid ${C.border2}`,padding:"28px 24px",overflowY:"auto",display:"flex",flexDirection:"column",gap:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{...cond,fontSize:24,fontWeight:700,color:C.text,letterSpacing:3,textTransform:"uppercase"}}>Settings</div>
          <button onClick={onClose} style={{...mono,fontSize:16,color:C.muted,background:"none",border:"none",cursor:"pointer",padding:"4px 8px"}}>x</button>
        </div>
        <div style={{borderBottom:`1px solid ${C.border}`,paddingBottom:20}}>
          <div style={{...mono,fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Location</div>
          <div style={{...mono,fontSize:11,color:C.text,marginBottom:10}}>{locationName}</div>
          <button onClick={()=>{onResetLocation();onClose();}} style={{...mono,fontSize:9,color:C.muted,background:"none",border:`1px solid ${C.border2}`,borderRadius:6,padding:"6px 14px",cursor:"pointer",letterSpacing:1}}>Change Location</button>
        </div>
        <StepperPicker label="Run Distance" value={distVal} items={DIST_ITEMS} onChange={v=>setLoc(l=>({...l,distance:parseInt(v)}))}/>
        <StepperPicker label="Pace per mile" value={paceVal} items={PACE_ITEMS} unit="/mi" onChange={v=>setLoc(l=>({...l,pace:parseInt(v)}))}/>
        <div style={{background:C.surface2,borderRadius:10,padding:"14px 16px",border:`1px solid ${C.border}`}}>
          <div style={{...mono,fontSize:9,color:C.muted,letterSpacing:1,marginBottom:6}}>Estimated run time</div>
          <div style={{...cond,fontSize:28,fontWeight:700,color:C.green,letterSpacing:2}}>{dur}</div>
          <div style={{...mono,fontSize:9,color:C.dim,marginTop:4}}>{loc.distance} mi at {loc.pace}:00/mi</div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{...mono,fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Daylight runs only</div><div style={{...mono,fontSize:8,color:C.dim,marginTop:4}}>Exclude windows after sunset</div></div>
          <div onClick={()=>setLoc(l=>({...l,daylightOnly:!l.daylightOnly}))} style={{width:42,height:24,borderRadius:12,background:loc.daylightOnly?C.green:C.border2,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
            <div style={{position:"absolute",top:3,left:loc.daylightOnly?20:3,width:18,height:18,borderRadius:"50%",background:loc.daylightOnly?C.bg:C.muted,transition:"left .2s"}}/>
          </div>
        </div>
        <button onClick={()=>{onSave(loc);onClose();}} style={{...mono,fontSize:11,color:C.bg,background:C.green,border:"none",borderRadius:8,padding:"12px 24px",cursor:"pointer",letterSpacing:1.5}}>Save</button>
      </div>
    </div>
  );
}

export default function App() {
  const [phase,       setPhase]       = useState("init");
  const [location,    setLocation]    = useState(null);
  const [weather,     setWeather]     = useState(null);
  const [view,        setView]        = useState("tomorrow");
  const [settings,    setSettings]    = useState(DEFAULT_SETTINGS);
  const [showSettings,setShowSettings]= useState(false);
  const [shareMsg,    setShareMsg]    = useState(null);
  const [visible,     setVisible]     = useState(false);
  const [loadError,   setLoadError]   = useState("");
  const [showPWA,     setShowPWA]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [touchStartY, setTouchStartY] = useState(null);

  const loadWeather = useCallback(async (loc) => {
    setPhase("loading");
    setLoadError("");
    try {
      const data = await fetchLiveWeather(loc.lat, loc.lon);
      setWeather(data);
      setPhase("ready");
      setTimeout(() => setVisible(true), 60);
    } catch (err) {
      const now=new Date(), tom=new Date(now); tom.setDate(now.getDate()+1);
      setWeather({isLive:false,today:makeFallbackDay(now),tomorrow:makeFallbackDay(tom)});
      setLoadError("Using seasonal estimates — live data unavailable.");
      setPhase("ready");
      setTimeout(() => setVisible(true), 60);
    }
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=JetBrains+Mono:wght@300;400;500&family=Barlow+Condensed:wght@300;400;600;700&family=DM+Sans:wght@300;400;500&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}body{background:#050c08;}
      .fade{opacity:0;transform:translateY(14px);transition:opacity .55s ease,transform .55s ease;}
      .fade.in{opacity:1;transform:translateY(0);}
      @keyframes breathe{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.1);opacity:.7}}
      @keyframes breathe2{0%,100%{transform:scale(1) rotate(0deg);opacity:.3}50%{transform:scale(1.05) rotate(-4deg);opacity:.45}}
      @keyframes rain{0%{transform:translateY(-5%);opacity:.4}100%{transform:translateY(110vh) translateX(-35px);opacity:0}}
      @keyframes windStreak{0%{transform:translateX(-100px);opacity:0}50%{opacity:.15}100%{transform:translateX(110vw);opacity:0}}
      .tog{transition:all .18s;}.tog:hover{opacity:.8;}
      .hbar{cursor:default;transition:filter .2s;}.hbar:hover{filter:brightness(1.4);}
      .chip{transition:all .18s;}.chip:hover{border-color:#2aab6e!important;background:#0a3320!important;}
      tr.dr{transition:background .15s;}tr.dr:hover{background:#0a332030!important;}
      ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:#1e3024;border-radius:2px;}
    `;
    document.head.appendChild(style);
    try {
      const sLoc  = JSON.parse(localStorage.getItem("wsr_loc")      || "null");
      const sSett = JSON.parse(localStorage.getItem("wsr_settings") || "null");
      if (sSett) setSettings(s => ({...s, ...sSett}));
      if (sLoc)  { setLocation(sLoc); loadWeather(sLoc); return; }
    } catch {}
    setPhase("location");
  }, [loadWeather]);

  useEffect(() => {
    if (phase === "ready") {
      try { if (!sessionStorage.getItem("pwa_dismissed")) setTimeout(()=>setShowPWA(true),3000); } catch {}
    }
  }, [phase]);

  const handleTouchStart = useCallback((e) => {
    if (window.scrollY === 0) setTouchStartY(e.touches[0].clientY);
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (touchStartY === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    setTouchStartY(null);
    if (dy > 72 && !refreshing && location) {
      setRefreshing(true);
      fetchLiveWeather(location.lat, location.lon)
        .then(data=>{setWeather(data);setVisible(false);setTimeout(()=>setVisible(true),60);})
        .catch(()=>{})
        .finally(()=>setRefreshing(false));
    }
  }, [touchStartY, refreshing, location]);

  const handleGrant = useCallback(async (lat, lon) => {
    setPhase("loading");
    const name = await getLocationName(lat, lon);
    const loc = {lat, lon, name};
    setLocation(loc);
    try { localStorage.setItem("wsr_loc", JSON.stringify(loc)); } catch {}
    loadWeather(loc);
  }, [loadWeather]);

  const handleSkip = useCallback(() => {
    setLocation(DEFAULT_LOC);
    loadWeather(DEFAULT_LOC);
  }, [loadWeather]);

  const handleSettingsSave = useCallback((s) => {
    setSettings(s);
    try { localStorage.setItem("wsr_settings", JSON.stringify(s)); } catch {}
  }, []);

  const handleResetLocation = useCallback(() => {
    try { localStorage.removeItem("wsr_loc"); } catch {}
    setLocation(null); setWeather(null); setPhase("location");
  }, []);

  if (phase==="init"||phase==="loading") return (
    <div style={{...bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",gap:14,textAlign:"center",padding:20}}>
      <div style={{...cond,fontSize:28,color:C.green,letterSpacing:3}}>LOADING FORECAST</div>
      <div style={{...mono,fontSize:10,color:C.muted,letterSpacing:1}}>{location?.name||"Fetching weather..."}</div>
      <Dots/>
    </div>
  );
  if (phase==="location") return <LocationScreen onGrant={handleGrant} onSkip={handleSkip}/>;
  if (!weather) return null;

  const dayData = view==="today" ? weather.today : weather.tomorrow;
  const sun     = dayData.sunTimes || {sunrise:6.5,sunset:19.5};
  const {hours,best} = processHours(dayData.hours||[], sun, settings.daylightOnly);
  const bh  = best ? hours[best.startIdx] : null;
  const col = bh ? sc(best.avgScore) : C.green;
  const runMins=settings.distance*settings.pace, retTotal=bh?bh.hr*60+runMins:0;
  const retH=Math.floor(retTotal/60), retM=retTotal%60;
  const retStr=retM>0?`${retH%12||12}:${String(retM).padStart(2,"0")}${retH>=12?"pm":"am"}`:fmt12(retH);
  const dirRec = bh ? getDirRec(dayData.windDeg,bh.w) : {dir:"EITHER",headline:"",detail:""};
  const outfit = bh ? getOutfit(bh) : null;

  return (
    <div style={{...bg,minHeight:"100vh",position:"relative",overflow:"hidden"}} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <WeatherBg hours={hours}/>
      {refreshing&&<div style={{position:"fixed",top:0,left:0,right:0,zIndex:200,textAlign:"center",padding:10,background:C.surface,borderBottom:`1px solid ${C.border2}`,...mono,fontSize:9,color:C.green,letterSpacing:2}}>REFRESHING...</div>}
      {loadError&&<div style={{position:"fixed",top:0,left:0,right:0,zIndex:190,textAlign:"center",padding:8,background:C.surface,...mono,fontSize:8,color:C.fair}}>{loadError}</div>}
      {showPWA&&<PWABanner onDismiss={()=>{setShowPWA(false);try{sessionStorage.setItem("pwa_dismissed","1");}catch{}}}/>}
      {showSettings&&<SettingsPanel settings={settings} locationName={location?.name||"Unknown"} onSave={handleSettingsSave} onClose={()=>setShowSettings(false)} onResetLocation={handleResetLocation}/>}

      <div style={{position:"relative",zIndex:1,maxWidth:520,margin:"0 auto",padding:"36px 20px 80px"}}>

        <div className={`fade ${visible?"in":""}`} style={{marginBottom:28,...dd(0)}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{...mono,fontSize:8,color:C.greenDim,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>{location?.name||"Upper West Side, NYC"}</div>
              <div style={{...cond,fontSize:36,fontWeight:700,color:C.text,letterSpacing:5,textTransform:"uppercase",lineHeight:1}}>Run Forecast</div>
              <div style={{...mono,fontSize:8,color:weather.isLive?C.greenMid:C.dim,marginTop:5,letterSpacing:1}}>
                {weather.isLive?"● Live · Tomorrow.io":"◌ Seasonal estimate"}
                {weather.fetchedAt&&<span style={{color:C.dim,marginLeft:8}}>· Updated {Math.round((Date.now()-weather.fetchedAt)/60000)||"<1"} min ago</span>}
              </div>
            </div>
            <button onClick={()=>setShowSettings(true)} style={{...mono,fontSize:9,color:C.muted,background:"none",border:`1px solid ${C.border2}`,borderRadius:6,padding:"6px 12px",cursor:"pointer",letterSpacing:1,marginTop:4}}>Settings</button>
          </div>
          <div style={{...mono,fontSize:9,color:C.muted,marginTop:8}}>{dayData.label.toUpperCase()}</div>
          <div style={{display:"inline-flex",gap:2,marginTop:14,background:C.surface,borderRadius:8,padding:3,border:`1px solid ${C.border2}`}}>
            {[{id:"tomorrow",label:"Tomorrow"},{id:"today",label:"Today"}].map(({id,label})=>(
              <button key={id} className="tog" onClick={()=>{setView(id);setVisible(false);setTimeout(()=>setVisible(true),40);}} style={{padding:"7px 20px",borderRadius:6,border:"none",cursor:"pointer",background:view===id?C.green:"transparent",color:view===id?C.bg:C.muted,...mono,fontSize:10,fontWeight:view===id?500:300,letterSpacing:1.5,textTransform:"uppercase"}}>{label}</button>
            ))}
          </div>
        </div>

        {bh&&(
          <div className={`fade ${visible?"in":""}`} style={{...dd(120),marginBottom:16}}>
            <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border2}`,padding:"28px 24px 24px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${col}50,transparent)`}}/>
              <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                <div style={{position:"relative",width:200,height:200,flexShrink:0,margin:"-20px -16px -20px -16px"}}>
                  <ScoreArc score={best.avgScore} color={col} animate={visible}/>
                  <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-48%)",textAlign:"center"}}>
                    <div style={{...cond,fontSize:44,fontWeight:700,color:col,lineHeight:1,letterSpacing:1}}><AnimNum value={best.avgScore}/></div>
                    <div style={{...mono,fontSize:8,color:C.muted,letterSpacing:2,marginTop:1}}>/100</div>
                    <div style={{...mono,fontSize:9,color:col,letterSpacing:2,marginTop:7,fontWeight:500}}>{sl(best.avgScore)}</div>
                  </div>
                </div>
                <div style={{flex:1,minWidth:130}}>
                  <div style={{...mono,fontSize:8,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Best Window</div>
                  <div style={{...serif,fontSize:46,fontWeight:300,color:C.text,lineHeight:0.95,letterSpacing:-1}}>{fmt12(bh.hr)} - {fmt12(bh.hr+2)}</div>
                  <div style={{...mono,fontSize:9,color:C.muted,marginTop:10}}>Back by ~{retStr} - {settings.distance}mi</div>
                  <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:6}}>
                    {[{icon:"🌡",val:`${bh.t}F`},{icon:"🌧",val:`${bh.p}%`},{icon:"💨",val:`${bh.w}mph`}].map(({icon,val})=>(
                      <span key={val} className="chip" style={{...mono,fontSize:10,color:C.text,background:C.surface2,border:`1px solid ${C.border2}`,borderRadius:6,padding:"4px 10px",display:"inline-flex",alignItems:"center",gap:5}}>{icon} {val}</span>
                    ))}
                  </div>
                  <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:6}}>
                    {(()=>{const ai=aqiInfo(bh.aqi||40),pi=pollenInfo(bh.pollen||0);return(<>
                      <span style={{...mono,fontSize:9,color:ai.c,background:`${ai.c}18`,border:`1px solid ${ai.c}40`,borderRadius:5,padding:"3px 8px"}}>AQI: {ai.l}</span>
                      <span style={{...mono,fontSize:9,color:pi.c,background:`${pi.c}18`,border:`1px solid ${pi.c}40`,borderRadius:5,padding:"3px 8px"}}>Pollen: {pi.l}</span>
                    </>);})()}
                  </div>
                </div>
              </div>
              <div style={{marginTop:26,paddingTop:22,borderTop:`1px solid ${C.border}`}}>
                {[{key:"precipitation",label:"Rain",icon:"🌧",w:28},{key:"wind",label:"Wind",icon:"💨",w:20},{key:"temperature",label:"Temp",icon:"🌡",w:18},{key:"aqi",label:"Air Quality",icon:"💚",w:15},{key:"humidity",label:"Humidity",icon:"💧",w:8},{key:"uv",label:"UV",icon:"☀",w:6},{key:"pollen",label:"Pollen",icon:"🌿",w:5}].map(({key,label,icon,w},fi)=>{
                  const sv=bh.bd[key],fc=sc(sv);
                  return <div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><div style={{fontSize:11,width:18,flexShrink:0}}>{icon}</div><div style={{...mono,fontSize:9,color:C.muted,width:74,letterSpacing:1,flexShrink:0}}>{label}</div><div style={{flex:1,background:C.surface2,borderRadius:2,height:3,overflow:"hidden"}}><div style={{width:visible?`${sv}%`:"0%",height:"100%",background:`linear-gradient(90deg,${C.greenDeep},${fc})`,borderRadius:2,transition:"width 1.1s cubic-bezier(0.4,0,0.2,1)",transitionDelay:`${300+fi*70}ms`}}/></div><div style={{...mono,fontSize:9,color:fc,width:22,textAlign:"right",fontWeight:500}}>{sv}</div><div style={{...mono,fontSize:8,color:C.dim,width:30,textAlign:"right"}}>{w}%</div></div>;
                })}
              </div>
              <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"flex-start",gap:10}}>
                <span style={{color:col,fontSize:14,flexShrink:0,marginTop:1}}>💬</span>
                <div><div style={{...mono,fontSize:8,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Why this window?</div><div style={{...mono,fontSize:10,color:C.text,lineHeight:1.7}}>{getWhyExplainer(bh,best)}</div></div>
              </div>
              <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`,display:"flex",gap:10,alignItems:"center"}}>
                <button onClick={async()=>{const r=await doShare(bh,best,dayData.label,location?.name||"NYC");if(r){setShareMsg(r==="copied"?"Copied!":"Shared!");setTimeout(()=>setShareMsg(null),2500);}}} style={{...mono,fontSize:10,color:C.green,background:`${C.green}15`,border:`1px solid ${C.green}40`,borderRadius:8,padding:"9px 18px",cursor:"pointer",letterSpacing:1,flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>Share this forecast</button>
                {shareMsg&&<div style={{...mono,fontSize:9,color:C.green,letterSpacing:1,flexShrink:0}}>{shareMsg}</div>}
              </div>
            </div>
          </div>
        )}

        {!bh&&hours.length>0&&(()=>{
          const msg=BAD_DAY_MSGS[new Date().getDate()%BAD_DAY_MSGS.length];
          const topScore=Math.max(...hours.map(h=>h.score));
          return (
            <div className={`fade ${visible?"in":""}`} style={{...dd(120),marginBottom:16}}>
              <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border2}`,padding:"40px 28px",textAlign:"center",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${C.skip}40,transparent)`}}/>
                <div style={{fontSize:56,marginBottom:16}}>{msg.emoji}</div>
                <div style={{...cond,fontSize:32,fontWeight:700,color:C.text,letterSpacing:3,textTransform:"uppercase",lineHeight:1,marginBottom:8}}>{msg.title}</div>
                <div style={{...mono,fontSize:11,color:C.muted,lineHeight:1.8,marginBottom:20}}>{msg.sub}</div>
                <div style={{...mono,fontSize:9,color:C.dim}}>Best score today: <span style={{color:C.skip}}>{topScore}/100</span></div>
              </div>
            </div>
          );
        })()}

        {bh&&(
          <div className={`fade ${visible?"in":""}`} style={{...dd(210),marginBottom:16}}>
            <div style={{background:C.surface,borderRadius:16,border:`1px solid ${C.border2}`,padding:"20px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${col}40,transparent)`}}/>
              <div style={{...mono,fontSize:8,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Route Direction - West Side Highway</div>
              <div style={{display:"flex",gap:16,alignItems:"center"}}>
                <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",width:40}}>
                  <div style={{...mono,fontSize:8,color:dirRec.dir==="NORTH"?col:C.dim,letterSpacing:1,marginBottom:4,fontWeight:dirRec.dir==="NORTH"?500:300}}>N</div>
                  <div style={{width:dirRec.dir==="NORTH"?12:7,height:dirRec.dir==="NORTH"?12:7,borderRadius:"50%",background:dirRec.dir==="NORTH"?col:C.border2,border:dirRec.dir==="NORTH"?`2px solid ${col}`:`1px solid ${C.border2}`,flexShrink:0}}/>
                  <div style={{position:"relative",width:2,height:60,background:`linear-gradient(180deg,${dirRec.dir==="NORTH"?col:C.border2},${dirRec.dir==="SOUTH"?col:C.border2})`,margin:"4px 0"}}>
                    {dirRec.dir!=="EITHER"&&<div style={{position:"absolute",left:"50%",top:dirRec.dir==="NORTH"?"30%":"60%",transform:"translate(-50%,-50%)",color:col,fontSize:12}}>{dirRec.dir==="NORTH"?"^":"v"}</div>}
                  </div>
                  <div style={{width:dirRec.dir==="SOUTH"?12:7,height:dirRec.dir==="SOUTH"?12:7,borderRadius:"50%",background:dirRec.dir==="SOUTH"?col:C.border2,border:dirRec.dir==="SOUTH"?`2px solid ${col}`:`1px solid ${C.border2}`,flexShrink:0}}/>
                  <div style={{...mono,fontSize:8,color:dirRec.dir==="SOUTH"?col:C.dim,letterSpacing:1,marginTop:4,fontWeight:dirRec.dir==="SOUTH"?500:300}}>S</div>
                </div>
                <WindRose windDeg={dayData.windDeg} color={col}/>
                <div style={{flex:1}}>
                  <div style={{...cond,fontSize:20,fontWeight:700,color:C.text,letterSpacing:2,lineHeight:1,textTransform:"uppercase"}}>{dirRec.headline}</div>
                  <div style={{...mono,fontSize:9,color:col,marginTop:5}}>{compassLabel(dayData.windDeg)} wind - {bh.w} mph</div>
                  <div style={{...mono,fontSize:9,color:C.muted,marginTop:8,lineHeight:1.7}}>{dirRec.detail}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {outfit&&(
          <div className={`fade ${visible?"in":""}`} style={{...dd(290),marginBottom:16}}>
            <div style={{background:C.surface,borderRadius:16,border:`1px solid ${C.border2}`,padding:"20px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${col}40,transparent)`}}/>
              <div style={{...mono,fontSize:8,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>What to Wear</div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                <div style={{...cond,fontSize:22,fontWeight:700,color:C.text,letterSpacing:1}}>Feels like {outfit.feel}F</div>
                <div style={{...mono,fontSize:9,color:col,letterSpacing:1}}>{outfit.feelPhrase}</div>
                {outfit.rainy&&<span style={{...mono,fontSize:8,color:"#6ab0e8",background:"#6ab0e818",border:"1px solid #6ab0e840",borderRadius:4,padding:"2px 8px"}}>RAIN</span>}
                {outfit.uvHigh&&<span style={{...mono,fontSize:8,color:"#e8c84a",background:"#e8c84a18",border:"1px solid #e8c84a40",borderRadius:4,padding:"2px 8px"}}>HIGH UV</span>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {outfit.layers.map(({slot,icon,item,note})=>(
                  <div key={slot} style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    <div style={{fontSize:18,width:26,flexShrink:0,lineHeight:1.2}}>{icon}</div>
                    <div style={{flex:1}}><div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}><span style={{...mono,fontSize:8,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",width:52,flexShrink:0}}>{slot}</span><span style={{...mono,fontSize:11,color:C.text}}>{item}</span></div><div style={{...mono,fontSize:8,color:C.muted,marginTop:2,marginLeft:60}}>{note}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className={`fade ${visible?"in":""}`} style={{...dd(370),marginBottom:16}}>
          <div style={{background:C.surface,borderRadius:16,border:`1px solid ${C.border2}`,padding:"20px 20px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{...mono,fontSize:8,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Hourly Score</div>
              <div style={{display:"flex",gap:12}}><span style={{...mono,fontSize:8,color:"#e8c060"}}>Sunrise {fmt12(Math.round(sun.sunrise))}</span><span style={{...mono,fontSize:8,color:"#e08040"}}>Sunset {fmt12(Math.round(sun.sunset))}</span></div>
            </div>
            <div style={{display:"flex",gap:3,alignItems:"flex-end",height:60}}>
              {hours.map((h,i)=>{
                const isBest=best&&(i===best.startIdx||i===best.startIdx+1), fc=sc(h.score), barH=Math.max(4,(h.score/100)*50), isNight=h.hr<sun.sunrise||h.hr>=sun.sunset;
                return <div key={h.hr} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}><div className="hbar" title={`${fmt12(h.hr)}: ${h.score}/100`} style={{width:"100%",height:barH,background:isBest?`linear-gradient(180deg,${fc},${fc}80)`:`${fc}${isNight?"16":"26"}`,borderRadius:"2px 2px 0 0",opacity:isNight?0.55:1}}/><div style={{...mono,fontSize:7,color:isBest?C.text:C.dim,whiteSpace:"nowrap"}}>{h.hr%4===1?fmt12(h.hr):""}</div></div>;
              })}
            </div>
          </div>
        </div>

        <div className={`fade ${visible?"in":""}`} style={{...dd(450)}}>
          <div style={{background:C.surface,borderRadius:16,border:`1px solid ${C.border2}`,padding:"20px"}}>
            <div style={{...mono,fontSize:8,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:16}}>Full Hourly Breakdown</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",...mono,fontSize:11}}>
                <thead><tr>{["TIME","SCORE","F","RAIN","WIND","AQI","UV"].map(c=><th key={c} style={{textAlign:"left",padding:"0 8px 10px 0",color:C.dim,fontWeight:400,letterSpacing:1.5,fontSize:8}}>{c}</th>)}</tr></thead>
                <tbody>
                  {hours.map((h,i)=>{
                    const isBest=best&&(i===best.startIdx||i===best.startIdx+1), fc=sc(h.score), ai=aqiInfo(h.aqi||40);
                    return <tr key={h.hr} className="dr" style={{borderTop:`1px solid ${C.border}`,background:isBest?`${fc}08`:"transparent"}}><td style={{padding:"7px 8px 7px 0",color:isBest?C.text:C.muted,fontWeight:isBest?500:300}}>{fmt12(h.hr)}{isBest&&i===best.startIdx&&<span style={{color:fc,marginLeft:5,fontSize:8}}>●</span>}</td><td style={{padding:"7px 8px 7px 0"}}><span style={{color:fc,fontWeight:500}}>{h.score}</span></td><td style={{padding:"7px 8px 7px 0",color:C.text}}>{h.t}</td><td style={{padding:"7px 8px 7px 0",color:h.p>40?C.skip:h.p>20?C.fair:C.muted}}>{h.p}%</td><td style={{padding:"7px 8px 7px 0",color:h.w>18?C.skip:h.w>10?C.fair:C.muted}}>{h.w}</td><td style={{padding:"7px 8px 7px 0",color:ai.c}}>{ai.l}</td><td style={{padding:"7px 8px 7px 0",color:h.u>7?C.skip:h.u>4?C.fair:C.muted}}>{h.u.toFixed(1)}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={`fade ${visible?"in":""}`} style={{...dd(520),marginTop:22,display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap"}}>
          {[[C.great,"80+ Perfect"],[C.good,"65+ Good"],[C.fair,"45+ Fair"],[C.skip,"0+ Skip"]].map(([fc,lbl])=>(
            <div key={lbl} style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:fc}}/><span style={{...mono,fontSize:8,color:C.dim,letterSpacing:1}}>{lbl}</span></div>
          ))}
        </div>
        <div style={{textAlign:"center",marginTop:12,...mono,fontSize:7,color:C.dim,letterSpacing:2,opacity:0.4}}>{weather.isLive?"LIVE TOMORROW.IO":"SEASONAL ESTIMATE"} - TEMPRUNTURE.COM</div>
      </div>
    </div>
  );
}
