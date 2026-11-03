import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Same current engine, exact army, resources and seed; swap only the planner.
// The baseline is the committed pre-v75 AI file, loaded against CURRENT skills.
// Fixed-army lane trials do not estimate a natural-match or PvP win rate.
// The initial trial used 7122b9d; the v74 revision below has the identical
// ai-combat.js blob c75aaebb5b2edaafce483c866d452698f57b8d14.
export const BASELINE_REF='874fe5397ea385ff01378138f10de71ec8f4ea75';
export async function loadPlanners(root=process.cwd()){
 // Published evidence embeds the exact old file so shallow CI checkouts do
 // not need a historical Git object or a network fetch to run this test.
 const evidence=JSON.parse(readFileSync(resolve(root,'reference/ai-v75-combat-benchmark.json'),'utf8'));
 const old=evidence.baselineSource??execFileSync('git',['show',BASELINE_REF+':dist/ai-combat.js'],{cwd:root,encoding:'utf8'});
 const hash=s=>createHash('sha256').update(s).digest('hex');
 if(hash(old)!==evidence.baselineHash)throw new Error('Baseline source hash does not match the recorded evidence');
 const rewritten=old.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${pathToFileURL(resolve(root,'dist',path)).href}'`);
 const baseline=(await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'))).castAICombat;
 const current=(await import(pathToFileURL(resolve(root,'dist/ai-combat.js')))).castAICombat;
 return {baseline,current,baselineHash:hash(old),currentHash:hash(readFileSync(resolve(root,'dist/ai-combat.js')))};
}
export async function runTrial({planner,raw,wave,seed,root=process.cwd()}){
 const {Game}=await import(pathToFileURL(resolve(root,'dist/engine.js'))),{UNITS}=await import(pathToFileURL(resolve(root,'dist/data.js')));
 const g=new Game({mode:'sandbox',seed}),p=g.state.players[4];g.state.wave=wave;
 for(const q of g.state.players){q.buildings=[];q.gold=q.wood=0;q.roster=[];q.heroAltarCount=2;q.workers=0;q.lumberLevel=0;q.eggHistory.firstWaveClosed=true;}
 const roster=[raw,'h00T','h00T','h00U','h00U','h00U','h00U'];let armyValue=0;
 for(const [i,code] of roster.entries()){
  const u=UNITS.find(u=>u.id==='v14_'+code);if(!u)throw new Error('Unknown trial unit '+code);armyValue+=u.cost;
  const b={id:g._uid('b'),unitId:u.id,col:i===0?2:(i-1)%4+1,row:i===0?5:i<3?4:6,construction:{targetId:u.id}};p.buildings.push(b);g._completeConstruction(p,b);
 }
 g.state.sandbox.aiEnabled=true;g._aiBuild=()=>{};g._aiAct=q=>{if(q.id===4)planner(g,q);};
 let orders=0;const spells={},command=g.command.bind(g);g.command=(type,payload)=>{const r=command(type,payload);if(type==='cast'&&r.ok){orders++;spells[payload.skillId]=(spells[payload.skillId]??0)+1;}return r;};
 g._startCombat();g._spawnQueue=g._spawnQueue.filter(e=>e.laneId===4);g.state.kings[1].hp=g.state.kings[1].maxHp=1000000;
 // Save the identical pre-battle state before either planner can decide.
 const initialHash=createHash('sha256').update(JSON.stringify(g.snapshot())).digest('hex');
 let ticks=0;while(g.state.phase==='combat'&&ticks<900){g.tick(.2);ticks++;}
 return {raw,wave,seed,armyValue,initialGold:0,initialWood:0,initialHash,orders,spells,seconds:Number((ticks*.2).toFixed(1)),leaks:p.stats.leaks,kills:p.stats.kills,damage:Math.round(p.stats.damage),kingDamage:Math.round(1000000-g.state.kings[1].hp),cleared:g.state.phase==='build'};
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const root=process.argv[2]&&!process.argv[2].startsWith('--')?resolve(process.argv[2]):process.cwd(),planners=await loadPlanners(root),holdout=process.argv.includes('--holdout');
 const waves=holdout?[6,12,20]:[8,13,16],seeds=holdout?[7,2073]:[42,173];
 console.log(JSON.stringify({type:'metadata',baselineRef:BASELINE_REF,baselineBlob:'c75aaebb5b2edaafce483c866d452698f57b8d14',comparisonScope:'A0IP-only',rejectedCandidates:['A0YF'],baselineHash:planners.baselineHash,currentHash:planners.currentHash,waves,seeds,method:'same-current-engine-and-snapshot-only-planner-differs'}));
 for(const raw of ['h0JQ'])for(const wave of waves)for(const seed of seeds){
  const baseline=await runTrial({planner:planners.baseline,raw,wave,seed,root}),current=await runTrial({planner:planners.current,raw,wave,seed,root});
  if(baseline.initialHash!==current.initialHash)throw new Error('Unequal initial snapshot');
  console.log(JSON.stringify({type:'pair',baseline,current}));
 }
}
