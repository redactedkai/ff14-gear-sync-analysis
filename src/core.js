/* ---------- core math (pure) ---------- */
/* Internal stat keys are role-neutral: main (Str/Dex/Int/Mind), vit, crit, det, dh, spd (Skill/Spell Speed), spec (Piety/Tenacity/none) */
const STATS = [], SUBSTATS = [], STAT_LABEL = {}, SHORT = {};
const ALL_STATS = ['main','vit','crit','det','dh','spd','spec'];
const SLOT_TYPES = ['weapon','offhand','head','body','hands','legs','feet','ear','neck','wrist','ring'];
const SLOT_LABEL = {weapon:'Weapon',offhand:'Off-hand',head:'Head',body:'Body',hands:'Hands',legs:'Legs',feet:'Feet',ear:'Earring',neck:'Necklace',wrist:'Bracelet',ring:'Ring'};
const SLOT_PCT = {weapon:140,offhand:40,head:85,body:135,hands:85,legs:135,feet:85,ear:67,neck:67,wrist:67,ring:67};
const SUB_WEIGHTS = [100,70,20];
const MAIN_NAME = {str:'Strength',dex:'Dexterity',int:'Intelligence',mind:'Mind'};
const MAIN_SHORT = {str:'Str',dex:'Dex',int:'Int',mind:'Mind'};
const SPD_NAME = {sks:'Skill Speed',sps:'Spell Speed'};
const SPD_SHORT = {sks:'SkS',sps:'SpS'};
const SPEC_NAME = {piety:'Piety',ten:'Tenacity'};
const SPEC_SHORT = {piety:'Piety',ten:'Ten'};
const PROFILES = {
  healer:{label:'Healer', main:'mind', spd:'sps', spec:'piety'},
  tank:{label:'Tank', main:'str', spd:'sks', spec:'ten'},
  melee:{label:'Melee DPS (Strength)', main:'str', spd:'sks', spec:null},
  dex:{label:'Ranged, Ninja, Viper (Dexterity)', main:'dex', spd:'sks', spec:null},
  caster:{label:'Caster (Intelligence)', main:'int', spd:'sps', spec:null},
};
let PROFILE = PROFILES.healer, PROFILE_ID = 'healer', WEAPON_MODE = '2h';
const MAX_ILVL = IL.mind.length - 1;
const MAX_REAL = (typeof ITEMS!=='undefined') ? ITEMS.reduce((m,r)=>Math.max(m,r[2]),0) : 795;   /* highest item level of any real piece */

function setProfile(id){
  PROFILE_ID = id; PROFILE = PROFILES[id];
  STATS.length = 0; SUBSTATS.length = 0;
  ['main','vit','crit','det','dh','spd'].concat(PROFILE.spec?['spec']:[]).forEach(s=>STATS.push(s));
  ['crit','det','dh','spd'].concat(PROFILE.spec?['spec']:[]).forEach(s=>SUBSTATS.push(s));
  Object.assign(STAT_LABEL,{main:MAIN_NAME[PROFILE.main],vit:'Vitality',crit:'Critical Hit',det:'Determination',dh:'Direct Hit',spd:SPD_NAME[PROFILE.spd],spec:PROFILE.spec?SPEC_NAME[PROFILE.spec]:''});
  Object.assign(SHORT,{main:MAIN_SHORT[PROFILE.main],vit:'Vit',crit:'Crit',det:'Det',dh:'DH',spd:SPD_SHORT[PROFILE.spd],spec:PROFILE.spec?SPEC_SHORT[PROFILE.spec]:''});
}
function setWeaponMode(m){ WEAPON_MODE = m; SLOT_PCT.weapon = (m==='2h') ? 140 : 100; }
function slotActive(t){ return t==='offhand' ? WEAPON_MODE==='1h+oh' : true; }
function activeSlotTypes(){ return SLOT_TYPES.filter(slotActive); }
function ilWeight(t){ return (t==='weapon' && WEAPON_MODE==='2h') ? 2 : 1; }
function vitFactor(){ return (PROFILE.main==='mind' || PROFILE.main==='int') ? 0.9 : 1; }
function colOf(stat){
  if(stat==='main') return IL[PROFILE.main];
  if(stat==='spd') return IL[PROFILE.spd];
  if(stat==='spec') return PROFILE.spec ? IL[PROFILE.spec] : IL.crit;
  return IL[stat];
}
setProfile('healer');

