import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES,UNITS} from '../dist/data.js';
import {compileSkills,castManualSourceSkill,manualSourceSkills,tickSourceScriptJobs,beforeSourceDamage,sourceDeath,initializeSourceClassCombat} from '../dist/skills.js';
import {laneToWorld} from '../dist/layout.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message);
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A1SB','A1SC']){
 const g=new Game({mode:'sandbox',seed:55});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};g._sourceDamageTriggerDepth=1;for(const p of g.state.players)p.eggHistory.firstWaveClosed=true;for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const p=laneToWorld(0,3,6),make=(dx=.5,side='monster',code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{side,ownerId:side==='defender'?0:4,sourceNativeOwnerId:side==='defender'?8:9,userData:side==='defender'?1:5,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=10000;e.mana=e.maxMana=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0VX'),t=make();skills(a,ids);
 return {g,a,t,p,make,cast:(id,target=t)=>castManualSourceSkill(g,a,id,{target}),at:n=>{g.state.time=n;tickSourceScriptJobs(g);},kill:e=>g._killUnit(e)};
}
function circleVictim(f){const e=f.make(1+Math.cos(Math.PI/18));e.worldY=f.p.y+Math.sin(Math.PI/18);return e;}

test('source evidence fixes swapped spell binding, timer formulas and native dummy fields',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/phoenix-active-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.units.e01G.regenHP,'-1.0');assert.equal(p.units.e01G.weapsOn,undefined);assert.equal(p.abilities.A1SB.Cost1,'10');
});
test('manual casts expose enemy targets, explicit prices and shared cooldowns',()=>{
 const f=fixture();assert.deepEqual(manualSourceSkills(f.g,f.a).map(s=>[s.id,s.targetKind,s.manaCost,s.cooldown]),[['A1SB','enemy',10,13],['A1SC','enemy',15,18]]);ok(f.cast('A1SC'));near(f.a.mana,985);near(f.a.skillStates.A1SC.readyAt,28);assert.equal(f.cast('A1SC').ok,false);ok(f.cast('A1SB'));near(f.a.mana,975);near(f.a.skillStates.A1SB.readyAt,23);assert.equal(f.a.status.sourcePaused,true);
});
test('invalid target range mana ability and controls fail without spending or queueing',()=>{
 for(const mode of ['range','mana','zero','silence','pause','dead','ally','invulnerable','immune']){const f=fixture();if(mode==='range')f.t.worldX+=5;if(mode==='mana')f.a.mana=9;if(mode==='zero')f.a.abilityLevels={A1SB:0};if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='pause')f.a.status.sourcePaused=true;if(mode==='dead')f.a.hp=0;if(mode==='ally')f.t.side=f.a.side;if(mode==='invulnerable')skills(f.t,['Avul']);if(mode==='immune')skills(f.t,['Amim']);const mana=f.a.mana;assert.equal(f.cast('A1SB').ok,false,mode);near(f.a.mana,mana);assert.equal(f.g.state.sourceSkillJobs.length,0);}
});
test('automatic phoenix orders prefer damaged unit and do not fall back on failed preferred order',()=>{
 const f=fixture(['A1SC']);skills(f.t,['A1SC']);f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a,{spell:true});assert.equal(f.t.skillStates.A1SC.casts,1);assert.equal(f.a.skillStates.A1SC.casts,0);
 const z=fixture(['A1SC']);skills(z.t,['A1SC']);z.t.mana=0;z.g._sourceDamageTriggerDepth=0;beforeSourceDamage(z.g,z.t,1,z.a);assert.equal(z.a.skillStates.A1SC.casts,0);assert.equal(z.t.status.phoenixOrderA1SC.outcome,'failed');
});
test('attacker fallback and zero ally A2Y7 guards match the main damage script',()=>{
 const f=fixture(['A1SC']);f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a,{spell:true});assert.equal(f.a.skillStates.A1SC.casts,1);
 for(const mode of ['zero','ally','A2Y7','suppressed']){const z=fixture(['A1SC',...(mode==='A2Y7'?['A2Y7']:[])]);z.g._sourceDamageTriggerDepth=mode==='suppressed'?1:0;if(mode==='ally')z.t.side=z.a.side;beforeSourceDamage(z.g,z.t,mode==='zero'?0:1,z.a);assert.equal(z.a.skillStates.A1SC.casts,0,mode);}
});
test('same-frame SB pause prevents SC adapter and does not charge its mana',()=>{
 const f=fixture();f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);assert.equal(f.a.skillStates.A1SB.casts,1);assert.equal(f.a.skillStates.A1SC.casts,0);assert.equal(f.a.status.phoenixOrderA1SC.outcome,'failed');near(f.a.mana,990);
});
test('circle first step is10degrees at0.02 with center forward and minimum300 radius',()=>{
 const f=fixture();ok(f.cast('A1SB'));f.t.worldX=100;f.at(10);near(f.a.worldX,f.p.x);f.at(10.02);near(f.a.worldX,f.p.x+1+Math.cos(Math.PI/18));near(f.a.worldY,f.p.y+Math.sin(Math.PI/18));near(f.a.facing,-80);assert.equal(jobs(f.g,'phoenix_circle')[0].steps,1);
});
test('circle ends before360 with35moves and restores vertex pathing and pause',()=>{
 const f=fixture();ok(f.cast('A1SB'));f.t.worldX=100;f.at(10.7);assert.equal(jobs(f.g,'phoenix_circle')[0].steps,35);f.at(10.72);assert.equal(jobs(f.g,'phoenix_circle').length,0);assert.equal(f.a.status.sourcePaused,false);assert.equal(f.a.status.phoenixVertexAlpha,255);assert.equal(f.a.status.phoenixPathingDisabled,false);near(f.a.status.phoenixCircleEnd.angle,360);near(f.a.worldX,f.p.x+1+Math.cos(350*Math.PI/180));
});
test('circle terrain and userData rectangle rejection clean up before moving or damaging',()=>{
 for(const mode of ['missing-user-data','outside']){const f=fixture(),v=circleVictim(f);if(mode==='missing-user-data')f.a.userData=0;else{f.a.worldX=7.5;f.t.worldX=8;}ok(f.cast('A1SB'));const x=f.a.worldX;f.at(10.02);near(f.a.worldX,x);near(v.hp,10000);assert.equal(f.a.status.phoenixCircleEnd.steps,0);assert.equal(f.a.status.sourcePaused,false);}
});
test('circle225range includes kings and magic immune enemies but excludes dead allies Avul',()=>{
 const f=fixture(),v=circleVictim(f),edge=f.make(v.worldX-f.p.x+.75),outside=f.make(v.worldX-f.p.x+.751),ally=f.make(v.worldX-f.p.x,'defender'),inv=f.make(v.worldX-f.p.x),dead=f.make(v.worldX-f.p.x),immune=f.make(v.worldX-f.p.x);for(const e of [edge,outside,ally,inv,dead,immune])e.worldY=v.worldY;skills(inv,['Avul']);dead.hp=0;skills(immune,['Amim']);const k=f.g.state.kings[0];k.side='monster';k.worldX=v.worldX;k.worldY=v.worldY;k.hp=k.maxHp=10000;ok(f.cast('A1SB'));f.t.worldX=100;f.at(10.02);for(const e of [v,edge,immune,k])near(e.hp,9925);for(const e of [outside,ally,inv])near(e.hp,10000);
});
test('each first hit produces one fixed burn zone of exactly seven delayed10damage ticks',()=>{
 const f=fixture(),v=circleVictim(f);ok(f.cast('A1SB'));f.t.worldX=100;f.at(10.7);near(v.hp,9925);assert.equal(jobs(f.g,'phoenix_burn').length,1);f.at(11.019);near(v.hp,9925);f.at(11.02);near(v.hp,9915);f.at(17.02);near(v.hp,9855);assert.equal(jobs(f.g,'phoenix_burn').length,0);
});
test('burn zones stay at impact coordinates and overlap without following their first victim',()=>{
 const f=fixture(),v=circleVictim(f),second=f.make(v.worldX-f.p.x+.1);second.worldY=v.worldY;ok(f.cast('A1SB'));f.t.worldX=100;f.at(10.02);assert.equal(jobs(f.g,'phoenix_burn').length,2);v.worldX+=10;f.at(11.02);near(v.hp,9925);near(second.hp,9905);
});
test('ordinary caster death stops circle but does not cancel already-created burn timers',()=>{
 const f=fixture(),v=circleVictim(f);ok(f.cast('A1SB'));f.t.worldX=100;f.at(10.02);f.kill(f.a);assert.equal(f.a.status.sourcePaused,false);f.at(11.02);near(v.hp,9915);assert.equal(jobs(f.g,'phoenix_circle').length,0);assert.equal(jobs(f.g,'phoenix_burn').length,1);
});
test('four actual e01G handles orbit outside army groups and preserve the blue model flag',()=>{
 const f=fixture();f.a.status.phoenixBlue=true;ok(f.cast('A1SC'));const j=jobs(f.g,'phoenix_orbit')[0];assert.equal(j.orbs.length,4);assert.equal(f.g.state.entities.length,2);for(const o of j.orbs){assert.equal(o.combatRawcode,'e01G');assert.equal(o.hp,60);assert.equal(o.userData,0);assert.equal(o.isSummon,false);assert.equal(o.sourceModelOverride,'firespirit_Blue01.mdx');assert.equal(o.status.phoenixNativeActionBoundary,true);}near(j.orbs[1].worldY,f.p.y+2/3);f.at(10.02);near(j.orbs[1].worldY,f.p.y+Math.sin(268.2*Math.PI/180)*2/3);near(j.orbs[0].status.phoenixScale,2.25);
});
test('integer-second dispatch uses evaluation count and excludes release frames from rotation',()=>{
 const f=fixture();ok(f.cast('A1SC'));f.at(10.98);const j=jobs(f.g,'phoenix_orbit')[0];assert.equal(j.evalCount,49);assert.equal(j.rotationTicks,49);f.at(11);assert.equal(j.evalCount,50);assert.equal(j.rotationTicks,49);assert.equal(j.orbs[0],null);assert.equal(jobs(f.g,'phoenix_feather').length,1);f.at(12);assert.equal(j.orbs.filter(Boolean).length,2);assert.equal(j.rotationTicks,98);
});
test('all four releases target the same original unit rather than random nearby enemies',()=>{
 const f=fixture();f.t.worldX=f.p.x+1.6;ok(f.cast('A1SC'));f.at(14);assert.equal(jobs(f.g,'phoenix_orbit').length,0);assert.equal(jobs(f.g,'phoenix_feather').length,4);assert.ok(jobs(f.g,'phoenix_feather').every(j=>j.targetId===f.t.id));
});
test('chase moves1codeunit per0.02 and damages once only after strict sub50 range',()=>{
 const f=fixture();ok(f.cast('A1SC'));f.at(11);const j=jobs(f.g,'phoenix_feather')[0];j.orb.worldX=f.t.worldX-51/300;j.orb.worldY=f.t.worldY;f.at(11.02);near(f.t.hp,10000);near(j.orb.worldX,f.t.worldX-50/300);f.at(11.04);near(f.t.hp,9898);assert.equal(j.orb.hp,0);assert.equal(j.orb.status.sourceHidden,true);f.at(11.06);near(f.t.hp,9898);
});
test('dead target before dispatch kills and hides the chosen orbiting feather',()=>{
 const f=fixture();ok(f.cast('A1SC'));const orb=jobs(f.g,'phoenix_orbit')[0].orbs[0];f.kill(f.t);f.at(11);assert.equal(orb.hp,0);assert.equal(orb.status.sourceHidden,true);assert.equal(jobs(f.g,'phoenix_feather').length,0);
});
test('target death during chase hides but does not kill the still-alive feather',()=>{
 const f=fixture();ok(f.cast('A1SC'));f.at(11);const j=jobs(f.g,'phoenix_feather')[0],hp=j.orb.hp;f.kill(f.t);assert.equal(j.done,true);near(j.orb.hp,hp);assert.equal(j.orb.status.sourceHidden,true);assert.ok(jobs(f.g,'phoenix_aux_decay').length);f.at(71);assert.equal(j.orb.hp,0);
});
test('source widget death clears orbiters while ACrn waiting leaves launched feather and circle listeners',()=>{
 const f=fixture(['A1SC','A14E']);ok(f.cast('A1SC'));f.at(11);const j=jobs(f.g,'phoenix_feather')[0],orbit=jobs(f.g,'phoenix_orbit')[0];f.g._hurt(f.a,1e9,f.t,{spell:true,universal:true});assert.equal(f.a.status.reincarnation.phase,'waiting');assert.equal(orbit.done,true);assert.equal(j.done,undefined);assert.ok(orbit.orbs.filter(Boolean).every(o=>o.hp===0));
 const z=fixture(['A1SB','A14E']);ok(z.cast('A1SB'));z.g._hurt(z.a,1e9,z.t,{spell:true,universal:true});assert.equal(jobs(z.g,'phoenix_circle')[0].done,undefined);
});
test('caster ordinary death hides chasing feather and kills remaining orbiters',()=>{
 const f=fixture();ok(f.cast('A1SC'));f.at(11);const j=jobs(f.g,'phoenix_feather')[0],orbit=jobs(f.g,'phoenix_orbit')[0];f.kill(f.a);assert.equal(j.done,true);assert.ok(j.orb.hp>0);assert.equal(j.orb.status.sourceHidden,true);assert.ok(orbit.orbs.filter(Boolean).every(o=>o.hp===0));
});
test('all dead orbiters wait for5second cleanup instead of manufacturing replacements',()=>{
 const f=fixture();ok(f.cast('A1SC'));const j=jobs(f.g,'phoenix_orbit')[0];for(const o of j.orbs)f.kill(o);f.at(14.98);assert.equal(jobs(f.g,'phoenix_orbit').length,1);f.at(15);assert.equal(jobs(f.g,'phoenix_orbit').length,0);assert.equal(j.reason,'five-second-timeout');assert.equal(jobs(f.g,'phoenix_feather').length,0);
});
test('script damage retains BJ weapon classification and consumes explicit magazine charges',()=>{
 const f=fixture(['A1SB','A1PJ']),v=circleVictim(f);ok(f.cast('A1SB'));f.t.worldX=100;f.at(10.02);near(v.hp,9890);assert.equal(f.a.status.musketeerMagazineCount,1);f.at(11.02);assert.ok(f.a.status.musketeerMagazineCount>=2);
});
test('global pause freezes orbital timers and native-cooldown time',()=>{
 const f=fixture();ok(f.cast('A1SC'));f.g.state.paused=true;const saved=clone(f.g.snapshot());f.g.tick(10);assert.deepEqual(clone(f.g.snapshot()),saved);
});
test('save restore rebinds shared handles across orbit chase and decay jobs',()=>{
 const f=fixture();ok(f.cast('A1SC'));f.at(11.2);const g=Game.fromSnapshot(clone(f.g.snapshot()));g._sourceDamageTriggerDepth=1;g.state.time=12.3;tickSourceScriptJobs(g);f.at(12.3);assert.deepEqual(clone(g.snapshot()),clone(f.g.snapshot()));const orbital=jobs(g,'phoenix_orbit')[0],flight=jobs(g,'phoenix_feather')[0];assert.equal(orbital.source,flight.source);assert.equal(orbital.target,flight.target);
});
test('continuous waves keep pending feathers while sandbox reset drops the whole family',()=>{
 const f=fixture();ok(f.cast('A1SC'));const j=jobs(f.g,'phoenix_orbit')[0];f.g.state.mode='standard';f.g._advanceContinuous();assert.ok(f.g.state.sourceSkillJobs.includes(j));assert.equal(f.g.state.wave,32);
 const z=fixture();ok(z.cast('A1SC'));ok(z.g.command('sandboxReset'));assert.equal(z.g.state.sourceSkillJobs.length,0);
});
test('real upgraded phoenix and its reborn form both expose the two mapped active abilities',()=>{
 const g=new Game({mode:'sandbox'}),p=g.state.players[0];p.roster=['v14_h08F'];p.entitlements.h230=1;for(let col=0;col<5;col++)ok(g.command('build',{unitId:'v14_h08F',col,row:1}));ok(g.command('sandboxComplete'));ok(g.command('ready'));g._endCombat();const b=p.buildings[0];for(const unitId of ['v14_h08I','v14_h18I','v14_n083']){ok(g.command('upgrade',{buildingId:b.id,unitId}));ok(g.command('sandboxComplete'));}ok(g.command('ready'));const a=g.state.entities.find(e=>e.buildingId===b.id);assert.deepEqual(manualSourceSkills(g,a).map(s=>s.id),['A1SB','A1SC']);g._killUnit(a);g.state.time+=3;tickSourceScriptJobs(g);const reborn=g.state.entities.find(e=>e.combatRawcode==='h0VZ');assert.deepEqual(manualSourceSkills(g,reborn).map(s=>s.id),['A1SB','A1SC']);
});
test('natural arena frames deliver all four102hits without autonomous dummy fighters',()=>{
 const f=fixture(['A1SC']);f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;ok(f.cast('A1SC'));f.g.tick(12);near(f.t.hp,9592);assert.equal(f.g.state.phase,'combat');assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='e01G'),false);assert.equal(jobs(f.g,'phoenix_feather').length,0);
});
test('hidden alive auxiliary cannot keep a defeated arena army in combat',()=>{
 const f=fixture(['A1SC']);f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;ok(f.cast('A1SC'));f.at(11);f.kill(f.a);assert.ok(jobs(f.g,'phoenix_aux_decay').length);f.g.tick(.1);assert.equal(f.g.state.phase,'build');assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('phoenix revival retains existing fixed burn timers without transferring them to new body',()=>{
 const f=fixture(['A1SB','A1SE']),b={id:'phoenix',unitId:'v14_n083',col:2,row:4};f.a.buildingId=b.id;f.g.state.players[0].buildings=[b];initializeSourceClassCombat(f.g,b,f.a);const v=circleVictim(f);ok(f.cast('A1SB'));f.t.worldX=100;f.at(10.02);f.kill(f.a);const hp=v.hp;f.at(13.02);near(v.hp,hp-30);const burn=jobs(f.g,'phoenix_burn')[0];assert.equal(burn.source,f.a);assert.equal(burn.source.status.sourceRemoved,true);assert.ok(f.g.state.entities.some(e=>e.combatRawcode==='h0VZ'));
});
