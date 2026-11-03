import {pathToFileURL} from 'node:url';
// Equal-budget, isolated lane trials. Not a natural-match win-rate estimate.
// Usage: node scripts/benchmark-ai-matchups.mjs [checkout-root]
const root=process.argv[2]??process.cwd();
const {Game}=await import(pathToFileURL(root+'/dist/engine.js'));
const scenarios=[
 {name:'knights-wave8',builder:'v14_builder_u00O',wave:8,gold:3000},
 {name:'beasts-wave8',builder:'v14_builder_u001',wave:8,gold:3000},
 {name:'forest-air13',builder:'v14_builder_u003',wave:13,gold:6000},
];
for(const scenario of scenarios)for(const seed of [42,173,615]){
 const g=new Game({mode:'sandbox',seed}),p=g.state.players[4];g.state.wave=scenario.wave;
 for(const q of g.state.players){q.gold=q.wood=0;q.roster=[];q.heroAltarCount=2;q.workers=0;q.lumberLevel=0;q.eggHistory.firstWaveClosed=true;}
 p.builderId=scenario.builder;p.roster=g._roster(scenario.builder);p.populationCap=300;p.gold=scenario.gold;
 // Give both versions the same 60 real seconds for paid construction.
 for(let tick=0;tick<300;tick++){g._aiBuild(p);g.tick(.2);}
 const army=p.buildings.map(b=>b.unitId),gold=p.gold,unfinished=p.buildings.filter(b=>b.construction).length;
 g.state.sandbox.aiEnabled=true;g._startCombat();g._spawnQueue=g._spawnQueue.filter(e=>e.laneId===p.id);g.state.sandbox.aiEnabled=false;
 g.state.kings[1].hp=g.state.kings[1].maxHp=1000000;
 let ticks=0;while(g.state.phase==='combat'&&ticks<900){g.tick(.2);ticks++;}
 console.log(JSON.stringify({scenario:scenario.name,seed,wave:scenario.wave,budget:scenario.gold,gold,army,unfinished,seconds:Number((ticks*.2).toFixed(1)),cleared:g.state.phase==='build',leaks:p.stats.leaks,kills:p.stats.kills,damage:Math.round(p.stats.damage),kingDamage:Math.round(1000000-g.state.kings[1].hp)}));
}
