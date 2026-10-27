import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSkills,describeSkills,attachSkills,tickSourceSkills,tickSourceScriptJobs,sourceOnHit,sourceAttackStart,sourceMoveFactor,canWeaponTarget,sourceWeapon,matchesTargets,modifyIncoming,afterSourceDamage,sourceDeath} from '../dist/skills.js';
import {V14_ABILITIES,V14_UNIT_TEMPLATES,V14_UNITS} from '../dist/v14-reference.js';
import {Game} from '../dist/engine.js';
import {WORKBOOK_UNIT_TEMPLATES} from '../dist/workbook-reference.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const v14=(ids=[],extra={})=>({id:'v14_test',name:'v14技能测试体',provenance:'v14.1A5-dataset',sourceVersion:'v14.1A5',abilityIds:ids,distanceScale:1/3,hp:1000,damage:20,mana:100,manaStart:100,range:100,...extra});
// A small combat harness keeps these tests on source skill semantics. Engine
// scheduling/creation hooks are covered separately by the engine tests.
function fixture(){let id=0;const g={state:{time:0,wave:20,entities:[],sourceSkillJobs:[]},events:[],_battleAuras:[[],[]],_random:()=>.9,_event(type,e,label,extra){this.events.push({type,id:e.id,label,...extra});},_auraEffects:()=>({damageMultiplier:1,armor:0}),_typeMultiplier:()=>1,_armorFactor:()=>1,_effectiveArmor:(e,a)=>a,
  _entity(def,extra={}){const e={id:++id,unitId:def.id,createdAt:this.state.time,hp:def.hp??1000,maxHp:def.hp??1000,damage:def.damage??20,range:(def.range??100)/100,attackInterval:1,acquisitionRange:5,status:{},worldX:0,worldY:0,x:0,y:0,team:0,side:'defender',ownerId:0,battleTeam:0,...extra};attachSkills(e,def);return e;},
  _hurt(t,amount,source,options={}){if(t.hp<=0||amount<=0)return 0;const dealt=modifyIncoming(this,t,amount,source,options);t.hp-=dealt;afterSourceDamage(this,t,dealt,source,options);if(t.hp<=0)sourceDeath(this,t,source);return dealt;},_sourceDeath(t,k){sourceDeath(this,t,k);}};return g;}
function add(g,def,side='defender',x=0,y=0){const e=g._entity(def,{side,team:side==='defender'?0:1,ownerId:side==='defender'?0:null,worldX:x,worldY:y});g.state.entities.push(e);return e;}
function battle(g){const a=g.state.entities;a.auras=a.filter(e=>e.skillSpecs.some(s=>s.kind.startsWith('aura_')));g._worldEntities=new Map(a.map(e=>[e.id,e]));return a;}

