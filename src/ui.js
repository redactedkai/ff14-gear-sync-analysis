/* ---------- UI ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const STORE = 'ilvl-stat-lab-v3';

const state = {
  job:'SGE', cap:123, sync:true, level:50, tab:'pool', mathTab:'piece', syncIlvl:475,
  piece:{ilvl:475, slot:'head', subs:['spd','spec','dh']},
  gen:{ilvl:475, third:true, subs:[], types:[]},
  browse:{q:'', type:'any', min:100, max:'', lvl:100, sort:'ilvl'},
  opt:{target:'spd', tb:'main', tb2:'vit', avg:true, avgMin:123},
  poolFilter:'all',
  pool:[]
};

function jobName(){ return JOBS.find(j=>j[0]===JOB_ID)[1]; }
function defaultSubs(){ return ['spd', PROFILE.spec ? 'spec' : 'crit', PROFILE.spec==='piety' ? 'dh' : null]; }
function resetForJob(){
  state.piece.subs = defaultSubs();
  if(!activeSlotTypes().includes(state.piece.slot)) state.piece.slot = 'head';
  state.gen.subs = SUBSTATS.slice(); state.gen.types = activeSlotTypes().slice(); state.gen.third = PROFILE.spec==='piety';
  state.opt.target = 'spd'; state.opt.tb = 'main'; state.opt.tb2 = 'vit';
  state.browse.type = 'any'; state.browse.sort = 'ilvl'; state.poolFilter = 'all';
  state.pool = [];
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORE);
    if(!raw) return false;
    const s = JSON.parse(raw);
    if(s.job && JOBS.some(j=>j[0]===s.job)) state.job = s.job;
    ['cap','sync','level','tab','mathTab','syncIlvl','poolFilter'].forEach(k=>{ if(s[k]!=null) state[k]=s[k]; });
    ['piece','gen','browse','opt'].forEach(k=>{ if(s[k]) Object.assign(state[k], s[k]); });
    if(Array.isArray(s.pool)) state.pool = s.pool.filter(i=>i && i.id && i.stats && i.src!=='preset' && SLOT_TYPES.includes(i.type)).map(i=>Object.assign(mkItem('',i.type,i.ilvl,{}),i));
    return true;
  }catch(e){ return false; }
}
function saveState(){ try{ localStorage.setItem(STORE, JSON.stringify(state)); }catch(e){} }
function bumpUid(){
  let m = 0; state.pool.forEach(i=>{ const n = parseInt(String(i.id).slice(1),10); if(n>m) m=n; });
  _uid = Math.max(_uid, m+1);
}
const ctx = () => ({cap:state.cap, sync:state.sync});
const effOf = it => state.sync ? syncStats(it.stats, it.type, state.cap, it.ilvl) : it.stats;

/* ----- selects ----- */
function fillSelect(sel, opts, val){
  sel.innerHTML = opts.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');
  sel.value = val;
}
const slotOpts = () => activeSlotTypes().map(t=>[t,SLOT_LABEL[t]]);
const subOpts = () => SUBSTATS.map(s=>[s,STAT_LABEL[s]]);
const subOpts0 = () => [['','none']].concat(subOpts());
const statOpts = () => STATS.map(s=>[s,STAT_LABEL[s]]);

function buildSelects(){
  const jobSel = $('#job');
  let h = '';
  Object.keys(ROLE_GROUP).forEach(role=>{
    h += `<optgroup label="${esc(ROLE_GROUP[role])}">` + JOBS.filter(j=>j[2]===role).map(j=>`<option value="${j[0]}">${esc(j[1])}</option>`).join('') + `</optgroup>`;
  });
  jobSel.innerHTML = h; jobSel.value = JOB_ID;
  fillSelect($('#p-slot'), slotOpts(), state.piece.slot);
  const ps = state.piece.subs;
  fillSelect($('#p-s1'), subOpts(), ps[0] || 'spd');
  fillSelect($('#p-s2'), subOpts(), ps[1] || SUBSTATS[1]);
  fillSelect($('#p-s3'), subOpts0(), ps[2] || '');
  fillSelect($('#c-slot'), slotOpts(), 'head');
  fillSelect($('#c-s1'), subOpts(), 'spd'); fillSelect($('#c-s2'), subOpts(), SUBSTATS[1]); fillSelect($('#c-s3'), subOpts0(), '');
  fillSelect($('#o-target'), statOpts(), state.opt.target);
  fillSelect($('#o-tb1'), [['','none']].concat(statOpts()), state.opt.tb);
  fillSelect($('#o-tb2'), [['','none']].concat(statOpts()), state.opt.tb2);
  fillSelect($('#b-type'), [['any','Any slot']].concat(slotOpts()), state.browse.type);
  fillSelect($('#b-sort'), [['ilvl','Item level']].concat(STATS.map(s=>[s,'Synced '+STAT_LABEL[s]])), state.browse.sort);
  fillSelect($('#pool-filter'), [['all','all items'],['generated','hypothetical only']].concat(slotOpts()), state.poolFilter);
  $('#g-subs').innerHTML = SUBSTATS.map(s=>`<label class="chk"><input type="checkbox" data-gsub="${s}" ${state.gen.subs.includes(s)?'checked':''}> ${STAT_LABEL[s]}</label>`).join('');
  $('#g-types').innerHTML = activeSlotTypes().map(t=>`<label class="chk"><input type="checkbox" data-gtype="${t}" ${state.gen.types.includes(t)?'checked':''}> ${SLOT_LABEL[t]}</label>`).join('');
  $('#g-third').value = state.gen.third ? '1' : '0';
  $('#c-stats').innerHTML = STATS.map(s=>`<label class="f">${STAT_LABEL[s]}<input type="number" min="0" value="0" data-cstat="${s}" inputmode="numeric"></label>`).join('');
}

