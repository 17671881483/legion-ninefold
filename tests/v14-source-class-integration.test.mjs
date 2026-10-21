import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {SOURCE_CLASS_ORDER,SOURCE_CLASS_REGISTRY} from '../dist/source-class-rules.js';
import {BOX_RANDOM_FIGHTER_RULES} from '../dist/box-training-rules.js';
import {tickSourceSkills,tickSourceScriptJobs,compileSkills} from '../dist/skills.js';
import {laneToWorld} from '../dist/layout.js';

const unit=raw=>UNITS.find(u=>!u.legacy&&u.sourceRawcode===raw),clone=value=>JSON.parse(JSON.stringify(value));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const ok=result=>assert.equal(result.ok,true,result.message??result.reason);
const ids=u=>u.skillSpecs?.map(s=>s.id)??[...new Set([...(u.abilityIds??[]),...(u.permanentAbilityIds??[])])];
const has=(u,id)=>ids(u).includes(id);
function fixture(){
  const g=new Game({mode:'sandbox',seed:819});g._aiAct=()=>{};
  for(const p of g.state.players){p.buildings=[];p.gold=p.wood=100000;p.populationCap=300;p.heroAltarCount=0;p.heroAltarUsed=false;p.heroId=null;}
  g.state.entities=[];g.state.sourceSkillJobs=[];return g;
}
function build(g,raw,col=0,playerId=0){
  const p=g.state.players[playerId],def=unit(raw);assert.ok(def,raw);p.roster=[...new Set([...p.roster,def.id])];
  ok(g.command('build',{unitId:def.id,col,row:0,playerId}));const b=p.buildings.at(-1);assert.ok(b.construction);return b;
}
function finish(g,b){g._completeConstruction(g.state.players.find(p=>p.buildings.includes(b)),b);assert.equal(b.construction,null);return b;}
function spawn(g,b){
  const p=g.state.players.find(p=>p.buildings.includes(b));g.state.phase='combat';g._spawnDefender(unit(b.unitId.replace(/^v14_/,'')),p,b.col+.5,b.row+4.5,b.id);
  return g.state.entities.filter(e=>e.buildingId===b.id).at(-1);
}
function enemy(g){
  const point=laneToWorld(0,3,6),e=g._entity(UNIT_TEMPLATES.h002,{ownerId:4,team:1,side:'monster',battleTeam:0,laneId:0,sourceLaneId:0,worldX:point.x,worldY:point.y});
  e.skillSpecs=[];e.skillStates={};e.hp=e.maxHp=10000;e.damage=10;g.state.entities.push(e);return e;
}
function reward(g,abilityId,tier='box'){
  const p=g.state.players[0];p.boxRewards={providerId:'box-n060-0',providerRawcode:'n060',ownerId:0,tier,abilityIds:[abilityId,tier==='box'?'A133':'A13O',tier==='box'?'A134':'A13P'],sourceWave:tier==='box'?6:13,consumed:false};
}
const effectiveArmor=(g,e)=>g._effectiveArmor(e,g._auraEffects(e,[]).armor);

test('class registration occurs at paid completion and ordinary upgrades retain the original marker and native child',()=>{
  const g=fixture(),b=build(g,'h010');
  assert.equal(SOURCE_CLASS_REGISTRY.h010,'A18P');assert.equal(has(b,'A18P'),false);assert.equal(has(b,'A18Q'),false);
  finish(g,b);assert.equal(has(b,'A18P'),true);assert.equal(has(b,'A18Q'),true);
  assert.deepEqual(b.sourceClassGrantedAbilityIds,['A18Q']);
  ok(g.command('upgrade',{buildingId:b.id,unitId:unit('h011').id}));
  assert.ok(b.construction);assert.equal(has(b,'A18Q'),true);finish(g,b);
  assert.equal(b.unitId,unit('h011').id);assert.equal(SOURCE_CLASS_REGISTRY.h011,undefined);
  assert.equal(has(b,'A18P'),true);assert.equal(has(b,'A18Q'),true);
  assert.equal(ids(b).filter(id=>id==='A18Q').length,1);
  const restored=Game.fromSnapshot(g.snapshot()),saved=restored.state.players[0].buildings[0];
  assert.equal(has(saved,'A18P'),true);assert.equal(has(saved,'A18Q'),true);assert.deepEqual(saved.sourceClassGrantedAbilityIds,['A18Q']);
});