test('v14 compile cache uses its own objects while old definitions retain old semantics',()=>{
 const old=compileSkills({abilityIds:['A06O','A01I','A0BH']}),current=compileSkills(v14(['A06O','A01I','A0BH']));
 assert.equal(old[0].effectText.includes('25'),true);assert.equal(current[0].heal,80);assert.equal(current[1].kind,'mana_strike_hit');assert.equal(old[1].kind,'mana_strike');assert.equal(current[2].status,'partial');assert.equal(old[2].kind,'aura_heartstopper');
 assert.equal(compileSkills({abilityIds:['A06O']})[0].version,'5.0dJF');assert.equal(compileSkills(v14(['A06O']))[0].version,'v14.1A5');
});
test('v14 mirror uses actual native values, not the stale tooltip',()=>{
 const s=compileSkills(v14(['A1TN']))[0];assert.equal(s.count,2);near(s.duration,999);near(s.cooldown,999);near(s.outgoing,1);near(s.incoming,1);
 const g=fixture(),e=add(g,v14(['A1TN'],{rawcode:'h0QA',combatRawcode:'h0QA'}));add(g,v14(),'monster',.5);e.buffs=[{key:'old-magic',expiresAt:20}];tickSourceSkills(g,e,battle(g),.1);
 const mirrors=g.state.entities.filter(t=>t.isIllusion);assert.equal(mirrors.length,2);assert.ok(mirrors.every(t=>t.skillVersion==='v14.1A5'&&t.expiresAt===999));assert.equal(e.buffs.length,0);assert.equal(e.skillStates.A1TN.casts,1);tickSourceSkills(g,e,battle(g),.1);assert.equal(g.state.entities.filter(t=>t.isIllusion).length,2);
});
test('totem healing stays at each casting location and stops at caster death',()=>{
 const g=fixture(),e=add(g,v14(['A1TP'])),ally=add(g,v14(), 'defender',.2),traveller=add(g,v14(),'defender',4);add(g,v14(),'monster',.5);ally.hp=traveller.hp=100;
 tickSourceSkills(g,e,battle(g),0);assert.equal(g.state.sourceSkillJobs.length,1);near(e.mana,82);g.state.time=.99;tickSourceScriptJobs(g);near(ally.hp,100);e.worldX=4;
 g.state.time=1;tickSourceScriptJobs(g);near(ally.hp,200);near(traveller.hp,100);g.state.time=2;tickSourceScriptJobs(g);near(ally.hp,300);e.hp=0;g.state.time=3;tickSourceScriptJobs(g);near(ally.hp,300);assert.equal(g.state.sourceSkillJobs.length,0);
});
test('totem casts create independent persistent areas and preserve cooldown/mana',()=>{
 const g=fixture(),e=add(g,v14(['A1TP'])),a=add(g,v14(),'defender',.2);add(g,v14(),'monster',.3);a.hp=0;a.hp=100;
 tickSourceSkills(g,e,battle(g),0);g.state.time=29.9;tickSourceSkills(g,e,battle(g),0);assert.equal(e.skillStates.A1TP.casts,1);g.state.time=30;tickSourceSkills(g,e,battle(g),0);assert.equal(e.skillStates.A1TP.casts,2);near(e.mana,64);assert.equal(g.state.sourceSkillJobs.length,2);
 // Restore the serializable state at a timer boundary; both original jobs tick.
 g.state=JSON.parse(JSON.stringify(g.state));const restored=g.state.entities.find(t=>t.id===a.id);g.state.time=31;tickSourceScriptJobs(g);assert.equal(restored.hp,1000);assert.equal(g.state.sourceSkillJobs.length,2);
});
test('charge travels through a corridor once per enemy, without moving or requiring a live caster',()=>{
 const g=fixture(),e=add(g,v14(['A1TQ'])),nearby=add(g,v14(),'monster',.2),far=add(g,v14(),'monster',3),off=add(g,v14(),'monster',2,1.01),friend=add(g,v14(),'defender',1),immune=add(g,v14(['Amim']),'monster',1),invul=add(g,v14(['Avul']),'monster',1);
 tickSourceSkills(g,e,battle(g),0);assert.equal(g.state.sourceSkillJobs.length,1);near(e.mana,82);near(e.worldX,0);g.state.time=.1;tickSourceScriptJobs(g);near(nearby.hp,900);near(immune.hp,900);near(invul.hp,1000);near(far.hp,1000);near(off.hp,1000);near(friend.hp,1000);
 e.hp=0;g.state.time=.3;tickSourceScriptJobs(g);near(nearby.hp,900);near(far.hp,900);g.state.time=.4;tickSourceScriptJobs(g);assert.equal(g.state.sourceSkillJobs.length,0);near(far.hp,900);near(e.worldX,0);
});
test('A1TT pulses every second even while stunned and explodes for 56 once',()=>{
 const g=fixture(),e=add(g,v14(['A1TT'])),inside=add(g,v14(),'monster',.5),outer=add(g,v14(),'monster',.9),ally=add(g,v14(),'defender',.2),invul=add(g,v14(['Avul']),'monster',.2);e.status.stunUntil=20;
 g.state.time=.99;tickSourceSkills(g,e,battle(g),.1);near(inside.hp,1000);g.state.time=1;tickSourceSkills(g,e,battle(g),.01);near(inside.hp,995);near(outer.hp,1000);g.state.time=1.5;tickSourceSkills(g,e,battle(g),.5);near(inside.hp,995);g.state.time=2;tickSourceSkills(g,e,battle(g),.5);near(inside.hp,990);
 g._hurt(e,2000,inside,{spell:true});near(inside.hp,934);near(outer.hp,944);near(ally.hp,1000);near(invul.hp,1000);sourceDeath(g,e,inside);near(inside.hp,934);assert.equal(e.skillSpecs[0].effectText.includes('56'),true);assert.equal(e.skillSpecs[0].effectText.includes('88'),true); // Explicitly records the tooltip discrepancy.
});
test('v14 mana strike triggers at 100 actual damage, immediately with current mana',()=>{
 const g=fixture(),e=add(g,v14(['A01I'],{rawcode:'h04N'})),t=add(g,v14(),'monster',.2);e.mana=10;sourceAttackStart(g,e,t);assert.equal(e.status.pendingStrikes,undefined);g._hurt(t,99,e,{spell:true});near(t.hp,901);g._hurt(t,100,e,{spell:true});near(t.hp,771);
});
test('v14 charged attack heals 80, preserving old-version 25',()=>{
 for(const [def,heal] of [[v14(['A06O'],{rawcode:'h081'}),80],[WORKBOOK_UNIT_TEMPLATES.h081,25]]){const g=fixture(),e=add(g,def),t=add(g,v14(),'monster',.2);e.hp=e.maxHp-100;e.maxMana=2;e.mana=0;sourceAttackStart(g,e,t);sourceAttackStart(g,e,t);near(e.hp,e.maxHp-100);sourceAttackStart(g,e,t);near(e.hp,e.maxHp-100+heal);near(e.mana,0);}
});
test('v14 void strike uses >40 threshold and hero current HP',()=>{
 const g=fixture(),e=add(g,v14([],{rawcode:'n0S6'})),normal=add(g,v14(),'monster',.2),hero=add(g,v14([],{isHero:true}),'monster',.2);g._hurt(normal,40,e,{spell:true});near(normal.hp,960);g._hurt(normal,41,e,{spell:true});near(normal.hp,909);g._hurt(hero,100,e,{spell:true});near(hero.hp,891);
});
test('altar hero presentation preserves its native giant classification for damage and control duration',()=>{
 const def=V14_UNITS.find(u=>u.sourceRawcode==='h0G5');assert.ok(def);assert.equal(def.sourceRawFields.type,'giant');
 const g=fixture(),attacker=add(g,v14([],{rawcode:'n0S6'})),target=add(g,{...def,hp:1000,abilityIds:[]},'monster',.2);
 assert.equal(target.isHero,true);assert.equal(target.isNativeHero,false);g._hurt(target,100,attacker,{spell:true});near(target.hp,890);
 for(const [victim,duration]of [[{...def,hp:1000,abilityIds:[]},4],[v14([],{isHero:true}),2]]){
  const h=fixture(),caster=add(h,v14(['A06B'])),enemy=add(h,victim,'monster',.2);tickSourceSkills(h,caster,battle(h),.01);
  const root=enemy.buffs.find(b=>b.skillId==='A06B');assert.ok(root);near(root.expiresAt,duration);
 }
});
test('v14 kill heal uses 50% of dead maximum HP and A0SB follows ability holders',()=>{
 const g=fixture(),killer=add(g,v14([],{rawcode:'h0CZ',hp:2000})),dead=add(g,v14(['A0SB'],{rawcode:'some'}),'monster',.2),other=add(g,v14(),'defender',.4);killer.hp=100;g._hurt(dead,2000,killer,{spell:true});near(killer.hp,574);near(other.hp,974);
});
test('unverified v14 script markers remain visible as unresolved, not old-version effects',()=>{
 for(const id of ['A0R5','A12K']){const source=V14_ABILITIES[id];assert.ok(source,id);const [s]=describeSkills(v14([id]));assert.equal(s.status,'unresolved',id);assert.ok(s.effectText);}
});