/* ----- settings ----- */
function renderSettings(){
  const sp = speedParams(state.level);
  $('#lvinfo').textContent = `Lv ${state.level}: one ${STAT_LABEL.spd} point is worth 130 ÷ ${sp.div} of a GCD step; the game’s own sync for this level is ${sp.sync}`;
  $('#jobinfo').textContent = `${jobName()}: main stat ${STAT_LABEL.main}, speed stat ${STAT_LABEL.spd}` + (PROFILE.spec ? `, special substat ${STAT_LABEL.spec}` : '') + `. Weapon: ${WEAPON_MODE==='2h'?'two-handed (counts twice toward average item level)':'one-handed with an off-hand (each counts once)'}.`;
  $('#o-avgnote').textContent = WEAPON_MODE==='2h' ? '(weapon counts twice)' : '';
  $('#b-lead').textContent = `Gear ${jobName()} can equip, with the game’s own stats. Pick what you own or could get, and it goes into the pool the optimizer searches.`;
}

/* ----- piece lab ----- */
function pieceRows(){
  const p = state.piece, il = clampIlvl(p.ilvl), t = p.slot;
  const caps = capsFor(t, state.cap);
  const rows = [{stat:'main',w:100},{stat:'vit',w:100}];
  p.subs.forEach((s,i)=>{ if(s && (s!=='spec'||PROFILE.spec)) rows.push({stat:s,w:SUB_WEIGHTS[i]}); });
  const clampOn = state.sync && il > state.cap;
  return rows.map(r=>{
    const base = colOf(r.stat)[il];
    const e1 = base*SLOT_PCT[t]/1000;
    let v = rnd(e1);
    let f = `${base} × ${SLOT_PCT[t]} ÷ 1000 = ${e1.toFixed(1)} → ${v}`;
    if(r.stat==='vit' && vitFactor()!==1){ const e2 = v*vitFactor(); const v2 = rnd(e2); f += `; × ${vitFactor()} = ${e2.toFixed(1)} → ${v2}`; v = v2; }
    if(r.w!==100){ const e3 = v*r.w/100; const v3 = rnd(e3); f += `; × ${r.w}% = ${e3.toFixed(1)} → ${v3}`; v = v3; }
    const raw = v;
    const capv = caps[r.stat];
    const syn = clampOn ? Math.min(raw,capv) : raw;
    return Object.assign(r,{label:STAT_LABEL[r.stat], base,raw,capv,syn,f});
  });
}
function renderPiece(){
  const p = state.piece, il = clampIlvl(p.ilvl);
  const rows = pieceRows();
  const lost = rows.reduce((a,r)=>a+(r.raw-r.syn),0);
  let h = `<div class="tablewrap"><table class="compact"><thead><tr><th>Stat</th><th class="n">Table @ ilvl ${il}</th><th>Calculation</th><th class="n">Raw</th><th class="n">Synced to ${state.cap}</th></tr></thead><tbody>`;
  rows.forEach(r=>{
    const cl = r.syn<r.raw;
    h += `<tr><td>${esc(r.label)} <span class="dim">${r.w}%</span></td><td class="n">${r.base}</td><td class="formula">${esc(r.f)}</td><td class="n">${r.raw}</td><td class="n ${cl?'clamp':''}">${r.syn}${cl?` <span class="small">(−${r.raw-r.syn})</span>`:''}</td></tr>`;
  });
  h += `</tbody></table></div>`;
  let msg;
  if(!state.sync) msg = 'Sync is off: stats are shown as on the item.';
  else if(il<=state.cap) msg = `This piece is at or below the cap (${state.cap}), so sync leaves it untouched.`;
  else msg = `This piece is above the cap, so sync clamps each line to what a 100% stat on a ${SLOT_LABEL[p.slot]} at item level ${state.cap} would have. <b class="bad">${lost} points</b> of its raw stats are unused.`;
  $('#p-out').innerHTML = `<p class="small" style="margin-bottom:10px">${msg}</p>` + h;
  $('#p-range').value = Math.max(1, Math.min(MAX_REAL, il));
  renderChart();
}
function niceStep(max, n){
  const raw = max/n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw/mag; return (m<=1?1:m<=2?2:m<=5?5:10)*mag;
}
function renderChart(){
  const il = clampIlvl(state.piece.ilvl);
  const mainCol = colOf('main'), subCol = IL.crit;
  const x0 = 80, x1 = Math.min(MAX_REAL, Math.max(500, il+30));
  const W = 640, H = 250, L = 52, R = 14, T = 12, B = 30;
  let ymax = 0;
  for(let i=x0;i<=x1;i++){ ymax = Math.max(ymax, subCol[i], mainCol[i]); }
  const step = niceStep(ymax, 5); ymax = Math.ceil(ymax/step)*step;
  const X = v => L + (v-x0)/(x1-x0)*(W-L-R);
  const Y = v => H-B - v/ymax*(H-B-T);
  const line = arr => { let d=''; for(let i=x0;i<=x1;i++) d += (i===x0?'M':'L')+X(i).toFixed(1)+' '+Y(arr[i]).toFixed(1); return d; };
  let g = '';
  for(let v=0; v<=ymax+1e-9; v+=step){
    g += `<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${Y(v)+4}" text-anchor="end">${v}</text>`;
  }
  const xs = niceStep(x1-x0, 6);
  for(let v=Math.ceil(x0/xs)*xs; v<=x1; v+=xs){
    g += `<line x1="${X(v)}" x2="${X(v)}" y1="${H-B}" y2="${H-B+4}" stroke="var(--muted)"/><text x="${X(v)}" y="${H-B+16}" text-anchor="middle">${v}</text>`;
  }
  if(state.cap>=x0 && state.cap<=x1){
    g += `<line x1="${X(state.cap)}" x2="${X(state.cap)}" y1="${T}" y2="${H-B}" stroke="var(--bad)" stroke-dasharray="4 3" stroke-width="1.5"/><text x="${X(state.cap)+4}" y="${T+10}" style="fill:var(--bad)">cap ${state.cap}</text>`;
  }
  g += `<path d="${line(mainCol)}" fill="none" stroke="var(--gold)" stroke-width="2"/><path d="${line(subCol)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  if(il>=x0 && il<=x1){
    g += `<circle cx="${X(il)}" cy="${Y(subCol[il])}" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/><circle cx="${X(il)}" cy="${Y(mainCol[il])}" r="5" fill="var(--gold)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  $('#p-chart').innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stat budget by item level">${g}</svg>`;
}

/* ----- sync caps ----- */
function renderSync(){
  const cap = state.cap, hil = clampIlvl(state.syncIlvl);
  $('#s-lead').textContent = `At sync cap ${cap}, a ${cap}-level piece defines the ceiling per slot. Anything above it is cut to this ceiling; anything below it keeps its own stats. The last two columns list a piece’s 1st / 2nd / 3rd substat (100 / 70 / 20% shares): one at item level ${cap}, and one at item level ${hil} after syncing.`;
  const tot = {n1:0,n2:0,n3:0,h1:0,h2:0,h3:0,c:0,main:0,vit:0};
  let h = `<thead><tr><th>Slot</th><th class="n">Share</th><th class="n">Substat cap</th><th class="n">${esc(SHORT.main)} cap</th><th class="n">Vit cap</th><th class="n">Ilvl ${cap} piece</th><th class="n">Ilvl ${hil} synced</th></tr></thead><tbody>`;
  activeSlotTypes().forEach(t=>{
    const c = capsFor(t,cap), m = t==='ring'?2:1;
    const n = SUB_WEIGHTS.map(w=>pieceValue('crit',cap,t,w));
    const hi = SUB_WEIGHTS.map(w=>Math.min(c.crit, pieceValue('crit',hil,t,w)));
    if(t!=='weapon' && t!=='offhand'){ tot.n1+=n[0]*m; tot.n2+=n[1]*m; tot.n3+=n[2]*m; tot.h1+=hi[0]*m; tot.h2+=hi[1]*m; tot.h3+=hi[2]*m; tot.c+=c.crit*m; tot.main+=c.main*m; tot.vit+=c.vit*m; }
    h += `<tr><td>${SLOT_LABEL[t]}${m>1?' ×2':''}</td><td class="n">${SLOT_PCT[t]/10}%</td><td class="n">${c.crit}</td><td class="n">${c.main}</td><td class="n">${c.vit}</td><td class="n">${n.join(' / ')}</td><td class="n">${hi.join(' / ')}</td></tr>`;
  });
  h += `<tr class="total"><td>10 armor and accessory slots</td><td class="n"></td><td class="n">${tot.c}</td><td class="n">${tot.main}</td><td class="n">${tot.vit}</td><td class="n">${tot.n1} / ${tot.n2} / ${tot.n3}</td><td class="n">${tot.h1} / ${tot.h2} / ${tot.h3}</td></tr></tbody>`;
  $('#s-table').innerHTML = h;
  const nat2 = tot.n1+tot.n2, hi2 = tot.h1+tot.h2, spd = tot.c;
  $('#s-sum').innerHTML = `<div class="readout">
    <div><b>${tot.c}</b><span>Most you can get of any one substat from the ten armor and accessory slots</span></div>
    <div><b class="gold">${hi2>=nat2?'+':''}${hi2-nat2}</b><span>First two substats combined, item level ${hil} pieces vs native ${cap} pieces (${nat2>0?(100*(hi2-nat2)/nat2).toFixed(0):0}%)</span></div>
    <div><b>${gcdFor(spd,state.level).toFixed(2)}s</b><span>GCD from ${spd} gear ${esc(STAT_LABEL.spd)} (level ${state.level}, 2.50 base)</span></div>
    <div><b>+${((dotMult(spd,state.level)-1)*100).toFixed(1)}%</b><span>DoT/HoT tick scaling from ${spd} ${esc(STAT_LABEL.spd)}</span></div>
  </div>`;
}

/* ----- validation against the real item database ----- */
let validDone = false;
function renderValidation(){
  if(validDone) return; validDone = true;
  const bands = {'110–135':[0,0,0],'136–300':[0,0,0],'301–600':[0,0,0],'601+':[0,0,0]};
  for(const r of ITEMS){
    const il = r[2]; if(il<110) continue;
    const st = r[5].split(',').map(Number);
    if([5,6,7,8,9,10,11].filter(i=>st[i]).length<2) continue;
    const p = predictRaw(il, r[1], st); if(!p) continue;
    const b = bands[il<=135?'110–135':il<=300?'136–300':il<=600?'301–600':'601+'];
    const d = Math.max(...p.map((x,i)=>Math.abs(x-st[i])));
    b[0]++; if(d===0) b[1]++; if(d<=1) b[2]++;
  }
  let rows = '', total = 0;
  Object.keys(bands).forEach(k=>{ const [n,e,w] = bands[k]; total+=n; rows += `<tr><td>${k}</td><td class="n">${n.toLocaleString()}</td><td class="n">${(100*e/n).toFixed(0)}%</td><td class="n">${(100*w/n).toFixed(0)}%</td></tr>`; });
  let caps = '';
  WIKI475.forEach(([lab,t,w,share])=>{
    const m = rnd(IL.crit[475]*share/1000);
    caps += `<tr><td>${lab}</td><td class="n">${w}</td><td class="n">${m}</td><td class="${m===w?'ok':'bad'}">${m===w?'match':'differs'}</td></tr>`;
  });
  const tbl = (head, body) => `<div class="tablewrap" style="margin-top:8px"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  $('#s-valid-out').innerHTML =
    `<p class="small">For every combat piece in the game database with two or more substats and item level 110 or higher (<b>${total.toLocaleString()}</b> pieces, all jobs), the page’s formula <span class="num">round( round(table × slot share) × substat share )</span> was compared with the item’s real stats, assigning substat shares by rank (100%, 70%, 20%). Real stats are rounded twice: the slot budget first, then the share.</p>` +
    tbl('<th>Item level</th><th class="n">Pieces</th><th class="n">Exact</th><th class="n">Within ±1</th>', rows) +
    `<p class="small" style="margin-top:12px"><b>Sync caps at item level 475</b>, published on the FFXIV Wiki’s Item Level Sync page, against this page’s formula:</p>` +
    tbl('<th>Gear type</th><th class="n">Wiki</th><th class="n">Formula</th><th></th>', caps) +
    `<p class="small dim" style="margin-top:8px">The wiki also states that substats are never scaled up, that melds are ignored on synced-down gear, and that for gear occupying several slots the cap is the sum of those slots. It does not say whether the main stat or Vitality is clamped; this page assumes they are. The few misses are mostly shields and weapons whose substats don’t follow the 70% rule, and some crafted pieces below item level 110 that were tuned by hand.</p>`;
}

