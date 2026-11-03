import {pathToFileURL} from 'node:url';
// Regression scenario: a legitimately earned random fighter fills population
// promised to a paid upgrade. Both revisions receive the same initial budget,
// real worker production, gift RNG and 30 seconds of normal construction.
// This isolates recovery from a population block, not general match win rate.
// Usage: node scripts/benchmark-ai-strength.mjs CHECKOUT_ROOT
const root=process.argv[2]??process.cwd();
const {Game}=await import(pathToFileURL(root+'/dist/engine.js'));
const {advanceBoxRewards}=await import(pathToFileURL(root+'/dist/box-training-rules.js'));
const {laneToWorld}=await import(pathToFileURL(root+'/dist/layout.js'));
const requireOk=result=>{if(!result.ok)throw new Error(result.message);};
// First three seeds whose genuine wave-13 offer contains A13N, selected by
// offer availability before observing battle outcomes.
for(const seed of [1,5,7]){
 const g=new Game({mode:'sandbox',seed}),p=g.state.players[4];g.state.wave=14;
 for(const q of g.state.players){q.gold=q.wood=0;q.roster=[];q.workers=0;q.lumberLevel=0;q.heroAltarCount=2;q.eggHistory.firstWaveClosed=true;}
 p.gold=554;p.wood=80;p.workers=10;p.populationCap=15;p.roster=['v14_h00T','v14_h00N'];
 requireOk(g.command('build',{playerId:p.id,unitId:'v14_h00T',col:2,row:4}));g.tick(2);p.roster=['v14_h00N'];g._aiBuild(p);
 if(p.aiUpgradePlan?.targets?.[0]!=='v14_h00U')throw new Error('Fixture did not create the expected funded bomber plan');
 advanceBoxRewards(g,13);if(!p.boxRewards.abilityIds.includes('A13N'))throw new Error('Seed lacks the real random fighter offer');
 const point=laneToWorld(p.id,3.5,10.5);requireOk(g.command('boxReward',{playerId:p.id,abilityId:'A13N',worldX:point.x,worldY:point.y}));g.tick(2);
 const gift=p.buildings.at(-1).unitId;
 for(let i=0;i<150;i++){g._aiBuild(p);g.tick(.2);}
 const preparation={gold:p.gold,wood:Math.round(p.wood),population:g._population(p),cap:p.populationCap,army:p.buildings.map(b=>b.unitId),pendingUpgrade:!!p.aiUpgradePlan,farmPending:!!p.economyTasks.farmTask,military:g._military(p)};
 g.state.sandbox.aiEnabled=true;g._startCombat();g._spawnQueue=g._spawnQueue.filter(e=>e.laneId===p.id);g.state.sandbox.aiEnabled=false;
 // Same high king HP in both revisions prevents early ending of this isolated
 // pressure trial; it is not granted to the opponent during normal gameplay.
 g.state.kings[1].hp=g.state.kings[1].maxHp=1000000;
 let ticks=0;while(g.state.phase==='combat'&&ticks<900){g.tick(.2);ticks++;}
 console.log(JSON.stringify({seed,wave:14,initialGold:554,initialWood:80,gift,preparation,seconds:Number((ticks*.2).toFixed(1)),cleared:g.state.phase==='build',leaks:p.stats.leaks,kills:p.stats.kills,damage:Math.round(p.stats.damage),kingDamage:Math.round(1000000-g.state.kings[1].hp)}));
}
