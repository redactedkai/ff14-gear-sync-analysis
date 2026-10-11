/* Core-logic tests. Run: node tests/core.test.js   (or: npm test)
   Loads src/data.js + src/items.js + src/core.js into one scope, the same way the browser bundle does. */
const fs = require('fs'), path = require('path');
const src = ['data.js', 'items.js', 'core.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
new Function('process', src + '\n' + ' ' + String.raw`
let fails=0; function eq(a,b,m){ if(JSON.stringify(a)!==JSON.stringify(b)){fails++;console.log('FAIL',m,'got',JSON.stringify(a),'want',JSON.stringify(b));} else console.log('ok  ',m,JSON.stringify(a)); }
setJob('SGE');
for(const [t,w] of [['head',29],['body',47],['ear',23],['weapon',48]]) eq(capsFor(t,123).spd,w,'cap '+t);
for(const [t,w] of [['head',30],['body',48],['ear',24],['weapon',50]]) eq(capsFor(t,123).main,w,'main cap '+t);
eq(buildPiece(130,'head',['spd','spec','dh']),{main:33,vit:32,crit:0,det:0,dh:6,spd:31,spec:22},'hood formula');
const t=gcdTiers(50,2500);
eq(t.filter(x=>[150,202,307,349].includes(x.spd)).map(x=>[x.spd,x.gcd]),[[150,2.35],[202,2.3],[307,2.2],[349,2.16]],'tiers');
eq([gcdFor(22,100),gcdFor(80,100)],[2.49,2.49],'AkhMorning lvl100 examples');
// preset + optimizer (healer)
let pool=browseItems({q:'Dreadwyrm',type:'any',ilvlMin:130,ilvlMax:130,lvlMax:50}).filter(r=>/of Healing$/.test(r.name)).map(poolItemFromRow);
eq(pool.length,9,'Dreadwyrm healing pieces found');
let r=optimize(pool,{cap:123,sync:true},{target:'spd'}); eq(r.totals.spd,171,'Dreadwyrm synced SpS (ring is Unique, so only one)');
r=optimize(pool,{cap:123,sync:false},{target:'spd'}); eq(r.totals.spd,176,'Dreadwyrm unsynced SpS (one ring)');
const gen=genericItems(475,SUBSTATS,false,['head','body','hands','legs','feet','ear','neck','wrist','ring']);
r=optimize(gen,{cap:123,sync:true},{target:'spd'}); eq([r.totals.spd,gcdFor(r.totals.spd,50)],[296,2.22],'generic max');
// wiki caps at 475 per slot, PLD for 1H + shield
setJob('PLD'); eq(WEAPON_MODE,'1h+oh','PLD mode');
for(const [lab,t,w,sh] of WIKI475) eq(Math.floor(IL.crit[475]*sh/1000+0.5),w,'wiki475 '+lab);
setJob('SGE');
// real item DB validation by band
const bands={};
for(const r of ITEMS){ const st=r[5].split(",").map(Number), il=r[2]; const p=predictRaw(il,r[1],st); if(!p) continue; const ns=[5,6,7,8,9,10,11].filter(i=>st[i]).length; if(ns<2||il<110) continue; const b=il<=135?"110-135":il<=300?"136-300":il<=600?"301-600":"601+"; bands[b]=bands[b]||[0,0,0]; const d=Math.max(...p.map((x,i)=>Math.abs(x-st[i]))); bands[b][0]++; if(d===0) bands[b][1]++; if(d<=1) bands[b][2]++; }
for(const [b,[n,exact,w1]] of Object.entries(bands)){ console.log('band',b,'n='+n,'exact',(exact/n*100).toFixed(1)+'%','within1',(w1/n*100).toFixed(1)+'%'); if(exact/n<0.95||w1/n<0.96){fails++;console.log('FAIL formula accuracy in band',b);} }
if(!(MAX_REAL<=MAX_ILVL)){fails++;console.log('FAIL MAX_REAL exceeds the ItemLevel table');}
console.log(fails?'FAILS '+fails:'ALL PASS'); if(fails) process.exitCode=1;

`)(process);