/* ----- browse real gear ----- */
let shownRows = [];
const ADD_LIMIT = 3000;
function renderBrowse(){
  const b = state.browse;
  const f = {q:b.q, type:b.type, ilvlMin:+b.min||0, ilvlMax:+b.max||0, lvlMax:+b.lvl||0};
  let rows = browseItems(f);
  const withStats = rows.map(r=>{
    const raw = dbStats(r.st), eff = state.sync ? syncStats(raw, r.type, state.cap, r.ilvl) : raw;
    return {r, raw, eff};
  });
  withStats.sort((a,b2)=>{
    if(b.sort!=='ilvl'){ const d = (b2.eff[b.sort]||0)-(a.eff[b.sort]||0); if(d) return d; }
    return b2.r.ilvl - a.r.ilvl || a.r.name.localeCompare(b2.r.name);
  });
  const LIMIT = 100;
  shownRows = withStats.slice(0, LIMIT);
  $('#b-count').textContent = withStats.length ? `${withStats.length.toLocaleString()} matches${withStats.length>LIMIT?`, showing the first ${LIMIT}`:''}` : 'No matches';
  $('#b-addall').disabled = !withStats.length;
  $('#b-addall')._all = withStats;
  if(!withStats.length){ $('#b-table').innerHTML = `<tbody><tr><td class="empty">No gear matches these filters.</td></tr></tbody>`; return; }
  let h = `<thead><tr><th>Item</th><th>Slot</th><th class="n">ilvl</th><th class="n">Lv</th>${STATS.map(s=>`<th class="n">${esc(SHORT[s])}</th>`).join('')}<th></th></tr></thead><tbody>`;
  shownRows.forEach((x,i)=>{
    h += `<tr><td>${esc(x.r.name)}</td><td>${SLOT_LABEL[x.r.type]}</td><td class="n">${x.r.ilvl}</td><td class="n dim">${x.r.lvl}</td>`;
    STATS.forEach(s=>{
      const raw = x.raw[s]||0, sy = x.eff[s]||0;
      h += sy<raw ? `<td class="n clamp">${raw}→${sy}</td>` : `<td class="n ${raw?'':'dim'}">${raw}</td>`;
    });
    h += `<td><button data-add="${i}" type="button">Add</button></td></tr>`;
  });
  $('#b-table').innerHTML = h + '</tbody>';
}
function addToPool(rows){
  let added = 0;
  rows.forEach(r=>{
    const key = x => [x.name,x.type,x.ilvl].join('|');
    const it = poolItemFromRow(r);
    if(state.pool.some(p=>key(p)===key(it))) return;
    state.pool.push(it); added++;
  });
  return added;
}

