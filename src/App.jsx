import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";

// ─── Themes ────────────────────────────────────────────────────────────────────
const DARK = {
  bg:"#050c08", surface:"#08120a", surface2:"#0d1a10",
  border:"#142018", border2:"#1e3024",
  green:"#3dd68c", greenMid:"#2aab6e", greenDim:"#165c38", greenDeep:"#0a3320",
  text:"#c8e8d0", muted:"#5a8a68", dim:"#1e3828",
  great:"#3dd68c", good:"#a8e060", fair:"#f0c040", skip:"#e05858",
};
const LIGHT = {
  bg:"#f4efe6", surface:"#ece6da", surface2:"#e2dbd0",
  border:"#d0c8bc", border2:"#beb5a8",
  green:"#1a7a4a", greenMid:"#156038", greenDim:"#0d4228", greenDeep:"#dff0e8",
  text:"#1a2820", muted:"#4a6850", dim:"#9aaa98",
  great:"#1a7a4a", good:"#5a8010", fair:"#b06808", skip:"#c03030",
};
const ThemeCtx = createContext(DARK);
const useT = () => useContext(ThemeCtx);

// ─── Config ────────────────────────────────────────────────────────────────────
const W = { precipitation:0.28, wind:0.20, temperature:0.18, humidity:0.08, uv:0.06, aqi:0.15, pollen:0.05 };
const DEFAULT_LOC = { lat:40.794, lon:-73.9916, name:"Upper West Side, NYC" };
const DEFAULT_SETTINGS = { distance:5.0, pace:540, apiKey:"ENu4XXZ57XWQUSkwSQ1iYw7waGmDXhWV", daylightOnly:false, tempUnit:"F", theme:"auto" };

// ─── Helpers ───────────────────────────────────────────────────────────────────
const sc  = (s,T) => s>=80?T.great:s>=65?T.good:s>=45?T.fair:T.skip;
const sl  = s => s>=80?"PERFECT":s>=65?"GOOD":s>=45?"FAIR":"SKIP IT";
const mono  = { fontFamily:"'JetBrains Mono',monospace" };
const serif  = { fontFamily:"'Cormorant Garamond',serif" };
const cond  = { fontFamily:"'Barlow Condensed',sans-serif" };
const aqiLabel = v => v<=50?{l:"Good",k:"great"}:v<=100?{l:"Moderate",k:"good"}:v<=150?{l:"Sensitive",k:"fair"}:{l:"Unhealthy",k:"skip"};
const polLabel = v => v<=0?{l:"None",k:"great"}:v<=30?{l:"Low",k:"good"}:v<=100?{l:"Medium",k:"fair"}:{l:"High",k:"skip"};
const aqC = (v,T) => T[aqiLabel(v).k];
const polC = (v,T) => T[polLabel(v).k];
const fmt12 = h => h===0||h===24?"12am":h<12?`${h}am`:h===12?"12pm":`${h-12}pm`;
const compassLabel = d => ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(d/22.5)%16];
const windChill = (t,w) => t>50||w<3?t:Math.round(35.74+0.6215*t-35.75*Math.pow(w,0.16)+0.4275*t*Math.pow(w,0.16));
const toC = f => Math.round((f-32)*5/9);
const displayTemp = (f,unit) => unit==="C"?`${toC(f)}°C`:`${f}°F`;
const dd = ms => ({ transitionDelay:`${ms}ms` });
const paceToStr = secs => `${Math.floor(secs/60)}:${String(secs%60).padStart(2,"0")} /mi`;
const paceFromStr = s => { const p=s.replace(" /mi","").split(":"); return parseInt(p[0])*60+parseInt(p[1]); };

// ─── Dist / Pace lists ─────────────────────────────────────────────────────────
const DIST_ITEMS = Array.from({length:104},(_,i) => `${((i+1)*0.25).toFixed(2).replace(/\.00$/,"").replace(/\.50$/,".5").replace(/\.25$/,".25").replace(/\.75$/,".75")} mi`);
const PACE_ITEMS = Array.from({length:61},(_,i) => { const s=300+i*10; return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")} /mi`; });

// ─── Seasonal fallback ─────────────────────────────────────────────────────────
const SEA = {
  0:{base:34,sw:6,rain:.35,wind:13,hum:62,uv:2,prev:315,aqi:35,pol:0},
  1:{base:36,sw:7,rain:.32,wind:13,hum:60,uv:3,prev:300,aqi:35,pol:5},
  2:{base:44,sw:8,rain:.38,wind:14,hum:58,uv:4,prev:270,aqi:40,pol:60},
  3:{base:54,sw:9,rain:.38,wind:13,hum:55,uv:6,prev:250,aqi:45,pol:90},
  4:{base:64,sw:9,rain:.35,wind:11,hum:57,uv:7,prev:230,aqi:50,pol:70},
  5:{base:73,sw:8,rain:.30,wind:10,hum:60,uv:9,prev:225,aqi:60,pol:50},
  6:{base:79,sw:7,rain:.35,wind:9,hum:63,uv:10,prev:220,aqi:65,pol:30},
  7:{base:77,sw:7,rain:.35,wind:9,hum:64,uv:9,prev:225,aqi:60,pol:25},
  8:{base:71,sw:8,rain:.30,wind:9,hum:63,uv:7,prev:240,aqi:45,pol:60},
  9:{base:61,sw:9,rain:.32,wind:10,hum:61,uv:5,prev:270,aqi:40,pol:40},
  10:{base:51,sw:8,rain:.35,wind:12,hum:62,uv:3,prev:295,aqi:38,pol:5},
  11:{base:41,sw:7,rain:.35,wind:13,hum:63,uv:2,prev:315,aqi:35,pol:0},
};
function seededRand(seed){let s=seed;return()=>{s=(s*1664525+1013904223)&0xffffffff;return(s>>>0)/0xffffffff;};}
function makeFallbackDay(date){
  const m=SEA[date.getMonth()],rand=seededRand(date.getFullYear()*10000+date.getMonth()*100+date.getDate());
  const isR=rand()<m.rain,ri=isR?0.4+rand()*0.6:0,wm=0.7+rand()*0.6,to=(rand()-0.5)*m.sw*2;
  const wd=Math.round((m.prev+(rand()-0.5)*90+360)%360),aqO=(rand()-0.5)*20;
  const mo=date.getMonth();
  const sunrises=[7.2,6.8,6.1,5.3,4.7,4.4,4.6,5.2,5.9,6.6,7.2,7.5];
  const sunsets=[16.7,17.3,18.0,18.7,19.4,19.9,19.8,19.2,18.3,17.4,16.7,16.4];
  const hours=Array.from({length:17},(_,i)=>{
    const hr=i+5,tc=-Math.cos(((hr-6)/9)*Math.PI)*m.sw,temp=Math.round(m.base+to+tc);
    const rc=isR?30+ri*50*Math.sin(((hr-8)/13)*Math.PI):5+rand()*8;
    const wind=Math.round(Math.max(3,m.wind*wm*(0.7+0.3*Math.sin(((hr-8)/13)*Math.PI))));
    const hum=Math.round(Math.max(30,Math.min(95,m.hum+(isR?12:0)-(temp-m.base)*0.4)));
    const uc=hr>=7&&hr<=19?Math.sin(((hr-7)/12)*Math.PI):0;
    const uv=isR?0:parseFloat((m.uv*uc).toFixed(1));
    const aqi=Math.max(0,Math.round(m.aqi+aqO+(hr>=12&&hr<=17?10:0)));
    const pc=hr>=8&&hr<=16?Math.sin(((hr-8)/8)*Math.PI):0;
    return{hr,t:temp,p:Math.round(Math.max(0,Math.min(95,rc))),w:wind,wd,h:hum,u:uv,aqi,pollen:Math.round(m.pol*pc)};
  });
  const fmtL=d=>d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
  return{label:fmtL(date),hours,windDeg:wd,sunTimes:{sunrise:sunrises[mo],sunset:sunsets[mo]}};
}

// ─── Live weather ──────────────────────────────────────────────────────────────
async function fetchLiveWeather(lat,lon,apiKey){
  if(!apiKey)throw new Error("No API key");
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone,tzEnc=encodeURIComponent(tz);
  const tUrl=`https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&timesteps=1h&units=imperial&apikey=${apiKey}`;
  const aUrl=`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=us_aqi,grass_pollen,birch_pollen,ragweed_pollen&timezone=${tzEnc}&forecast_days=2`;
  const sUrl=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&timezone=${tzEnc}&forecast_days=2`;
  const [tRes,aRes,sRes]=await Promise.all([fetch(tUrl),fetch(aUrl).catch(()=>null),fetch(sUrl).catch(()=>null)]);
  if(!tRes.ok){const err=await tRes.json().catch(()=>({}));throw new Error(err?.message||`Tomorrow.io ${tRes.status}`);}
  const tData=await tRes.json(),aData=aRes?.ok?await aRes.json():null,sData=sRes?.ok?await sRes.json():null;
  const hourlyArr=tData?.timelines?.hourly;
  if(!Array.isArray(hourlyArr))throw new Error("Unexpected shape");
  const aqMap={};
  aData?.hourly?.time?.forEach((t,i)=>{aqMap[t.slice(0,13)]={aqi:aData.hourly.us_aqi?.[i]??40,pollen:(aData.hourly.grass_pollen?.[i]??0)+(aData.hourly.birch_pollen?.[i]??0)+(aData.hourly.ragweed_pollen?.[i]??0)};});
  const parseSun=str=>{if(!str)return null;const d=new Date(str);return d.getHours()+d.getMinutes()/60;};
  const now=new Date(),tom=new Date(now);tom.setDate(now.getDate()+1);
  const toDS=d=>d.toLocaleDateString("en-CA"),todayStr=toDS(now),tomStr=toDS(tom);
  const getSun=ds=>{const i=sData?.daily?.time?.indexOf(ds)??-1;if(i<0)return{sunrise:6.5,sunset:19.5};return{sunrise:parseSun(sData.daily.sunrise[i])??6.5,sunset:parseSun(sData.daily.sunset[i])??19.5};};
  const buildDay=ds=>{const hrs=[];for(const entry of hourlyArr){const t=entry.time;if(!t.startsWith(ds))continue;const hr=parseInt(t.slice(11,13)),v=entry.values,key=t.slice(0,13),aq=aqMap[key]||{aqi:40,pollen:0};hrs.push({hr,t:Math.round(v.temperature??60),p:Math.round(v.precipitationProbability??10),w:Math.round(v.windSpeed??8),wd:Math.round(v.windDirection??270),h:Math.round(v.humidity??60),u:parseFloat((v.uvIndex??0).toFixed(1)),aqi:Math.round(aq.aqi),pollen:Math.round(aq.pollen)});}const mid=hrs.filter(h=>h.hr>=10&&h.hr<=14);return{hrs,windDeg:mid.length?Math.round(mid.reduce((s,h)=>s+h.wd,0)/mid.length):270};};
  const fmtL=d=>d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
  const td=buildDay(todayStr),tm=buildDay(tomStr);
  return{isLive:true,fetchedAt:Date.now(),today:{label:fmtL(now),hours:td.hrs,windDeg:td.windDeg,sunTimes:getSun(todayStr)},tomorrow:{label:fmtL(tom),hours:tm.hrs,windDeg:tm.windDeg,sunTimes:getSun(tomStr)}};
}
async function getLocationName(lat,lon){
  try{const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=12`,{headers:{"Accept-Language":"en"}});const d=await r.json(),a=d.address;return a.neighbourhood||a.suburb||a.city_district||a.quarter||a.city||a.town||`${lat.toFixed(2)}°N`;}
  catch{return `${lat.toFixed(2)}°N`;}
}

