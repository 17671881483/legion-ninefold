import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { WORKBOOK_UNIT_TEMPLATES as T } from '../dist/workbook-reference.js';
import { tickSourceSkills, sourceMoveFactor } from '../dist/skills.js';

// These are behavioral fixtures: real source abilities/weapons run through the
// engine's attack, hurt and cast paths. Only HP, damage and positions are made
// deterministic, so expected damage does not depend on source balance values.
const near = (actual, expected, message='') => assert.ok(Math.abs(actual-expected)<1e-7, `${message}: ${actual} != ${expected}`);
function fixture() {
  const game=new Game({seed:3281});
  game.state.phase='combat'; game.state.time=1; game.state.entities=[];
  game._random=()=>.99;
  return game;
}
function entity(game, rawcode=null, def={}, placement={}) {
  return game._entity({id:'review-basic',name:'Review fixture',interval:1,range:60,speed:90,ability:null,abilityIds:[],distanceScale:1/3,sourceRawFields:{},weapon1:{weapsOn:1,weapTp1:'normal',targs1:'enemies'},weapon2:{},...(rawcode?T[rawcode]:{}),hp:1000,damage:100,armor:0,armorType:'unarmored',mana:100,manaStart:100,manaRegen:0,hpRegen:0,...def},
    {side:'monster',team:1,battleTeam:0,laneId:0,sourceLaneId:0,ownerId:null,worldX:0,worldY:0,...placement});
}
function battle(game,...members) {
  const b=[...members]; b.auras=[...members];
  game.state.entities=b; game._battleAuras=[b.auras,[]]; game._worldEntities=new Map(members.map(e=>[e.id,e]));
  return b;
}

test('source splash applies full, half-ring and outer-ring fields in F/H/Q order',()=>{
  const g=fixture(),e=entity(g,'h02W',{}, {side:'defender',ownerId:0,team:0,worldX:-1});
  const primary=entity(g),full=entity(g,null,{}, {worldY:.01}),middle=entity(g,null,{}, {worldY:.1}),outer=entity(g,null,{}, {worldY:.5}),outside=entity(g,null,{}, {worldY:1.01});
  g._attack(e,primary,battle(g,e,primary,full,middle,outer,outside));
  near(1000-primary.hp,100,'primary'); near(1000-full.hp,100,'full ring');
  near(1000-middle.hp,30,'Harea/Hfact'); near(1000-outer.hp,5,'Qarea/Qfact'); near(outside.hp,1000,'outside');
});

test('source splash mitigates each secondary target using its own armor',()=>{
  const g=fixture(),e=entity(g,'h02W',{}, {side:'defender',ownerId:0,team:0,worldX:-1});
  const armoredPrimary=entity(g,null,{armor:10}),secondary=entity(g,null,{}, {worldY:.1});
  g._attack(e,armoredPrimary,battle(g,e,armoredPrimary,secondary));
  near(1000-armoredPrimary.hp,62.5,'primary armor');near(1000-secondary.hp,30,'unarmored splash target');
});

test('source splash uses each secondary target armor type multiplier',()=>{
  const g=fixture(),e=entity(g,'h02W',{}, {side:'defender',ownerId:0,team:0,worldX:-1});
  const primary=entity(g),heavy=entity(g,null,{armorType:'heavy'}, {worldY:.1});
  g._attack(e,primary,battle(g,e,primary,heavy));
  near(1000-primary.hp,100);near(1000-heavy.hp,27,'normal versus heavy is 0.9');
});

test('ground-only source splash does not hit nearby air targets',()=>{
  const g=fixture(),e=entity(g,'h02V',{}, {side:'defender',ownerId:0,team:0,worldX:-1});
  const primary=entity(g),ground=entity(g,null,{targetType:'ground'}, {worldY:.05}),air=entity(g,null,{targetType:'air'}, {worldY:.05});
  g._attack(e,primary,battle(g,e,primary,ground,air));
  near(1000-ground.hp,50,'ground secondary');near(air.hp,1000,'air is excluded by splashTargs1');
});