/* ----- pool ----- */
function poolSorted(){
  const ord = t => SLOT_TYPES.indexOf(t);
  return state.pool.slice().sort((a,b)=>ord(a.type)-ord(b.type) || b.ilvl-a.ilvl || a.name.localeCompare(b.name));
}
function renderPool(){
  const filt = state.poolFilter;
  const items = poolSorted().filter(i=>filt==='all' || filt===i.type || (filt==='generated'&&i.src==='generated'));
  $('#pool-count').textContent = `${state.pool.length} items · ` + activeSlotTypes().map(t=>`${SLOT_LABEL[t]} ${state.pool.filter(i=>i.type===t).length}`).join(' · ');
  if(!state.pool.length){
    $('#pool-table').innerHTML = `<tbody><tr><td class="empty">The pool is empty. Add gear from the browser above.</td></tr></tbody>`;
    return;
  }
  let h = `<thead><tr><th>Item</th><th>Slot</th><th class="n">ilvl</th><th class="n">Copies</th>${STATS.map(s=>`<th class="n">${esc(SHORT[s])}</th>`).join('')}<th></th></tr></thead><tbody>`;
  const POOL_ROWS = 400;
  const hidden = Math.max(0, items.length - POOL_ROWS);
  items.slice(0, POOL_ROWS).forEach(it=>{
    const e = effOf(it);
    h += `<tr><td>${esc(it.name)}${it.src==='generated'?' <span class="dim small">· hypothetical</span>':''}</td><td>${SLOT_LABEL[it.type]}</td><td class="n">${it.ilvl}</td>
      <td class="n"><input type="number" min="1" max="2" value="${it.copies||1}" data-copies="${it.id}" style="width:54px;padding:3px 5px" aria-label="Copies"></td>`;
    STATS.forEach(s=>{
      const raw = it.stats[s]||0, sy = e[s]||0;
      h += sy<raw ? `<td class="n clamp">${raw}→${sy}</td>` : `<td class="n ${raw?'':'dim'}">${raw}</td>`;
    });
    h += `<td><button class="x" data-del="${it.id}" aria-label="Remove ${esc(it.name)}" type="button">✕</button></td></tr>`;
  });
  if(hidden) h += `<tr><td colspan="${STATS.length+5}" class="dim small">${hidden.toLocaleString()} more items not shown here (they are all still searched). Use the filter above to view them.</td></tr>`;
  $('#pool-table').innerHTML = h + '</tbody>';
}
function poolChanged(){ saveState(); renderPool(); scheduleOpt(); }

