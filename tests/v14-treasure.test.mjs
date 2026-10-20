import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { UNITS, UNIT_TEMPLATES, WAVES, RULES } from '../dist/data.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const fixture=()=>{
  const game=new Game({mode:'sandbox',seed:42});
  for(const p of game.state.players){p.buildings=[];p.treasures=[];p.gold=100000;p.wood=100000;p.populationCap=300;}
  return game;
};
const reward=(g,wave=14,playerId=0)=>{
  g.state.wave=wave;
  const code=`h0V${['3','4','5','6','7','8','9','A','B','C','D','E','F'][wave-7]}`;
  g._spawnMonster({laneId:playerId,wave:UNIT_TEMPLATES[code],specialKind:'treasure',sourceWave:wave,x:3,y:.3});
  const e=g.state.entities.at(-1);
  g._hurt(e,1e9,{ownerId:playerId,team:playerId<4?0:1,side:'defender'},true);
  return g.state.players[playerId].treasures.at(-1);
};
const claim=(g,t,kind,extra={})=>g.command('treasure',{treasureId:t.id,reward:kind,...extra});
const troop=()=>UNITS.find(u=>!u.legacy&&u.randomPool&&u.upgrades.length&&u.combatRawcode);
const build=(g)=>{
  const p=g.state.players[0],u=troop();p.roster=[u.id];
  assert.equal(g.command('build',{unitId:u.id,col:0,row:0}).ok,true);
  g.command('sandboxComplete');return p.buildings[0];
};

test('actual treasure deaths expose the source 1/10/14 reward tiers and consume exactly one choice',()=>{
  for(const [wave,gold,wood,armor]of[[7,100,200,15],[10,130,300,30],[14,300,600,50]]){
    const g=fixture(),p=g.state.players[0],t=reward(g,wave),s=g.treasureStatus()[0];
    assert.deepEqual([s.gold,s.wood,s.unitArmor,s.kingArmor,s.canLumber],[gold,wood,armor,wave>=14?2:1,wave>=14]);
    const before=p.gold;assert.equal(claim(g,t,'gold').ok,true);assert.equal(p.gold,before+gold);
    assert.equal(claim(g,t,'wood').ok,false);assert.equal(p.treasures.length,0);
  }
});

test('invalid choices and foreign buildings preserve the treasure and every resource',()=>{
  const g=fixture(),t=reward(g),p=g.state.players[0],before=[p.gold,p.wood,g.state.kings[0].armor];
  g.state.players[1].buildings=[{id:'foreign',unitId:troop().id}];
  for(const [kind,extra]of[['unknown',{}],['unitArmor',{buildingId:'foreign'}],['unitArmor',{buildingId:'missing'}]]){
    assert.equal(claim(g,t,kind,extra).ok,false);
    assert.deepEqual([p.gold,p.wood,g.state.kings[0].armor],before);assert.equal(p.treasures.length,1);
  }
  assert.equal(g.command('treasure',{treasureId:'missing',reward:'gold'}).ok,false);
});

test('treasure wood and king armor stack without buying king levels or adding income',()=>{
  const g=fixture(),p=g.state.players[0],k=g.state.kings[0],wood=p.wood,income=p.income,armor=k.armor;
  const first=reward(g,10);assert.equal(claim(g,first,'wood').ok,true);assert.equal(p.wood,wood+300);
  for(const wave of[7,14])assert.equal(claim(g,reward(g,wave),'kingArmor').ok,true);
  assert.equal(k.armor,armor+3);assert.equal(k.treasureArmor,3);assert.equal(k.attackLevel,0);assert.equal(p.income,income);
  const saved=Game.fromSnapshot(g.snapshot());assert.equal(saved.state.kings[0].treasureArmor,3);assert.equal(saved.state.kings[0].armor,k.armor);
});

