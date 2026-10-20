import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {SKILL_IMPLEMENTATION_REVISION,attachSkills,compileSkills,describeSkills,refreshSourceSkills,sourceAuraEffects,sourceWeapon,sourceDamage,modifyIncoming} from '../dist/skills.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const definition=(abilityIds=[],extra={})=>({id:'v14_box_fixture',combatRawcode:'hfoo',sourceVersion:'v14.1A5',skillVersion:'v14.1A5',provenance:'v14.1A5-dataset',distanceScale:1/3,x9HpScale:1,hp:1000,damage:20,mana:100,manaStart:100,hpRegen:0,manaRegen:0,range:100,interval:1,moveSpeed:0,abilityIds,weapon1:{weapsOn:1,weapTp1:'normal',targs1:'air,ground,enemy',rangeN1:100,cool1:1},...extra});
function fixture(){const game=new Game({seed:91,mode:'sandbox'});game.state.entities=[];game.state.sourceSkillJobs=[];game._random=()=>.99;return game;}
function body(game,abilityIds=[],extra={},defExtra={}){
  const entity=game._entity(definition(abilityIds,defExtra),{team:0,battleTeam:0,side:'defender',ownerId:0,laneId:0,worldX:5,worldY:8,...extra});game.state.entities.push(entity);return entity;
}
const hostile={side:'monster',ownerId:4,team:1,worldX:6,worldY:8};

test('all ten native item grants and QC compile from the v14 object fields',()=>{
  const ids=['A138','A13T','A139','A13X','A13V','A13A','A13U','A13B','A13W','A13Y','A2ZG'],specs=Object.fromEntries(compileSkills(definition(ids)).map(s=>[s.id,s]));
  for(const id of ids)assert.equal(specs[id].status,'implemented',id);
  for(const [id,expected] of [['A138',300],['A13T',800]]){assert.equal(specs[id].base,'AIml');assert.equal(specs[id].bonusHp,expected);assert.equal(Number(specs[id].fields.DataA1),expected);}
  for(const [id,expected] of [['A139',30],['A13X',80]]){assert.equal(specs[id].base,'AIat');assert.equal(specs[id].flatDamage,expected);}
  assert.equal(specs.A13V.base,'Arel');assert.equal(specs.A13V.selfRegen,40);assert.equal(specs.A13A.armor,1);assert.equal(specs.A13U.armor,2);near(specs.A13B.haste,.1);near(specs.A13W.haste,.2);
  near(specs.A13Y.chance,.4);assert.equal(specs.A13Y.multiplier,2);assert.equal(specs.A2ZG.kind,'box_damage_shield');near(specs.A2ZG.damageFactor,.85);
  assert.match(describeSkills(definition(['A2ZG']))[0].effectText,/主监听内部追加伤害不重复触发/);
});

test('initial deployment adds the literal HP and attack bonuses once after creation HP scaling',()=>{
  const game=fixture(),entity=body(game,['A138','A138','A13T','A139','A13X'],{}, {hp:9000,damage:100});
  near(entity.maxHp,10100);near(entity.hp,10100);near(entity.damage,210);
  assert.deepEqual(entity.sourcePassiveStatBonuses,{A138:{bonusHp:300,flatDamage:0},A13T:{bonusHp:800,flatDamage:0},A139:{bonusHp:0,flatDamage:30},A13X:{bonusHp:0,flatDamage:80}});
  entity.hp-=123;attachSkills(entity,definition(['A138','A13T','A139','A13X']));near(entity.maxHp,10100);near(entity.hp,9977);near(entity.damage,210);
});

test('both native weapon slots include flat item attack without increasing a fixed spell',()=>{
  const game=fixture(),entity=body(game,['A139','A13X'],{}, {weapon1:{weapsOn:3,weapTp1:'normal',targs1:'ground,enemy',rangeN1:100},weapon2:{weapsOn:3,weapTp2:'missile',targs2:'air,enemy',rangeN2:600,dmgplus2:20,dice2:1,sides2:9}}),ground=body(game,[],hostile),air=body(game,[],hostile,{targetType:'air'});
  near(sourceWeapon(entity,ground).damage,130);assert.equal(sourceWeapon(entity,ground).slot,1);near(sourceWeapon(entity,air).damage,135);assert.equal(sourceWeapon(entity,air).slot,2);
  sourceDamage(game,ground,50,entity,true);near(ground.hp,950,'fixed spell damage does not gain AIat attack');
});

test('armor, speed, and Arel regeneration remain self-only and do not add HP repeatedly',()=>{
  const game=fixture(),entity=body(game,['A138','A13T','A13V','A13A','A13U','A13B','A13W']),ally=body(game);
  const self=sourceAuraEffects(game,entity,[entity]),other=sourceAuraEffects(game,ally,[entity]);near(self.armor,3);near(self.haste,.3);near(self.healRate,40);near(other.armor,0);near(other.haste,0);near(other.healRate,0);
  entity.hp=900;ally.hp=900;game._updateEntities(.25);near(entity.hp,910);near(ally.hp,900);near(entity.maxHp,2100);
  game._updateEntities(.5);near(entity.hp,930);near(entity.maxHp,2100);entity.hp=entity.maxHp-2;game._updateEntities(.1);near(entity.hp,entity.maxHp);
  entity.hp=0;game._updateEntities(1);near(entity.hp,0,'passive regeneration cannot resurrect a corpse');
});

