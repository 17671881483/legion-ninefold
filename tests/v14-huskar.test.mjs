import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {V14_ABILITIES} from '../dist/v14-reference.js';
import {compileSkills,sourceAuraEffects,sourceClassAttackDamageEvent,tickSourceScriptJobs} from '../dist/skills.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function fixture(ids=['A0IC','A0IE','A0II'],levels={}){
  const g=new Game({mode:'sandbox',seed:783});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];
  const e=g._entity(UNIT_TEMPLATES.h0JL,{team:0,side:'defender',battleTeam:0,laneId:0,ownerId:0,worldX:10,worldY:10});
  e.abilityLevels={...levels};e.skillSpecs=compileSkills({abilityIds:ids,abilityLevels:levels,skillVersion:'v14.1A5',distanceScale:1/3});e.hp=e.maxHp=1000;e.hpRegen=e.manaRegen=0;e.attackCd=e.abilityCd=1e9;g.state.entities.push(e);
  const enemy=({hp=10000,...extra}={})=>{const t=g._entity(UNIT_TEMPLATES.h002,{team:1,side:'monster',battleTeam:0,laneId:0,worldX:10.3,worldY:10,...extra});t.skillSpecs=[];t.hp=t.maxHp=hp;t.hpRegen=t.manaRegen=0;t.armor=0;g.state.entities.push(t);return t;};
  const t=enemy();return {g,e,t,enemy};
}
const hurt=(g,e,t,n)=>g._hurt(e,n,t,{spell:true,universal:true});
const tick=(g,at)=>{g.state.time=at;tickSourceScriptJobs(g);};
const jobs=g=>g.state.sourceSkillJobs.filter(j=>j.type==='huskar_unyielding');
test('source descriptions distinguish known scripts, missing native barrage and zero-level behavior',()=>{
  const s=compileSkills({abilityIds:['A0IC','A0IE','A0II','A0IF'],skillVersion:'v14.1A5'});
  assert.deepEqual(s.map(s=>s.status),['implemented','partial','partial','unresolved']);
  assert.match(s[1].effectText,/5秒/);assert.match(s[1].effectText,/严格大于/);assert.match(s[2].effectText,/10%/);assert.match(s[2].effectText,/0级/);
});
test('real base and skin deploy the combat body with unconsumed one-shot ability',()=>{
  for(const [raw,combat] of [['h0NP','h0JL'],['h0SS','h0SR']]){
    const g=new Game({mode:'sandbox'}),p=g.state.players[0],def=UNITS.find(u=>u.sourceRawcode===raw),b={id:'huskar-building',unitId:def.id,col:2,row:1};
    p.buildings=[b];g.state.entities=[];g._recordLimitOrigins(b,def);g._recordSourceCompletion(p,def);g._recordEggCompletion(p,def,b);g._spawnDefender(def,p,3,6,b.id);
    const e=g.state.entities[0];assert.equal(e.combatRawcode,combat);assert.equal(has(e,'A0IE'),true);assert.equal(has(e,'A0IF'),false);assert.equal(e.skillSpecs.find(s=>s.id==='A0II').haste,.1);
  }
});
test('strict lethal event triggers before damage and grants a five-second one-shot state',()=>{
  const {g,e,t}=fixture(['A0IE']);e.hp=50;near(hurt(g,e,t,100),100);near(e.hp,50);
  assert.equal(has(e,'A0IE'),false);assert.equal(has(e,'A0IF'),true);assert.equal(e.status.huskarUnyielding,true);near(jobs(g)[0].at,15);
});
test('equal damage kills without triggering, and low HP alone is not the trigger',()=>{
  let f=fixture(['A0IE']);f.e.hp=50;hurt(f.g,f.e,f.t,50);assert.ok(f.e.hp<=0);assert.equal(jobs(f.g).length,0);assert.equal(has(f.e,'A0IE'),true);
  f=fixture(['A0IE']);f.e.hp=20;hurt(f.g,f.e,f.t,1);near(f.e.hp,19);assert.equal(jobs(f.g).length,0);
});
test('repeated lethal hits preheal without refreshing, while nonlethal hits still reduce life',()=>{
  const {g,e,t}=fixture(['A0IE']);e.hp=50;hurt(g,e,t,100);g.state.time=14.9;hurt(g,e,t,200);near(e.hp,50);near(jobs(g)[0].at,15);assert.equal(jobs(g).length,1);hurt(g,e,t,20);near(e.hp,30);
  tick(g,14.999);assert.equal(has(e,'A0IF'),true);tick(g,15);assert.equal(has(e,'A0IF'),false);assert.equal(has(e,'A0IE'),false);hurt(g,e,t,31);assert.ok(e.hp<=0);assert.equal(jobs(g).length,0);
});
test('preheal caps at maximum HP rather than cancelling damage, so very large hits still kill',()=>{
  const {g,e,t}=fixture(['A0IE']);e.hp=50;hurt(g,e,t,1100);near(e.hp,-100);assert.equal(e.status.huskarUnyielding,true);
});
test('main-listener guards reject ally, self, null, A2Y7, nested and zero events',()=>{
  for(const type of ['ally','self','null','A2Y7','nested','zero']){
    const {g,e,t}=fixture(['A0IE','A0II']);e.hp=50;if(type==='ally')t.side=e.side;if(type==='A2Y7')t.skillSpecs=[{id:'A2Y7'}];if(type==='nested')g._sourceDamageTriggerDepth=1;
    hurt(g,e,type==='null'?null:type==='self'?e:t,type==='zero'?0:100);assert.equal(has(e,'A0IE'),true,type);assert.equal(jobs(g).length,0,type);assert.equal(e.abilityLevels.A0II,undefined,type);
  }
});
test('unexpired state survives removal of granted barrage and expires without restoring the marker',()=>{
  const {g,e,t}=fixture(['A0IE']);e.hp=50;hurt(g,e,t,100);e.skillSpecs=e.skillSpecs.filter(s=>s.id!=='A0IF');hurt(g,e,t,100);near(e.hp,50);tick(g,15);assert.equal(e.status.huskarUnyielding,undefined);assert.equal(has(e,'A0IE'),false);
});
test('received damage updates berserk from pre-damage HP, with unyielding taking priority',()=>{
  const {g,e,t}=fixture(['A0IE','A0II']);e.hp=550;hurt(g,e,t,100);near(e.hp,450);assert.equal(e.abilityLevels.A0II,4);near(sourceAuraEffects(g,e,[e]).haste,.4);
  e.hp=50;hurt(g,e,t,100);assert.equal(e.abilityLevels.A0II,4);hurt(g,e,t,10);near(e.hp,40);assert.equal(e.abilityLevels.A0II,9);
});
test('explicit DataB1 through DataB10 compile and update without tooltip rounding',()=>{
  for(let lv=1;lv<=10;lv++){const [s]=compileSkills({abilityIds:['A0II'],abilityLevels:{A0II:lv},skillVersion:'v14.1A5'});near(s.haste,Number(V14_ABILITIES.A0II.fields['DataB'+lv]));}
  const {g,e,t}=fixture(['A0II']);e.hp=350;hurt(g,e,t,1);assert.equal(e.abilityLevels.A0II,6);near(sourceAuraEffects(g,e,[e]).haste,.6000000238418579);near(sourceAuraEffects(g,t,[e]).haste,0);
});
test('zero-level requests remain explicit unknowns and preserve the last valid level',()=>{
  const {g,e,t}=fixture(['A0II'],{A0II:7});e.hp=980;hurt(g,e,t,1);assert.equal(e.status.huskarBerserkRequestedLevel,0);assert.equal(e.abilityLevels.A0II,7);assert.equal(e.status.huskarNativeLevelRequest.status,'native-unverified');near(e.skillSpecs[0].haste,Number(V14_ABILITIES.A0II.fields.DataB7));
  e.hp=500;hurt(g,e,t,1);assert.equal(e.abilityLevels.A0II,5);assert.equal(e.status.huskarNativeLevelRequest,undefined);
});
test('normal battle collection includes the partial native aura and changes the actual attack cooldown',()=>{
  const {g,e,t}=fixture(['A0II']);e.hp=550;hurt(g,e,t,100);e.moveSpeed=t.moveSpeed=0;e.status.activated=true;t.attackCd=1e9;
  g._updateEntities(0);assert.ok(g._battleAuras[0].includes(e));near(g._auraEffects(e,g._battleAuras[0]).attackSpeedMultiplier,1.4);
  const battle=g.state.entities;battle.auras=g._battleAuras[0];g._attack(e,t,battle);near(e.attackCd,e.attackInterval/1.4);
});
test('blood boil applies divine damage before primary HP debit, then berserk heals at its previous level',()=>{
  const {g,e,t}=fixture(['A0IC','A0II'],{A0II:4});e.hp=500;const calls=[],original=g._hurt.bind(g);
  g._hurt=(target,amount,source,options)=>{if(options?.nativeDamageType==='divine')calls.push({amount,hp:target.hp,self:e.hp,options});return original(target,amount,source,options);};
  near(g._hurt(t,100,e,{}),100);near(e.hp,510);near(t.hp,9860);assert.equal(e.abilityLevels.A0II,4);assert.equal(calls.length,1);near(calls[0].hp,10000);near(calls[0].self,470);assert.equal(calls[0].options.attackType,'chaos');assert.equal(calls[0].options.spell,true);
});
test('blood boil uses strict ten percent and spell events do not run the attack listener',()=>{
  const {g,e,t}=fixture(['A0IC']);e.hp=100;g._hurt(t,100,e,{});near(e.hp,100);near(t.hp,9900);e.hp=101;g._hurt(t,100,e,{spell:true});near(e.hp,101);near(t.hp,9800);g._hurt(t,100,e,{});near(e.hp,94.94);near(t.hp,9660);
});
test('attack listener does not inherit main friendly/A2Y7 guards or require positive event damage',()=>{
  const {g,e,t}=fixture(['A0IC','A0II','A2Y7'],{A0II:4});e.hp=500;t.side=e.side;g._hurt(t,100,e,{});near(e.hp,510);near(t.hp,9860);
  e.hp=500;sourceClassAttackDamageEvent(g,t,e,{},0);near(e.hp,470);near(t.hp,9820);assert.equal(e.abilityLevels.A0II,5);
});
test('the per-attacker recursion flag blocks reentry while the main trigger may be disabled independently',()=>{
  const {g,e,t}=fixture(['A0IC','A0II'],{A0II:4});e.hp=500;e.status.sourceNativeAttackBusy=true;g._hurt(t,100,e,{});near(e.hp,500);near(t.hp,9900);
  e.status.sourceNativeAttackBusy=false;g._sourceDamageTriggerDepth=1;g._hurt(t,100,e,{});near(e.hp,510);near(t.hp,9760);assert.equal(e.status.sourceNativeAttackBusy,false);
});
test('berserk lifesteal uses event damage even when blood boil already killed the victim',()=>{
  const {g,e,t}=fixture(['A0IC','A0II'],{A0II:4});e.hp=500;t.hp=1;g._hurt(t,100,e,{});near(e.hp,510);assert.ok(t.hp<=0);assert.equal(t.status.deathCounted,true);
});
test('native barrage secondary arrows each run independent blood boil and berserk listeners once',()=>{
  const {g,e,t,enemy}=fixture(['A0II','A0VW'],{A0II:4}),other=enemy();e.hp=500;e.damage=100;e.weapon1={...e.weapon1,weapTp1:'missile',weapsOn:'1'};
  const battle=g.state.entities;battle.auras=[];g._attack(e,t,battle);near(t.hp,9900);near(other.hp,9900);near(e.hp,580);assert.equal(e.abilityLevels.A0II,4);
});
test('dragon soul occurs between blood boil and berserk, before primary damage',()=>{
  const {g,e,t}=fixture(['A0IC','A0YD','A0II'],{A0II:4});e.hp=500;t.isNativeHero=true;g._random=()=>0;const seen=[],original=g._hurt.bind(g);g._hurt=(target,amount,source,options)=>{if(source===e&&options?.scripted)seen.push([amount,e.hp,target.hp]);return original(target,amount,source,options);};
  g._hurt(t,100,e,{});assert.deepEqual(seen,[[40,470,10000],[3000,470,9960]]);near(t.hp,6860);near(e.hp,510);
});
test('already released arrows still hit after caster death but berserk cannot resurrect the corpse',()=>{
  const {g,e,t,enemy}=fixture(['A0II','A0VW'],{A0II:4}),other=enemy(),original=g._hurt.bind(g);e.hp=500;e.damage=100;e.weapon1={...e.weapon1,weapTp1:'missile',weapsOn:'1'};
  g._hurt=(target,...args)=>{const value=original(target,...args);if(target===t){e.hp=0;e.status.deathCounted=true;g._sourceDeath(e,t);}return value;};
  const battle=g.state.entities;battle.auras=[];g._attack(e,t,battle);near(other.hp,9900);near(e.hp,0);assert.equal(e.status.sourceDeathHandled,true);
});
test('earlier unyielding branch still blocks later shield cleanup after removing its own ability',()=>{
  const {g,e,t}=fixture(['A0IE','A0VY']);e.hp=50;e.mana=5;e.maxMana=100;e.status.aesaraShieldScriptOn=true;e.status.aesaraShieldBuff=false;
  hurt(g,e,t,100);near(e.hp,50);near(e.mana,5);assert.equal(e.status.aesaraCleanupDeferred,'prior-elseif');hurt(g,e,t,100);near(e.mana,5);tick(g,15);hurt(g,e,t,1);near(e.mana,15);assert.equal(e.status.aesaraShieldScriptOn,false);
});
test('JSON restore rebinds a live timer handle, preserves levels and never re-adds consumed A0IE',()=>{
  const {g,e,t}=fixture();e.hp=50;hurt(g,e,t,100);g.state.time=12;const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))),copy=restored.state.entities.find(u=>u.id===e.id);
  assert.equal(jobs(restored)[0].source,copy);assert.equal(has(copy,'A0IE'),false);for(const game of [g,restored])tick(game,15);assert.deepEqual(restored.snapshot(),g.snapshot());
});
test('death and corpse cleanup do not cancel expiry, including a save after the corpse was removed',()=>{
  const {g,e,t}=fixture(['A0IE']);e.hp=50;hurt(g,e,t,1100);g._clearDead();assert.equal(g.state.entities.includes(e),false);assert.equal(jobs(g).length,1);
  const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))),retained=jobs(restored)[0].source;tick(g,15);tick(restored,15);assert.equal(has(e,'A0IF'),false);assert.equal(has(retained,'A0IF'),false);assert.equal(retained.status.huskarUnyielding,undefined);assert.deepEqual(restored.snapshot(),g.snapshot());
});
test('sandbox reset clears round timers and old saves do not invent previously activated unyielding',()=>{
  const {g,e,t}=fixture();e.hp=50;hurt(g,e,t,100);g.command('sandboxReset');assert.equal(jobs(g).length,0);
  const f=fixture(['A0II']);f.e.abilityLevels.A0II=6;f.e.skillImplementationRevision='v14-content-20261027-v22-1';const restored=Game.fromSnapshot(f.g.snapshot()),u=restored.state.entities[0];near(u.skillSpecs[0].haste,Number(V14_ABILITIES.A0II.fields.DataB6));assert.equal(has(u,'A0IE'),false);assert.equal(u.status.huskarUnyielding,undefined);
});