/* ----- optimizer ----- */
let optTimer = null;
function scheduleOpt(){ clearTimeout(optTimer); optTimer = setTimeout(renderOpt, 120); }

function renderOpt(){
  const o = state.opt;
  if(state.tab!=='opt') return;
  if(!state.pool.length){
    $('#o-out').innerHTML = `<div class="panel"><div class="empty">Add gear to the pool first.<div class="row" style="justify-content:center;margin-top:10px"><button class="primary" data-act="browse" type="button">Browse real gear</button></div></div></div>`;
    $('#o-ceil').innerHTML = '';
    return;
  }
  const res = optimize(state.pool, ctx(), {
    target:o.target, tiebreak:[o.tb, o.tb2], minAvgIlvl: o.avg ? +o.avgMin||0 : 0, nodeLimit:700000
  });
  if(!res.ok){
    $('#o-out').innerHTML = `<div class="panel"><div class="empty"><b class="bad">No combination meets the average item level requirement</b>${res.truncated?' within the search limit':''}.<br>Lower the requirement or add higher item level gear.</div></div>`;
    renderCeil();
    return;
  }
  const t = res.totals, spd = t.spd;
  const tiers = gcdTiers(state.level);
  const cur = tiers.filter(x=>x.spd<=spd).pop();
  const nxt = tiers.find(x=>x.spd>spd);
  const g = gcdFor(spd, state.level), dm = dotMult(spd, state.level);
  let h = `<div class="panel"><h3>Best loadout for ${esc(STAT_LABEL[o.target])}</h3><div class="readout">
    <div><b>${t[o.target]}</b><span>${esc(STAT_LABEL[o.target])} (gear total${state.sync?', synced':''})</span></div>
    <div><b>${g.toFixed(2)}s</b><span>GCD with ${spd} gear ${esc(STAT_LABEL.spd)} · tier starts at ${cur.spd}${nxt?`, next at ${nxt.spd} (+${nxt.spd-spd})`:''}</span></div>
    <div><b>+${((dm-1)*100).toFixed(1)}%</b><span>DoT/HoT tick scaling</span></div>
    <div><b class="${res.avgIlvl>=state.cap?'ok':'bad'}">${res.avgIlvl.toFixed(1)}</b><span>Average item level over ${res.denom} slot-weights</span></div>
  </div>`;
  h += `<div class="tablewrap"><table><thead><tr><th>Slot</th><th>Item</th><th class="n">ilvl</th>${STATS.map(s=>`<th class="n">${esc(SHORT[s])}</th>`).join('')}</tr></thead><tbody>`;
  let ringN = 0;
  res.picks.forEach(p=>{
    let lab = SLOT_LABEL[p.type]; if(p.type==='ring'){ ringN++; lab = 'Ring '+ringN; }
    if(!p.item){ h += `<tr><td>${lab}</td><td class="dim" colspan="${STATS.length+2}">empty (no copy left)</td></tr>`; return; }
    h += `<tr><td>${lab}</td><td>${esc(p.item.name)}</td><td class="n">${p.item.ilvl}</td>`;
    STATS.forEach(s=>{
      const sy = p.eff[s]||0;
      h += `<td class="n ${s===o.target&&sy?'gold':''}">${sy||'<span class="dim">0</span>'}</td>`;
    });
    h += `</tr>`;
  });
  h += `<tr class="total"><td>Total</td><td></td><td class="n"></td>${STATS.map(s=>`<td class="n">${t[s]}</td>`).join('')}</tr></tbody></table></div>`;
  if(res.truncated) h += `<div class="note small">Search hit its node limit, so this result may not be optimal. Narrow the pool.</div>`;
  $('#o-out').innerHTML = h + `</div>`;
  renderCeil();
}
let ceilCache = '';
function renderCeil(){
  const key = JSON.stringify([state.pool.map(i=>[i.id,i.copies,i.ilvl,i.stats]), state.cap, state.sync, state.level, JOB_ID]);
  if(key===ceilCache && $('#o-ceil').innerHTML) return; ceilCache = key;
  const a = {}, b = {};
  STATS.forEach(s=>{
    const r1 = optimize(state.pool, {cap:state.cap,sync:true}, {target:s, nodeLimit:150000});
    const r2 = optimize(state.pool, {cap:state.cap,sync:false}, {target:s, nodeLimit:150000});
    a[s] = r1.ok ? r1.totals[s] : 0; b[s] = r2.ok ? r2.totals[s] : 0;
  });
  const spdIdx = STATS.indexOf('spd');
  let h = `<div class="panel"><h3>Ceiling per stat from this pool</h3><p class="small dim">The most of each stat the pool can give on its own, ignoring the other stats. “Unsynced” is the same pool without the cap, to show how much the cap removes.</p><div class="tablewrap"><table><thead><tr><th></th>${STATS.map(s=>`<th class="n">${esc(SHORT[s])}</th>`).join('')}</tr></thead><tbody>`;
  h += `<tr><td>Synced to ${state.cap}</td>${STATS.map(s=>`<td class="n">${a[s]}</td>`).join('')}</tr>`;
  h += `<tr><td>Unsynced</td>${STATS.map(s=>`<td class="n dim">${b[s]}</td>`).join('')}</tr>`;
  h += `<tr class="total"><td>GCD at synced ceiling</td>${STATS.map((s,i)=>i===spdIdx?`<td class="n">${a.spd?gcdFor(a.spd,state.level).toFixed(2)+'s':'—'}</td>`:'<td></td>').join('')}</tr></tbody></table></div></div>`;
  $('#o-ceil').innerHTML = h;
}