test('source skill refresh preserves saved resources, runtime state, and already-applied item stats',()=>{
  const game=fixture(),entity=body(game,['A138','A139','A13V']);entity.hp=777;entity.mana=13;entity.skillStates.A139={readyAt:53,casts:4};entity.buffs=[{key:'saved-buff',expiresAt:99,armor:2}];entity.skillImplementationRevision='old-before-box-content';
  const state=entity.skillStates,buffs=entity.buffs,journal=entity.sourcePassiveStatBonuses,saved={hp:entity.hp,maxHp:entity.maxHp,damage:entity.damage,mana:entity.mana};
  assert.equal(refreshSourceSkills(entity,definition(['A138','A139','A13V'])),true);assert.equal(entity.skillStates,state);assert.equal(entity.buffs,buffs);assert.equal(entity.sourcePassiveStatBonuses,journal);assert.deepEqual({hp:entity.hp,maxHp:entity.maxHp,damage:entity.damage,mana:entity.mana},saved);assert.equal(entity.skillImplementationRevision,SKILL_IMPLEMENTATION_REVISION);
  assert.equal(refreshSourceSkills(entity,definition()),false);assert.equal(entity.damage,50);
});

test('old pending item definitions recompile without retroactively inventing HP or attack',()=>{
  const entity={skillVersion:'v14.1A5',skillImplementationRevision:'pre-box',hp:321,maxHp:1000,damage:20,mana:7,skillStates:{A138:{readyAt:11,casts:1}},buffs:[],skillSpecs:['A138','A139','A13V'].map(id=>({id,kind:'pending',status:'unresolved'}))};
  assert.equal(refreshSourceSkills(entity,definition(['A138','A139','A13V'])),true);assert.ok(entity.skillSpecs.every(s=>s.status==='implemented'));assert.deepEqual({hp:entity.hp,maxHp:entity.maxHp,damage:entity.damage,mana:entity.mana},{hp:321,maxHp:1000,damage:20,mana:7});assert.equal(entity.sourcePassiveStatBonuses,undefined);assert.equal(entity.skillStates.A138.casts,1);
});

test('JSON game restoration does not reapply item bonuses and preserves a damaged body',()=>{
  const game=fixture(),entity=body(game,['A13T','A13X','A13V']);entity.hp=1500;entity.mana=12;entity.skillImplementationRevision='before-v15';entity.skillStates.A13V={readyAt:32,casts:2};const id=entity.id;
  const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(game.snapshot()))),live=restored.state.entities.find(e=>e.id===id);
  near(live.maxHp,1800);near(live.hp,1500);near(live.damage,100);near(live.mana,12);assert.equal(live.skillStates.A13V.casts,2);assert.equal(live.skillImplementationRevision,SKILL_IMPLEMENTATION_REVISION);near(sourceAuraEffects(restored,live,[]).healRate,40);
});

test('QC reduces ordinary, spell, and universal enemy damage at the main event stage',()=>{
  for(const options of [{},{spell:true,magic:true},{spell:true,scripted:true,universal:true}]){
    const game=fixture(),target=body(game,['A2ZG']),attacker=body(game,[],hostile);near(modifyIncoming(game,target,100,attacker,options),85);near(game._hurt(target,100,attacker,options),85);near(target.hp,915);
  }
});

test('QC follows the source exclusions for null, self, ally, A2Y7, and disabled main callbacks',()=>{
  const game=fixture(),target=body(game,['A2ZG']),ally=body(game),attacker=body(game,[],hostile),excluded=body(game,['A2Y7'],hostile);
  for(const source of [null,target,ally,excluded])near(modifyIncoming(game,target,100,source,{spell:true,universal:true}),100);
  game._sourceDamageTriggerDepth=1;near(modifyIncoming(game,target,100,attacker,{spell:true,universal:true}),100);game._sourceDamageTriggerDepth=0;near(modifyIncoming(game,target,100,attacker,{spell:true,universal:true}),85);
  near(modifyIncoming(game,target,0,attacker),0);
});

test('QC changes lethal-event input before Ysera revival decides whether the hit is lethal',()=>{
  const game=fixture(),target=body(game,['A2ZG','A2YI']),attacker=body(game,[],hostile);target.hp=900;
  near(game._hurt(target,1000,attacker),850);near(target.hp,50);assert.equal(target.status.yseraRevivalCount,undefined);
  target.hp=500;near(game._hurt(target,600,attacker),0);near(target.hp,50);assert.equal(target.status.yseraRevivalCount,1);
});

test('QC still sees a fresh UB independent-listener universal event',()=>{
  const game=fixture(),target=body(game,['A2ZG']),attacker=body(game,['A0S3'],hostile,{combatRawcode:'n0S4'});
  near(game._hurt(target,100,attacker),85);near(target.hp,1000-85-30*.85);assert.equal(game._sourceTrueFireDepth,0);assert.equal(game._sourceDamageTriggerDepth,0);
});

test('QC does not run twice on universal damage appended inside the disabled main listener',()=>{
  const game=fixture(),target=body(game,['A2ZG']),attacker=body(game,['A01I'],hostile,{manaStart:10});
  near(game._hurt(target,200,attacker),170);near(target.hp,800,'170 reduced event plus unreduced 10×3 main-listener addition');assert.equal(game._sourceDamageTriggerDepth,0);
});

test('legacy-version ability IDs do not acquire v14 box behavior',()=>{
  const entity={id:'old',hp:1000,maxHp:1000,damage:20,status:{},side:'defender'};attachSkills(entity,{abilityIds:['A138','A139','A13V','A2ZG']});near(entity.hp,1000);near(entity.damage,20);assert.equal(entity.sourcePassiveStatBonuses,undefined);
});
