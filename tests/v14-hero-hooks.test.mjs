import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES,UNITS} from '../dist/data.js';
import {compileSkills,tickSourceScriptJobs} from '../dist/skills.js';

const jass=(await readFile(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url))).toString('latin1');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){
  const game=new Game({mode:'sandbox',seed:42});
  for(const p of game.state.players){p.buildings=[];p.nagaFarmerGoldRate=0;}
  game.state.entities=[];game.state.sourceSkillJobs=[];game.state.time=0;
  return game;
}
function entity(game,rawcode,overrides={}){
  const e=game._entity(UNIT_TEMPLATES[rawcode],{ownerId:0,team:0,side:'defender',laneId:0,sourceLaneId:0,battleTeam:0,worldX:0,worldY:0,...overrides});
  e.mana=0;game.state.entities.push(e);return e;
}
const rage=e=>e.buffs.find(buff=>buff.key==='alchemist-chemical-rage');

test('Garrosh engine damage retains armor on the building and restores it once on new deployments and saves',()=>{
  const game=fixture(),p=game.state.players[0],def=UNITS.find(u=>!u.legacy&&u.sourceRawcode==='n06K');
  const building={id:'hero-hooks-building',unitId:def.id,col:0,row:0};p.buildings=[building];
  game._spawnDefender(def,p,.5,4.5,building.id);const garrosh=game.state.entities[0],base=garrosh.armor;
  const enemy=entity(game,'h002',{ownerId:null,team:1,side:'monster'});
  game._hurt(garrosh,300,enemy,{spell:true,universal:true});
  assert.equal(building.garroshArmorLevel,1);near(garrosh.armor,base+1);
  game._hurt(garrosh,30,enemy,{spell:true,universal:true});
  assert.equal(building.garroshArmorLevel,2);near(garrosh.armor,base+2);
  const restored=Game.fromSnapshot(game.snapshot()),saved=restored.state.entities.find(e=>e.id===garrosh.id);
  near(saved.armor,base+2);assert.equal(saved.status.garroshArmorLevel,2);
  restored.state.entities=[];restored._spawnDefender(def,restored.state.players[0],.5,4.5,building.id);
  const next=restored.state.entities[0];near(next.armor,base+2);assert.equal(next.status.garroshArmorLastLifePercent,undefined);
  restored.state.entities=[];restored._startArena();
  const arena=restored.state.entities.find(e=>e.buildingId===building.id);near(arena.armor,base+2);
});

test('the independent Garrosh bleed timer can cross the alchemist rage threshold and never doubles its caster-target pair',()=>{
  const game=fixture(),garrosh=entity(game,'h0SN'),alchemist=entity(game,'h0XH',{ownerId:4,team:1,side:'monster'});
  garrosh.damage=1;alchemist.hp=alchemist.maxHp*.25+6;game._random=()=>0;
  game._attack(garrosh,alchemist,[]);
  assert.ok(alchemist.hp<alchemist.maxHp*.25,'the ordinary one-point hit remains above 25%, then the zero-second bleed crosses it');
  assert.ok(rage(alchemist),'timer damage is a fresh main damage event and triggers chemical rage');
  assert.equal(rage(alchemist).haste,.5);assert.equal(rage(alchemist).expiresAt,5);
  const jobs=game.state.sourceSkillJobs.filter(job=>job.type==='garrosh_bleed');assert.equal(jobs.length,1);
  const nextAt=jobs[0].nextAt;game._attack(garrosh,alchemist,[]);
  assert.equal(game.state.sourceSkillJobs.filter(job=>job.type==='garrosh_bleed').length,1);assert.equal(jobs[0].nextAt,nextAt);
  const before=alchemist.hp;game.state.time=1;tickSourceScriptJobs(game);
  near(alchemist.hp,before-10);assert.equal(alchemist.skillStates.A2Z2.casts,1);
});

test('synchronous source damage additions do not reenter the main hero trigger, but a later standalone scripted event does',()=>{
  assert.match(jass,/call DisableTrigger\(Eb\)[\s\S]*?call SingedChemicalRage\(i,P8\)/);
  const game=fixture(),attacker=entity(game,'h002'),alchemist=entity(game,'h0XH',{ownerId:4,team:1,side:'monster'});
  attacker.skillSpecs=compileSkills({id:'v14-main-event-fixture',skillVersion:'v14.1A5',abilityIds:['A01I']});attacker.mana=20;
  alchemist.hp=alchemist.maxHp*.25+101;
  let events=0;const original=game._hurt.bind(game);game._hurt=(...args)=>{events++;assert.ok(events<10,'main damage additions must not recursively trigger themselves');return original(...args);};
  game._hurt(alchemist,100,attacker,{spell:true,universal:true});
  assert.equal(events,2);assert.ok(alchemist.hp<alchemist.maxHp*.25);assert.equal(rage(alchemist),undefined,'the nested A01I mana addition runs while the original main damage trigger is disabled');
  assert.equal(game._sourceDamageTriggerDepth??0,0,'the depth is released after the event');
  game._hurt(alchemist,1,attacker,{spell:true,universal:true,scripted:true});
  assert.ok(rage(alchemist));assert.equal(alchemist.skillStates.A2Z2.casts,1);assert.equal(game._sourceDamageTriggerDepth??0,0);
});

