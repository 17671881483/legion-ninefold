import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES,UNITS} from '../dist/data.js';
import {compileSkills,tickSourceSkills,tickSourceScriptJobs} from '../dist/skills.js';
import {livingBombSpellEffect} from '../dist/living-bomb-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const skills=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
const clone=x=>JSON.parse(JSON.stringify(x));
const ok=r=>assert.equal(r.ok,true,r.message);
function fixture(){
 const g=new Game({mode:'sandbox',seed:35});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;for(const k of g.state.kings){k.worldX=10000;k.worldY=10000;}
 const p=laneToWorld(0,3,6);
 const make=(side='monster',dx=.2,raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,userData:side==='defender'?1:5,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;skills(e,[]);g.state.entities.push(e);return e;};
 const a=make('defender',0,'h0JP'),t=make();skills(a,['A0IP']);
 const cast=(source=a,target=t)=>g.command('cast',{entityId:source.id,skillId:'A0IP',targetId:target.id,playerId:source.ownerId});
 const tick=time=>{g.state.time=time;tickSourceScriptJobs(g);};
 const jobs=()=>g.state.sourceSkillJobs.filter(j=>j.type==='living_bomb');
 const kill=(target=t,killer=a)=>{target.hp=1;g._hurt(target,2,killer,{spell:true,universal:true});};
 return {g,a,t,make,cast,tick,jobs,kill};
}
test('living bomb evidence matches exact JASS bytes and object data',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/living-bomb-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');assert.equal(createHash('sha256').update(raw).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.abilities.A0IP.Cool1,'2.0');assert.equal(p.abilities.A0IS.DataA1,undefined);assert.equal(p.abilities.A0IQ.DataA1,'5');assert.equal(p.units.h0JP.auto,'_');
});
test('manual command exposes600 range and consumes20 mana with2s cooldown,50percent haste debuff',()=>{
 const f=fixture(),ui=f.g.unitSkillStatus(f.a.id,0)[0];assert.equal(ui.id,'A0IP');assert.equal(ui.targetKind,'enemy');near(ui.range,2);ok(f.cast());near(f.a.mana,0);near(f.a.skillStates.A0IP.readyAt,12);near(f.t.hp,1000);assert.equal(f.t.status.livingBombCounter,7);const b=f.t.buffs.find(b=>b.key==='B04Y');near(b.haste,-.5);near(b.expiresAt,17);assert.equal(b.move,undefined);assert.equal(f.jobs().length,1);
});
test('rejected target, range, immunity, resource and cooldown requests create no extra timer',()=>{
 for(const mode of ['range','friend','immune','invulnerable','locust','hidden','stun','mana','cooldown']){const f=fixture();if(mode==='range')f.t.worldX=f.a.worldX+2.01;if(mode==='friend')f.t.side=f.a.side;if(mode==='immune')skills(f.t,['Amim']);if(mode==='invulnerable')skills(f.t,['Avul']);if(mode==='locust')skills(f.t,['Aloc']);if(mode==='hidden')f.t.status.sourceHidden=true;if(mode==='stun')f.a.status.stunUntil=11;if(mode==='mana')f.a.mana=19;if(mode==='cooldown')f.a.skillStates.A0IP.readyAt=11;const mana=f.a.mana;assert.equal(f.cast().ok,false,mode);near(f.a.mana,mana);assert.equal(f.jobs().length,0);}
});
test('no source auto-slow entry is invented by proximity ticks',()=>{
 const f=fixture();tickSourceSkills(f.g,f.a,f.g.state.entities,1);assert.equal(f.jobs().length,0);near(f.a.mana,20);assert.equal(f.t.buffs.length,0);
});
test('seven callbacks use current maximum HP and decrement before damage',()=>{
 const f=fixture();ok(f.cast());f.tick(10.999);near(f.t.hp,1000);f.tick(11);near(f.t.hp,950);assert.equal(f.t.status.livingBombCounter,6);f.t.maxHp=2000;f.tick(12);near(f.t.hp,850);f.tick(17);near(f.t.hp,350);assert.equal(f.t.status.livingBombCounter,0);assert.equal(f.jobs().length,0);assert.deepEqual(f.g.state.livingBombHandles,{});
});
test('dispel and source death do not stop the script timer or clear the bomb tag',()=>{
 const f=fixture();ok(f.cast());f.t.buffs=[];f.g._killUnit(f.a);f.g._clearDead();assert.equal(f.g.state.entities.includes(f.a),false);f.tick(11);near(f.t.hp,950);assert.equal(f.t.status.livingBombCounter,6);f.tick(17);near(f.t.hp,650);assert.equal(f.jobs().length,0);
});
test('target corpse still consumes ticks after cleanup; no repeated death explosion',()=>{
 const f=fixture();ok(f.cast());f.kill();const explosion=f.t.status.livingBombExplosion;assert.ok(explosion);f.g._clearDead();f.tick(17);assert.equal(f.t.status.livingBombCounter,0);assert.equal(f.t.status.livingBombExplosion,explosion);assert.equal(f.jobs().length,0);
});
test('last periodic hit sees zero tag and allows Tauren resurrection instead of exploding',()=>{
 const f=fixture();f.t.combatRawcode='h0NE';skills(f.t,['A0N6']);ok(f.cast());f.tick(16);near(f.t.hp,700);f.t.hp=50;f.tick(17);assert.equal(f.t.status.livingBombCounter,0);assert.equal(f.t.status.livingBombExplosion,undefined);assert.equal(f.g.state.entities.filter(e=>e.status.taurenSpirit).length,1);
});
test('earlier lethal periodic hit sees nonzero tag and suppresses Tauren resurrection',()=>{
 const f=fixture();f.t.combatRawcode='h0NE';skills(f.t,['A0N6']);ok(f.cast());f.t.hp=50;f.tick(11);assert.ok(f.t.status.livingBombExplosion);assert.equal(f.t.status.livingBombExplosion.counter,6);assert.equal(f.g.state.entities.some(e=>e.status.taurenSpirit),false);
});
test('two simultaneous applications share7; one stops at0 and the other runs negative',()=>{
 const f=fixture();livingBombSpellEffect(f.g,f.a,f.t);livingBombSpellEffect(f.g,f.a,f.t);f.tick(14);near(f.t.hp,600);assert.equal(f.t.status.livingBombCounter,-1);assert.equal(f.jobs().length,1);assert.equal(f.jobs()[0].ticks,4);f.tick(17);near(f.t.hp,450);assert.equal(f.t.status.livingBombCounter,-4);assert.equal(f.jobs().length,1);
});
test('timer interleaving matches small steps when catching up a large frame',()=>{
 const run=large=>{const f=fixture();livingBombSpellEffect(f.g,f.a,f.t);livingBombSpellEffect(f.g,f.a,f.t);if(large)f.tick(17);else for(let n=11;n<=17;n++)f.tick(n);return [f.t.hp,f.t.status.livingBombCounter,f.jobs().map(j=>[j.nextAt,j.ticks])];};assert.deepEqual(run(true),run(false));
});
test('reapplication resets shared counter without cancelling older timers or stacking native haste',()=>{
 const f=fixture();ok(f.cast());f.tick(12);assert.equal(f.t.status.livingBombCounter,5);f.a.mana=20;ok(f.cast());assert.equal(f.jobs().length,2);assert.equal(f.t.status.livingBombCounter,7);assert.equal(f.t.buffs.filter(b=>b.key==='B04Y').length,1);f.tick(13);near(f.t.hp,800);assert.equal(f.t.status.livingBombCounter,5);
});
test('native buff and spending still happen when shared spell-effect trigger is disabled',()=>{
 const f=fixture();f.g._sourceAbilityEffectDepth=1;ok(f.cast());near(f.a.mana,0);assert.equal(f.t.buffs[0].key,'B04Y');assert.equal(f.jobs().length,0);assert.equal(f.t.status.livingBombCounter,undefined);assert.equal(f.a.status.livingBombCast.scriptApplied,false);
});
test('periodic universal damage ignores acquired spell immunity/armor, invulnerability still blocks',()=>{
 const f=fixture();ok(f.cast());skills(f.t,['Amim','A19A']);f.t.armor=999;f.tick(11);near(f.t.hp,950);skills(f.t,['Avul']);f.tick(12);near(f.t.hp,950);assert.equal(f.t.status.livingBombCounter,5);
});
test('explosion picks enemies of actual killer, not the original bomber, and uses dead target as damage source',()=>{
 const f=fixture(),friend=f.make('defender',.4),killer=f.make('monster',.5);ok(f.cast());const seen=[],hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,s,o)=>{if(n===150)seen.push([t.id,s.id]);return hurt(t,n,s,o);};f.kill(f.t,killer);near(f.a.hp,850);near(friend.hp,850);near(killer.hp,1000);assert.ok(seen.length>=2&&seen.every(([,sourceId])=>sourceId===f.t.id));assert.equal(f.t.status.livingBombExplosion.dummy.ownerId,killer.ownerId);
});
test('450 range includes edge, and explosive damage reaches mechanical and magic immune targets',()=>{
 const f=fixture(),edge=f.make('monster',1.7),out=f.make('monster',1.701),immune=f.make('monster',.5),machine=f.make('monster',.4),inv=f.make('monster',.6);skills(immune,['Amim']);skills(inv,['Avul']);machine.traits=['mechanical'];ok(f.cast());f.kill();near(edge.hp,850);near(out.hp,1000);near(immune.hp,850);near(machine.hp,850);near(inv.hp,1000);assert.ok(f.t.status.livingBombExplosion.enumeratedIds.includes(inv.id));
});
test('all dummy orders share one handle and remain requests rather than guaranteed area stun/armor',()=>{
 const f=fixture(),a=f.make(),b=f.make();ok(f.cast());f.kill();const r=f.t.status.livingBombExplosion;assert.deepEqual(r.requests.map(q=>q.order),['thunderbolt','faeriefire','thunderbolt','faeriefire','thunderbolt','faeriefire']);assert.ok(r.requests.every(q=>q.dummyId===r.dummy.id&&q.outcome==='native-unresolved'));assert.equal(r.lastOrder.order,'faeriefire');near(r.dummy.removeAt,11);near(r.dummy.timedLifeAt,12);for(const t of [a,b]){assert.equal(t.status.stunUntil,undefined);assert.equal(t.buffs.some(b=>b.armor===-5),false);near(t.hp,850);}
});
test('fire, Skeleton King and empty h0PC branches take priority over bomb',()=>{
 for(const type of ['fire','skeleton','h0PC']){const f=fixture();ok(f.cast());if(type==='fire')skills(f.a,['A0HW']);if(type==='skeleton'){f.t.combatRawcode='h0JJ';skills(f.t,['A0IA']);}if(type==='h0PC')f.t.combatRawcode='h0PC';f.kill();assert.equal(f.t.status.livingBombExplosion,undefined);if(type==='skeleton')assert.ok(f.g.state.sourceSkillJobs.some(j=>j.type==='skeleton_king_revive'));}
});
test('negative bomb tag still selects death branch and nested deaths do not reenter it',()=>{
 const f=fixture(),next=f.make();f.t.status.livingBombCounter=-1;next.status.livingBombCounter=7;next.hp=100;skills(next,['A0N6']);next.combatRawcode='h0NE';f.kill();assert.ok(f.t.status.livingBombExplosion);assert.ok(next.hp<=0);assert.equal(next.status.livingBombExplosion,undefined);assert.equal(f.g.state.entities.some(e=>e.status.taurenSpirit),false);
});
test('Ju/death suppression skips bomb; null killer selects branch but records unresolved ownership',()=>{
 for(const mode of ['Ju','depth','null']){const f=fixture();f.t.status.livingBombCounter=7;skills(f.t,['A0N6']);f.t.combatRawcode='h0NE';if(mode==='Ju')f.t.status.sourceJuMember=true;if(mode==='depth')f.g._sourceUnitDeathTriggerDepth=1;f.g._killUnit(f.t);if(mode==='null')assert.equal(f.t.status.livingBombExplosion.boundary,'null-killer-owner-unresolved');else assert.equal(f.t.status.livingBombExplosion,undefined);assert.equal(f.g.state.entities.some(e=>e.status.taurenSpirit),false);}
});
test('explicit removed handles stop with a boundary; ordinary corpses are distinct',()=>{
 const f=fixture();ok(f.cast());const job=f.jobs()[0];f.a.status.sourceRemoved=true;f.tick(11);assert.equal(job.boundary,'native-removed-handle-unresolved');assert.equal(f.jobs().length,0);near(f.t.hp,1000);assert.equal(f.t.status.livingBombCounter,7);
});
test('pause and JSON restoration rebind shared target handles across overlapping timers and corpse cleanup',()=>{
 const f=fixture();livingBombSpellEffect(f.g,f.a,f.t);livingBombSpellEffect(f.g,f.a,f.t);f.tick(12);f.g.state.paused=true;f.g.tick(9);near(f.g.state.time,12);const g=Game.fromSnapshot(clone(f.g.snapshot())),t=g.state.entities.find(e=>e.id===f.t.id),a=g.state.entities.find(e=>e.id===f.a.id);assert.equal(g.state.livingBombHandles[t.id],t);g._killUnit(a);g._clearDead();g.state.time=14;tickSourceScriptJobs(g);near(t.hp,600);assert.equal(t.status.livingBombCounter,-1);assert.equal(g.state.sourceSkillJobs.filter(j=>j.type==='living_bomb').length,1);
});
test('continuous waves preserve live bomb handles/jobs; sandbox reset clears them',()=>{
 const f=fixture();ok(f.cast());f.g.state.mode='normal';f.g.state.wave=31;const job=f.jobs()[0];f.g._advanceContinuous();assert.equal(f.g.state.wave,32);assert.ok(f.jobs().includes(job));assert.equal(f.g.state.livingBombHandles[f.t.id],f.t);f.tick(11);near(f.t.hp,950);f.g.state.mode='sandbox';ok(f.g.command('sandboxReset'));assert.equal(f.jobs().length,0);assert.deepEqual(f.g.state.livingBombHandles,{});
});
test('v34 old native-only buff is not mistaken for evidence of an active script timer',()=>{
 const f=fixture();f.a.skillImplementationRevision='v14-content-20261029-v34-1';Object.assign(f.a.skillSpecs[0],{kind:'debuff',status:'implemented'});f.t.buffs=[{key:'B04Y',haste:-.5,expiresAt:17}];f.a.mana=0;const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id),t=g.state.entities.find(e=>e.id===f.t.id);assert.equal(a.skillSpecs[0].kind,'living_bomb_source');near(a.mana,0);g.state.time=11;tickSourceScriptJobs(g);near(t.hp,1000);assert.equal(g.state.sourceSkillJobs.length,0);assert.equal(t.buffs[0].haste,-.5);
});
test('ordinary combat steps execute all seven timed hits after one manual command',()=>{
 const f=fixture();ok(f.cast());f.a.moveSpeed=f.t.moveSpeed=0;f.g._aiAct=()=>{};for(let i=0;i<141;i++)f.g.tick(.05);near(f.t.hp,650);assert.equal(f.t.status.livingBombCounter,0);assert.equal(f.jobs().length,0);assert.equal(f.t.buffs.some(b=>b.key==='B04Y'),false);assert.ok(Number.isFinite(f.g.state.time));
});
test('real Skeleton Warlock upgrade remains gated and deployed unit exposes manual bomb',()=>{
 const g=new Game({mode:'sandbox',builderId:'v14_builder_u002',seed:35}),p=g.state.players[0];p.populationCap=300;const finish=()=>ok(g.command('sandboxComplete'));
 ok(g.command('build',{unitId:'v14_h01P',col:0,row:0}));finish();const b=p.buildings[0];ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_h01S'}));finish();assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_h0JQ'}).ok,false);
 ok(g.command('build',{unitId:'v14_h0DB',col:1,row:0}));finish();const altar=p.buildings[1];let u=UNITS.find(u=>u.id==='v14_h0DY');for(;;){ok(g.command('upgrade',{buildingId:altar.id,unitId:u.id}));finish();if(u.id==='v14_h0E8')break;u=UNITS.find(v=>v.id===u.upgrades[0]);assert.ok(u);}
 ok(g.command('sandboxBuilder',{builderId:'v14_builder_u00L'}));ok(g.command('build',{unitId:'v14_h08V',col:2,row:0}));finish();ok(g.command('upgrade',{buildingId:p.buildings[2].id,unitId:'v14_h08Y'}));finish();assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_h0JQ'}).ok,false);ok(g.command('sandboxQualification',{key:'h210',enabled:true}));ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_h0JQ'}));finish();ok(g.command('ready'));
 const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0JP');assert.ok(g.unitSkillStatus(e.id,0).some(s=>s.id==='A0IP'));const t=g._entity(UNIT_TEMPLATES.h03E,{ownerId:4,side:'monster',battleTeam:e.battleTeam,worldX:e.worldX+.2,worldY:e.worldY});g.state.entities.push(t);ok(g.command('cast',{entityId:e.id,skillId:'A0IP',targetId:t.id}));assert.equal(t.status.livingBombCounter,7);ok(g.command('sandboxReset'));assert.deepEqual(g.state.livingBombHandles,{});
});