// ─── Scoring ───────────────────────────────────────────────────────────────────
const sAQI=v=>v<=50?100:v<=100?Math.round(100-(v-50)*0.5):v<=150?Math.round(75-(v-100)*0.7):v<=200?Math.round(40-(v-150)*0.6):0;
const sPollen=v=>v<=0?100:v<=30?Math.round(100-v*0.5):v<=100?Math.round(85-(v-30)*0.35):v<=200?Math.round(60-(v-100)*0.3):Math.max(0,Math.round(30-(v-200)*0.15));
function scoreHour(h){
  const p=Math.max(0,100-(h.p??0)*0.8),ww=Math.max(0,100-(h.w??0)*4),t=Math.max(0,100-Math.abs((h.t??62)-62.5)*3.5),hm=Math.max(0,100-(h.h??0)*0.9),u=Math.max(0,100-(h.u??0)*9),aq=sAQI(h.aqi??40),po=sPollen(h.pollen??0);
  return{total:Math.round(p*W.precipitation+ww*W.wind+t*W.temperature+hm*W.humidity+u*W.uv+aq*W.aqi+po*W.pollen),bd:{precipitation:Math.round(p),wind:Math.round(ww),temperature:Math.round(t),humidity:Math.round(hm),uv:Math.round(u),aqi:Math.round(aq),pollen:Math.round(po)}};
}
function processHours(arr,sunTimes,daylightOnly){
  const hours=arr.map(h=>{const s=scoreHour(h);return{...h,score:s.total,bd:s.bd};});
  let best=null;
  for(let i=0;i<hours.length-1;i++){
    if(daylightOnly&&sunTimes){const isNight=hours[i].hr<sunTimes.sunrise||hours[i].hr>=sunTimes.sunset||hours[i+1].hr>=sunTimes.sunset;if(isNight)continue;}
    const avg=Math.round((hours[i].score+hours[i+1].score)/2);
    if(!best||avg>best.avgScore)best={startIdx:i,avgScore:avg};
  }
  if(best&&best.avgScore<35)best=null;
  return{hours,best};
}

// ─── Direction ─────────────────────────────────────────────────────────────────
function getDirRec(wd,ws){
  if(ws<6)return{headline:"Wind is calm",detail:"Conditions are calm — start in whatever direction suits your route."};
  const label=compassLabel(wd),returnLabel=compassLabel((wd+180)%360);
  return{headline:`Head ${label} first`,detail:`Run into the ${label} headwind while your legs are fresh — you'll earn that tailwind boost on the way back ${returnLabel}.`};
}