test('v14 native aliases use object parameters instead of conflicting tooltip values',()=>{
 const [wave,breath,stone]=compileSkills(v14(['A104','A1A9','A164']));assert.equal(wave.kind,'wave');near(wave.damage,5);near(wave.damageCap,200);near(wave.length,8/3);assert.equal(breath.kind,'breath');near(breath.damage,175);assert.equal(stone.kind,'bolt');near(stone.damage,300);near(stone.duration,.001);
});
test('water-elemental orb casts a mana-funded source wave with target mask and damage cap',()=>{
 const g=fixture(),e=add(g,v14(['A102'])),targets=Array.from({length:45},(_,i)=>add(g,v14(),'monster',.3+i*.01)),air=add(g,v14([],{targetType:'air'}),'monster',.4);const b=battle(g),procs=e.skillSpecs;
 e.mana=39;sourceOnHit(g,e,targets[0],b,0,procs);assert.ok(targets.every(t=>t.hp===1000));e.mana=40;sourceOnHit(g,e,targets[0],b,0,procs);near(e.mana,0);near(targets.reduce((sum,t)=>sum+1000-t.hp,0),200);near(air.hp,1000);
});
test('charge helper destroys before its configured final step',()=>{
 const g=fixture(),e=add(g,v14(['A1TQ']));add(g,v14(),'monster',.2);const nearEnd=add(g,v14(),'monster',4.5),pastEnd=add(g,v14(),'monster',4.8);tickSourceSkills(g,e,battle(g),0);g.state.time=.36;tickSourceScriptJobs(g);near(nearEnd.hp,900);near(pastEnd.hp,1000);assert.equal(g.state.sourceSkillJobs.length,0);
});
test('Ysera revival intercepts lethal events and reduces sleeping damage by 80 percent',()=>{
 const g=fixture(),e=add(g,v14(['A2YI'])),t=add(g,v14(),'monster',.2);near(g._hurt(e,1200,t,{spell:true}),0);near(e.hp,50);assert.equal(e.status.yseraRevivalCount,1);near(g._hurt(e,100,t,{spell:true}),20);near(e.hp,30);g.state.time=2.99;tickSourceScriptJobs(g);near(e.hp,30);g.state.time=3;tickSourceScriptJobs(g);near(e.hp,280);assert.equal(e.status.yseraSleepingUntil,0);
});
test('Ysera low-HP branch preserves original precedence and can bypass count/cooldown',()=>{
 const g=fixture(),e=add(g,v14(['A2YI'])),t=add(g,v14(),'monster',.2);e.hp=300;e.status.yseraRevivalCount=2;e.status.yseraRevivalCooldownUntil=100;near(g._hurt(e,1,t,{spell:true}),0);near(e.hp,50);assert.equal(e.status.yseraRevivalCount,3);g.state.time=3;tickSourceScriptJobs(g);near(e.hp,300);near(g._hurt(e,1,t,{spell:true}),0);assert.equal(e.status.yseraRevivalCount,4);
});
test('Ysera lethal branch respects count/cooldown and waking never resurrects a dead unit',()=>{
 for(const mode of ['count','cooldown']){const g=fixture(),e=add(g,v14(['A2YI'])),t=add(g,v14(),'monster',.2);if(mode==='count')e.status.yseraRevivalCount=2;else e.status.yseraRevivalCooldownUntil=1;g._hurt(e,1200,t,{spell:true});assert.ok(e.hp<=0);assert.equal(g.state.sourceSkillJobs.length,0);}
 const g=fixture(),e=add(g,v14(['A2YI'])),t=add(g,v14(),'monster',.2);g._hurt(e,1200,t,{spell:true});g._hurt(e,1000,t,{spell:true});assert.ok(e.hp<=0);g.state.time=3;tickSourceScriptJobs(g);assert.ok(e.hp<=0);assert.equal(g.state.sourceSkillJobs.length,0);
});
test('Ysera dream corrosion refreshes one armor debuff from attacks and actual damage',()=>{
 const g=fixture(),e=add(g,v14(['A2YH'])),t=add(g,v14(),'monster',.2),friend=add(g,v14());sourceAttackStart(g,e,t);assert.equal(t.buffs.length,1);near(t.buffs[0].armor,-2);near(t.buffs[0].expiresAt,4);g.state.time=2;g._hurt(t,10,e,{spell:true});assert.equal(t.buffs.length,1);near(t.buffs[0].expiresAt,6);sourceAttackStart(g,e,friend);assert.equal(friend.buffs.length,0);
});


