import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,describeSkills,tickSourceScriptJobs,sourceAuraEffects,manualSourceSkills,castManualSourceSkill} from '../dist/skills.js';
import {malfurionNativeBlink} from '../dist/malfurion-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const skills=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type);
function fixture(){
 const g=new Game({mode:'sandbox',seed:30});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;for(const k of g.state.kings){k.worldX=10000;k.worldY=10000;}
 const p=laneToWorld(0,3,6);
 const make=(code='h03E',side='monster',ids=[],dx=0)=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,userData:side==='defender'?1:5,worldX:p.x+dx,worldY:p.y});skills(e,ids);e.hp=e.maxHp=3200;e.mana=e.maxMana=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;g.state.entities.push(e);return e;};
 const a=make('h0JU','defender',['A0JA']),t=make();
 const hit=(target=t,amount=50,source=a,options={spell:true,universal:true})=>g._hurt(target,amount,source,options);
 const at=n=>{g.state.time=n;tickSourceScriptJobs(g);};
 return {g,a,t,make,hit,at,p};
}
test('JASS source evidence is byte-pinned and contradicts lethal immunity and random-periodic tooltip',()=>{
 const proof=JSON.parse(readFileSync(new URL('../reference/malfurion-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');assert.equal(createHash('sha256').update(raw).digest('hex'),proof.source.sha256);for(const e of proof.sourceEvidence)assert.equal(lines[e.line-1].replace(/\r$/,''),e.text);assert.match(lines[41365],/GetUnitLifePercent\(i\)<=10/);assert.match(lines[41378],/225,true,false,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_NORMAL/);
});
test('positive spell damage queues a fixed-location burst at 0.9 seconds, not a current-target or periodic cast',()=>{
 const f=fixture();f.hit();assert.equal(jobs(f.g,'malfurion_starfire').length,1);f.at(10.899);near(f.t.hp,3150);const other=f.make('h03E','monster',[],.1);f.t.worldX+=20;f.at(10.9);near(f.t.hp,3150);near(other.hp,2900);near(other.status.stunUntil,13.4);f.at(17);assert.equal(jobs(f.g,'malfurion_starfire').length,0);
});
test('starfire is bound to A0JA rather than rawcode or the A0JB marker',()=>{
 const f=fixture();skills(f.a,['A0JB']);f.hit();assert.equal(jobs(f.g,'malfurion_starfire').length,0);skills(f.a,['A0JA']);f.a.combatRawcode='h03E';f.hit();assert.equal(jobs(f.g,'malfurion_starfire').length,1);
});
test('eight-second source cooldown is independent of native heal cooldown and does not queue every hit',()=>{
 const f=fixture();f.a.skillStates.A0JA={readyAt:999,casts:1};f.hit();f.hit();assert.equal(jobs(f.g,'malfurion_starfire').length,1);f.at(17.999);f.hit();assert.equal(jobs(f.g,'malfurion_starfire').length,0);f.at(18);f.hit();assert.equal(jobs(f.g,'malfurion_starfire').length,1);near(jobs(f.g,'malfurion_starfire')[0].at,18.9);near(f.a.skillStates.A0JA.readyAt,999);
});
test('delayed starfire retains a dead source handle through cleanup and JSON restoration',()=>{
 const f=fixture();f.hit();f.g._killUnit(f.a);f.g._clearDead();const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot())));r.state.time=10.9;tickSourceScriptJobs(r);near(r.state.entities.find(e=>e.id===f.t.id).hp,2850);const d=jobs(r,'malfurion_dummy')[0].dummy;assert.equal(d.ownerId,f.a.ownerId);assert.equal(d.isSummon,true);assert.deepEqual(d.sourceGroups,['JW','JH']);assert.equal(d.userData,1);
});
test('explicit RemoveUnit does not masquerade as a retained corpse',()=>{
 const f=fixture();f.hit();f.a.status.sourceRemoved=true;f.at(10.9);near(f.t.hp,3150);assert.equal(jobs(f.g,'malfurion_dummy').length,0);
});
test('late callbacks use scheduled time and expire their one-second dummy during the same catch-up',()=>{
 const f=fixture();f.hit();f.at(20);near(f.t.hp,2850);near(f.t.status.stunUntil,13.4);near(f.g.state.time,20);assert.equal(f.a.status.malfurionStarfireCooldown,undefined);assert.equal(jobs(f.g,'malfurion_dummy').length,0);
});
test('starfire radius is 200, magic immunity rejects it, hero control lasts one second',()=>{
 for(const mode of ['edge','outside','immune','hero','ally','dead']){const f=fixture();f.hit();if(mode==='edge')f.t.worldX+=200/300;if(mode==='outside')f.t.worldX+=201/300;if(mode==='immune')skills(f.t,['Amim']);if(mode==='hero')f.t.isNativeHero=true;if(mode==='ally')f.t.side=f.a.side;if(mode==='dead')f.t.hp=0;const before=f.t.hp;f.at(10.9);const hits=['edge','hero'].includes(mode);near(f.t.hp,hits?before-300:before);if(hits)near(f.t.status.stunUntil,mode==='hero'?11.9:13.4);}
});
test('main event guards and Huskar branch precedence suppress starfire',()=>{
 for(const mode of ['zero','allied','self','null','A2Y7','nested','berserk','unyielding']){const f=fixture();if(mode==='allied')f.a.side=f.t.side;if(mode==='A2Y7')skills(f.a,['A0JA','A2Y7']);if(mode==='nested')f.g._sourceDamageTriggerDepth=1;if(mode==='berserk')skills(f.t,['A0II']);if(mode==='unyielding'){skills(f.t,['A0IE']);f.t.hp=10;}f.hit(f.t,mode==='zero'?0:50,mode==='null'?null:mode==='self'?f.t:f.a);assert.equal(jobs(f.g,'malfurion_starfire').length,0,mode);}
});
test('earlier separate elemental chain does not suppress the second damage chain',()=>{
 const f=fixture();skills(f.a,['A0JA','A0HX']);f.g._random=()=>0;f.hit();assert.equal(jobs(f.g,'malfurion_starfire').length,1);
});
test('twilight uses pre-damage <=10% life, not lethal prediction, and leaves the original event intact',()=>{
 for(const hp of [321,320]){const f=fixture();f.a.hp=hp;f.hit(f.a,100,f.t);assert.equal(!!f.a.status.malfurionTwilightUsed,hp===320);near(f.a.hp,hp===320?420:221);}
 const f=fixture();f.a.hp=1000;f.hit(f.a,2000,f.t);assert.ok(f.a.hp<=0);assert.equal(f.a.status.malfurionTwilightUsed,undefined);
});
test('twilight does not require its building marker and occurs once per original unit',()=>{
 const f=fixture();f.a.hp=320;f.hit(f.a,10,f.t);assert.equal(f.a.skillSpecs.some(s=>s.id==='A0JE'),false);assert.equal(jobs(f.g,'malfurion_aura').length,1);f.a.hp=100;f.hit(f.a,10,f.t);near(f.a.hp,90);assert.equal(jobs(f.g,'malfurion_aura').length,1);
});
test('outgoing ready starfire branch wins over victim twilight; busy source can fall through',()=>{
 const f=fixture();skills(f.t,['A0JA']);f.t.hp=320;f.hit();assert.equal(f.t.status.malfurionTwilightUsed,undefined);f.hit();assert.equal(f.t.status.malfurionTwilightUsed,true);
});
test('twilight unfiltered damage includes allies while its own temporary Avul prevents self damage',()=>{
 const f=fixture(),ally=f.make('h03E','defender',[],.2),out=f.make('h03E','defender',[],401/300);f.a.hp=320;f.hit(f.a,50,f.t);near(f.a.hp,470);near(ally.hp,2975);near(f.t.hp,2975);near(out.hp,3200);assert.equal(f.a.skillSpecs.some(s=>s.id==='Avul'),false);
});
test('twilight damage is a weapon event with spells/normal armor rules, not universal holy damage',()=>{
 const f=fixture();f.a.hp=320;f.t.armor=10;let options;const hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,a,o)=>{if(t===f.t)options=o;return hurt(t,n,a,o);};f.hit(f.a,50,f.t);near(f.t.hp,3200-225*f.g._armorFactor(10));assert.equal(options.weapon,true);assert.equal(options.attackType,'spells');assert.equal(options.nativeDamageType,'normal');assert.equal(options.universal,false);
});
test('twilight enumerates once and records every haze request without inventing zero cooldown or movement slow',()=>{
 const f=fixture(),ally=f.make('h03E','defender',[],.2);f.a.hp=320;f.hit(f.a,50,f.t);const j=jobs(f.g,'malfurion_dummy')[0];assert.equal(j.dummy.isSummon,false);assert.equal(j.dummy.lifeRequest,10000);assert.deepEqual(j.dummy.status.orderRequests.map(r=>r.targetId),[f.a.id,f.t.id,ally.id]);assert.equal(f.t.buffs.some(b=>b.move===-8),false);assert.equal(f.a.status.malfurionBlinkRequest.applied,false);assert.equal(f.a.facing,90);
});
test('native blink source program has a broad no-movement band and exact inclusive thresholds',()=>{
 for(const [y,expected]of[[1889,2339],[1890,1890],[2500,2500],[3742,3742],[3743,3293]])assert.equal(malfurionNativeBlink(y).finalY,expected);
});
test('manual tranquility validates target range health mana cooldown and player-visible entry',()=>{
 const f=fixture();f.a.hp=3000;const m=manualSourceSkills(f.g,f.a).find(s=>s.id==='A0JA');assert.equal(m.targetKind,'unit');assert.equal(m.manaCost,28);assert.equal(m.cooldown,14);assert.equal(m.cooldownMode,'shared_native');
 assert.equal(castManualSourceSkill(f.g,f.a,'A0JA',{target:f.t}).ok,false);const result=castManualSourceSkill(f.g,f.a,'A0JA',{target:f.a});assert.equal(result.ok,true);near(f.a.mana,72);near(f.a.hp,3000);near(f.a.skillStates.A0JA.readyAt,24);assert.equal(castManualSourceSkill(f.g,f.a,'A0JA',{target:f.a}).ok,false);assert.equal(jobs(f.g,'malfurion_aura').length,1);
});
test('rejected manual conditions consume no mana or cooldown',()=>{
 for(const mode of ['full','dead','mana','range','stun','mechanical-target-immunity']){const f=fixture(),t=f.make('h03E','defender',[],.1);t.hp=2000;if(mode==='full')t.hp=t.maxHp;if(mode==='dead')f.a.hp=0;if(mode==='mana')f.a.mana=27;if(mode==='range')t.worldX+=3;if(mode==='stun')f.a.status.stunUntil=11;if(mode==='mechanical-target-immunity')skills(t,['Amim']);const before=f.a.mana;assert.equal(castManualSourceSkill(f.g,f.a,'A0JA',{target:t}).ok,false,mode);near(f.a.mana,before);assert.equal(jobs(f.g,'malfurion_aura').length,0);}
});
test('normal tranquility creates a fixed six-second aura, cancels order and survives caster death',()=>{
 const f=fixture();f.a.hp=3000;f.a.pendingAttack={targetId:f.t.id};f.a.targetId=f.t.id;f.a.chase={};castManualSourceSkill(f.g,f.a,'A0JA',{target:f.a});assert.equal(f.a.pendingAttack,null);assert.equal(f.a.targetId,null);assert.equal(f.a.chase,null);const other=f.make('h03E','defender',[],.3);f.g._killUnit(f.a);f.g._clearDead();near(sourceAuraEffects(f.g,other,[]).healRate,128);near(sourceAuraEffects(f.g,other,[]).armor,2);f.at(16);near(sourceAuraEffects(f.g,other,[]).healRate,0);assert.equal(jobs(f.g,'malfurion_aura').length,0);
});
test('five-second free aura and six-second paid aura overlap without stacking or sharing cooldown',()=>{
 const f=fixture();f.a.hp=3000;castManualSourceSkill(f.g,f.a,'A0JA',{target:f.a});f.a.hp=320;f.hit(f.a,1,f.t);assert.equal(jobs(f.g,'malfurion_aura').length,2);near(f.a.mana,72);near(f.a.skillStates.A0JA.readyAt,24);near(sourceAuraEffects(f.g,f.a,[]).healRate,128);near(sourceAuraEffects(f.g,f.a,[]).armor,2);f.at(15);assert.equal(jobs(f.g,'malfurion_aura').length,1);near(sourceAuraEffects(f.g,f.a,[]).armor,2);f.at(16);near(sourceAuraEffects(f.g,f.a,[]).armor,0);
});
test('aura follows friendship/range and remains inside the host battle',()=>{
 const f=fixture();f.a.hp=3000;castManualSourceSkill(f.g,f.a,'A0JA',{target:f.a});near(sourceAuraEffects(f.g,f.t,[]).healRate,0);const edge=f.make('h03E','defender',[],500/300);near(sourceAuraEffects(f.g,edge,[]).healRate,128);edge.worldX+=.001;near(sourceAuraEffects(f.g,edge,[]).healRate,0);edge.worldX=f.a.worldX;edge.battleTeam=1;near(sourceAuraEffects(f.g,edge,[]).healRate,0);
});
test('spell-effect listener suppression does not refund the native cast or add a free aura',()=>{
 const f=fixture();f.a.hp=3000;f.g._sourceAbilityEffectDepth=1;assert.equal(castManualSourceSkill(f.g,f.a,'A0JA',{target:f.a}).ok,true);near(f.a.mana,72);assert.equal(jobs(f.g,'malfurion_aura').length,0);assert.equal(f.g._sourceAbilityEffectDepth,1);
});
test('JSON preserves independent timers, fixed aura and once-only twilight flag',()=>{
 const f=fixture();f.a.hp=3000;castManualSourceSkill(f.g,f.a,'A0JA',{target:f.a});f.hit();f.a.hp=320;f.hit(f.a,1,f.t);const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),a=r.state.entities.find(e=>e.id===f.a.id);assert.equal(a.status.malfurionTwilightUsed,true);r.state.time=10.9;tickSourceScriptJobs(r);f.at(10.9);assert.deepEqual(r.state.entities.map(e=>e.hp),f.g.state.entities.map(e=>e.hp));near(sourceAuraEffects(r,a,[]).healRate,128);r.command('sandboxReset');assert.equal(jobs(r,'malfurion_aura').length,0);
});
test('real build and deployment carry A0JA/A0JB while twilight stays a rawcode description',()=>{
 const g=new Game({mode:'sandbox',seed:30}),p=g.state.players[0],u=UNITS.find(u=>u.combatRawcode==='h0JU');p.roster=[u.id];p.technologies.R010=1;p.entitlements.h230=1;assert.equal(g.command('build',{unitId:u.id,col:2,row:2}).ok,true);assert.equal(g.command('ready').ok,true);const a=g.state.entities.find(e=>e.combatRawcode==='h0JU');assert.ok(a);assert.equal(a.skillSpecs.some(s=>s.id==='A0JE'),false);assert.ok(describeSkills(a).some(s=>s.id==='trigger:h0JU'));assert.equal(manualSourceSkills(g,a).find(s=>s.id==='A0JA').reason,'魔法不足');
});
test('coverage keeps all seven capabilities partial and records dummy and display-only abilities',()=>{
 const c=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url)));for(const id of ['A0JA','A0JB','A0JE','A0J8','A0J9','A0JC','A0JD'])assert.equal(c.playerSkills.abilities.find(a=>a.rawcode===id).status,'partial',id);assert.ok(c.playerRuntimeAbilities.find(a=>a.sourceRawcode==='e008').abilityIds.includes('A0JC'));assert.ok(c.unitScriptBindings.some(b=>b.combatRawcode==='h0JU'&&b.requiredAbility==='A0JA'));
});

test('real engine healing consumes the virtual aura without requiring an ordinary aura carrier',()=>{
 const f=fixture();f.a.hp=2000;castManualSourceSkill(f.g,f.a,'A0JA',{target:f.a});f.g._applyHealingAura(f.a,[],.5);near(f.a.hp,2064);f.at(16);f.g._applyHealingAura(f.a,[],1);near(f.a.hp,2064);
});
test('pause freezes timers and continuous transition retains the pending starfire callback',()=>{
 const f=fixture();f.hit();f.g.state.paused=true;f.g.tick(2);near(f.g.state.time,10);near(f.t.hp,3150);f.g.state.paused=false;f.g.state.mode='normal';f.g.state.wave=31;f.g._advanceContinuous();assert.equal(jobs(f.g,'malfurion_starfire').length,1);f.at(10.9);near(f.t.hp,2850);assert.equal(jobs(f.g,'malfurion_starfire').length,0);
});
