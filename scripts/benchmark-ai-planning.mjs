import {pathToFileURL} from 'node:url';
// Fixed equal-budget planning trial. This is not a natural-match win rate.
const root=process.argv[2]??process.cwd();
const {Game}=await import(pathToFileURL(root+'/dist/engine.js'));
for(const seed of [42,173,615]){
 const g=new Game({mode:'sandbox',seed}),p=g.state.players[4];g.state.wave=4;
 for(const q of g.state.players){q.gold=q.wood=0;q.roster=[];q.heroAltarCount=2;q.workers=10;q.lumberLevel=30;q.eggHistory.firstWaveClosed=true;}
 p.buildings.push({id:g._uid('b'),unitId:'v14_h00T',col:2,row:4,construction:null});
 p.populationCap=300;p.gold=405;p.roster=['v14_h00N'];
 // Allow 20 actual seconds of construction, no income/economy or free finishes.
 for(let tick=0;tick<100;tick++){g._aiBuild(p);g.tick(.2);}
 const army=p.buildings.map(b=>b.unitId),gold=p.gold;
 g.state.sandbox.aiEnabled=true;g._startCombat();g._spawnQueue=g._spawnQueue.filter(e=>e.laneId===p.id);g.state.sandbox.aiEnabled=false;
 g.state.kings[1].hp=g.state.kings[1].maxHp=1000000;
 let ticks=0;while(g.state.phase==='combat'&&ticks<900){g.tick(.2);ticks++;}
 console.log(JSON.stringify({seed,wave:4,budget:405,gold,army,seconds:Number((ticks*.2).toFixed(1)),cleared:g.state.phase==='build',leaks:p.stats.leaks,kills:p.stats.kills,damage:Math.round(p.stats.damage),kingDamage:Math.round(1000000-g.state.kings[1].hp)}));
}