test('native thorns percent flag returns 24 percent rather than 0.24 flat damage',()=>{
  const g=fixture(),attacker=entity(g),tree=entity(g,'h039',{}, {side:'defender',ownerId:0,team:0,worldX:.5});
  g._attack(attacker,tree,battle(g,attacker,tree));
  near(tree.hp,900);near(attacker.hp,976,'24 percent reflection');
});

test('Guardian Spirit grants a passive that actually reduces incoming damage',()=>{
  const g=fixture(),guardian=entity(g,'h071',{}, {side:'defender',ownerId:0,team:0,worldX:0}),friend=entity(g,null,{}, {side:'defender',ownerId:0,team:0,worldX:.3}),enemy=entity(g,null,{}, {worldX:.7});
  const b=battle(g,guardian,friend,enemy);tickSourceSkills(g,guardian,b,.01);
  assert.ok(friend.skillSpecs.some(s=>s.id==='A060'),'guarded unit received A060');
  g._attack(enemy,friend,b);near(1000-friend.hp,65,'A060 received-damage factor is 0.65');
});

test('ANdh blindness changes actual attack outcomes for the affected unit',()=>{
  const g=fixture(),caster=entity(g,null,{abilityIds:['A05C']},{side:'defender',ownerId:0,team:0}),blinded=entity(g,null,{}, {worldX:1});
  const b=battle(g,caster,blinded);tickSourceSkills(g,caster,b,.01);
  assert.ok(blinded.buffs.some(v=>v.skillId==='A05C'),'cast applied blindness');
  g._random=()=>.1;g._attack(blinded,caster,b);near(caster.hp,1000,'missed roll');
  g._random=()=>.9;g._attack(blinded,caster,b);near(caster.hp,900,'successful roll');
});

test('Absk incoming modifier is applied during its buff and expires with simulation time',()=>{
  const g=fixture(),turtle=entity(g,null,{abilityIds:['A06P']},{side:'defender',ownerId:0,team:0}),enemy=entity(g,null,{}, {worldX:.5});
  const b=battle(g,turtle,enemy);tickSourceSkills(g,turtle,b,.01);
  assert.ok(turtle.buffs.some(v=>v.skillId==='A06P'),'self cast applied incoming modifier');
  g._attack(enemy,turtle,b);near(1000-turtle.hp,99,'DataC1=-.01 decreases incoming by one percent');
  g.state.time=3;g._attack(enemy,turtle,b);near(1000-turtle.hp,199,'expired modifier no longer applies');
});


test('magic immunity rejects magic attacks while physical attacks still deal damage',()=>{
  const g=fixture(),magic=entity(g,null,{attackType:'magic'},{side:'defender',ownerId:0,team:0}),immune=entity(g,null,{abilityIds:['A038']},{worldX:.5});
  const b=battle(g,magic,immune);g._attack(magic,immune,b);near(immune.hp,1000,'magic attack blocked');
  magic.attackType='normal';g._attack(magic,immune,b);near(immune.hp,900,'normal attack passes');
});

test('magic immunity rejects hostile entangling roots and slow status effects',()=>{
  for(const id of ['A06B','A045']){
    const g=fixture(),caster=entity(g,null,{abilityIds:[id]},{side:'defender',ownerId:0,team:0}),immune=entity(g,null,{abilityIds:['A038']},{worldX:.5});
    tickSourceSkills(g,caster,battle(g,caster,immune),.01);
    assert.equal(immune.buffs.some(b=>b.skillId===id),false,`${id} must not apply a hostile spell status to magic immunity`);
  }
});