test('both source gift initialization and the blood-fusion building marker require no extra class draw or construction',()=>{
  for(const raw of ['h014','h06M']){
    const g=fixture(),p=g.state.players[0],pool=BOX_RANDOM_FIGHTER_RULES.byAbility.A132,index=pool.rawcodes.indexOf(raw);assert.ok(index>=0);
    reward(g,'A132');let draws=0;g._random=()=>{draws++;return(index+.5)/pool.count;};
    const point=laneToWorld(0,2.5,7.5);ok(g.command('boxReward',{abilityId:'A132',worldX:point.x,worldY:point.y}));
    assert.equal(draws,1);const b=p.buildings[0];assert.equal(b.unitId,unit(raw).id);assert.ok(!b.construction);
    assert.equal(has(b,SOURCE_CLASS_REGISTRY[raw]),true,raw);
    assert.equal(has(b,'A18Q'),raw==='h014');assert.equal(has(b,'A18X'),raw==='h06M');
    if(raw==='h06M')assert.ok(!b.sourceClassGrantedAbilityIds?.length,'building blood fusion is not prematurely randomized');
  }
});

test('normal and arena bodies initialize their source class once and the self-only class aura never leaks to a neighboring ally',()=>{
  const g=fixture(),b=finish(g,build(g,'h010')),other=finish(g,build(g,'h00M',1));
  g._startCombat();let e=g.state.entities.find(e=>e.buildingId===b.id),ally=g.state.entities.find(e=>e.buildingId===other.id);
  assert.equal(has(e,'A18P'),true);assert.equal(has(e,'A18Q'),true);assert.equal(e.status.sourceClassDeployment.effectiveClassId,'A18P');
  near(g._auraEffects(e,[e]).damageMultiplier,1.1);near(g._auraEffects(ally,[e]).damageMultiplier,1);
  assert.equal(ids(e).filter(id=>id==='A18Q').length,1);
  g._startArena();e=g.state.entities.find(e=>e.buildingId===b.id);ally=g.state.entities.find(e=>e.buildingId===other.id);
  assert.equal(e.isArena,true);assert.equal(has(e,'A18Q'),true);assert.equal(ids(e).filter(id=>id==='A18Q').length,1);
  near(g._auraEffects(e,[e]).damageMultiplier,1.1);near(g._auraEffects(ally,[e]).damageMultiplier,1);
});

test('A198 adds exactly three self regeneration per second on each fresh ordinary or arena body',()=>{
  const g=fixture(),b=finish(g,build(g,'h01C')),def=unit('h01C');
  assert.equal(has(b,'A18T'),true);assert.equal(has(b,'A198'),true);
  for(const arena of [false,true]){
    if(arena)g._startArena();else g._startCombat();
    const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(has(e,'A198'),true);
    e.hp=20;const before=e.hp;g._applyHealingAura(e,[],2);tickSourceSkills(g,e,g.state.entities,2);
    near(e.hp,before+2*(Number(def.hpRegen)+3));
    assert.equal(ids(e).filter(id=>id==='A198').length,1);
  }
});

test('A19A reduces explicit native magic spell damage by forty percent and leaves ordinary magic weapons and universal damage intact',()=>{
  const g=fixture(),b=finish(g,build(g,'h040')),e=spawn(g,b),attacker=enemy(g);
  assert.equal(has(e,'A18V'),true);assert.equal(has(e,'A19A'),true);
  const hit=(options,expected)=>{e.hp=e.maxHp=1000;const actual=g._hurt(e,100,attacker,options);near(actual,expected);near(e.hp,1000-expected);};
  hit({magic:true,spell:true},60);
  hit({magic:true},100);
  hit({magic:true,spell:true,universal:true},100);
  hit({spell:true,nativeDamageType:'magic'},60);
  e.status.nagaSpellResistance=.1;hit({magic:true,spell:true},90);
  assert.equal(e.status.sourceClassResistanceOverlapUnresolved,true,'unknown mixed-native stacking is reported without inventing an extra factor');
});

test('native class resistance applies before the Ysera lethal check and prevents an otherwise lethal revival',()=>{
  const g=fixture(),def=unit('h0YM'),e=g._entity({...def,abilityIds:[...def.abilityIds,'A19A']},{ownerId:0,team:0,side:'defender',battleTeam:0,laneId:0,sourceLaneId:0});
  e.skillSpecs=e.skillSpecs.filter(s=>['A2YI','A19A'].includes(s.id));g.state.entities.push(e);const attacker=enemy(g);
  e.maxHp=2500;e.hp=900;assert.ok(e.hp/e.maxHp>.3);
  near(g._hurt(e,1000,attacker,{magic:true,spell:true}),600);
  near(e.hp,300);assert.equal(e.status.yseraRevivalCount??0,0);
});