// ─── Outfit ────────────────────────────────────────────────────────────────────
function getOutfit(h){
  const feel=windChill(h.t,h.w),rainy=h.p>40,misty=h.p>20&&h.p<=40,uvHigh=h.u>6,windy=h.w>15;
  const L=[];
  if(feel<=25)L.push({slot:"Top",icon:"🧥",item:"Heavy insulated jacket",note:"windproof shell essential"});
  else if(feel<=35)L.push({slot:"Top",icon:"🧥",item:"Thermal running jacket",note:"full zip, wind resistant"});
  else if(feel<=45)L.push({slot:"Top",icon:"🫙",item:"Half-zip + base layer",note:"moisture-wicking base underneath"});
  else if(feel<=55)L.push({slot:"Top",icon:"👕",item:"Long sleeve running shirt",note:feel<50?"consider a light vest":"lightweight fabric"});
  else if(feel<=65)L.push({slot:"Top",icon:"👕",item:"Short sleeve + arm warmers",note:"easy to strip mid-run"});
  else if(feel<=75)L.push({slot:"Top",icon:"👕",item:"Short sleeve tech shirt",note:"breathable"});
  else L.push({slot:"Top",icon:"🎽",item:"Singlet or racerback",note:"max ventilation"});
  if(rainy)L.push({slot:"Shell",icon:"🌧",item:"Waterproof running jacket",note:"packable, taped seams if possible"});
  else if(misty||(windy&&feel<50))L.push({slot:"Shell",icon:"💨",item:"Wind shell",note:"light enough to tie around waist"});
  if(feel<=30)L.push({slot:"Bottom",icon:"🩲",item:"Thermal tights",note:"full length, wind-blocking"});
  else if(feel<=45)L.push({slot:"Bottom",icon:"🩲",item:"Running tights",note:"full length"});
  else if(feel<=58)L.push({slot:"Bottom",icon:"🩲",item:"3/4 tights or capris",note:"or shorts + calf sleeves"});
  else L.push({slot:"Bottom",icon:"🩳",item:"Running shorts",note:"moisture-wicking liner"});
  if(feel<=35)L.push({slot:"Hands",icon:"🧤",item:"Running gloves",note:"thin wind-resistant pair"});
  else if(feel<=45)L.push({slot:"Hands",icon:"🧤",item:"Light gloves",note:"you'll likely pull these off mid-run"});
  if(feel<=30)L.push({slot:"Head",icon:"🧣",item:"Beanie + neck gaiter",note:"protect ears and neck"});
  else if(feel<=42)L.push({slot:"Head",icon:"🧢",item:"Running beanie",note:"keeps ears warm"});
  else if(rainy||uvHigh)L.push({slot:"Head",icon:"🧢",item:"Cap with brim",note:rainy?"keeps rain off your face":"shade from UV"});
  if(feel<=40)L.push({slot:"Socks",icon:"🧦",item:"Thermal running socks",note:"slightly thicker for cold"});
  else if(rainy)L.push({slot:"Socks",icon:"🧦",item:"Wool blend socks",note:"dries faster when wet"});
  else L.push({slot:"Socks",icon:"🧦",item:"No-show running socks",note:"standard"});
  if(uvHigh&&!rainy)L.push({slot:"Skin",icon:"🌞",item:"Sunscreen SPF 30+",note:"reapply if out over 90 min"});
  const fp=feel<=25?"Bitterly cold":feel<=35?"Very cold":feel<=45?"Cold":feel<=55?"Chilly":feel<=65?"Cool & comfortable":feel<=75?"Comfortable":feel<=82?"Warm":"Hot";
  return{layers:L,feel,feelPhrase:fp,rainy,uvHigh};
}

function getWhyExplainer(bh,best){
  const reasons=[];
  if(bh.p<=10)reasons.push("no rain in the forecast");
  else if(bh.p<=25)reasons.push(`only ${bh.p}% chance of rain`);
  if(bh.w<=7)reasons.push("wind is barely noticeable");
  else if(bh.w<=12)reasons.push(`light ${bh.w} mph breeze`);
  const feel=bh.t>50||bh.w<3?bh.t:Math.round(35.74+0.6215*bh.t-35.75*Math.pow(bh.w,0.16)+0.4275*bh.t*Math.pow(bh.w,0.16));
  if(feel>=55&&feel<=70)reasons.push(`${feel}°F feels perfect for running`);
  else if(feel>=48&&feel<55)reasons.push(`crisp ${feel}°F — ideal race-day feel`);
  else if(feel>70&&feel<=78)reasons.push(`${feel}°F is warm but manageable`);
  if((bh.aqi||40)<=50)reasons.push("air quality is excellent");
  if((bh.pollen||0)<=20)reasons.push("pollen is low");
  if(bh.u<=3)reasons.push("UV is minimal");
  if(reasons.length===0)reasons.push(best.avgScore>=65?"conditions are decent across the board":"this is the best window available today");
  const top=reasons.slice(0,3);
  if(top.length===1)return`${top[0].charAt(0).toUpperCase()+top[0].slice(1)}.`;
  if(top.length===2)return`${top[0].charAt(0).toUpperCase()+top[0].slice(1)} and ${top[1]}.`;
  return`${top[0].charAt(0).toUpperCase()+top[0].slice(1)}, ${top[1]}, and ${top[2]}.`;
}

const BAD_DAY_MSGS=[
  {emoji:"🛋️",title:"Take a day off.",sub:"You've earned it."},
  {emoji:"☕",title:"Rest day confirmed.",sub:"Your legs will thank you tomorrow."},
  {emoji:"🧘",title:"Nature says no.",sub:"Stretch, hydrate, try again tomorrow."},
  {emoji:"📚",title:"A great day to not run.",sub:"Seriously. Stay inside. Read something."},
  {emoji:"🍕",title:"Rest day protocol activated.",sub:"Treat yourself. The miles will be there tomorrow."},
];

async function doShare(bh,best,dateLabel,locationName,tempUnit){
  const win=`${fmt12(bh.hr)} – ${fmt12(bh.hr+2)}`;
  const tempStr=tempUnit==="C"?`${toC(bh.t)}°C`:`${bh.t}°F`;
  const text=`🏃 Run Forecast — ${locationName}\n📅 ${dateLabel}\n⏰ Best window: ${win}\n⭐ Score: ${best.avgScore}/100 (${sl(best.avgScore)})\n\n🌡️ ${tempStr}  ·  🌧️ ${bh.p}% rain  ·  💨 ${bh.w} mph wind\n\nGet your forecast → temprunture.com`;
  try{if(navigator.share){await navigator.share({title:"My Run Forecast",text,url:"https://temprunture.com"});return"shared";}await navigator.clipboard.writeText(text);return"copied";}
  catch(e){if(e.name!=="AbortError"){try{await navigator.clipboard.writeText(text);return"copied";}catch{}}return null;}
}

