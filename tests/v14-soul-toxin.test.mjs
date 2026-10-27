import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,tickSourceSkills,tickSourceScriptJobs,matchesTargets,sourceAuraEffects,manualSourceSkills} from '../dist/skills.js';
import {soulToxinSpellEffect,hasSoulToxinBuff} from '../dist/soul-toxin-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const specs=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
const jobs=g=>g.state.sourceSkillJobs.filter(j=>j.type==='soul_toxin');
function fixture(){
  const g=new Game({mode:'sandbox',seed:27});g.state.entities=[];g.state.phase='combat';g.state.time=10;
  const at=laneToWorld(0,3,6);
  const make=(side='monster',ids=[])=>{
    const e=g._entity(UNIT_TEMPLATES.h0JL,{ownerId:side==='defender'?0:null,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,worldX:at.x+.3,worldY:at.y});
    specs(e,ids);e.buffs=[];e.ability=null;e.hp=e.maxHp=1000;e.hpRegen=e.manaRegen=0;e.armor=0;e.armorType='unarmored';e.sourceArmorTypeRaw='none';e.attackCd=e.abilityCd=1000;e.traits=[];e.isNativeHero=e.isHero=false;g.state.entities.push(e);return e;
  };
  const caster=make('defender',['A0I5']),primary=make(),splash=make();caster.worldX=at.x;caster.mana=100;caster.maxMana=100;
  primary.maxHp=primary.hp=2000;splash.worldX=primary.worldX+.2;
  const hit=(amount=1,source=primary,options={spell:true,universal:true})=>g._hurt(caster,amount,source,options);
  const advance=at=>{g.state.time=at;tickSourceScriptJobs(g);};
  return {g,caster,primary,splash,make,hit,advance};
}
test('source evidence lines, SHA, registered spell effect and damage trigger remain exact',()=>{
  const evidence=JSON.parse(readFileSync(new URL('../reference/soul-toxin-evidence.json',import.meta.url)));
  const bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),evidence.source.sha256);
  const lines=bytes.toString('latin1').split('\n');for(const e of evidence.sourceEvidence)assert.equal(lines[e.line-1].trim(),e.text,`line ${e.line}`);
  assert.match(lines.slice(39744,39768).join('\n'),/GetUnitTypeId\(i\)!=Pn/);
  const fields=compileSkills({abilityIds:['A0I5','A0I7'],skillVersion:'v14.1A5'}).map(s=>s.fields);
  assert.equal(fields[0].Cool1,undefined);assert.equal(fields[0].DataC1,undefined);assert.equal(fields[1].DataA1,undefined);
});
test('compiler corrects implemented mislabel and leaves missing native cooldown null',()=>{
  const {g,caster}=fixture(),s=caster.skillSpecs[0];assert.equal(s.status,'partial');assert.equal(s.kind,'soul_toxin_source');assert.equal(s.cooldown,null);assert.equal(s.manaCost,24);assert.equal(s.haste,-.2);assert.equal(s.move,-.2);
  assert.equal(manualSourceSkills(g,caster).some(s=>s.id==='A0I5'),false);
  assert.equal(compileSkills({abilityIds:['A0I7'],skillVersion:'v14.1A5'})[0].status,'partial');
});
test('three real build-menu carriers deploy combat bodies with toxin and source mana',()=>{
  for(const [building,combat,start] of [['h0OL','h0OK',0],['h0UW','h0UV',30],['n0JI','h0JI',30]]){
    const f=fixture(),def=UNITS.find(u=>u.sourceRawcode===building),p=f.g.state.players[0],b={id:'toxin-building',unitId:def.id,col:2,row:1};
    p.buildings=[b];f.g._spawnDefender(def,p,3,6,b.id);const e=f.g.state.entities.at(-1);e.worldX=f.caster.worldX;e.worldY=f.caster.worldY;
    assert.equal(e.combatRawcode,combat);assert.equal(e.skillSpecs.find(s=>s.id==='A0I5').status,'partial');near(e.mana,start);
    f.g._hurt(e,1,f.primary,{spell:true,universal:true});assert.equal(!!e.status.soulToxinOrderRequest,start>24);near(e.mana,start>24?start-24:start);
  }
});
test('no generic idle autocast and no damage source spell-type restriction',()=>{
  const f=fixture(),battle=f.g.state.entities;battle.auras=[];tickSourceSkills(f.g,f.caster,battle,.1);near(f.caster.mana,100);assert.equal(jobs(f.g).length,0);
  for(const options of [{spell:true,universal:true},{spell:false,universal:true},{spell:true,weapon:true,universal:true}]){const x=fixture();x.hit(1,x.primary,options);assert.equal(x.caster.status.soulToxinOrderRequest.outcome,'adapted-success');}
});
test('strict mana boundary: 24 misses and >24 selects, native spell spends exactly 24 once',()=>{
  for(const mana of [0,24,24.00001,25]){const f=fixture();f.caster.mana=mana;f.hit();assert.equal(!!f.caster.status.soulToxinOrderRequest,mana>24);near(f.caster.mana,mana>24?mana-24:mana);assert.equal(jobs(f.g).length,mana>24?1:0);}
});
test('guards suppress requests for self/allied/null/zero/A2Y7/disabled ability and nested damage',()=>{
  for(const mode of ['self','ally','null','zero','A2Y7','level-zero','nested']){const f=fixture();if(mode==='ally')f.primary.side=f.caster.side;if(mode==='A2Y7')specs(f.primary,['A2Y7']);if(mode==='level-zero')f.caster.abilityLevels={A0I5:0};if(mode==='nested')f.g._sourceDamageTriggerDepth=1;f.hit(mode==='zero'?0:1,mode==='self'?f.caster:mode==='null'?null:f.primary);assert.equal(f.caster.status.soulToxinOrderRequest,undefined,mode);}
});
test('request failure still selects the elseif branch and suppresses duel',()=>{
  for(const mode of ['stun','cooldown','immune','range','dead-source','mechanical']){
    const f=fixture();specs(f.caster,['A0I5','A0ID']);
    if(mode==='stun')f.caster.status.stunUntil=20;if(mode==='cooldown')f.caster.skillStates.A0I5={readyAt:20,casts:0};if(mode==='immune')specs(f.primary,['Amim']);if(mode==='range')f.primary.worldX+=4;if(mode==='dead-source')f.primary.hp=0;if(mode==='mechanical')f.primary.traits=['mechanical'];
    f.hit();assert.equal(f.caster.status.soulToxinOrderRequest.outcome,'failed',mode);near(f.caster.mana,100);assert.equal(f.caster.status.huskarDuelTag,undefined);assert.equal(jobs(f.g).length,0);
  }
});
test('24 mana falls through to duel, while successful toxin and unknown cooldown requests block it',()=>{
  const f=fixture();specs(f.caster,['A0I5','A0ID']);f.caster.mana=24;f.hit();assert.equal(f.caster.status.huskarDuelTag,f.primary.id);
  const x=fixture();specs(x.caster,['A0I5','A0ID']);x.hit();x.hit();near(x.caster.mana,76);assert.equal(x.caster.skillStates.A0I5.casts,1);assert.equal(x.caster.status.soulToxinOrderRequest.outcome,'unresolved');assert.equal(x.caster.status.huskarDuelTag,undefined);assert.equal(jobs(x.g).length,1);
});
test('fire and ice successful prefixes suppress toxin, random misses reach it',()=>{
  for(const id of ['A0HX','A0IK'])for(const roll of [0,.9]){const f=fixture();specs(f.primary,[id]);f.g._random=()=>roll;f.hit();assert.equal(!!f.caster.status.soulToxinOrderRequest,roll===.9,`${id}/${roll}`);}
});
test('unresolved preceding lethal A0XM remains deferred for the B integration',()=>{
  const f=fixture();specs(f.caster,['A0I5','A0XM','A0ID']);f.caster.hp=10;f.hit(10);assert.equal(f.caster.status.soulToxinOrderRequest,undefined);assert.equal(f.caster.status.huskarDuelTag,undefined);
});
test('toxin branch does not suppress the separate lethal unyielding if chain',()=>{
  const f=fixture();specs(f.caster,['A0I5','A0IE']);f.caster.hp=50;f.hit(100);near(f.caster.hp,50);near(f.caster.mana,76);assert.equal(f.caster.status.huskarUnyielding,true);assert.equal(jobs(f.g).length,1);
});
test('coarse catch-up terminal damage starts unyielding at its tick time and restores caller time/context',()=>{
  const f=fixture();specs(f.splash,['A0IE']);f.splash.hp=50;f.hit();f.g._soulToxinEventAt=7;
  f.advance(18);near(f.g.state.time,18);assert.equal(f.g._soulToxinEventAt,7);near(f.splash.hp,10);
  assert.equal(f.splash.status.huskarUnyielding,true);const j=f.g.state.sourceSkillJobs.find(j=>j.type==='huskar_unyielding');near(j.at,20);near(f.splash.status.soulToxinEndRequest.at,15);near(f.splash.status.stunUntil,16);
  delete f.g._soulToxinEventAt;f.advance(19.99);assert.equal(f.splash.status.huskarUnyielding,true);f.advance(20);assert.equal(f.splash.status.huskarUnyielding,undefined);
});
test('native primary buff precedes host spell effect; primary has slow but no forced timer',()=>{
  const f=fixture();f.hit();assert.equal(hasSoulToxinBuff(f.primary,10),true);assert.equal(jobs(f.g).some(j=>j.targetId===f.primary.id),false);assert.equal(jobs(f.g)[0].targetId,f.splash.id);
  const aura=sourceAuraEffects(f.g,f.primary,[]);near(aura.move,-.2);near(aura.haste,-.2);f.advance(15);near(f.primary.hp,2000);
});
test('range is 200 source units around primary, enemy-only, inclusive edge, not caster-centered',()=>{
  const f=fixture();f.primary.worldX=f.caster.worldX+2;f.splash.worldX=f.primary.worldX+2/3;
  const outside=f.make();outside.worldX=f.primary.worldX+2/3+.0001;
  const byCaster=f.make();byCaster.worldX=f.caster.worldX;
  const ally=f.make('defender');ally.worldX=f.primary.worldX;
  const otherBattle=f.make();otherBattle.battleTeam=1;
  f.hit();assert.deepEqual(jobs(f.g).map(j=>j.targetId),[f.splash.id]);assert.equal(hasSoulToxinBuff(outside,10),false);assert.equal(hasSoulToxinBuff(ally,10),false);
});
test('already-present B04U skips a timer and does not refresh a secondary duration',()=>{
  for(const key of ['id','key','buffKey']){const f=fixture();f.splash.buffs.push({[key]:'B04U',expiresAt:11});f.hit();assert.equal(jobs(f.g).length,0);near(f.splash.buffs[0].expiresAt,11);}
  const f=fixture();f.splash.nativeBuffIds=['B04U'];f.hit();assert.equal(jobs(f.g).length,0);
});
test('secondary expiry is checked at spell-effect time, not mere buff array presence',()=>{
  const f=fixture();f.splash.buffs.push({key:'B04U',expiresAt:10});f.hit();assert.equal(jobs(f.g).length,1);near(f.splash.buffs[0].expiresAt,15);
});
test('failed dummy casts still create timers: mechanical, magic-immune, invulnerable, unavailable and out-of-range',()=>{
  for(const mode of ['mechanical','immune','invulnerable','locust','range']){const f=fixture();
    if(mode==='mechanical')f.splash.traits=['mechanical'];if(mode==='immune')specs(f.splash,['Amim']);if(mode==='invulnerable')specs(f.splash,['Avul']);if(mode==='locust')specs(f.splash,['Aloc']);if(mode==='range'){f.primary.worldX=f.caster.worldX+8/3;f.splash.worldX=f.primary.worldX+.6;}
    f.hit();assert.equal(jobs(f.g).length,1,mode);assert.equal(jobs(f.g)[0].crippleRequest.outcome,'failed',mode);assert.equal(hasSoulToxinBuff(f.splash,10),false,mode);f.advance(11);assert.equal(jobs(f.g).length,0,mode);near(f.splash.hp,['immune','invulnerable'].includes(mode)?1000:910);assert.equal(f.splash.status.soulToxinEndRequest.applied,!['mechanical','immune','invulnerable','locust'].includes(mode));
  }
});
test('air organic targets are included and a secondary corpse still creates its source timer',()=>{
  const f=fixture();f.splash.targetType='air';const corpse=f.make();corpse.hp=0;f.hit();assert.equal(jobs(f.g).length,2);assert.equal(hasSoulToxinBuff(f.splash,10),true);assert.equal(jobs(f.g).find(j=>j.targetId===corpse.id).crippleRequest.outcome,'failed');f.advance(11);assert.equal(jobs(f.g).length,1);assert.equal(corpse.status.soulToxinEndRequest.applied,false);
});
test('ordinary five-second buff gives four 10 ticks then one 90 terminal callback, no fifth 10',()=>{
  const f=fixture();f.hit();const job=jobs(f.g)[0];f.advance(10.99);near(f.splash.hp,1000);
  for(let i=1;i<=4;i++){f.advance(10+i);near(f.splash.hp,1000-10*i);assert.equal(job.ticks,i);}
  f.advance(15);near(f.splash.hp,870);assert.equal(job.ticks,5);assert.equal(job.done,true);assert.equal(jobs(f.g).length,0);near(f.splash.status.stunUntil,16);f.advance(20);near(f.splash.hp,870);
});
test('buff removal ends on next periodic callback; no invented fixed five-tick counter',()=>{
  const f=fixture();f.hit();f.advance(11);f.splash.buffs=[];f.advance(11.9);near(f.splash.hp,990);f.advance(12);near(f.splash.hp,900);near(f.splash.status.stunUntil,13);
  const x=fixture();x.hit();x.splash.buffs[0].expiresAt=18;x.advance(17);near(x.splash.hp,930);assert.equal(jobs(x.g).length,1);x.advance(18);near(x.splash.hp,840);assert.equal(jobs(x.g).length,0);
});
test('separate targets have independent timers and early end never ends another target',()=>{
  const f=fixture(),other=f.make();f.hit();assert.equal(jobs(f.g).length,2);f.splash.buffs=[];f.advance(11);near(f.splash.hp,910);near(other.hp,990);assert.equal(jobs(f.g).length,1);
});
test('reapplication deduplicates by B04U only; dispelled targets may own overlapping timers',()=>{
  const f=fixture();f.hit();const other=f.make('defender',['A0I5']);other.mana=100;f.g._hurt(other,1,f.primary,{spell:true,universal:true});assert.equal(jobs(f.g).length,1);
  f.splash.buffs=[];const third=f.make('defender',['A0I5']);third.mana=100;f.g._hurt(third,1,f.primary,{spell:true,universal:true});assert.equal(jobs(f.g).length,2);f.advance(11);near(f.splash.hp,980);
});
test('timer damage uses Spells attack row and magic damage, ignores armor but respects resistance/immunity',()=>{
  for(const mode of ['armor','fortified','resist','immune-after-cast']){const f=fixture();f.hit();if(mode==='armor')f.splash.armor=100;if(mode==='fortified'){f.splash.armorType='fortified';f.splash.sourceArmorTypeRaw='fort';}if(mode==='resist')specs(f.splash,['A19A']);if(mode==='immune-after-cast')specs(f.splash,['Amim']);f.advance(11);near(f.splash.hp,mode==='fortified'?970:mode==='resist'?994:mode==='immune-after-cast'?1000:990);}
});
test('terminal A0I7 level one lasts 1 second for ordinary units, 0.5 for native heroes',()=>{
  for(const hero of [false,true]){const f=fixture();f.splash.isNativeHero=hero;f.hit();f.advance(15);near(f.splash.status.stunUntil,hero?15.5:16);assert.equal(f.splash.status.soulToxinEndRequest.missingNativeDamage,true);near(f.splash.hp,870);}
});
test('source death after spell starts ends next tick, even after host corpse cleanup',()=>{
  const f=fixture();f.hit();f.g._killUnit(f.caster);f.g._clearDead();assert.equal(f.g.state.entities.includes(f.caster),false);f.advance(11);near(f.splash.hp,910);assert.equal(jobs(f.g).length,0);near(f.splash.status.stunUntil,12);assert.deepEqual(f.g.state.soulToxinHandles,{});
});
test('target death ends next tick without resurrection or corpse damage/control',()=>{
  const f=fixture();f.hit();f.g._killUnit(f.splash);f.g._clearDead();f.advance(11);assert.equal(f.splash.hp,0);assert.equal(f.splash.status.soulToxinEndRequest.applied,false);assert.equal(jobs(f.g).length,0);
});
test('dead retained caster and live target remain distinct through JSON save restoration',()=>{
  const f=fixture();f.hit();f.g._killUnit(f.caster);f.g._clearDead();
  const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),rt=r.state.entities.find(e=>e.id===f.splash.id);assert.ok(r.state.soulToxinHandles[f.caster.id]);assert.equal(r.state.soulToxinHandles[f.splash.id],rt);r.state.time=11;tickSourceScriptJobs(r);near(rt.hp,910);assert.equal(jobs(r).length,0);
});
test('restored multiple timers use the live shared target, cooldown state persists without double debit',()=>{
  const f=fixture();f.hit();f.splash.buffs=[];const other=f.make('defender',['A0I5']);other.mana=100;f.g._hurt(other,1,f.primary,{spell:true,universal:true});f.advance(12);near(f.splash.hp,960);
  const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),rc=r.state.entities.find(e=>e.id===f.caster.id),rp=r.state.entities.find(e=>e.id===f.primary.id),rt=r.state.entities.find(e=>e.id===f.splash.id);assert.equal(jobs(r).length,2);assert.equal(r.state.soulToxinHandles[rt.id],rt);
  r._hurt(rc,1,rp,{spell:true,universal:true});near(rc.mana,76);assert.equal(rc.status.soulToxinOrderRequest.outcome,'unresolved');r.state.time=15;tickSourceScriptJobs(r);near(rt.hp,740);assert.equal(jobs(r).length,0);
});
test('RemoveUnit status is explicit partial boundary, not silently treated as a death explosion',()=>{
  const f=fixture();f.hit();f.splash.status.sourceRemoved=true;f.advance(11);near(f.splash.hp,1000);assert.equal(f.splash.status.soulToxinHandleBoundary,'native-removed-handle-unresolved');assert.equal(f.splash.status.soulToxinEndRequest,undefined);assert.equal(jobs(f.g).length,0);
});
test('e008 spell effect exclusion prevents recursive spread; non-e008 respects observed primary buff state',()=>{
  const f=fixture(),api={compileAbility:(g,e,id)=>compileSkills({abilityIds:[id],skillVersion:'v14.1A5',distanceScale:1/3})[0],matchesTargets,magicImmune:()=>false};
  const dummy={...f.caster,combatRawcode:'e008'};assert.deepEqual(soulToxinSpellEffect(f.g,dummy,f.primary,api),[]);assert.equal(jobs(f.g).length,0);
  soulToxinSpellEffect(f.g,f.caster,f.primary,api);assert.equal(jobs(f.g).length,2,'raw event before a primary buff creates primary timer only when actually observed absent');
});
test('pause and speed use simulation time and catch-up does not multiply terminal effects',()=>{
  const f=fixture();f.hit();f.g._updateEntities=()=>{};f.g._updateKings=()=>{};f.g._transferDefenders=()=>{};f.g._checkCombatEnd=()=>{};f.g.state.paused=true;f.g.tick(2);near(f.g.state.time,10);near(f.splash.hp,1000);
  f.g.state.paused=false;f.g.state.speed=2;f.g.tick(.5);near(f.g.state.time,11);near(f.splash.hp,990);f.g.tick(2.1);near(f.splash.hp,870);assert.equal(jobs(f.g).length,0);
});
test('continuous waves preserve jobs/handles; fresh sandbox waves discard both',()=>{
  const f=fixture();f.hit();const oldJobs=f.g.state.sourceSkillJobs,handles=f.g.state.soulToxinHandles;f.g.state.wave=31;f.g.state.mode='normal';f.g._advanceContinuous();assert.equal(f.g.state.sourceSkillJobs,oldJobs);assert.equal(f.g.state.soulToxinHandles,handles);
  f.g._resetSandboxWave();assert.deepEqual(f.g.state.sourceSkillJobs,[]);assert.deepEqual(f.g.state.soulToxinHandles,{});
});
test('same global revision legacy save refreshes stale generic Acri without inventing retroactive timers',()=>{
  const f=fixture();f.caster.skillSpecs[0]={...f.caster.skillSpecs[0],kind:'debuff',status:'implemented',cooldown:0};delete f.caster.skillSpecs[0].soulToxinRevision;
  f.caster.skillStates.A0I5={readyAt:10.1,casts:3};const mana=f.caster.mana;
  const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),rc=r.state.entities.find(e=>e.id===f.caster.id),rp=r.state.entities.find(e=>e.id===f.primary.id);
  assert.equal(rc.skillSpecs[0].kind,'soul_toxin_source');assert.equal(rc.skillSpecs[0].cooldown,null);assert.equal(jobs(r).length,0);near(rc.mana,mana);
  r._hurt(rc,1,rp,{spell:true,universal:true});assert.equal(rc.status.soulToxinOrderRequest.outcome,'unresolved');near(rc.mana,mana);
});
test('generated coverage includes both dynamic e008 abilities with honest partial classifications',()=>{
  const coverage=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url)));
  for(const scope of ['playerSkills','battleSkills'])for(const id of ['A0I5','A0I7']){const ability=coverage[scope].abilities.find(s=>s.rawcode===id);assert.equal(ability.status,'partial');assert.ok(ability.unitRawcodes.includes('e008'));}
  assert.ok(coverage.playerRuntimeAbilities.find(u=>u.sourceRawcode==='e008').abilityIds.includes('A0I7'));
});