test('Avul walls reject weapon selection and all damage while native friendly healing remains eligible',()=>{
 const g=fixture(),wall=add(g,V14_UNIT_TEMPLATES.n04E),enemy=add(g,v14(),'monster',.1),healer=add(g,v14(['A0H2']),'defender',.2);
 assert.equal(wall.invulnerable,true);assert.equal(wall.nativeInvulnerable,true);assert.equal(wall.isBuilding,true);assert.equal(wall.isStaticObstacle,true);near(wall.moveSpeed,0);assert.equal(sourceWeapon(wall,enemy),null);assert.equal(canWeaponTarget(enemy,wall),false);assert.equal(matchesTargets({targets:['enemies']},enemy,wall),false);assert.equal(matchesTargets({targets:['friend']},healer,wall),true);
 const hp=wall.hp;for(const options of [{},{magic:true,spell:true},{scripted:true,universal:true}])g._hurt(wall,99999,enemy,options);near(wall.hp,hp);wall.hp=50;tickSourceSkills(g,healer,battle(g),.1);assert.ok(wall.hp>50);
});
test('invulnerable statues keep explicitly enabled weapons and invulnerable caves can summon',()=>{
 const g=fixture(),statue=add(g,V14_UNIT_TEMPLATES.n04X),enemy=add(g,v14(),'monster',.5),cave=add(g,V14_UNIT_TEMPLATES.n04O);assert.ok(sourceWeapon(statue,enemy));assert.equal(canWeaponTarget(enemy,statue),false);tickSourceSkills(g,cave,battle(g),.1);assert.ok(g.state.entities.some(t=>t.isSummon));
});
test('engine acquisition skips a nearer invulnerable wall in favor of a normal defender',()=>{
 const g=new Game({seed:42});g._aiTimer=Infinity;g.state.phase='combat';g.state.entities=[];const player=g.state.players[0];g._spawnDefender({...V14_UNIT_TEMPLATES.n04E,combatRawcode:'n04E'},player,2.5,6,'wall');g._spawnDefender({...V14_UNIT_TEMPLATES.h00L,combatRawcode:'h00L'},player,3.5,6,'normal');const [wall,normal]=g.state.entities;
 const enemy=g._entity(v14([],{hp:10000}),{team:1,side:'monster',battleTeam:0,laneId:0,sourceLaneId:0,worldX:wall.worldX+.1,worldY:wall.worldY});enemy.skillSource=false;enemy.moveSpeed=0;g.state.entities.push(enemy);g._updateEntities(.01);assert.equal(enemy.targetId,normal.id);assert.notEqual(enemy.targetId,wall.id);
});
test('ordinary v14 Adef is not a permanent shield or movement penalty',()=>{
 const [spec]=compileSkills(v14(['Adef']));assert.equal(spec.status,'unresolved');const g=fixture(),e=add(g,v14(['Adef'],{rawcode:'h00L'})),enemy=add(g,v14([],{attackType:'pierce'}),'monster',.2);enemy.attackType='pierce';near(modifyIncoming(g,e,100,enemy,{}),100);near(sourceMoveFactor(g,e,battle(g)),1);sourceAttackStart(g,e,enemy);near(modifyIncoming(g,e,100,enemy,{}),100);
});
test('captain A07N activates only on its source attack-start hook',()=>{
 const g=fixture(),e=add(g,v14(['A07N'],{rawcode:'h09P'})),enemy=add(g,v14(),'monster',.2);enemy.attackType='pierce';near(modifyIncoming(g,e,100,enemy,{}),100);near(sourceMoveFactor(g,e,battle(g)),1);sourceAttackStart(g,e,enemy);near(modifyIncoming(g,e,100,enemy,{}),60);near(sourceMoveFactor(g,e,battle(g)),.7);enemy.attackType='magic';near(modifyIncoming(g,e,100,enemy,{magic:true}),80);
});