test('unit armor stays with the selected building, persists through save and upgrades, and deploys in normal and arena combat',()=>{
  const g=fixture(),p=g.state.players[0],b=build(g),u=UNITS.find(u=>u.id===b.unitId);
  const t=reward(g,14);assert.equal(claim(g,t,'unitArmor',{buildingId:b.id}).ok,true);assert.equal(b.treasureArmor,50);
  g._spawnDefender(u,p,.5,4.5,b.id);near(g.state.entities.at(-1).armor,u.armor+50);
  const restored=Game.fromSnapshot(g.snapshot()),bp=restored.state.players[0].buildings[0];assert.equal(bp.treasureArmor,50);
  const next=u.upgrades.map(id=>UNITS.find(u=>u.id===id)).find(v=>restored.requirementStatus(v).canStart);
  assert.ok(next);assert.equal(restored.command('upgrade',{buildingId:bp.id,unitId:next.id}).ok,true);
  restored.command('sandboxComplete');assert.equal(bp.treasureArmor,50);
  restored.state.entities=[];restored._spawnDefender(next,restored.state.players[0],.5,4.5,bp.id);near(restored.state.entities.at(-1).armor,next.armor+50);
  restored.state.phase='build';restored._startArena();near(restored.state.entities.find(e=>e.buildingId===bp.id).armor,next.armor+50);
});

test('free lumber is immediate, bypasses the price and military gate, and does not duplicate a queued paid level',()=>{
  const g=fixture(),p=g.state.players[0],t=reward(g);p.gold=p.wood=0;
  assert.equal(claim(g,t,'lumber').ok,true);assert.equal(p.lumberLevel,1);assert.equal(p.gold,0);assert.equal(p.wood,0);
  p.economyTasks.lumberTask={targetLevel:2,startAt:0,finishAt:10,duration:10,cost:{gold:100,wood:50}};
  assert.equal(claim(g,reward(g),'lumber').ok,true);assert.equal(p.lumberLevel,2);assert.equal(p.economyTasks.lumberTask.targetLevel,3);
  g._advanceEconomy(p,0,10);assert.equal(p.lumberLevel,3);assert.equal(p.economyTasks.lumberTask,null);
});

test('free advanced lumber while basic level seven is queued uses the actual separate branch harvest and technology requirements',()=>{
  const g=fixture(),p=g.state.players[0];p.lumberLevel=6;
  p.economyTasks.lumberTask={targetLevel:7,startAt:0,finishAt:10,duration:10,cost:{gold:200,wood:100}};
  assert.equal(claim(g,reward(g),'lumber').ok,true);
  assert.deepEqual(g._sourceLumberLevels(p),{basic:6,advanced:1});near(g._woodRate(p),p.workers*10.5/10);
  const status=g.requirementStatus({requiresDetails:[{rawcode:'R003',amount:7},{rawcode:'R00H',amount:1}]});
  assert.deepEqual(status.requirements.map(r=>[r.current,r.met]),[[6,false],[1,true]]);
  const restored=Game.fromSnapshot(g.snapshot());assert.deepEqual(restored._sourceLumberLevels(restored.state.players[0]),{basic:6,advanced:1});
  restored._advanceEconomy(restored.state.players[0],0,10);
  assert.deepEqual(restored._sourceLumberLevels(restored.state.players[0]),{basic:7,advanced:1});
  near(restored._woodRate(restored.state.players[0]),p.workers*11.5/10);
});

test('full or source-reserved lumber caps reject without consuming a treasure, leaving other choices available',()=>{
  const g=fixture(),p=g.state.players[0];p.lumberLevel=29;
  p.economyTasks.lumberTask={targetLevel:30,startAt:0,finishAt:38,duration:38,cost:{gold:200,wood:200}};
  const t=reward(g);assert.equal(g.treasureStatus()[0].lumberAvailable,false);assert.equal(claim(g,t,'lumber').ok,false);assert.equal(p.treasures.length,1);
  assert.equal(claim(g,t,'wood').ok,true);
  p.lumberLevel=28;p.lumberAdvancedWhileBasicQueued=22;p.economyTasks.lumberTask.targetLevel=29;
  const r=reward(g);assert.equal(claim(g,r,'lumber').ok,false,'native advanced22 + one pending job reserves level23');
  p.economyTasks.lumberTask=null;p.lumberAdvancedWhileBasicQueued=0;p.lumberLevel=30;
  assert.equal(claim(g,r,'lumber').ok,false);
});

