import {pathToFileURL} from 'node:url';
// Isolate reward use from economy, drafting, sends and opposite-team AI.
// Fixed fixtures, not win-rate or natural progression measurements.
const root=process.argv[2]??process.cwd();
const {Game}=await import(pathToFileURL(root+'/dist/engine.js'));
for(const seed of [42,173,615]){
 const g=new Game({mode:'sandbox',seed}),p=g.state.players[4];
 g.state.wave=8;g.state.sandbox.aiEnabled=true;
 for(const q of g.state.players){q.gold=q.wood=0;q.roster=[];q.heroAltarCount=2;q.workers=10;q.lumberLevel=30;q.eggHistory.firstWaveClosed=true;}
 for(const [i,raw] of ['h100','h100','h01B','h01B'].entries()){
  const id=`v14_${raw}`,b={id:g._uid('b'),unitId:id,col:2+i%2,row:i<2?4:5,construction:{targetId:id}};
  p.buildings.push(b);g._completeConstruction(p,b);
 }
 p.boxRewards={providerId:'box-n060-4',providerRawcode:'n060',ownerId:4,tier:'box',sourceWave:6,consumed:false,abilityIds:['A136']};
 g._aiAct(p);const rewardUsed=p.boxRewards.consumed;
 g._startCombat();g._spawnQueue=g._spawnQueue.filter(e=>e.laneId===p.id);g.state.sandbox.aiEnabled=false;
 // Stop king death from truncating the fixed lane trial; king attack is unchanged.
 g.state.kings[1].hp=g.state.kings[1].maxHp=1000000;
 let ticks=0;while(g.state.phase==='combat'&&ticks<900){g.tick(.2);ticks++;}
 console.log(JSON.stringify({seed,wave:8,seconds:Number((ticks*.2).toFixed(1)),cleared:g.state.phase==='build',rewardUsed,leaks:p.stats.leaks,kills:p.stats.kills,damage:Math.round(p.stats.damage),kingDamage:Math.round(1000000-g.state.kings[1].hp)}));
}