test('the original death pays alchemy before a later independent death explosion consumes the next random draw',()=>{
  // InitCustomTriggers registers the universal alchemy death listener before
  // the separate DeathTrigger which invokes n0SC's 8-damage explosion.
  assert.ok(jass.indexOf('call InitTrig_UnitDeath()')<jass.indexOf('call InitTrig_DeathTrigger()'));
  const death=jass.match(/function Trig_UnitDeathActions\b[\s\S]*?endfunction/)[0];
  assert.ok(death.indexOf('call SingedAlchemyGold(bv,i)')<death.indexOf('if GetUnitTypeId(i)'));
  const game=fixture(),alchemist=entity(game,'h0XH'),bomb=entity(game,'n0SC',{ownerId:null,team:1,side:'monster'});
  alchemist.hp=1;bomb.hp=1;let draws=0;game._random=()=>draws++===0?0:.99;
  const p=game.state.players[0],before=p.gold;
  game._hurt(bomb,10,alchemist,{spell:true,universal:true});
  assert.ok(alchemist.hp<=0,'the explosion causes a second death');
  assert.equal(p.gold-before,8,'original roll 1 pays 5 gold before the 3-gold normal bounty; the subsequent non-alchemist kill cannot consume that roll first');
  assert.equal(game.state.events.filter(event=>event.type==='gold'&&event.text==='点金+5').length,1);
  game._hurt(bomb,10,alchemist,{spell:true,universal:true});assert.equal(p.gold-before,8,'a dead target cannot pay twice');
});

test('a real source death tears down the active bleed pair and does not tick it after its caster dies',()=>{
  const game=fixture(),garrosh=entity(game,'h0SN'),target=entity(game,'h002',{ownerId:null,team:1,side:'monster'});
  target.hp=target.maxHp=10000;garrosh.damage=1;game._random=()=>0;
  game._attack(garrosh,target,[]);assert.equal(game.state.sourceSkillJobs.filter(job=>job.type==='garrosh_bleed').length,1);
  game._hurt(garrosh,1e8,target,{spell:true,universal:true});const before=target.hp;
  game.state.time=2;tickSourceScriptJobs(game);
  assert.equal(game.state.sourceSkillJobs.filter(job=>job.type==='garrosh_bleed').length,0);assert.equal(target.hp,before);
  assert.equal(target.status.garroshBleedSources[garrosh.id],undefined);
});

test('self damage and friendly damage do not invoke alchemist automatic casts or chemical rage',()=>{
  for(const self of [true,false]){
    const game=fixture(),alchemist=entity(game,'h0XH');
    const attacker=self?alchemist:entity(game,'h002',{ownerId:1});
    alchemist.mana=100;alchemist.hp=alchemist.maxHp*.25+1;
    const before=alchemist.hp;
    near(game._hurt(alchemist,10,attacker,{spell:true,universal:true}),10);near(alchemist.hp,before-10);
    assert.equal(rage(alchemist),undefined,self?'self damage cannot trigger rage':'same-side damage cannot trigger rage');
    assert.equal(alchemist.skillStates.A2Z0.casts,0);assert.equal(alchemist.skillStates.A2Z1.casts,0);
    near(alchemist.mana,100);assert.equal(game.state.sourceSkillJobs.length,0);
  }
});

test('native evasion and magic immunity reduce damage to zero without auto-casting the attacking Ysera',()=>{
  for(const [ability,options] of [['AEev',{}],['Amim',{spell:true,magic:true}]]){
    const game=fixture(),ysera=entity(game,'h0YN'),target=entity(game,'h002',{ownerId:null,team:1,side:'monster'});
    ysera.skillSpecs=ysera.skillSpecs.filter(s=>s.id==='A2YD');ysera.mana=20;
    target.skillSpecs=compileSkills({id:'v14_native-zero-fixture',provenance:'v14.1A5-dataset',abilityIds:[ability]});
    game._random=()=>0;
    const before=target.hp;assert.equal(game._hurt(target,100,ysera,options),0);near(target.hp,before);
    assert.equal(ysera.skillStates.A2YD.casts,0,ability);assert.equal(ysera.skillStates.A2YD.yseraAutoReadyAt,undefined);
    near(ysera.mana,20);assert.equal(target.status.yseraRevivalCount,undefined);assert.equal(game.state.sourceSkillJobs.length,0);
  }
});

test('actual emerald revival is the zero-damage exception that still allows the attacker automatic damage-event cast',()=>{
  const game=fixture(),attacker=entity(game,'h0YN'),target=entity(game,'h0YN',{ownerId:4,team:1,side:'monster'});
  attacker.skillSpecs=attacker.skillSpecs.filter(s=>s.id==='A2YD');attacker.mana=100;
  target.skillSpecs=target.skillSpecs.filter(s=>s.kind==='ysera_revival');target.hp=target.maxHp*.2;
  game._random=()=>0;
  assert.equal(game._hurt(target,10,attacker,{spell:true,universal:true}),0);
  assert.equal(target.status.yseraRevivalCount,1);near(target.hp,target.maxHp*.05);
  assert.equal(attacker.skillStates.A2YD.casts,1);near(attacker.mana,90);
  assert.equal(game.state.sourceSkillJobs.filter(job=>job.type==='ysera_wake').length,1);
  assert.equal(game.state.sourceSkillJobs.filter(job=>job.type==='ysera_mind_disrupt').length,1);
});