test('blood fusion chooses independently for each new body, leaves the persistent building unrolled and restores without another RNG draw',()=>{
  const g=fixture(),p=g.state.players[0],a=finish(g,build(g,'h06J')),b=finish(g,build(g,'h06J',1));
  for(const building of [a,b]){assert.equal(has(building,'A18X'),true);assert.equal(has(building,'A18Q'),false);assert.equal(has(building,'A198'),false);}
  g._random=()=>.001;const first=spawn(g,a);assert.equal(first.status.sourceClassDeployment.effectiveClassId,'A18P');assert.equal(has(first,'A18Q'),true);
  g._random=()=>((SOURCE_CLASS_ORDER.indexOf('A18T')+.1)/SOURCE_CLASS_ORDER.length);const second=spawn(g,b);
  assert.equal(second.status.sourceClassDeployment.effectiveClassId,'A18T');assert.equal(has(second,'A198'),true);assert.equal(has(second,'A18Q'),false);
  assert.equal(p.buildings.length,2);assert.ok([a,b].every(building=>has(building,'A18X')&&!has(building,'A198')&&!has(building,'A18Q')));
  const saved=clone(g.snapshot()),restored=Game.fromSnapshot(saved);
  assert.equal(restored._rng,saved.rng);
  for(const prior of [first,second]){
    const current=restored.state.entities.find(e=>e.id===prior.id);
    assert.deepEqual(current.status.sourceClassDeployment,prior.status.sourceClassDeployment);assert.deepEqual(ids(current),ids(prior));
  }
  const oldFirst=restored.state.entities.find(e=>e.id===first.id);restored._random=()=>((SOURCE_CLASS_ORDER.indexOf('A18S')+.1)/SOURCE_CLASS_ORDER.length);
  const fresh=spawn(restored,restored.state.players[0].buildings.find(building=>building.id===a.id));
  assert.notEqual(fresh.id,first.id);assert.equal(fresh.status.sourceClassDeployment.effectiveClassId,'A18S');assert.equal(has(fresh,'A18R'),true);
  assert.equal(oldFirst.status.sourceClassDeployment.effectiveClassId,'A18P');
});

test('training replacement copies QC but initializes only the new exact raw class instead of inheriting an old marker or native child',()=>{
  const g=fixture(),p=g.state.players[0],b=finish(g,build(g,'h010'));
  reward(g,'A2ZC');ok(g.command('boxReward',{abilityId:'A2ZC',buildingId:b.id}));assert.equal(has(b,'A2ZG'),true);
  ok(g.command('sandboxBoxTraining'));ok(g.command('boxTrain',{buildingId:b.id,unitId:unit('h011').id}));
  const replacement=p.buildings.find(next=>next.unitId===unit('h011').id);
  assert.notEqual(replacement.id,b.id);assert.equal(has(replacement,'A2ZG'),true);
  assert.equal(has(replacement,'A18P'),false);assert.equal(has(replacement,'A18Q'),false);assert.ok(!replacement.sourceClassGrantedAbilityIds?.length);
  const body=spawn(g,replacement);assert.equal(has(body,'A2ZG'),true);assert.equal(has(body,'A18P'),false);assert.equal(has(body,'A18Q'),false);

});

test('A191 observes pre-subtraction HP and is consumed only once when the next accepted damage event begins at ten percent or less',()=>{
  const g=fixture(),b=finish(g,build(g,'h09L')),e=spawn(g,b),attacker=enemy(g);
  assert.equal(has(e,'A191'),true);e.hp=e.maxHp*.2;
  g._hurt(e,e.maxHp*.15,attacker,{spell:true,universal:true});near(e.hp,e.maxHp*.05);assert.equal(has(e,'A191'),true);
  g._hurt(e,1,attacker,{spell:true,universal:true});near(e.hp,e.maxHp*.2-1);assert.equal(has(e,'A191'),false);
  const before=e.hp;g._hurt(e,1,attacker,{spell:true,universal:true});near(e.hp,before-1);
  const fresh=spawn(g,b);assert.equal(has(fresh,'A191'),true,'each deployment receives its own one-use class marker');
});