test('entangling roots disarms whereas physical ensnare only prevents movement',()=>{
  for(const [id,disarmed] of [['A06B',true],['A056',false]]){
    const g=fixture(),caster=entity(g,null,{abilityIds:[id]},{side:'defender',ownerId:0,team:0}),rooted=entity(g,null,{}, {worldX:.5});
    const b=battle(g,caster,rooted);tickSourceSkills(g,caster,b,.01);tickSourceSkills(g,rooted,b,0);
    assert.ok(rooted.buffs.some(v=>v.skillId===id),`${id} applied root`);
    near(sourceMoveFactor(g,rooted,b),0,`${id} immobilizes`);
    g._attack(rooted,caster,b);near(caster.hp,disarmed?1000:900,`${id} disarm behavior`);
  }
});

test('an AIsb chain-lightning proc executes its child spell and jumps to another enemy',()=>{
  const g=fixture(),druid=entity(g,null,{abilityIds:['A0BP']},{side:'defender',ownerId:0,team:0,worldX:-.5}),primary=entity(g),secondary=entity(g,null,{}, {worldY:.4});
  const b=battle(g,druid,primary,secondary);g._attack(druid,primary,b);
  near(primary.hp,815,'primary receives attack plus 85 spell damage');
  near(secondary.hp,944.75,'first jump loses 35 percent of 85 damage');
});

test('an AIsb storm-bolt proc executes child damage and stun',()=>{
  const g=fixture(),chief=entity(g,null,{abilityIds:['A0AO']},{side:'defender',ownerId:0,team:0}),target=entity(g,null,{}, {worldX:.5});
  const b=battle(g,chief,target);g._attack(chief,target,b);tickSourceSkills(g,target,b,0);
  near(target.hp,600,'attack plus 300 storm-bolt child damage');
  assert.ok(target.status.stunUntil>g.state.time,'storm-bolt child applies stun');
});

test('summoned Storm Geyser template executes its forked-lightning skill',()=>{
  const g=fixture(),geyser=entity(g,'n007',{}, {side:'defender',ownerId:0,team:0}),targets=[.5,.6,.7,.8].map(worldX=>entity(g,null,{}, {worldX}));
  const b=battle(g,geyser,...targets);tickSourceSkills(g,geyser,b,.01);
  assert.equal(targets.filter(t=>Math.abs(t.hp-960)<1e-7).length,3,'three enemies receive the 40-damage fork');
  assert.equal(targets.filter(t=>t.hp===1000).length,1,'target cap excludes the fourth enemy');
});

test('disease cloud leaves its authored five-second effect after the victim leaves range',()=>{
  const g=fixture(),zombie=entity(g,null,{abilityIds:['Aap1']},{side:'defender',ownerId:0,team:0}),victim=entity(g,null,{}, {worldX:.5});
  const b=battle(g,zombie,victim);tickSourceSkills(g,zombie,b,0);
  assert.ok(victim.buffs.some(v=>v.skillId==='Aap1'),'cloud applied disease');
  victim.worldX=3;g.state.time=2;tickSourceSkills(g,zombie,b,1);tickSourceSkills(g,victim,b,1);
  near(victim.hp,997,'three DPS remains outside source radius');
  g.state.time=7;tickSourceSkills(g,victim,b,1);near(victim.hp,997,'disease expires');
});

test('two copies of the same disease refresh one buff rather than doubling DPS',()=>{
  const g=fixture(),z1=entity(g,null,{abilityIds:['Aap1']},{side:'defender',ownerId:0,team:0}),z2=entity(g,null,{abilityIds:['Aap1']},{side:'defender',ownerId:0,team:0,worldY:.1}),victim=entity(g,null,{}, {worldX:.5});
  const b=battle(g,z1,z2,victim);tickSourceSkills(g,z1,b,0);tickSourceSkills(g,z2,b,0);
  assert.equal(victim.buffs.filter(v=>v.skillId==='Aap1').length,1,'shared plague effect refreshes');
  g.state.time=2;tickSourceSkills(g,victim,b,1);near(victim.hp,997,'one disease DOT');
});