test('flying hunter engine settlement awards only the first/final special bonus, and persists its global counter',()=>{
  const g=fixture();g.state.wave=5;g.state.mode='normal';
  for(let laneId=0;laneId<8;laneId++)g._spawnMonster({laneId,wave:UNIT_TEMPLATES.h0OU,specialKind:'waveFive',sourceWave:5,x:3,y:.3});
  const p=g.state.players[0],gold=p.gold,wood=p.wood;
  for(const e of g.state.entities)g._hurt(e,1e9,{ownerId:0,team:0,side:'defender'},true);
  assert.equal(p.gold,gold+80,'only the first blue-side reward goes to player0; enemy routes cannot pay an enemy killer');
  assert.equal(p.wood,wood+150);assert.equal(g.state.specialMonsters.waveFive.killed,8);
  const restored=Game.fromSnapshot(g.snapshot());assert.deepEqual(restored.state.specialMonsters,g.state.specialMonsters);
});

test('actual combat queue adds the special wave units without reducing the published main-wave count',()=>{
  for(const [wave,additional]of[[5,1],[7,1],[10,1],[14,1],[20,0]]){
    const g=fixture();g.state.wave=wave;g._startCombat();
    const count=WAVES[wave-1].count;
    assert.equal(g._spawnQueue.filter(e=>!e.merc&&!e.specialKind).length,count);
    assert.equal(g._spawnQueue.filter(e=>e.specialKind).length,additional);
  }
});

test('real farmer construction starts the player reward and only completing its upgrade unregisters it',()=>{
  const g=fixture(),p=g.state.players[0],farmer=UNITS.find(u=>u.id==='v14_n085'),master=UNITS.find(u=>u.id==='v14_n084');
  p.roster=[farmer.id];
  assert.equal(g.command('build',{unitId:farmer.id,col:0,row:0}).ok,true);
  const b=p.buildings[0];assert.ok(b.construction);assert.equal(p.nagaFarmerGoldRate,15);
  g.command('sandboxComplete');assert.equal(p.nagaFarmerGoldRate,15);
  assert.equal(g.command('upgrade',{buildingId:b.id,unitId:master.id}).ok,true);assert.equal(p.nagaFarmerGoldRate,15);
  const restored=Game.fromSnapshot(g.snapshot());assert.equal(restored.state.players[0].nagaFarmerGoldRate,15);
  restored.command('sandboxComplete');assert.equal(restored.state.players[0].nagaFarmerGoldRate,0);
});

test('farm settlement counts deployed original farmer corpses even after cleanup while its master survives',()=>{
  const g=fixture(),p=g.state.players[0];
  p.roster=['v14_n085'];
  for(let col=0;col<3;col++)assert.equal(g.command('build',{unitId:'v14_n085',col,row:0}).ok,true);
  g.command('sandboxComplete');
  assert.equal(g.command('upgrade',{buildingId:p.buildings[0].id,unitId:'v14_n084'}).ok,true);
  g.command('sandboxComplete');g.state.mode='normal';g.state.wave=7;g._startCombat();
  assert.equal(p.farmWaveCount,2);
  for(const e of g.state.entities.filter(e=>e.ownerId===0&&e.combatRawcode==='h0W1'))g._hurt(e,1e9,{ownerId:4,team:1,side:'monster'},true);
  g._clearDead();assert.equal(g.state.entities.filter(e=>e.combatRawcode==='h0W1').length,0);
  const before=p.gold;g._endCombat();assert.equal(p.gold-before,(RULES.waveRewards[6]??0)+p.income+6);
  assert.equal(p.nagaFarmerGoldRate,15.5,'combat farmer deaths do not unregister their surviving buildings');
});

test('sandbox switching later waves closes the first-wave window consistently before and after saving',()=>{
  const g=fixture();g.command('sandboxWave',{wave:14});
  assert.ok(g.state.players.every(p=>p.eggHistory.firstWaveClosed));
  assert.deepEqual(Game.fromSnapshot(g.snapshot()).snapshot(),g.snapshot());
});

test('clearing the first sandbox wave settles its egg condition without paying ordinary round rewards',()=>{
  const g=fixture(),p=g.state.players[0];p.roster=['v14_h08F'];
  for(let col=0;col<5;col++)assert.equal(g.command('build',{unitId:'v14_h08F',col,row:0}).ok,true);
  g.command('sandboxComplete');assert.equal(p.eggHistory.firstWaveHippogryphs,5);
  const gold=p.gold,wood=p.wood;g._endCombat();
  assert.equal(p.technologies.R00N,1);assert.equal(p.eggHistory.firstWaveClosed,true);
  assert.equal(p.gold,gold);assert.equal(p.wood,wood);assert.equal(g.state.wave,1);
});