function rnd(x){ return Math.floor(x + 0.5 + 1e-9); }
function clampIlvl(i){ i = Math.round(+i||0); return Math.max(0, Math.min(MAX_ILVL, i)); }

/* value of `stat` at ilvl for a slot type. Real item stats are rounded twice: first the slot budget
   (table x slot share), then the substat share or the Vitality factor applied to that whole number. */
function slotBudget(stat, ilvl, type){
  const base = colOf(stat)[clampIlvl(ilvl)];
  let v = rnd(base * SLOT_PCT[type] / 1000);
  if(stat==='vit' && vitFactor()!==1) v = rnd(v * vitFactor());
  return v;
}
function pieceValue(stat, ilvl, type, weight){
  const v = slotBudget(stat, ilvl, type);
  return (weight==null || weight===100) ? v : rnd(v * weight / 100);
}
function blankStats(){ return {main:0,vit:0,crit:0,det:0,dh:0,spd:0,spec:0}; }
function buildPiece(ilvl, type, subs){
  const st = blankStats();
  st.main = pieceValue('main', ilvl, type, 100);
  st.vit  = pieceValue('vit',  ilvl, type, 100);
  subs.forEach((s,i)=>{ if(s) st[s] = pieceValue(s, ilvl, type, SUB_WEIGHTS[i]); });
  return st;
}
function capsFor(type, capIlvl){
  const c = {};
  ALL_STATS.forEach(s=>{ c[s] = (s==='spec' && !PROFILE.spec) ? 0 : pieceValue(s, capIlvl, type, 100); });
  return c;
}
function syncStats(stats, type, capIlvl, itemIlvl){
  if(itemIlvl!=null && itemIlvl<=capIlvl) return Object.assign({}, stats);
  const c = capsFor(type, capIlvl), o = {};
  ALL_STATS.forEach(s=>{ o[s] = Math.min(stats[s]||0, c[s]); });
  return o;
}

/* ---------- speed ---------- */
function speedParams(level){
  const r = PG[Math.max(1,Math.min(100,level|0))-1];
  return {sub:r[0], div:r[1], sync:r[2]};
}
function gcdFor(gearSpd, level, baseMs){
  const {sub,div} = speedParams(level);
  baseMs = baseMs||2500;
  const speed = sub + gearSpd;
  const m = 1000 + Math.ceil(130*(sub - speed)/div);
  return Math.floor(baseMs * m / 10000) / 100;
}
function dotMult(gearSpd, level){
  const {div} = speedParams(level);
  return (1000 + Math.floor(130*gearSpd/div)) / 1000;
}
function gcdTiers(level, baseMs){
  const out = []; let last = gcdFor(0,level,baseMs);
  out.push({spd:0,gcd:last});
  for(let s=1;s<=1200;s++){ const g = gcdFor(s,level,baseMs); if(g<last-1e-9){ out.push({spd:s,gcd:g}); last=g; } }
  return out;
}