// ─── Visual Components ─────────────────────────────────────────────────────────
function ScoreArc({score,color,animate}){
  const T=useT();
  const R=88,CX=100,CY=100,sa=-220,ta=260;
  const rad=deg=>deg*Math.PI/180,pt=deg=>({x:CX+R*Math.cos(rad(deg)),y:CY+R*Math.sin(rad(deg))});
  const arc=(f,t)=>{const s=pt(f),e=pt(t);return`M ${s.x} ${s.y} A ${R} ${R} 0 ${Math.abs(t-f)>180?1:0} 1 ${e.x} ${e.y}`;};
  const circ=2*Math.PI*R,filled=(ta/360)*circ*(score/100);
  return(
    <svg width="200" height="200" style={{overflow:"visible"}}>
      <defs><filter id="ga"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <path d={arc(sa,sa+ta)} fill="none" stroke={T.border2} strokeWidth="5" strokeLinecap="round"/>
      <path d={arc(sa,sa+ta)} fill="none" stroke={T.greenDeep} strokeWidth="12" strokeLinecap="round" opacity="0.7"/>
      <path d={arc(sa,sa+ta)} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${filled} ${circ}`} filter="url(#ga)" style={{transition:animate?"stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)":"none"}}/>
      {[0,25,50,75,100].map(p=>{const a=sa+ta*p/100,ii={x:CX+(R-8)*Math.cos(rad(a)),y:CY+(R-8)*Math.sin(rad(a))},oi={x:CX+(R+4)*Math.cos(rad(a)),y:CY+(R+4)*Math.sin(rad(a))};return<line key={p} x1={ii.x} y1={ii.y} x2={oi.x} y2={oi.y} stroke={T.border2} strokeWidth="1.5"/>;}) }
    </svg>
  );
}

function AnimNum({value,dur=1200}){
  const [v,setV]=useState(0);
  useEffect(()=>{let s=null;const f=ts=>{if(!s)s=ts;const p=Math.min((ts-s)/dur,1);setV(Math.round((1-Math.pow(1-p,3))*value));if(p<1)requestAnimationFrame(f);};requestAnimationFrame(f);},[value]);
  return <span>{v}</span>;
}

function WindRose({windDeg,color}){
  const T=useT();
  const rad=d=>d*Math.PI/180,going=(windDeg+180)%360,aa=rad(going-90),cx=36,cy=36,r=26;
  const tx=cx+r*Math.cos(aa),ty=cy+r*Math.sin(aa),bx=cx-(r*0.6)*Math.cos(aa),by=cy-(r*0.6)*Math.sin(aa),px=Math.cos(aa+Math.PI/2)*6,py=Math.sin(aa+Math.PI/2)*6;
  return(
    <svg width="72" height="72">
      <defs><filter id="wg"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <circle cx={cx} cy={cy} r={r+4} fill="none" stroke={T.border2} strokeWidth="1"/>
      {[0,90,180,270].map(deg=>{const a=rad(deg-90);return<line key={deg} x1={cx+(r-2)*Math.cos(a)} y1={cy+(r-2)*Math.sin(a)} x2={cx+(r+4)*Math.cos(a)} y2={cy+(r+4)*Math.sin(a)} stroke={T.border2} strokeWidth="1.5"/>;}) }
      {[["N",0],["E",90],["S",180],["W",270]].map(([l,deg])=>{const a=rad(deg-90);return<text key={l} x={cx+(r+12)*Math.cos(a)-3} y={cy+(r+12)*Math.sin(a)+3} fill={T.dim} fontSize="8" fontFamily="JetBrains Mono,monospace" textAnchor="middle">{l}</text>;}) }
      <polygon points={`${tx},${ty} ${bx+px},${by+py} ${bx-px},${by-py}`} fill={color} filter="url(#wg)"/>
      <circle cx={cx} cy={cy} r="3" fill={T.surface2} stroke={color} strokeWidth="1.5"/>
    </svg>
  );
}

function WeatherBg({hours}){
  const T=useT();
  const day=hours.filter(h=>h.hr>=8&&h.hr<=18);
  const avgRain=day.reduce((s,h)=>s+h.p,0)/Math.max(1,day.length);
  const avgWind=day.reduce((s,h)=>s+h.w,0)/Math.max(1,day.length);
  if(avgRain>45)return<div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>{Array.from({length:18}).map((_,i)=><div key={i} style={{position:"absolute",top:"-5%",left:`${(i*5.8)%100}%`,width:1.5,height:`${12+i%3*8}px`,background:`${T.green}20`,borderRadius:1,animation:`rain ${1.4+i*0.12}s linear infinite`,animationDelay:`${i*0.18}s`}}/>)}</div>;
  if(avgWind>18)return<div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>{Array.from({length:7}).map((_,i)=><div key={i} style={{position:"absolute",top:`${8+i*13}%`,left:"-5%",width:`${60+i*25}px`,height:1,background:`${T.green}18`,animation:`windStreak ${2.5+i*0.5}s ease-in-out infinite`,animationDelay:`${i*0.6}s`}}/>)}</div>;
  return<div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}><div style={{position:"absolute",top:"-25%",left:"-15%",width:"65vw",height:"65vw",borderRadius:"50%",background:`radial-gradient(circle,${T.green}14 0%,transparent 65%)`,animation:"breathe 14s ease-in-out infinite"}}/><div style={{position:"absolute",bottom:"-20%",right:"-10%",width:"55vw",height:"55vw",borderRadius:"50%",background:`radial-gradient(circle,${T.greenMid}10 0%,transparent 65%)`,animation:"breathe2 20s ease-in-out infinite"}}/></div>;
}

function Dots(){
  const T=useT();
  const [v,setV]=useState(".");
  useEffect(()=>{const t=setInterval(()=>setV(p=>p.length>=3?".":p+"."),500);return()=>clearInterval(t);},[]);
  return <span style={{...mono,color:T.greenMid,fontSize:22}}>{v}</span>;
}

function PWABanner({onDismiss}){
  const T=useT();
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid=/android/i.test(navigator.userAgent);
  const isStandalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone;
  if(isStandalone||(!isIOS&&!isAndroid))return null;
  const msg=isIOS?"Tap Share then 'Add to Home Screen'":"Tap Menu then 'Add to Home Screen'";
  return(
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,padding:"12px 16px",background:T.surface,borderTop:`1px solid ${T.border2}`,display:"flex",alignItems:"center",gap:12,boxShadow:"0 -4px 24px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:22,flexShrink:0}}>📲</div>
      <div style={{flex:1}}><div style={{...mono,fontSize:11,color:T.text}}>Add to your home screen</div><div style={{...mono,fontSize:9,color:T.muted,marginTop:2}}>{msg}</div></div>
      <button onClick={onDismiss} style={{...mono,fontSize:10,color:T.muted,background:"none",border:`1px solid ${T.border2}`,borderRadius:6,padding:"7px 14px",cursor:"pointer"}}>Dismiss</button>
    </div>
  );
}

function LocationScreen({onGrant,onSkip}){
  const T=useT();
  const [asking,setAsking]=useState(false);
  const hasGeo=!!navigator.geolocation;
  const handleGrant=()=>{
    setAsking(true);
    navigator.geolocation.getCurrentPosition(pos=>onGrant(pos.coords.latitude,pos.coords.longitude),()=>{setAsking(false);onSkip();},{timeout:12000,enableHighAccuracy:false});
  };
  return(
    <div style={{background:T.bg,fontFamily:"'DM Sans',sans-serif",color:T.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:"40px 24px",textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:20}}>🏃</div>
      <div style={{display:"flex",alignItems:"baseline",marginBottom:12}}>
        <span style={{...cond,fontSize:20,fontWeight:700,color:T.muted,letterSpacing:3,textTransform:"uppercase"}}>temp</span>
        <span style={{...cond,fontSize:52,fontWeight:700,fontStyle:"italic",color:T.green,letterSpacing:1,marginLeft:3,marginRight:8,textTransform:"uppercase",lineHeight:1}}>RUN</span>
        <span style={{...cond,fontSize:20,fontWeight:700,color:T.muted,letterSpacing:3,textTransform:"uppercase"}}>ture</span>
      </div>
      <div style={{...mono,fontSize:11,color:T.muted,marginBottom:40,lineHeight:1.9,maxWidth:300}}>Live scored run windows with outfit picks, wind direction, air quality & pollen.</div>
      {hasGeo&&<button onClick={handleGrant} disabled={asking} style={{...mono,fontSize:12,color:T.bg,background:T.green,border:"none",borderRadius:10,padding:"14px 36px",cursor:asking?"default":"pointer",letterSpacing:1.5,marginBottom:16,opacity:asking?0.7:1,width:"100%",maxWidth:280}}>{asking?"Locating you...":"📍 Use My Location"}</button>}
      <button onClick={onSkip} style={{...mono,fontSize:11,color:T.muted,background:"none",border:"none",cursor:"pointer",letterSpacing:1,textDecoration:"underline"}}>{hasGeo?"Use New York City instead":"Continue with New York City"}</button>
    </div>
  );
}

// ─── Stepper Picker ────────────────────────────────────────────────────────────
function StepperPicker({label,value,items,onChange}){
  const T=useT();
  const idx=items.indexOf(value);
  const dec=()=>{if(idx>0)onChange(items[idx-1]);};
  const inc=()=>{if(idx<items.length-1)onChange(items[idx+1]);};
  const btnStyle=disabled=>({...mono,fontSize:20,color:disabled?T.dim:T.green,background:"none",border:`1px solid ${disabled?T.border:T.border2}`,borderRadius:8,width:44,height:44,cursor:disabled?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"});
  return(
    <div>
      <div style={{...mono,fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:10,background:T.surface2,borderRadius:10,border:`1px solid ${T.border2}`,padding:"10px 14px"}}>
        <button onClick={dec} disabled={idx<=0} style={btnStyle(idx<=0)}>−</button>
        <div style={{flex:1,textAlign:"center"}}><div style={{...cond,fontSize:26,fontWeight:700,color:T.green,letterSpacing:1,lineHeight:1}}>{value}</div></div>
        <button onClick={inc} disabled={idx>=items.length-1} style={btnStyle(idx>=items.length-1)}>+</button>
      </div>
    </div>
  );
}

// ─── Settings Panel (bottom sheet) ────────────────────────────────────────────
function SettingsPanel({settings,locationName,onSave,onClose,onResetLocation}){
  const T=useT();
  const [loc,setLoc]=useState(settings);
  const runSecs=loc.distance*loc.pace;
  const runM=Math.floor(runSecs/60),runH=Math.floor(runM/60),runRem=runM%60;
  const dur=runH>0?`${runH}h ${runRem}m`:`${runM}m`;
  const distVal=`${loc.distance} mi`;
  const paceVal=paceToStr(loc.pace);
  const Toggle=({val,label,sub,onToggle})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${T.border}`}}>
      <div><div style={{...mono,fontSize:10,color:T.muted,letterSpacing:1.5,textTransform:"uppercase"}}>{label}</div>{sub&&<div style={{...mono,fontSize:9,color:T.dim,marginTop:3}}>{sub}</div>}</div>
      <div onClick={onToggle} style={{width:46,height:26,borderRadius:13,background:val?T.green:T.border2,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0,minWidth:46}}>
        <div style={{position:"absolute",top:3,left:val?22:3,width:20,height:20,borderRadius:"50%",background:val?T.bg:T.muted,transition:"left .2s"}}/>
      </div>
    </div>
  );
  return(
    <div style={{position:"fixed",inset:0,zIndex:100}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1}}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:T.surface,borderRadius:"20px 20px 0 0",maxHeight:"85vh",overflowY:"auto",paddingBottom:40,zIndex:2}}>
        <div style={{display:"flex",justifyContent:"center",padding:"env(safe-area-inset-top, 14px) 0 6px",paddingTop:"max(14px, env(safe-area-inset-top))"}}>
          <div style={{width:44,height:4,borderRadius:2,background:T.border2}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 24px 16px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{...cond,fontSize:26,fontWeight:700,color:T.text,letterSpacing:3,textTransform:"uppercase"}}>Settings</div>
          <button onClick={onClose} style={{width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",background:T.surface2,border:`1px solid ${T.border2}`,borderRadius:"50%",cursor:"pointer",fontSize:18,color:T.muted,flexShrink:0}}>✕</button>
        </div>
        <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:20}}>
          <div style={{paddingBottom:16,borderBottom:`1px solid ${T.border}`}}>
            <div style={{...mono,fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Location</div>
            <div style={{...mono,fontSize:12,color:T.text,marginBottom:10}}>{locationName}</div>
            <button onClick={()=>{onResetLocation();onClose();}} style={{...mono,fontSize:10,color:T.muted,background:"none",border:`1px solid ${T.border2}`,borderRadius:7,padding:"8px 16px",cursor:"pointer",letterSpacing:1}}>📍 Change Location</button>
          </div>
          <StepperPicker label="Run Distance" value={distVal} items={DIST_ITEMS} onChange={v=>setLoc(l=>({...l,distance:parseFloat(v.replace(" mi",""))}))}/>
          <StepperPicker label="Pace" value={paceVal} items={PACE_ITEMS} onChange={v=>setLoc(l=>({...l,pace:paceFromStr(v)}))}/>
          <div style={{background:T.surface2,borderRadius:10,padding:"14px 16px",border:`1px solid ${T.border}`}}>
            <div style={{...mono,fontSize:10,color:T.muted,letterSpacing:1,marginBottom:6}}>Estimated run time</div>
            <div style={{...cond,fontSize:30,fontWeight:700,color:T.green,letterSpacing:2}}>{dur}</div>
            <div style={{...mono,fontSize:9,color:T.dim,marginTop:4}}>{loc.distance} mi at {paceToStr(loc.pace)}</div>
          </div>
          <Toggle val={loc.daylightOnly} label="Daylight runs only" sub="Exclude windows after sunset" onToggle={()=>setLoc(l=>({...l,daylightOnly:!l.daylightOnly}))}/>
          <div style={{padding:"12px 0",borderBottom:`1px solid ${T.border}`}}>
            <div style={{...mono,fontSize:10,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12}}>Theme</div>
            <div style={{display:"flex",gap:6}}>
              {[{id:"auto",label:"☀️→🌙 Auto"},{id:"light",label:"☀️ Light"},{id:"dark",label:"🌙 Dark"}].map(({id,label})=>(
                <button key={id} onClick={()=>{setLoc(l=>({...l,theme:id}));onSave({...loc,theme:id});}} style={{flex:1,padding:"9px 0",borderRadius:8,border:`1px solid ${loc.theme===id?T.green:T.border2}`,cursor:"pointer",background:loc.theme===id?`${T.green}20`:T.surface2,color:loc.theme===id?T.green:T.muted,...mono,fontSize:10,letterSpacing:0.5,transition:"all .15s"}}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{...mono,fontSize:9,color:T.dim,marginTop:8}}>Auto switches at sunrise & sunset</div>
          </div>
          <div style={{padding:"12px 0"}}>
            <div style={{...mono,fontSize:10,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12}}>Temperature</div>
            <div style={{display:"inline-flex",gap:4,background:T.surface2,borderRadius:8,padding:4,border:`1px solid ${T.border2}`}}>
              {["F","C"].map(u=><button key={u} onClick={()=>setLoc(l=>({...l,tempUnit:u}))} style={{padding:"9px 26px",borderRadius:6,border:"none",cursor:"pointer",background:loc.tempUnit===u?T.green:"transparent",color:loc.tempUnit===u?T.bg:T.muted,...mono,fontSize:12,fontWeight:500,letterSpacing:1}}>°{u}</button>)}
            </div>
          </div>
          <button onClick={()=>{onSave(loc);onClose();}} style={{...mono,fontSize:12,color:T.bg,background:T.green,border:"none",borderRadius:10,padding:"14px 24px",cursor:"pointer",letterSpacing:1.5,width:"100%"}}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App(){
  const [phase,setPhase]=useState("init");
  const [location,setLocation]=useState(null);
  const [weather,setWeather]=useState(null);
  const [view,setView]=useState("today");
  const [settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [showSettings,setShowSettings]=useState(false);
  const [shareMsg,setShareMsg]=useState(null);
  const [visible,setVisible]=useState(false);
  const [loadError,setLoadError]=useState("");
  const [showPWA,setShowPWA]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [touchStartY,setTouchStartY]=useState(null);

  // Theme
  const isDark=useMemo(()=>{
    const ov=settings.theme||"auto";
    if(ov==="dark")return true;
    if(ov==="light")return false;
    const now=new Date(),h=now.getHours()+now.getMinutes()/60;
    const rise=weather?.today?.sunTimes?.sunrise??weather?.tomorrow?.sunTimes?.sunrise??6.5;
    const set=weather?.today?.sunTimes?.sunset??weather?.tomorrow?.sunTimes?.sunset??19.5;
    return h<rise||h>=set;
  },[settings.theme,weather]);
  const T=isDark?DARK:LIGHT;
  useEffect(()=>{document.body.style.background=T.bg;},[T]);

  const loadWeather=useCallback(async(loc,apiKey)=>{
    setPhase("loading");setLoadError("");
    try{
      const data=await fetchLiveWeather(loc.lat,loc.lon,apiKey);
      setWeather(data);setPhase("ready");setTimeout(()=>setVisible(true),60);
    }catch(err){
      const msg=err.message||"";
      if(msg.includes("401")||msg.includes("403")||msg.includes("Invalid")||msg.includes("invalid")){setLoadError("Invalid API key.");setPhase("error");return;}
      if(msg.includes("429")){setLoadError("Rate limit hit — try again in a minute.");setPhase("error");return;}
      const now=new Date(),tom=new Date(now);tom.setDate(now.getDate()+1);
      setWeather({isLive:false,today:makeFallbackDay(now),tomorrow:makeFallbackDay(tom)});
      setPhase("ready");setTimeout(()=>setVisible(true),60);
    }
  },[]);

  useEffect(()=>{
    const style=document.createElement("style");
    style.textContent=`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=JetBrains+Mono:wght@300;400;500&family=Barlow+Condensed:wght@300;400;600;700&family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}.fade{opacity:0;transform:translateY(14px);transition:opacity .55s ease,transform .55s ease;}.fade.in{opacity:1;transform:translateY(0);}@keyframes breathe{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.1);opacity:.7}}@keyframes breathe2{0%,100%{transform:scale(1) rotate(0deg);opacity:.3}50%{transform:scale(1.05) rotate(-4deg);opacity:.45}}@keyframes rain{0%{transform:translateY(-5%) translateX(0);opacity:.4}100%{transform:translateY(110vh) translateX(-35px);opacity:0}}@keyframes windStreak{0%{transform:translateX(-100px);opacity:0}50%{opacity:.15}100%{transform:translateX(110vw);opacity:0}}.tog{transition:all .18s;}.tog:hover{opacity:.8;}.hbar{transition:filter .2s;cursor:default;}.hbar:hover{filter:brightness(1.3);}::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{border-radius:2px;}`;
    document.head.appendChild(style);
    try{
      const sLoc=JSON.parse(localStorage.getItem("wsr_loc")||"null");
      const sSett=JSON.parse(localStorage.getItem("wsr_settings")||"null");
      if(sSett){
        const migrated={...DEFAULT_SETTINGS,...sSett};
        if(sSett.pace&&sSett.pace<60)migrated.pace=sSett.pace*60;
        setSettings(migrated);
      }
      if(sLoc){setLocation(sLoc);loadWeather(sLoc,(sSett?.apiKey||DEFAULT_SETTINGS.apiKey));return;}
    }catch{}
    setPhase("location");
  },[loadWeather]);

  useEffect(()=>{
    if(phase==="ready"){const d=sessionStorage.getItem("pwa_dismissed");if(!d)setTimeout(()=>setShowPWA(true),3000);}
  },[phase]);

  const handleTouchStart=useCallback((e)=>{if(window.scrollY===0)setTouchStartY(e.touches[0].clientY);},[]);
  const handleTouchEnd=useCallback((e)=>{
    if(touchStartY===null)return;
    const dy=e.changedTouches[0].clientY-touchStartY;setTouchStartY(null);
    if(dy>72&&!refreshing){
      setRefreshing(true);
      const key=settings.apiKey||DEFAULT_SETTINGS.apiKey;
      fetchLiveWeather(location?.lat||DEFAULT_LOC.lat,location?.lon||DEFAULT_LOC.lon,key)
        .then(data=>{setWeather({...data,fetchedAt:Date.now()});}).catch(()=>{})
        .finally(()=>{setRefreshing(false);setVisible(false);setTimeout(()=>setVisible(true),60);});
    }
  },[touchStartY,refreshing,settings,location]);

  const handleGrant=useCallback(async(lat,lon)=>{
    setPhase("loading");
    const name=await getLocationName(lat,lon);
    const loc={lat,lon,name};setLocation(loc);
    try{localStorage.setItem("wsr_loc",JSON.stringify(loc));}catch{}
    const saved=(()=>{try{return JSON.parse(localStorage.getItem("wsr_settings")||"null");}catch{return null;}})();
    loadWeather(loc,saved?.apiKey||DEFAULT_SETTINGS.apiKey);
  },[loadWeather]);

  const handleSkip=useCallback(()=>{
    setLocation(DEFAULT_LOC);
    const saved=(()=>{try{return JSON.parse(localStorage.getItem("wsr_settings")||"null");}catch{return null;}})();
    loadWeather(DEFAULT_LOC,saved?.apiKey||DEFAULT_SETTINGS.apiKey);
  },[loadWeather]);

  const handleSettingsSave=useCallback((s)=>{
    setSettings(s);try{localStorage.setItem("wsr_settings",JSON.stringify(s));}catch{}
    if(s.apiKey!==settings.apiKey&&s.apiKey)loadWeather(location||DEFAULT_LOC,s.apiKey);
  },[settings,location,loadWeather]);

  const handleResetLocation=useCallback(()=>{
    try{localStorage.removeItem("wsr_loc");}catch{}
    setLocation(null);setWeather(null);setPhase("location");
  },[]);

  const bgStyle={background:T.bg,fontFamily:"'DM Sans',sans-serif",color:T.text};

  if(phase==="init"||phase==="loading")return(
    <ThemeCtx.Provider value={T}>
      <div style={{...bgStyle,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",gap:14,textAlign:"center",padding:20}}>
        <div style={{display:"flex",alignItems:"baseline"}}>
          <span style={{...cond,fontSize:20,fontWeight:700,color:T.muted,letterSpacing:3,textTransform:"uppercase"}}>temp</span>
          <span style={{...cond,fontSize:50,fontWeight:700,fontStyle:"italic",color:T.green,letterSpacing:1,marginLeft:3,marginRight:8,textTransform:"uppercase",lineHeight:1}}>RUN</span>
          <span style={{...cond,fontSize:20,fontWeight:700,color:T.muted,letterSpacing:3,textTransform:"uppercase"}}>ture</span>
        </div>
        <div style={{...mono,fontSize:11,color:T.muted,letterSpacing:1}}>{location?.name||"Fetching weather..."}</div>
        <Dots/>
      </div>
    </ThemeCtx.Provider>
  );
  if(phase==="location")return<ThemeCtx.Provider value={T}><LocationScreen onGrant={handleGrant} onSkip={handleSkip}/></ThemeCtx.Provider>;
  if(phase==="error")return(
    <ThemeCtx.Provider value={T}>
      <div style={{...bgStyle,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",gap:16,textAlign:"center",padding:32}}>
        <div style={{fontSize:36}}>⚠️</div>
        <div style={{...cond,fontSize:24,color:T.skip,letterSpacing:2}}>Weather fetch failed</div>
        <div style={{...mono,fontSize:11,color:T.muted,maxWidth:300,lineHeight:1.8}}>{loadError}</div>
      </div>
    </ThemeCtx.Provider>
  );
  if(!weather)return null;

  const dayData=view==="today"?weather.today:weather.tomorrow;
  const sun=dayData.sunTimes||{sunrise:6.5,sunset:19.5};
  const {hours,best}=processHours(dayData.hours||[],sun,settings.daylightOnly);
  const bh=best?hours[best.startIdx]:null;
  const col=bh?sc(best.avgScore,T):T.green;
  const runMins=Math.round(settings.distance*settings.pace/60);
  const retTotal=bh?(bh.hr*60+runMins):0;
  const retH=Math.floor(retTotal/60),retM=retTotal%60;
  const retStr=retM>0?`${retH%12||12}:${String(retM).padStart(2,"0")}${retH>=12?"pm":"am"}`:fmt12(retH);
  const dirRec=bh?getDirRec(dayData.windDeg,bh.w):{headline:"",detail:""};
  const outfit=bh?getOutfit(bh):null;
  const tu=settings.tempUnit||"F";

  return(
    <ThemeCtx.Provider value={T}>
      <div style={{...bgStyle,minHeight:"100vh",position:"relative",overflow:"hidden"}} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <WeatherBg hours={hours}/>
        {refreshing&&<div style={{position:"fixed",top:0,left:0,right:0,zIndex:200,textAlign:"center",padding:"10px",background:T.surface,borderBottom:`1px solid ${T.border2}`,...mono,fontSize:10,color:T.green,letterSpacing:2}}>↻ REFRESHING...</div>}
        {showPWA&&<PWABanner onDismiss={()=>{setShowPWA(false);try{sessionStorage.setItem("pwa_dismissed","1");}catch{}}}/>}
        {showSettings&&<SettingsPanel settings={settings} locationName={location?.name||"Unknown"} onSave={handleSettingsSave} onClose={()=>setShowSettings(false)} onResetLocation={handleResetLocation}/>}

        <div style={{position:"relative",zIndex:1,maxWidth:520,margin:"0 auto",padding:"36px 20px 64px"}}>

          {/* Header */}
          <div className={`fade ${visible?"in":""}`} style={{marginBottom:28,...dd(0)}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{display:"flex",alignItems:"baseline"}}>
                  <span style={{...cond,fontSize:20,fontWeight:700,color:T.muted,letterSpacing:3,textTransform:"uppercase"}}>temp</span>
                  <span style={{...cond,fontSize:52,fontWeight:700,fontStyle:"italic",color:T.green,letterSpacing:1,marginLeft:3,marginRight:8,textTransform:"uppercase",lineHeight:0.9}}>RUN</span>
                  <span style={{...cond,fontSize:20,fontWeight:700,color:T.muted,letterSpacing:3,textTransform:"uppercase"}}>ture</span>
                </div>
                <div style={{...mono,fontSize:10,color:T.muted,letterSpacing:2,marginTop:6}}>{location?.name||"Upper West Side, NYC"}</div>
                <div style={{...mono,fontSize:9,marginTop:4,letterSpacing:1,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:weather.isLive?T.green:T.dim}}>{weather.isLive?"● Live":"◌ Estimate"}</span>
                  {weather.fetchedAt&&<span style={{color:T.muted}}>· Updated {Math.round((Date.now()-weather.fetchedAt)/60000)||"<1"} min ago</span>}
                </div>
              </div>
              <button onClick={()=>setShowSettings(true)} style={{...mono,fontSize:10,color:T.muted,background:"none",border:`1px solid ${T.border2}`,borderRadius:6,padding:"7px 14px",cursor:"pointer",letterSpacing:1,marginTop:4}}>⚙ Settings</button>
            </div>
            <div style={{...mono,fontSize:10,color:T.muted,marginTop:10}}>{dayData.label.toUpperCase()}</div>
            <div style={{display:"inline-flex",gap:2,marginTop:14,background:T.surface,borderRadius:8,padding:3,border:`1px solid ${T.border2}`}}>
              {[{id:"today",label:"Today"},{id:"tomorrow",label:"Tomorrow"}].map(({id,label})=>(
                <button key={id} className="tog" onClick={()=>{setView(id);setVisible(false);setTimeout(()=>setVisible(true),40);}}
                  style={{padding:"8px 22px",borderRadius:6,border:"none",cursor:"pointer",background:view===id?T.green:"transparent",color:view===id?T.bg:T.muted,...mono,fontSize:11,fontWeight:view===id?500:300,letterSpacing:1.5,textTransform:"uppercase"}}>{label}
                </button>
              ))}
            </div>
          </div>

          {/* Hero */}
          {bh&&(
            <div className={`fade ${visible?"in":""}`} style={{...dd(120),marginBottom:16}}>
              <div style={{background:T.surface,borderRadius:20,border:`1px solid ${T.border2}`,padding:"28px 24px 24px",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${col}50,transparent)`}}/>
                <div style={{position:"absolute",top:0,right:0,width:120,height:120,background:`radial-gradient(circle at top right,${col}12,transparent 70%)`,pointerEvents:"none"}}/>
                <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                  <div style={{position:"relative",width:200,height:200,flexShrink:0,margin:"-20px -16px -20px -16px"}}>
                    <ScoreArc score={best.avgScore} color={col} animate={visible}/>
                    <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-48%)",textAlign:"center"}}>
                      <div style={{...cond,fontSize:46,fontWeight:700,color:col,lineHeight:1,letterSpacing:1}}><AnimNum value={best.avgScore}/></div>
                      <div style={{...mono,fontSize:9,color:T.muted,letterSpacing:2,marginTop:1}}>/100</div>
                      <div style={{...mono,fontSize:10,color:col,letterSpacing:2,marginTop:7,fontWeight:500}}>{sl(best.avgScore)}</div>
                    </div>
                  </div>
                  <div style={{flex:1,minWidth:130}}>
                    <div style={{...mono,fontSize:9,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Best Window</div>
                    <div style={{...serif,fontSize:44,fontWeight:300,color:T.text,lineHeight:0.95,letterSpacing:-1}}>{fmt12(bh.hr)} – {fmt12(bh.hr+2)}</div>
                    <div style={{...mono,fontSize:10,color:T.muted,marginTop:10}}>Back by ~{retStr}</div>
                    <div style={{...mono,fontSize:9,color:T.dim,marginTop:3}}>{settings.distance} mi · {paceToStr(settings.pace)}</div>
                  </div>
                </div>

                {/* 5 metric tiles — no score shown */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginTop:22}}>
                  {[
                    {icon:"🌡",label:"Temp",   value:displayTemp(bh.t,tu),       color:sc(bh.bd.temperature,T)},
                    {icon:"🌧",label:"Rain",   value:`${bh.p}%`,                 color:sc(bh.bd.precipitation,T)},
                    {icon:"💨",label:"Wind",   value:`${bh.w}mph`,               color:sc(bh.bd.wind,T)},
                    {icon:"💚",label:"AQI",    value:aqiLabel(bh.aqi||40).l,     color:aqC(bh.aqi||40,T)},
                    {icon:"🌿",label:"Pollen", value:polLabel(bh.pollen||0).l,   color:polC(bh.pollen||0,T)},
                  ].map(({icon,label,value,color})=>(
                    <div key={label} style={{background:T.surface2,borderRadius:10,border:`1px solid ${T.border2}`,padding:"11px 8px",textAlign:"center",display:"flex",flexDirection:"column",gap:5}}>
                      <div style={{fontSize:15}}>{icon}</div>
                      <div style={{...mono,fontSize:8,color:T.muted,letterSpacing:1,textTransform:"uppercase"}}>{label}</div>
                      <div style={{...mono,fontSize:11,color,fontWeight:500,letterSpacing:0.5,lineHeight:1.1}}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Factor bars */}
                <div style={{marginTop:22,paddingTop:18,borderTop:`1px solid ${T.border}`}}>
                  {[
                    {key:"precipitation",label:"Rain",    icon:"🌧",actual:`${bh.p}%`},
                    {key:"wind",         label:"Wind",    icon:"💨",actual:`${bh.w} mph`},
                    {key:"temperature",  label:"Temp",    icon:"🌡",actual:displayTemp(bh.t,tu)},
                    {key:"aqi",          label:"AQ",      icon:"💚",actual:aqiLabel(bh.aqi||40).l},
                    {key:"humidity",     label:"Humidity",icon:"💧",actual:`${bh.h}%`},
                    {key:"uv",           label:"UV",      icon:"☀️",actual:`${bh.u}`},
                    {key:"pollen",       label:"Pollen",  icon:"🌿",actual:polLabel(bh.pollen||0).l},
                  ].map(({key,label,icon,actual},fi)=>{
                    const sv=bh.bd[key],fc=sc(sv,T);
                    return(
                      <div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                        <div style={{fontSize:12,width:18,flexShrink:0}}>{icon}</div>
                        <div style={{...mono,fontSize:10,color:T.muted,width:62,letterSpacing:1,flexShrink:0}}>{label}</div>
                        <div style={{flex:1,background:T.surface2,borderRadius:2,height:3,overflow:"hidden"}}>
                          <div style={{width:visible?`${sv}%`:"0%",height:"100%",background:`linear-gradient(90deg,${T.greenDeep},${fc})`,borderRadius:2,boxShadow:`0 0 8px ${fc}50`,transition:"width 1.1s cubic-bezier(0.4,0,0.2,1)",transitionDelay:`${300+fi*70}ms`}}/>
                        </div>
                        <div style={{...mono,fontSize:10,color:fc,width:20,textAlign:"right",fontWeight:500}}>{sv}</div>
                        <div style={{...mono,fontSize:10,color:T.muted,width:54,textAlign:"right"}}>{actual}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Why this window */}
                {(()=>{const why=getWhyExplainer(bh,best);return(
                  <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`,display:"flex",alignItems:"flex-start",gap:10}}>
                    <span style={{color:col,fontSize:15,flexShrink:0,marginTop:1}}>💬</span>
                    <div>
                      <div style={{...mono,fontSize:9,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Why this window?</div>
                      <div style={{...mono,fontSize:11,color:T.text,lineHeight:1.7}}>{why}</div>
                    </div>
                  </div>
                );})()}

                {/* Share */}
                <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`,display:"flex",gap:10,alignItems:"center"}}>
                  <button onClick={async()=>{const r=await doShare(bh,best,dayData.label,location?.name||"NYC",tu);if(r){setShareMsg(r==="copied"?"Copied!":"Shared! 🎉");setTimeout(()=>setShareMsg(null),2500);}}} style={{...mono,fontSize:11,color:T.green,background:`${T.green}15`,border:`1px solid ${T.green}40`,borderRadius:8,padding:"10px 18px",cursor:"pointer",letterSpacing:1,flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>📤 Share this forecast</button>
                  {shareMsg&&<div style={{...mono,fontSize:10,color:T.green,letterSpacing:1,flexShrink:0}}>{shareMsg}</div>}
                </div>
              </div>
            </div>
          )}

          {/* Bad day */}
          {!bh&&hours.length>0&&(()=>{
            const msg=BAD_DAY_MSGS[new Date().getDate()%BAD_DAY_MSGS.length];
            const worstScore=Math.max(...hours.map(h=>h.score));
            return(
              <div className={`fade ${visible?"in":""}`} style={{...dd(120),marginBottom:16}}>
                <div style={{background:T.surface,borderRadius:20,border:`1px solid ${T.border2}`,padding:"40px 28px",textAlign:"center",position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${T.skip}40,transparent)`}}/>
                  <div style={{fontSize:56,marginBottom:16}}>{msg.emoji}</div>
                  <div style={{...cond,fontSize:34,fontWeight:700,color:T.text,letterSpacing:3,textTransform:"uppercase",lineHeight:1,marginBottom:8}}>{msg.title}</div>
                  <div style={{...mono,fontSize:12,color:T.muted,lineHeight:1.8,marginBottom:20}}>{msg.sub}</div>
                  <div style={{...mono,fontSize:10,color:T.dim}}>Best score today: <span style={{color:T.skip}}>{worstScore}/100</span></div>
                </div>
              </div>
            );
          })()}

          {/* Direction */}
          {bh&&(
            <div className={`fade ${visible?"in":""}`} style={{...dd(220),marginBottom:16}}>
              <div style={{background:T.surface,borderRadius:16,border:`1px solid ${T.border2}`,padding:"20px",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${col}40,transparent)`}}/>
                <div style={{...mono,fontSize:9,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Start Direction</div>
                <div style={{display:"flex",gap:16,alignItems:"center"}}>
                  <WindRose windDeg={dayData.windDeg} color={col}/>
                  <div style={{flex:1}}>
                    <div style={{...cond,fontSize:24,fontWeight:700,color:T.text,letterSpacing:2,lineHeight:1,textTransform:"uppercase"}}>{dirRec.headline}</div>
                    <div style={{...mono,fontSize:10,color:col,marginTop:6}}>{compassLabel(dayData.windDeg)} wind · {bh.w} mph</div>
                    <div style={{...mono,fontSize:10,color:T.muted,marginTop:8,lineHeight:1.7}}>{dirRec.detail}</div>
                  </div>
                </div>
                <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${T.border}`,...mono,fontSize:9,color:T.text,letterSpacing:1,lineHeight:1.8,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:T.greenDim,fontSize:11}}>⚡</span>Run into the headwind while fresh — earn your tailwind on the way home.
                </div>
              </div>
            </div>
          )}

          {/* Outfit */}
          {outfit&&(
            <div className={`fade ${visible?"in":""}`} style={{...dd(300),marginBottom:16}}>
              <div style={{background:T.surface,borderRadius:16,border:`1px solid ${T.border2}`,padding:"20px",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${col}40,transparent)`}}/>
                <div style={{...mono,fontSize:9,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>What to Wear</div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                  <div style={{...cond,fontSize:24,fontWeight:700,color:T.text,letterSpacing:1}}>Feels like {displayTemp(outfit.feel,tu)}</div>
                  <div style={{...mono,fontSize:10,color:col,letterSpacing:1}}>{outfit.feelPhrase}</div>
                  {outfit.rainy&&<span style={{...mono,fontSize:9,color:"#4a90d8",background:"#4a90d818",border:"1px solid #4a90d840",borderRadius:4,padding:"3px 9px",letterSpacing:1}}>RAIN</span>}
                  {outfit.uvHigh&&<span style={{...mono,fontSize:9,color:"#c09010",background:"#c0901018",border:"1px solid #c0901040",borderRadius:4,padding:"3px 9px",letterSpacing:1}}>HIGH UV</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {outfit.layers.map(({slot,icon,item,note})=>(
                    <div key={slot} style={{display:"flex",alignItems:"flex-start",gap:12}}>
                      <div style={{fontSize:18,width:26,flexShrink:0,lineHeight:1.2}}>{icon}</div>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                          <span style={{...mono,fontSize:9,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",width:52,flexShrink:0}}>{slot}</span>
                          <span style={{...mono,fontSize:12,color:T.text}}>{item}</span>
                        </div>
                        <div style={{...mono,fontSize:9,color:T.muted,marginTop:2,marginLeft:60}}>{note}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:16,paddingTop:12,borderTop:`1px solid ${T.border}`,...mono,fontSize:9,color:T.text,letterSpacing:1,lineHeight:1.8,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:T.greenDim,fontSize:11}}>💡</span>Dress for 15–20° warmer than feel-like — your body heat does the rest.
                </div>
              </div>
            </div>
          )}

          {/* Time-of-day table */}
          <div className={`fade ${visible?"in":""}`} style={{...dd(380),marginBottom:16}}>
            <div style={{background:T.surface,borderRadius:16,border:`1px solid ${T.border2}`,padding:"20px"}}>
              <div style={{...mono,fontSize:9,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:16}}>Conditions by Time of Day</div>
              {[
                {label:"Early Morning",icon:"🌅",range:[5,8]},
                {label:"Morning",      icon:"☀️",range:[9,12]},
                {label:"Afternoon",    icon:"🌤",range:[13,17]},
                {label:"Evening",      icon:"🌆",range:[18,21]},
              ].map(({label,icon,range})=>{
                const group=hours.filter(h=>h.hr>=range[0]&&h.hr<=range[1]);
                if(group.length===0)return null;
                const bestH=group.reduce((a,b)=>a.score>b.score?a:b);
                const avgScore=Math.round(group.reduce((s,h)=>s+h.score,0)/group.length);
                const fc=sc(bestH.score,T);
                const isBestWindow=best&&hours[best.startIdx]?.hr>=range[0]&&hours[best.startIdx]?.hr<=range[1];
                return(
                  <div key={label} style={{marginBottom:12,background:isBestWindow?`${fc}10`:T.surface2,borderRadius:10,border:`1px solid ${isBestWindow?fc+"40":T.border}`,padding:"12px 14px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:15}}>{icon}</span>
                        <div>
                          <div style={{...mono,fontSize:10,color:isBestWindow?fc:T.text,fontWeight:500,letterSpacing:1}}>{label}</div>
                          <div style={{...mono,fontSize:9,color:T.dim,marginTop:2}}>{fmt12(range[0])} – {fmt12(range[1]+1)}</div>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{...mono,fontSize:15,color:fc,fontWeight:500}}>{avgScore}</div>
                        <div style={{...mono,fontSize:8,color:T.dim,marginTop:1}}>avg</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {group.map(h=>{
                        const hfc=sc(h.score,T);
                        const isThisBest=best&&h.hr===hours[best.startIdx]?.hr;
                        return(
                          <div key={h.hr} style={{background:isThisBest?`${hfc}20`:T.surface,borderRadius:6,padding:"6px 9px",border:`1px solid ${isThisBest?hfc+"60":T.border}`,minWidth:54}}>
                            <div style={{...mono,fontSize:9,color:isThisBest?hfc:T.muted}}>{fmt12(h.hr)}</div>
                            <div style={{...mono,fontSize:11,color:hfc,fontWeight:500,marginTop:1}}>{h.score}</div>
                            <div style={{...mono,fontSize:8,color:T.dim,marginTop:1}}>{displayTemp(h.t,tu)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className={`fade ${visible?"in":""}`} style={{...dd(500),marginTop:8,display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap"}}>
            {[["great","80+"],["good","65+"],["fair","45+"],["skip","<45"]].map(([k,lbl])=>(
              <div key={lbl} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:T[k],boxShadow:`0 0 5px ${T[k]}`}}/>
                <span style={{...mono,fontSize:9,color:T.dim,letterSpacing:1}}>{lbl}</span>
              </div>
            ))}
          </div>
          <div style={{textAlign:"center",marginTop:10,...mono,fontSize:8,color:T.dim,letterSpacing:2,opacity:0.5}}>{weather.isLive?"LIVE · TOMORROW.IO + OPEN-METEO":"SEASONAL ESTIMATE"} · TEMPRUNTURE.COM</div>
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}
