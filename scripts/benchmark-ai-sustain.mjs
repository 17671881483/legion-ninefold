import {pathToFileURL} from 'node:url';
// Holdout trials: other builders, waves and seeds than benchmark-ai-matchups.
// Equal budget, 60 seconds paid construction, 180 seconds isolated combat.
// This measures lane defense, not natural-match win rate.
const root=process.argv[2]??process.cwd();
const {Game}=await import(pathToFileURL(root+'/dist/engine.js'));
const builders=['u000','u002','u00C','u00G','u00J','u00M','u00Z','u01X'];
for(const builder of builders)for(const [wave,budget] of [[6,2200],[12,5500],[16,8500]])for(const seed of [7,2073]){
 const g=new Game({mode:'sandbox',seed}),p=g.state.players[4];g.state.wave=wave;
 for(const q of g.state.players){q.gold=q.wood=0;q.roster=[];q.heroAltarCount=2;q.workers=0;q.lumberLevel=0;q.eggHistory.firstWaveClosed=true;}
 p.builderId='v14_builder_'+builder;p.roster=g._roster(p.builderId);p.populationCap=300;p.gold=budget;
 for(let tick=0;tick<300;tick++){g._aiBuild(p);g.tick(.2);}
 const army=p.buildings.map(b=>b.unitId),gold=p.gold,unfinished=p.buildings.filter(b=>b.construction).length;
 g.state.sandbox.aiEnabled=true;g._startCombat();g._spawnQueue=g._spawnQueue.filter(e=>e.laneId===p.id);g.state.sandbox.aiEnabled=false;
 g.state.kings[1].hp=g.state.kings[1].maxHp=1000000;
 let ticks=0;while(g.state.phase==='combat'&&ticks<900){g.tick(.2);ticks++;}
 console.log(JSON.stringify({builder,wave,seed,budget,gold,army,unfinished,seconds:Number((ticks*.2).toFixed(1)),cleared:g.state.phase==='build',leaks:p.stats.leaks,kills:p.stats.kills,damage:Math.round(p.stats.damage),kingDamage:Math.round(1000000-g.state.kings[1].hp)}));
}