/* ----- tabs ----- */
function showTab(t){
  if(t==='piece' || t==='sync'){ state.mathTab = t; t = 'math'; }   // older saved state
  if(!['pool','opt','math'].includes(t)) t = 'pool';
  state.tab = t;
  $$('.tab').forEach(s=>s.hidden = s.id !== 'tab-'+t);
  $$('.tabs [data-tab]').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.tab===t)));
  if(t==='opt') renderOpt();
  if(t==='pool') renderBrowse();
  if(t==='math') showSub(state.mathTab);
  saveState();
}
function showSub(s){
  if(!['piece','sync'].includes(s)) s = 'piece';
  state.mathTab = s;
  $$('.subtab').forEach(x=>x.hidden = x.id !== 'tab-'+s);
  $$('.subtabs [data-sub]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.sub===s)));
  saveState();
}

/* ----- wiring ----- */
function renderAll(){
  renderSettings(); renderPiece(); renderSync(); renderPool();
  if(state.tab==='pool') renderBrowse();
  if(state.tab==='opt') renderOpt();
}
function changeJob(id){
  const before = PROFILE_ID, beforeMode = WEAPON_MODE;
  setJob(id); state.job = JOB_ID;
  if(PROFILE_ID!==before || WEAPON_MODE!==beforeMode) resetForJob();
  buildSelects(); syncInputs(); saveState(); ceilCache=''; renderAll();
}
function syncInputs(){
  $('#cap').value = state.cap; $('#level').value = state.level; $('#sync').checked = state.sync;
  $('#p-ilvl').value = state.piece.ilvl; $('#s-ilvl').value = state.syncIlvl;
  $('#g-ilvl').value = state.gen.ilvl;
  $('#o-avg').checked = state.opt.avg; $('#o-avgv').value = state.opt.avgMin;
  $('#b-q').value = state.browse.q; $('#b-min').value = state.browse.min; $('#b-max').value = state.browse.max; $('#b-lvl').value = state.browse.lvl;
}
function init(){
  const had = loadState();
  setJob(state.job);
  if(!had) resetForJob();
  else {
    if(!Array.isArray(state.piece.subs)) state.piece.subs = defaultSubs();
    if(!state.gen.subs.length) state.gen.subs = SUBSTATS.slice();
    if(!state.gen.types.length) state.gen.types = activeSlotTypes().slice();
  }
  // drop any saved selections that don't exist for this job
  const okSub = s => SUBSTATS.includes(s);
  const ds = defaultSubs();
  state.piece.subs = [0,1,2].map(i=>{ const v = state.piece.subs && state.piece.subs[i]; return okSub(v) ? v : (i===2 ? null : ds[i]); });
  if(state.piece.subs[1]===state.piece.subs[0]) state.piece.subs[1] = ds[1];
  if(!activeSlotTypes().includes(state.piece.slot)) state.piece.slot = 'head';
  state.piece.ilvl = Math.min(state.piece.ilvl, MAX_REAL); state.syncIlvl = Math.min(state.syncIlvl, MAX_REAL); state.gen.ilvl = Math.min(state.gen.ilvl, MAX_REAL);
  state.gen.subs = state.gen.subs.filter(okSub); if(state.gen.subs.length<2) state.gen.subs = SUBSTATS.slice();
  state.gen.types = state.gen.types.filter(t=>activeSlotTypes().includes(t)); if(!state.gen.types.length) state.gen.types = activeSlotTypes().slice();
  if(!STATS.includes(state.opt.target)) state.opt.target = 'spd';
  if(state.opt.tb && !STATS.includes(state.opt.tb)) state.opt.tb = 'main';
  if(state.opt.tb2 && !STATS.includes(state.opt.tb2)) state.opt.tb2 = 'vit';
  if(state.browse.sort!=='ilvl' && !STATS.includes(state.browse.sort)) state.browse.sort = 'ilvl';
  bumpUid();
  buildSelects(); syncInputs();

  const num = (el, fn, lo, hi) => el.addEventListener('input', e=>{ const v = +e.target.value; if(e.target.value!=='' && v>=lo && v<=hi) fn(Math.round(v)); });
  $('#job').addEventListener('change', e=>changeJob(e.target.value));
  num($('#cap'), v=>{ state.cap=v; saveState(); renderAll(); }, 1, MAX_REAL);
  num($('#level'), v=>{ state.level=v; saveState(); renderAll(); }, 1, 100);
  $('#sync').addEventListener('change', e=>{ state.sync=e.target.checked; saveState(); renderAll(); });
  $$('.tabs [data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
  $$('.subtabs [data-sub]').forEach(b=>b.addEventListener('click',()=>showSub(b.dataset.sub)));

  // piece lab
  num($('#p-ilvl'), v=>{ state.piece.ilvl=v; saveState(); renderPiece(); }, 1, MAX_REAL);
  $('#p-range').addEventListener('input', e=>{ state.piece.ilvl=+e.target.value; $('#p-ilvl').value=state.piece.ilvl; saveState(); renderPiece(); });
  $('#p-slot').addEventListener('change', e=>{ state.piece.slot=e.target.value; saveState(); renderPiece(); });
  ['#p-s1','#p-s2','#p-s3'].forEach((id,i)=>$(id).addEventListener('change', e=>{ state.piece.subs[i]=e.target.value||null; saveState(); renderPiece(); }));
  num($('#s-ilvl'), v=>{ state.syncIlvl=v; saveState(); renderSync(); }, 1, MAX_REAL);
  $('#s-valid').addEventListener('toggle', e=>{ if(e.target.open) renderValidation(); });

  // browser
  const bset = (k, v) => { state.browse[k]=v; saveState(); renderBrowse(); };
  $('#b-q').addEventListener('input', e=>bset('q', e.target.value));
  $('#b-type').addEventListener('change', e=>bset('type', e.target.value));
  $('#b-sort').addEventListener('change', e=>bset('sort', e.target.value));
  $('#b-min').addEventListener('input', e=>bset('min', e.target.value));
  $('#b-max').addEventListener('input', e=>bset('max', e.target.value));
  $('#b-lvl').addEventListener('input', e=>bset('lvl', e.target.value));
  $('#b-table').addEventListener('click', e=>{
    const btn = e.target.closest('[data-add]'); if(!btn) return;
    const x = shownRows[+btn.dataset.add]; if(!x) return;
    if(addToPool([x.r])){ btn.textContent = 'Added'; btn.disabled = true; poolChanged(); }
    else { btn.textContent = 'In pool'; btn.disabled = true; }
  });
  $('#b-addall').addEventListener('click', ()=>{
    const all = $('#b-addall')._all || []; if(!all.length) return;
    if(all.length>ADD_LIMIT){ $('#b-count').innerHTML = `<b class="bad">${all.length.toLocaleString()} matches is too many to add at once.</b> Narrow the filters to ${ADD_LIMIT.toLocaleString()} or fewer (slot, item level range or name).`; return; }
    const n = addToPool(all.map(x=>x.r)); poolChanged();
    $('#b-count').innerHTML = `<b class="ok">Added ${n.toLocaleString()} item${n===1?'':'s'} to the pool</b>${n<all.length?` (${(all.length-n).toLocaleString()} already there)`:''}.`;
  });

  // pool
  $('#b-clear').addEventListener('click',()=>{ state.pool=[]; poolChanged(); });
  $('#pool-filter').addEventListener('change', e=>{ state.poolFilter=e.target.value; saveState(); renderPool(); });
  $('#pool-table').addEventListener('click', e=>{
    const id = e.target.closest('[data-del]'); if(!id) return;
    state.pool = state.pool.filter(i=>i.id!==id.dataset.del); poolChanged();
  });
  $('#pool-table').addEventListener('change', e=>{
    const el = e.target.closest('[data-copies]'); if(!el) return;
    const it = state.pool.find(i=>i.id===el.dataset.copies); if(it){ it.copies = Math.min(2,Math.max(1,Math.round(+el.value||1))); saveState(); scheduleOpt(); }
  });

  // advanced
  num($('#g-ilvl'), v=>{ state.gen.ilvl=v; saveState(); }, 1, MAX_REAL);
  $('#g-third').addEventListener('change', e=>{ state.gen.third = e.target.value==='1'; saveState(); });
  $('#g-subs').addEventListener('change', ()=>{ state.gen.subs = $$('[data-gsub]').filter(x=>x.checked).map(x=>x.dataset.gsub); saveState(); });
  $('#g-types').addEventListener('change', ()=>{ state.gen.types = $$('[data-gtype]').filter(x=>x.checked).map(x=>x.dataset.gtype); saveState(); });
  $('#b-gen').addEventListener('click',()=>{
    if(state.gen.subs.length<2 || !state.gen.types.length) return;
    state.pool = state.pool.filter(i=>i.src!=='generated').concat(genericItems(state.gen.ilvl, state.gen.subs, state.gen.third, state.gen.types));
    poolChanged();
  });
  $('#b-gen-clear').addEventListener('click',()=>{ state.pool = state.pool.filter(i=>i.src!=='generated'); poolChanged(); });
  $('#b-fill').addEventListener('click',()=>{
    const st = buildPiece(clampIlvl($('#c-ilvl').value), $('#c-slot').value, [$('#c-s1').value,$('#c-s2').value,$('#c-s3').value||null]);
    STATS.forEach(s=>{ $(`[data-cstat="${s}"]`).value = st[s]; });
  });
  $('#b-add').addEventListener('click',()=>{
    const st = {}; STATS.forEach(s=>{ st[s] = Math.max(0, Math.round(+$(`[data-cstat="${s}"]`).value||0)); });
    const type = $('#c-slot').value;
    const name = $('#c-name').value.trim() || (SLOT_LABEL[type]+' custom');
    state.pool.push(mkItem(name, type, clampIlvl($('#c-ilvl').value), st, {copies: Math.min(2,Math.max(1,+$('#c-copies').value||1))}));
    $('#c-name').value='';
    poolChanged();
  });

  // optimizer
  $('#o-target').addEventListener('change', e=>{ state.opt.target=e.target.value; saveState(); scheduleOpt(); });
  $('#o-tb1').addEventListener('change', e=>{ state.opt.tb=e.target.value; saveState(); scheduleOpt(); });
  $('#o-tb2').addEventListener('change', e=>{ state.opt.tb2=e.target.value; saveState(); scheduleOpt(); });
  $('#o-avg').addEventListener('change', e=>{ state.opt.avg=e.target.checked; saveState(); scheduleOpt(); });
  $('#o-avgv').addEventListener('input', e=>{ state.opt.avgMin=+e.target.value||0; saveState(); scheduleOpt(); });
  $('#o-out').addEventListener('click', e=>{
    const a = e.target.closest('[data-act]'); if(!a) return;
    showTab('pool');
  });

  renderAll();
  showTab(state.tab);
}
init();