/* ---------- optimizer ---------- */
function effStats(item, ctx){
  return ctx.sync ? syncStats(item.stats, item.type, ctx.cap, item.ilvl) : item.stats;
}
function optimize(pool, ctx, opts){
  opts = opts || {};
  const targetStat = opts.target || 'spd';
  const tb = (opts.tiebreak||[]).filter(Boolean);
  const mins = opts.mins || {}, maxs = opts.maxs || {};
  const minAvg = opts.minAvgIlvl || 0;
  const nodeLimit = opts.nodeLimit || 1500000;
  const W = [1e8, 1e4, 1];
  const dims = STATS.concat(['ilw']);
  const present = {};
  SLOT_TYPES.forEach(t=>{ present[t] = slotActive(t) ? pool.filter(i=>i.type===t) : []; });
  const slotList = [];
  SLOT_TYPES.forEach(t=>{
    if(!present[t].length) return;
    slotList.push(t);
    if(t==='ring') slotList.push('ring');
  });
  const nSlots = slotList.length;
  const denom = slotList.reduce((a,t)=>a+ilWeight(t),0);
  function vec(item){
    const e = effStats(item, ctx);
    const v = {}; STATS.forEach(s=>v[s]=e[s]||0);
    v.ilw = item.ilvl * ilWeight(item.type);
    return v;
  }
  function score(v){
    let sc = (v[targetStat]||0)*W[0];
    if(tb[0]) sc += (v[tb[0]]||0)*W[1];
    if(tb[1]) sc += (v[tb[1]]||0)*W[2];
    return sc;
  }
  const cand = {};
  slotList.forEach(t=>{
    if(cand[t]) return;
    const arr = present[t].map(it=>({it, v:vec(it), copies: it.copies||1}));
    arr.forEach(a=>{ a.sc = score(a.v); });
    const keep = [];
    for(let i=0;i<arr.length;i++){
      let dom = false;
      for(let j=0;j<arr.length && !dom;j++){
        if(i===j) continue;
        const A = arr[j], B = arr[i];
        if(A.copies < B.copies) continue;
        let ge = true, gt = false;
        for(const d of dims){ if(A.v[d] < B.v[d]) { ge=false; break; } if(A.v[d] > B.v[d]) gt = true; }
        if(ge && (gt || j<i)) dom = true;
      }
      if(!dom) keep.push(arr[i]);
    }
    keep.sort((a,b)=>b.sc-a.sc);
    cand[t] = keep;
  });
  const posList = slotList.map(t=>cand[t]);
  const remMax = {}; dims.forEach(d=>{ remMax[d]=new Array(nSlots+1).fill(0); });
  const remSc = new Array(nSlots+1).fill(0);
  for(let i=nSlots-1;i>=0;i--){
    dims.forEach(d=>{ remMax[d][i] = remMax[d][i+1] + Math.max(0, ...posList[i].map(a=>a.v[d])); });
    remSc[i] = remSc[i+1] + Math.max(...posList[i].map(a=>a.sc));
  }
  const need = {};
  STATS.forEach(s=>{ if(mins[s]>0) need[s]=mins[s]; });
  const ilNeed = minAvg>0 ? minAvg*denom : 0;
  let best = null, bestSc = -Infinity, nodes = 0, truncated = false;
  const cur = {}; dims.forEach(d=>cur[d]=0);
  const chosen = new Array(nSlots).fill(null);
  const used = new Map();
  function dfs(pos, sc){
    if(truncated) return;
    if(++nodes > nodeLimit){ truncated = true; return; }
    if(pos===nSlots){
      for(const s in need) if(cur[s] < need[s]) return;
      if(ilNeed && cur.ilw < ilNeed) return;
      if(sc > bestSc){ bestSc = sc; best = chosen.slice(); }
      return;
    }
    if(sc + remSc[pos] <= bestSc) return;
    for(const s in need) if(cur[s] + remMax[s][pos] < need[s]) return;
    if(ilNeed && cur.ilw + remMax.ilw[pos] < ilNeed) return;
    const t = slotList[pos];
    const list = posList[pos];
    const isRing2 = t==='ring' && pos>0 && slotList[pos-1]==='ring';
    let avail = 0;
    for(let k=0;k<list.length;k++){
      const a = list[k];
      const u = used.get(a.it.id)||0;
      if(u >= a.copies) continue;
      avail++;
      if(isRing2){ const prev = chosen[pos-1]; if(prev && prev.rank > k) continue; }
      let ok = true;
      for(const s in maxs){ if(maxs[s]!=null && cur[s] + a.v[s] > maxs[s]){ ok=false; break; } }
      if(!ok) continue;
      dims.forEach(d=>cur[d]+=a.v[d]);
      used.set(a.it.id,u+1);
      chosen[pos] = {a, rank:k};
      dfs(pos+1, sc + a.sc);
      chosen[pos] = null;
      used.set(a.it.id,u);
      dims.forEach(d=>cur[d]-=a.v[d]);
      if(truncated) return;
    }
    if(avail===0){
      chosen[pos] = {a:null, rank:-1};
      dfs(pos+1, sc);
      chosen[pos] = null;
    }
  }
  dfs(0,0);
  if(!best) return {ok:false, truncated, nodes};
  const picks = [];
  const totals = {}; dims.forEach(d=>totals[d]=0);
  best.forEach((c,i)=>{
    if(!c || !c.a){ picks.push({type:slotList[i], item:null}); return; }
    picks.push({type:slotList[i], item:c.a.it, eff:c.a.v});
    dims.forEach(d=>totals[d]+=c.a.v[d]);
  });
  return {ok:true, picks, totals, truncated, nodes, denom, avgIlvl: denom? totals.ilw/denom : 0};
}

