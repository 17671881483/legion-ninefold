import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS} from '../dist/data.js';
const choices=UNITS.filter(u=>!u.legacy&&u.randomPool&&u.combatRawcode&&u.hp>0&&u.damage>0);
function same(a,b,path='snapshot'){if(Object.is(a,b))return;if(typeof a!==typeof b||a===null||b===null||typeof a!=='object')throw new Error(path+': '+JSON.stringify(a)+' != '+JSON.stringify(b));for(const key of new Set([...Object.keys(a),...Object.keys(b)]))same(a[key],b[key],path+'.'+key);}
let peak=0,spawns=0,jobs=0;
for(let wave=1;wave<=35;wave++){
 const g=new Game({seed:2026+wave,mode:'sandbox'}),p=g.state.players[0];
 p.roster=choices.map(u=>u.id);
 for(let i=0;i<18;i++){const u=choices[(i*37+wave*13)%choices.length];const result=g.command('build',{unitId:u.id,col:i%6,row:Math.floor(i/6)});assert.ok(result.ok,result.message);}
 g.command('sandboxWave',{wave});g.command('ready');
 for(let i=0;i<240&&g.state.phase==='combat';i++){
  g.tick(.05);peak=Math.max(peak,g.state.entities.length);jobs=Math.max(jobs,g.state.sourceSkillJobs.length);
  for(const e of g.state.entities)for(const f of['hp','maxHp','damage','armor','worldX','worldY','mana'])if(e[f]!==undefined)assert.ok(Number.isFinite(e[f]),`wave${wave}: ${e.id}.${f}`);
 }
 spawns+=g.state.metrics.spawned;
 const restored=Game.fromSnapshot(g.snapshot());
 same(restored.snapshot(),g.snapshot(),`wave${wave} snapshot`);
 g.tick(.05);restored.tick(.05);same(restored.snapshot(),g.snapshot(),`wave${wave} continuation`);
}
console.log(JSON.stringify({waves:35,simulatedSecondsPerWave:12,peakEntities:peak,peakSourceJobs:jobs,spawned:spawns,finiteState:true,saveContinuation:true}));
