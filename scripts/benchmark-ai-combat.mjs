import {pathToFileURL} from 'node:url';
// Same source rules, armies, seeds and waves; only proactive combat orders differ.
// This is a fixed-army lane trial, not a natural-match win-rate estimate.
const root=process.argv[2]??process.cwd(),{Game}=await import(pathToFileURL(root+'/dist/engine.js'));
const {castAICombat}=await import(pathToFileURL(root+'/dist/ai-combat.js'));
const {UNITS}=await import(pathToFileURL(root+'/dist/data.js'));
const scenarios=[['malfurion','h0JV'],['alexstrasza','n066'],['anduin','n087'],['nerzhul','n08J'],['maiev','n08G']];
const holdout=process.argv.includes('--holdout');
for(const [hero,raw] of scenarios)for(const wave of holdout?[6,12,20]:[8,13,16])for(const seed of holdout?[7,2073]:[42,173])for(const enabled of [false,true]){
 const g=new Game({mode:'sandbox',seed}),p=g.state.players[4];g.state.wave=wave;
 for(const q of g.state.players){q.buildings=[];q.gold=q.wood=0;q.roster=[];q.heroAltarCount=2;q.workers=0;q.lumberLevel=0;q.eggHistory.firstWaveClosed=true;}
 // One source hero, two upgraded frontliners and four ranged core troops.
 const roster=[raw,'h00T','h00T','h00U','h00U','h00U','h00U'];
 for(const [i,code] of roster.entries()){const u=UNITS.find(u=>u.id==='v14_'+code);if(!u)throw Error(code);const b={id:g._uid('b'),unitId:u.id,col:i===0?2:(i-1)%4+1,row:i===0?5:i<3?4:6,construction:{targetId:u.id}};p.buildings.push(b);g._completeConstruction(p,b);}
 g.state.sandbox.aiEnabled=true;g._aiBuild=()=>{};g._aiAct=q=>{if(enabled&&q.id===4)castAICombat(g,q);};
 let orders=0;const command=g.command.bind(g);g.command=(type,payload)=>{const r=command(type,payload);if(type==='cast'&&r.ok)orders++;return r;};
 g._startCombat();g._spawnQueue=g._spawnQueue.filter(e=>e.laneId===4);g.state.kings[1].hp=g.state.kings[1].maxHp=1000000;
 let ticks=0;while(g.state.phase==='combat'&&ticks<900){g.tick(.2);ticks++;}
 console.log(JSON.stringify({hero,wave,seed,enabled,orders,seconds:Number((ticks*.2).toFixed(1)),leaks:p.stats.leaks,kills:p.stats.kills,kingDamage:Math.round(1000000-g.state.kings[1].hp),cleared:g.state.phase==='build'}));
}