test('the accepted Ysera revival zero-damage path still reaches A191 after revival updates current HP',()=>{
  const g=fixture(),def=unit('h0YM'),e=g._entity({...def,abilityIds:[...def.abilityIds,'A191']},{ownerId:0,team:0,side:'defender',battleTeam:0,laneId:0,sourceLaneId:0});
  e.skillSpecs=e.skillSpecs.filter(s=>['A2YI','A191'].includes(s.id));g.state.entities.push(e);const attacker=enemy(g);
  e.hp=e.maxHp*.25;const actual=g._hurt(e,1,attacker,{spell:true,universal:true});
  assert.equal(actual,0);assert.equal(e.status.yseraRevivalCount,1);near(e.hp,e.maxHp*.2);assert.equal(has(e,'A191'),false);
});

test('main damage precedes the independent desert attack listener so its nested hit cannot cause an extra low-health class check',()=>{
  const g=fixture(),victim=finish(g,build(g,'h09L')),attacking=finish(g,build(g,'h0QO',0,4));g._startArena();
  const target=g.state.entities.find(e=>e.buildingId===victim.id),source=g.state.entities.find(e=>e.buildingId===attacking.id);
  assert.notEqual(source.side,target.side);assert.equal(has(source,'A197'),true);assert.equal(has(target,'A191'),true);
  target.hp=150;target.maxHp=1000;
  g._hurt(target,20,source);
  near(target.hp,5);assert.equal(has(target,'A191'),true);assert.equal(has(source,'A197'),false);
});

test('independent class attack hooks work while the main damage listener is busy and dead desert rearm survives JSON continuation once',()=>{
  const g=fixture(),b=finish(g,build(g,'h0QO')),e=spawn(g,b),target=enemy(g);assert.equal(has(e,'A197'),true);
  g._sourceDamageTriggerDepth=1;const before=target.hp;g._hurt(target,10,e);g._sourceDamageTriggerDepth=0;
  near(target.hp,before-135);assert.equal(has(e,'A197'),false);
  assert.equal(g.state.sourceSkillJobs.filter(job=>job.type==='source_class_desert_rearm').length,1);
  g._hurt(e,e.hp+1000,target,{spell:true,universal:true});g._clearDead();assert.ok(!g.state.entities.some(other=>other.id===e.id));
  const restored=Game.fromSnapshot(clone(g.snapshot()));
  for(const game of [g,restored]){
    const job=game.state.sourceSkillJobs.find(job=>job.type==='source_class_desert_rearm');assert.ok(job);
    game.state.time=5;tickSourceScriptJobs(game);assert.equal(job.done,true);assert.equal(has(job.source,'A197'),true);assert.ok(job.source.hp<=0);
    assert.equal(game.state.sourceSkillJobs.filter(pending=>pending.type==='source_class_desert_rearm').length,0);
    const prior=clone(job.source);game.state.time=6;tickSourceScriptJobs(game);assert.deepEqual(job.source,prior);
  }
});

test('direct source dark-erosion ability refreshes through real attack-damage hooks and expires at the refreshed deadline',()=>{
  const g=fixture(),b=finish(g,build(g,'h01P')),e=spawn(g,b),target=enemy(g);g._random=()=>0;
  const base=effectiveArmor(g,target);g._hurt(target,1,e);assert.equal(has(target,'A199'),true);near(effectiveArmor(g,target),base-3);
  g.state.time=2;g._hurt(target,1,e);near(effectiveArmor(g,target),base-3);
  g.state.time=3;tickSourceScriptJobs(g);assert.equal(has(target,'A199'),true,'the refreshed ability survives the first deadline');
  g.state.time=5;tickSourceScriptJobs(g);assert.equal(has(target,'A199'),false);near(effectiveArmor(g,target),base);
  assert.ok(compileSkills(unit('h01P')).every(s=>s.id!=='A18U'),'class registration is a genuine source hook, not a static template mutation');
});

test('upstream impact invokes native VertigoTarget without applying the unrelated animation-freeze host',()=>{
  const g=fixture(),b=finish(g,build(g,'h07J')),source=spawn(g,b),target=enemy(g);g._random=()=>0;
  assert.equal(has(source,'A18Y'),true);g._hurt(target,1,source);
  near(target.status.stunUntil,2);assert.equal(target.status.sourceAnimationFrozenUntil,undefined);
});
