import {pathToFileURL} from 'node:url';
import {readFileSync,cpSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// The prototypes were rejected and are NOT used by the game. This optional
// mode reconstructs them in new isolated directories from the frozen v74
// baseline controller, so the recorded negative results remain reproducible.
// node scripts/benchmark-ai-v75.mjs --prepare-prototypes baseline-root output-root
if(process.argv[2]==='--prepare-prototypes'){
 const baseline=process.argv[3],output=process.argv[4];
 if(!baseline||!output)throw new Error('provide baseline-root and a new output-root');
 if(existsSync(output))throw new Error('output-root must not already exist');
 const evidence=JSON.parse(readFileSync(new URL('../reference/ai-v75-benchmark.json',import.meta.url),'utf8'));
 const source=readFileSync(baseline+'/dist/ai-controller.js','utf8');
 if(createHash('sha256').update(source).digest('hex')!==evidence.baseline.controllerSha256)throw new Error('baseline controller does not match the recorded v74 source');
 mkdirSync(output,{recursive:true});
 for(const variant of [{id:'baseline',sourceTransforms:[]},...evidence.rejectedPrototypes]){
  const root=output+'/'+variant.id;cpSync(baseline+'/dist',root+'/dist',{recursive:true});cpSync(baseline+'/package.json',root+'/package.json');
  let candidate=source;
  for(const edit of variant.sourceTransforms){if(candidate.split(edit.from).length!==2)throw new Error('prototype source context must match exactly once');candidate=candidate.replace(edit.from,edit.to);}
  if(variant.controllerSha256&&createHash('sha256').update(candidate).digest('hex')!==variant.controllerSha256)throw new Error('reconstructed prototype hash mismatch');
  writeFileSync(root+'/dist/ai-controller.js',candidate);console.log(root);
 }
 process.exit(0);
}

// Usage: node scripts/benchmark-ai-v75.mjs strategy-root [focus|holdout|regression|natural] [baseline-root]
// The current checkout supplies the engine for both strategy versions. Every
// army is bought through the public commands with an equal starting treasury.
const strategyRoot=process.argv[2]??process.cwd(),suite=process.argv[3]??'focus';
const {Game}=await import(pathToFileURL(process.cwd()+'/dist/engine.js'));
const strategy=await import(pathToFileURL(strategyRoot+'/dist/ai-controller.js'));
const baselineRoot=process.argv[4]??strategyRoot;

if(suite==='natural'){
 const baseline=await import(pathToFileURL(baselineRoot+'/dist/ai-controller.js'));
 for(const seed of [42,173,615]){
  const g=new Game({seed});
  g._aiBuild=(p,opening=false)=>(p.team===0?baseline:strategy).buildAIArmy(g,p,opening);
  g._aiAct=p=>(p.team===0?baseline:strategy).actAI(g,p);
  g._aiBuild(g.state.players[0],true);
  let ticks=0;
  while(g.state.phase!=='ended'&&g.state.wave<=3&&ticks<16000){if(g.state.phase==='build')g._aiBuild(g.state.players[0]);g.tick(.2);ticks++;}
  const ps=g.state.players.slice(4);
  console.log(JSON.stringify({suite,seed,wave:g.state.wave,phase:g.state.phase,seconds:Math.round(g.state.time),winner:g.state.winner??null,kings:g.state.kings.map(k=>Math.round(k.hp)),leaks:ps.reduce((sum,p)=>sum+p.stats.leaks,0),kills:ps.reduce((sum,p)=>sum+p.stats.kills,0),military:ps.reduce((sum,p)=>sum+g._military(p),0),sent:ps.reduce((sum,p)=>sum+p.stats.sent,0)}));
 }
}else{
 const scenarios=suite==='focus'
  ?[[4,1200],[8,3000],[12,5500]].map(([wave,budget])=>({builder:'u00G',wave,budget}))
  :suite==='regression'
   ?[{builder:'u00O',wave:8,budget:3000},{builder:'u001',wave:8,budget:3000},{builder:'u003',wave:13,budget:6000}]
  :suite==='holdout'
   ?['u00G','u00L','u000','u002','u00C','u00J','u00M','u00Z','u01X'].flatMap(builder=>[[6,2200],[16,8500]].map(([wave,budget])=>({builder,wave,budget})))
   :null;
 if(!scenarios)throw new Error('suite must be focus, holdout, regression or natural');
 for(const scenario of scenarios)for(const seed of suite==='holdout'?[7,2073]:[42,173,615]){
  const g=new Game({mode:'sandbox',seed}),p=g.state.players[4];g.state.wave=scenario.wave;
  g._aiBuild=(p,opening=false)=>strategy.buildAIArmy(g,p,opening);
  for(const q of g.state.players){q.gold=q.wood=0;q.roster=[];q.heroAltarCount=2;q.workers=0;q.lumberLevel=0;q.eggHistory.firstWaveClosed=true;}
  p.builderId='v14_builder_'+scenario.builder;p.roster=g._roster(p.builderId);p.populationCap=300;p.gold=scenario.budget;
  for(let tick=0;tick<300;tick++){g._aiBuild(p);g.tick(.2);}
  const army=p.buildings.map(b=>b.unitId),formation=p.buildings.map(b=>[b.col,b.row]),gold=p.gold,unfinished=p.buildings.filter(b=>b.construction).length;
  g.state.sandbox.aiEnabled=true;g._startCombat();g._spawnQueue=g._spawnQueue.filter(e=>e.laneId===p.id);g.state.sandbox.aiEnabled=false;
  g.state.kings[1].hp=g.state.kings[1].maxHp=1000000;
  let ticks=0;while(g.state.phase==='combat'&&ticks<900){g.tick(.2);ticks++;}
  console.log(JSON.stringify({suite,...scenario,seed,gold,army,formation,unfinished,seconds:Number((ticks*.2).toFixed(1)),cleared:g.state.phase==='build',leaks:p.stats.leaks,kills:p.stats.kills,damage:Math.round(p.stats.damage),kingDamage:Math.round(1000000-g.state.kings[1].hp)}));
 }
}
