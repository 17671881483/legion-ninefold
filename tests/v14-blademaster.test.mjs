import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,tickSourceScriptJobs,sourceAttackStart,initializeSourceClassCombat,sourceAuraEffects,tickSourceSkills,manualSourceSkills,castManualSourceSkill} from '../dist/skills.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const skills=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type);
function fixture(){
 const g=new Game({mode:'sandbox',seed:31});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;for(const k of g.state.kings){k.worldX=10000;k.worldY=10000;}
 const p=laneToWorld(0,3,6);
 const make=(side='monster',ids=[],dx=0,dy=0,code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,userData:side==='defender'?1:5,worldX:p.x+dx,worldY:p.y+dy});skills(e,ids);e.hp=e.maxHp=3200;e.mana=e.maxMana=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;g.state.entities.push(e);return e;};
 const a=make('defender',[],0,0,'h0VQ'),t=make('monster',[],.2);
 const hit=(target=t,amount=50,source=a,options={spell:true,universal:true})=>g._hurt(target,amount,source,options);
 const at=n=>{g.state.time=n;tickSourceScriptJobs(g);};
 const cast=(id,point)=>castManualSourceSkill(g,a,id,{point});
 return {g,a,t,make,hit,at,cast,p};
}
test('exact source evidence is byte-pinned and ability/native fields remain distinct',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/blademaster-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');assert.equal(createHash('sha256').update(raw).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.abilities.A1QE.DataA1,'100.0');
});
test('critical native hit is 1.5 then weapon event removes it for exactly nine seconds',()=>{
 const f=fixture();skills(f.a,['A1QE']);near(sourceAttackStart(f.g,f.a,f.t).multiplier,1.5);f.hit(f.t,10,f.a,{spell:false});assert.equal(f.a.skillSpecs.length,0);near(sourceAttackStart(f.g,f.a,f.t).multiplier,1);f.at(18.999);assert.equal(f.a.skillSpecs.length,0);f.at(19);near(sourceAttackStart(f.g,f.a,f.t).multiplier,1.5);
});
test('critical removal accepts zero damage but excludes illusion and spell-only events',()=>{
 for(const mode of ['zero','illusion','spell']){const f=fixture();skills(f.a,['A1QE']);if(mode==='illusion')f.a.isIllusion=true;if(mode==='zero')skills(f.t,['Amim']);f.hit(f.t,10,f.a,{spell:mode!=='illusion',weapon:mode==='zero',magic:mode==='zero'});assert.equal(f.a.skillSpecs.some(s=>s.id==='A1QE'),mode!=='zero');}
});
test('critical restore timer survives death/JSON and does not duplicate on re-added ability',()=>{
 const f=fixture();skills(f.a,['A1QE']);f.hit(f.t,10,f.a,{spell:false});skills(f.a,['A1QE']);f.hit(f.t,10,f.a,{spell:false});assert.equal(jobs(f.g,'blademaster_critical').length,1);const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),a=r.state.entities.find(e=>e.id===f.a.id);r._killUnit(a);r._clearDead();r.state.time=19;tickSourceScriptJobs(r);assert.equal(a.status.blademasterCriticalTimer,undefined);assert.ok(a.skillSpecs.some(s=>s.id==='A1QE'));
});
test('chop uses base damage not average/max and heals 75 percentage points',()=>{
 const f=fixture();skills(f.a,['A1QF']);f.a.sourceRawFields={...f.a.sourceRawFields,dmgplus1:'10'};f.a.damage=999;f.a.hp=320;f.t.armor=100;f.cast('A1QF');near(f.t.hp,3150);near(f.a.hp,2720);near(f.a.mana,78);near(f.a.skillStates.A1QF.readyAt,23);
});
test('chop includes 300 boundary not 200 and excludes friends, Avul and other battles',()=>{
 const f=fixture();skills(f.a,['A1QF']);f.a.sourceBaseDamage=10;const edge=f.make('monster',[],1),out=f.make('monster',[],1.001),ally=f.make('defender',[],.1),inv=f.make('monster',['Avul'],.2);f.cast('A1QF');near(edge.hp,3150);for(const t of [out,ally,inv])near(t.hp,3200);
});
test('manual casts validate resources, cooldown and point range before side effects',()=>{
 const f=fixture();skills(f.a,['A1QF','A1QG']);f.a.mana=21;assert.equal(f.cast('A1QF').ok,false);assert.equal(f.cast('A1QG',{x:f.p.x+2,y:f.p.y}).ok,false);assert.equal(f.cast('A1QG',{x:f.p.x+1,y:f.p.y}).ok,true);near(f.a.mana,6);assert.equal(f.cast('A1QG',f.p).ok,false);assert.equal(manualSourceSkills(f.g,f.a).find(s=>s.id==='A1QG').cooldown,9);
});
test('spell effect suppression consumes paid cast without scripted damage or heal',()=>{
 const f=fixture();skills(f.a,['A1QF','A1QG']);f.a.hp=100;f.g._sourceAbilityEffectDepth=1;f.cast('A1QF');f.cast('A1QG',f.p);near(f.a.hp,100);near(f.t.hp,3200);near(f.a.mana,63);assert.equal(jobs(f.g,'blademaster_wave').length,0);
});
test('main damage auto requests prioritize victim even when mana failure prevents cast',()=>{
 const f=fixture();skills(f.a,['A1QF']);skills(f.t,['A1QF']);f.t.mana=0;f.hit();near(f.a.mana,100);near(f.t.mana,0);near(f.t.hp,3150);
});
test('main damage disabled and A2Y7 source do not auto-cast sword skills',()=>{
 for(const mode of ['disabled','excluded']){const f=fixture();skills(f.t,['A1QF']);if(mode==='disabled')f.g._sourceDamageTriggerDepth=1;else skills(f.a,['A2Y7']);f.hit();near(f.t.mana,100);}
});
test('mirror is damage requested rather than proximity polling and retains native resource order',()=>{
 const f=fixture();skills(f.a,['A1QC','A1QF','A1QG']);f.a.mana=30;tickSourceSkills(f.g,f.a,[f.a,f.t],0);assert.equal(f.g.state.entities.length,2);f.hit();near(f.a.mana,5);assert.equal(f.a.skillStates.A1QC.casts,1);assert.equal(f.a.skillStates.A1QF.casts??0,0);assert.equal(f.a.skillStates.A1QG.casts,1);const copies=f.g.state.entities.filter(e=>e.isIllusion);assert.equal(copies.length,2);near(copies[0].damage,f.a.damage*.75);near(copies[0].expiresAt,28);assert.equal(copies[0].skillSpecs.length,0);
});
test('fifteen kills create four storm pulses at zero, one, two, three seconds',()=>{
 const f=fixture();skills(f.a,['A1QD']);for(let i=0;i<14;i++){const t=f.make('monster',[],.2);t.hp=1;f.hit(t,2);}assert.equal(jobs(f.g,'blademaster_storm').length,0);const t=f.make('monster',[],.2);t.hp=1;f.hit(t,2);assert.ok(f.a.skillSpecs.some(s=>s.id==='A1D6'));f.at(10);near(f.t.hp,3063);f.at(13);near(f.t.hp,2652);assert.equal(f.a.status.blademasterSpinning,false);assert.equal(f.a.skillSpecs.some(s=>s.id==='A1D6'),false);
});
test('storm active kills are discarded; disabled main death does not accumulate',()=>{
 const f=fixture();skills(f.a,['A1QD']);f.a.status.blademasterKills=14;f.t.hp=1;f.hit(f.t,2);const t=f.make('monster',[],.2);t.hp=1;f.hit(t,2);assert.equal(f.a.status.blademasterKills,0);f.at(13);f.g._sourceUnitDeathTriggerDepth=1;const x=f.make('monster',[],.2);x.hp=1;f.hit(x,2);assert.equal(f.a.status.blademasterKills,0);
});
test('storm follows source current position and continues on retained corpse',()=>{
 const f=fixture();skills(f.a,['A1QD']);f.a.status.blademasterKills=14;const t=f.make('monster',[],.2);t.hp=1;f.hit(t,2);f.a.worldX+=20;f.at(10);near(f.t.hp,3200);f.a.worldX=f.p.x;f.g._killUnit(f.a);f.g._clearDead();f.at(13);near(f.t.hp,2789);
});
test('A1D6 only zeros eligible main events and does not remove control',()=>{
 const f=fixture();skills(f.a,['A1D6']);f.a.status.stunUntil=15;near(f.hit(f.a,50,f.t),0);near(f.hit(f.a,50,f.a),50);f.g._sourceDamageTriggerDepth=1;near(f.hit(f.a,50,f.t),50);f.g._sourceDamageTriggerDepth=0;skills(f.t,['A2Y7']);near(f.hit(f.a,50,f.t),50);near(f.a.status.stunUntil,15);
});
test('A1D6 does not consume adjacent Ysera revival or corrosion and is version isolated',()=>{
 const f=fixture();skills(f.a,['A1D6','A2YI']);skills(f.t,['A2YH']);f.a.hp=100;near(f.hit(f.a,50,f.t),0);near(f.a.hp,100);assert.equal(f.a.status.yseraRevivalCount,undefined);sourceAttackStart(f.g,f.t,f.a);assert.equal(f.a.buffs.some(b=>b.key==='A2YH'),false);
 skills(f.a,['A1D6']);Object.assign(f.a,{skillVersion:'5.0dJF',sourceVersion:'5.0dJF',provenance:'legacy',unitId:'legacy-fixture'});near(f.hit(f.a,50,f.t),50);
});
test('sword wave starts at source with first step at .03 and burns once a second five times',()=>{
 const f=fixture();skills(f.a,['A1QG']);f.cast('A1QG',{x:f.p.x+1,y:f.p.y});f.at(10);near(f.t.hp,3200);f.at(10.03);near(f.t.hp,2975);f.at(11.03);near(f.t.hp,2903);f.at(15.03);near(f.t.hp,2615);assert.equal(jobs(f.g,'blademaster_wave').length,0);assert.equal(jobs(f.g,'blademaster_burn').length,0);
});
test('wave stops after167 steps/1002 distance and never re-hits a target',()=>{
 const f=fixture();skills(f.a,['A1QG']);f.cast('A1QG',{x:f.p.x+1,y:f.p.y});const j=jobs(f.g,'blademaster_wave')[0];f.at(15.01);near(j.point.x,f.p.x+1002/300);assert.equal(j.steps,167);assert.equal(j.hitIds.filter(id=>id===f.t.id).length,1);assert.equal(jobs(f.g,'blademaster_wave').length,0);
});
test('wave attack event can consume critical, burn damage is not a weapon event',()=>{
 const f=fixture();skills(f.a,['A1QG','A1QE']);f.cast('A1QG',{x:f.p.x+1,y:f.p.y});f.at(10.03);assert.equal(f.a.skillSpecs.some(s=>s.id==='A1QE'),false);skills(f.a,['A1QE']);f.a.status.blademasterCriticalTimer=false;f.at(11.03);assert.ok(f.a.skillSpecs.some(s=>s.id==='A1QE'));
});
test('wave and burn respect magic immunity while still scheduling the per-target timer',()=>{
 const f=fixture();skills(f.a,['A1QG']);skills(f.t,['Amim']);f.cast('A1QG',f.p);f.at(10.03);near(f.t.hp,3200);assert.equal(jobs(f.g,'blademaster_burn').length,1);skills(f.t,[]);f.at(11.03);near(f.t.hp,3128);
});
test('burn keeps original target and source through death cleanup and JSON',()=>{
 const f=fixture();skills(f.a,['A1QG']);f.cast('A1QG',f.p);f.at(10.03);f.t.worldX+=50;const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),a=r.state.entities.find(e=>e.id===f.a.id);r._killUnit(a);r._clearDead();r.state.time=15.03;tickSourceScriptJobs(r);near(r.state.entities.find(e=>e.id===f.t.id).hp,2615);
});
test('clan checks persistent building ability at deployment, waits1s, same owner exact prototypes',()=>{
 const f=fixture();const peer=f.make('defender',[],50,0,'e00H'),wrong=f.make('defender',[],.2,0,'h03E'),other=f.make('defender',[],.3,0,'e00M');other.ownerId=1;initializeSourceClassCombat(f.g,{sourceRawcode:'n07U'},f.a);f.at(10.999);assert.equal(f.a.skillSpecs.length,0);f.at(11);assert.ok(f.a.skillSpecs.some(s=>s.id==='A1QI'));assert.ok(peer.skillSpecs.some(s=>s.id==='A1QI'));assert.equal(wrong.skillSpecs.length,0);assert.equal(other.skillSpecs.length,0);assert.equal(jobs(f.g,'blademaster_death').length,2);
});
test('clan multiple matching groups register once and aura buffs self only',()=>{
 const f=fixture();f.make('defender',[],.1,0,'e00H');f.make('defender',[],.2,0,'e00M');initializeSourceClassCombat(f.g,{sourceRawcode:'n07U'},f.a);f.at(11);assert.equal(jobs(f.g,'blademaster_death').length,3);near(sourceAuraEffects(f.g,f.a,[f.a]).damage,.3);const other=f.make('defender',[],.1);near(sourceAuraEffects(f.g,other,[f.a]).damage,0);
});
test('clan body ability alone cannot substitute for building or create independent listener',()=>{
 const f=fixture();skills(f.a,['A1QH','A1QI']);f.make('defender',[],.1,0,'e00H');initializeSourceClassCombat(f.g,{sourceRawcode:'h03E'},f.a);f.at(11);assert.equal(jobs(f.g,'blademaster_death').length,0);f.g._killUnit(f.a);near(f.t.hp,3200);
});
test('clan death listener runs despite disabled main death and force-kills a shielded chosen enemy',()=>{
 const f=fixture();f.make('defender',[],.1,0,'e00H');initializeSourceClassCombat(f.g,{sourceRawcode:'n07U'},f.a);f.at(11);skills(f.t,['A1D6']);f.g._sourceUnitDeathTriggerDepth=1;f.g._killUnit(f.a);assert.ok(f.t.hp<=0);assert.equal(f.a.status.blademasterDeathRegistered,undefined);
});
test('empty clan range falls back to killer without applying999999 damage',()=>{
 const f=fixture();f.make('defender',[],.1,0,'e00H');initializeSourceClassCombat(f.g,{sourceRawcode:'n07U'},f.a);f.at(11);f.t.worldX+=50;let calls=0;const hurt=f.g._hurt.bind(f.g);f.g._hurt=(...args)=>{if(args[1]===999999)calls++;return hurt(...args)};f.a.hp=1;f.hit(f.a,2,f.t);assert.ok(f.t.hp<=0);assert.equal(calls,0);
});
test('pause and save preserve storm jobs and consumed critical; sandbox reset clears listeners',()=>{
 const f=fixture();skills(f.a,['A1QD','A1QE']);f.a.status.blademasterKills=14;f.t.hp=1;f.hit(f.t,2,f.a,{spell:false});f.g.state.paused=true;f.g.tick(2);near(f.g.state.time,10);const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot())));assert.equal(jobs(r,'blademaster_storm').length,1);assert.equal(jobs(r,'blademaster_critical').length,1);r.command('sandboxReset');assert.equal(r.state.sourceSkillJobs.length,0);
});
test('source-only Samuro form deploys with clan registration without inventing a build menu',()=>{
 const g=new Game({mode:'sandbox',seed:32}),p=g.state.players[0];assert.equal(UNITS.some(u=>u.combatRawcode==='h0VQ'),false);p.buildings.push({id:'samuro-fixture',unitId:'v14_n07U',sourceRawcode:'n07U'});g._spawnDefender(UNIT_TEMPLATES.h0VQ,p,2,2,'samuro-fixture');const e=g.state.entities.find(e=>e.combatRawcode==='h0VQ');assert.ok(e);assert.equal(jobs(g,'blademaster_class').length,3);
});
test('source-only coverage exposes all eight abilities and explicitly unresolved acquisition',()=>{
 const c=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url))),f=c.sourceOnlyCombatForms.find(f=>f.combatRawcode==='h0VQ');assert.equal(f.status,'entry-unresolved');assert.equal(f.skills.abilities.length,8);assert.equal(f.skills.counts.partial,8);assert.equal(c.playerSkills.abilities.some(a=>a.rawcode==='A1QF'),false);
});