/* ---------- item generators / presets ---------- */
let _uid = 1;
function newId(){ return 'i'+(_uid++); }
function mkItem(name, type, ilvl, stats, extra){
  return Object.assign({id:newId(), name, type, ilvl, stats: Object.assign(blankStats(), stats), copies:1, src:'custom'}, extra||{});
}
/* generic pieces: every ordered pair (A,B) of allowed substats per slot type, optional DH third (healer-style gear) */
function genericItems(ilvl, subsAllowed, third, types){
  const items = [];
  types.forEach(t=>{
    subsAllowed.forEach(a=>subsAllowed.forEach(b=>{
      if(a===b) return;
      const subs = [a,b];
      if(third && a!=='dh' && b!=='dh') subs.push('dh');
      const st = buildPiece(ilvl,t,subs);
      const nm = SLOT_LABEL[t]+' ilvl '+ilvl+' · '+SHORT[a]+'/'+SHORT[b]+(subs.length>2?'/DH':'');
      items.push(mkItem(nm,t,ilvl,st,{src:'generated',copies:2}));
    }));
  });
  return items;
}

/* ---------- jobs and the real-item database (ITEMS, from items.js) ---------- */
const JOBS = [
  ['PLD','Paladin','tank'],['WAR','Warrior','tank'],['DRK','Dark Knight','tank'],['GNB','Gunbreaker','tank'],
  ['WHM','White Mage','healer'],['SCH','Scholar','healer'],['AST','Astrologian','healer'],['SGE','Sage','healer'],
  ['MNK','Monk','melee'],['DRG','Dragoon','melee'],['SAM','Samurai','melee'],['RPR','Reaper','melee'],
  ['NIN','Ninja','dex'],['VPR','Viper','dex'],['BRD','Bard','dex'],['MCH','Machinist','dex'],['DNC','Dancer','dex'],
  ['BLM','Black Mage','caster'],['SMN','Summoner','caster'],['RDM','Red Mage','caster'],['PCT','Pictomancer','caster'],['BLU','Blue Mage','caster'],
];
const ROLE_GROUP = {tank:'Tanks',healer:'Healers',melee:'Melee DPS',dex:'Ranged and Dexterity DPS',caster:'Casters'};
const ITEM_STAT_ORDER = ['str','dex','int','mind','vit','piety','ten','dh','crit','det','sks','sps'];
const DB_SLOT_TYPE = ['weapon','weapon','offhand','head','body','hands','legs','feet','ear','neck','wrist','ring'];   /* ITEMS slot code -> pool slot type; codes 0 = two-handed, 1 = one-handed weapon */
let JOB_ID = 'SGE';
function setJob(id){
  const j = JOBS.find(x=>x[0]===id) || JOBS[7];
  JOB_ID = j[0];
  setProfile(j[2]);
  setWeaponMode(JOB_ID==='PLD' ? '1h+oh' : '2h');
}
function jobIndex(){ return JOBS.findIndex(j=>j[0]===JOB_ID); }
function statIdx(key){ return ITEM_STAT_ORDER.indexOf(key); }
/* convert a database row's 12 stats to this job's neutral keys */
function dbStats(st12){
  const g = k => st12[statIdx(k)]||0;
  return {main:g(PROFILE.main), vit:g('vit'), crit:g('crit'), det:g('det'), dh:g('dh'), spd:g(PROFILE.spd), spec: PROFILE.spec ? g(PROFILE.spec) : 0};
}
function parseRow(r){
  return {name:r[0], slotCode:r[1], type:DB_SLOT_TYPE[r[1]], ilvl:r[2], lvl:r[3], mask:r[4], st:r[5].split(',').map(Number), unique:!!r[6]};
}
/* rows usable by the current job, filtered; returns parsed rows */
function browseItems(f){
  const bit = 1 << jobIndex(), out = [];
  const q = (f.q||'').trim().toLowerCase();
  for(let k=0;k<ITEMS.length;k++){
    const r = ITEMS[k];
    if(!(r[4] & bit)) continue;
    if(r[1]===0 && WEAPON_MODE!=='2h') continue;
    if(r[1]===1 && WEAPON_MODE==='2h') continue;
    if(r[1]===2 && WEAPON_MODE!=='1h+oh') continue;
    if(f.type && f.type!=='any' && DB_SLOT_TYPE[r[1]]!==f.type) continue;
    if(f.ilvlMin && r[2] < f.ilvlMin) continue;
    if(f.ilvlMax && r[2] > f.ilvlMax) continue;
    if(f.lvlMax && r[3] > f.lvlMax) continue;
    if(q && r[0].toLowerCase().indexOf(q)<0) continue;
    const p = parseRow(r);
    // must carry this job's main stat
    if(!p.st[statIdx(PROFILE.main)]) continue;
    out.push(p);
  }
  return out;
}
function poolItemFromRow(p){
  return mkItem(p.name, p.type, p.ilvl, dbStats(p.st), {src:'game', copies: (p.type==='ring' && !p.unique) ? 2 : 1});
}
/* formula prediction from the raw 12-stat vector (any role); used to validate against the database */
function predictRaw(il, slotCode, st){
  const pct = [140,100,40,85,135,85,135,85,67,67,67,67][slotCode];
  const main = [0,1,2,3].filter(i=>st[i]);
  if(!main.length) return null;
  const col = k => IL[k][il];
  const m = main[0], out = new Array(12).fill(0);
  out[m] = rnd(col(ITEM_STAT_ORDER[m])*pct/1000);
  const vb = rnd(col('vit')*pct/1000);
  out[4] = (m===2||m===3) ? rnd(vb*0.9) : vb;
  const subs = [5,6,7,8,9,10,11].filter(i=>st[i]).sort((a,b)=>st[b]-st[a]);
  subs.slice(0,3).forEach((i,k)=>{ out[i] = rnd(rnd(col(ITEM_STAT_ORDER[i])*pct/1000)*[1,0.7,0.2][k]); });
  return out;
}
/* published substat caps at ilvl 475 (FFXIV Wiki, Item Level Sync): accessories 88, head/hands/feet 112, body/legs 177, 1H weapon 131 + shield 53 */
const WIKI475 = [['Accessory','ear',88,67],['Head / hands / feet','head',112,85],['Body / legs','body',177,135],['One-handed weapon','weapon',131,100],['Off-hand (shield)','offhand',53,40]];

setJob('SGE');

if(typeof module!=='undefined') module.exports = {WIKI475,STATS,SUBSTATS,SHORT,SLOT_TYPES,SLOT_PCT,pieceValue,buildPiece,capsFor,syncStats,gcdFor,dotMult,gcdTiers,optimize,genericItems,mkItem,speedParams,IL,PG,setProfile,setWeaponMode,setJob,browseItems,poolItemFromRow,predictRaw,dbStats,PROFILES,JOBS,ITEMS:(typeof ITEMS!=='undefined'?ITEMS:null)};
