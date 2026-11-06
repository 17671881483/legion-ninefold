import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,tickSourceScriptJobs,tickSourceSkills,sourceWeapon,sourceSpellTargetState} from '../dist/skills.js';
import {isSirenSleeping,sirenSleepProtected} from '../dist/siren-sleep-rules.js';
import {spawnWarpWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),clone=x=>JSON.parse(JSON.stringify(x));
export function sirenFixture(){
 const g=new Game({mode:'sandbox',seed:77});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];g._spawnQueue=[];g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const skills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates={};};
 const make=(code='h0UM',team=0,x=5,y=10)=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId:team?4:0,team,side:team?'monster':'defender',battleTeam:0,laneId:0,sourceLaneId:0,worldX:x,worldY:y,facing:90,userData:team?5:1});g.state.entities.push(e);e.hp=e.maxHp=1000;e.hpRegen=e.manaRegen=0;e.attackCd=e.abilityCd=999;e.ability=null;e.pendingAttack=null;return e;};
 const a=make(),t=make('h03E',1,5,10.5);skills(a,['A1DO']);skills(t,[]);g._random=()=>0;
 const hit=(damage=10,source=a,target=t,options={weapon:true})=>g._hurt(target,damage,source,options);
 const at=time=>{g.state.time=time;tickSourceScriptJobs(g);};
 return {g,a,t,make,skills,hit,at};
}
test('actual weapon damage triggers a real independent e008 without cancelling the initiating hit',()=>{
 const f=sirenFixture();near(f.hit(),10);near(f.t.hp,990);assert.ok(isSirenSleeping(f.g,f.t));const d=f.g.state.entities.find(e=>e.status.sirenAuxiliary);assert.equal(d.combatRawcode,'e008');near(d.mana,99900);assert.equal(d.ownerId,0);assert.equal(d.nav,undefined);assert.equal(d.skillStates.A1DN.casts,1);assert.equal(f.a.mana,0);assert.equal(f.g.state.sourceSkillJobs.length,2);
});
test('spell damage and same-source recursive native listener do not roll the weapon proc',()=>{
 for(const mode of ['spell','busy','no-ability','zero-level']){const f=sirenFixture();if(mode==='busy')f.a.status.sourceNativeAttackBusy=true;if(mode==='no-ability')f.skills(f.a,[]);if(mode==='zero-level')f.a.abilityLevels={A1DO:0};f.hit(10,f.a,f.t,mode==='spell'?{spell:true}:{weapon:true});assert.equal(f.g.state.entities.filter(e=>e.status.sirenAuxiliary).length,0,mode);assert.equal(isSirenSleeping(f.g,f.t),false,mode);}
});
test('initial protection rejects subsequent weapon spell and universal damage before listener side effects',()=>{
 const f=sirenFixture();f.hit();f.at(10.5);const hp=f.t.hp,count=f.g.state.entities.length;for(const options of [{weapon:true},{spell:true,magic:true},{spell:true,universal:true}])near(f.hit(500,f.a,f.t,options),0);near(f.t.hp,hp);assert.equal(f.g.state.entities.length,count);assert.ok(sirenSleepProtected(f.g,f.t));
});
test('after protection positive damage wakes before event processing and does not clear another stun',()=>{
 const f=sirenFixture(),other=f.make('h03E');f.skills(other,[]);f.t.status.stunUntil=30;f.hit();f.at(11);assert.equal(sirenSleepProtected(f.g,f.t),false);near(f.hit(10,other),10);near(f.t.hp,980);assert.equal(isSirenSleeping(f.g,f.t),false);assert.equal(f.t.status.sirenSleepProtected,false);near(f.t.status.stunUntil,30);
});
test('fully absorbed or zero damage does not wake sleep after its protected interval',()=>{
 const f=sirenFixture(),other=f.make('h03E');f.skills(other,[]);f.hit();f.at(11.1);f.t.status.shield=100;near(f.hit(10,other),0);assert.ok(isSirenSleeping(f.g,f.t));near(f.hit(0,other),0);assert.ok(isSirenSleeping(f.g,f.t));
});
test('the same attacker can wake an old sleep and apply a fresh independently owned sleep',()=>{
 const f=sirenFixture();f.hit();const old=f.t.status.sirenSleep.id;f.at(11.2);near(f.hit(),10);assert.notEqual(f.t.status.sirenSleep.id,old);near(f.t.status.sirenSleep.expiresAt,13.2);f.at(12);assert.ok(isSirenSleeping(f.g,f.t));near(f.t.status.sirenSleep.expiresAt,13.2);
});
test('sleeping units stop movement normal attacks native automatic spells and pending attack windups',()=>{
 const f=sirenFixture();f.skills(f.t,['A0HB']);f.t.mana=f.t.maxMana=100;f.t.pendingAttack={targetId:f.a.id,readyAt:10.5};f.hit();assert.equal(f.t.pendingAttack,null);assert.equal(sourceWeapon(f.t,f.a,10.5),null);const p=[f.t.worldX,f.t.worldY],hp=f.a.hp;f.t.attackCd=0;f.g._updateEntities(.2);assert.deepEqual([f.t.worldX,f.t.worldY],p);near(f.a.hp,hp);near(f.t.mana,100);assert.equal(f.t.skillStates.A0HB?.casts??0,0);
});
test('manual hero spells reject sleeping casters with no charge or new timers',()=>{
 const f=sirenFixture();f.skills(f.t,['A313']);f.t.mana=f.t.maxMana=100;f.hit();const n=f.g.state.sourceSkillJobs.length;const s=f.g.unitSkillStatus(f.t.id,4).find(s=>s.id==='A313');assert.equal(s.canStart,false);assert.match(s.reason,/无法施法/);assert.equal(f.g.command('cast',{playerId:4,entityId:f.t.id,skillId:'A313',targetId:f.a.id}).ok,false);near(f.t.mana,100);assert.equal(f.g.state.sourceSkillJobs.length,n);
});
test('applying sleep interrupts the native monsoon channel without deleting unrelated script jobs',()=>{
 const f=sirenFixture();f.t.status.stormLizardChannel={until:30};const job={type:'custom-persistent',source:f.t};f.g.state.sourceSkillJobs.push(job);f.hit();assert.equal(f.t.status.stormLizardChannel,undefined);assert.ok(f.g.state.sourceSkillJobs.includes(job));
});
test('dummy timed life ends at1 second but recipient control lasts its own2 seconds',()=>{
 const f=sirenFixture();f.hit();const d=f.g.state.entities.find(e=>e.status.sirenAuxiliary),kills=f.g.state.metrics.killed;f.at(11);assert.equal(d.hp,0);assert.ok(d.status.deathCounted);assert.ok(isSirenSleeping(f.g,f.t));f.g._clearDead();assert.equal(f.g.state.entities.includes(d),false);f.at(12);assert.equal(isSirenSleeping(f.g,f.t),false);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(f.g.state.metrics.killed,kills);
});
test('sleep is not ended by helper death or by source death and removal',()=>{
 const f=sirenFixture();f.hit();f.a.hp=0;f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);f.at(11);assert.ok(isSirenSleeping(f.g,f.t));f.at(12);assert.equal(isSirenSleeping(f.g,f.t),false);
});
test('save restoration binds the live recipient and helper without replaying cost or damage',()=>{
 const f=sirenFixture();f.hit();f.at(10.5);const g=Game.fromSnapshot(clone(f.g.snapshot())),t=g.state.entities.find(e=>e.id===f.t.id),j=g.state.sourceSkillJobs.find(j=>j.type==='siren_sleep');assert.equal(j.target,t);assert.equal(j.source,g.state.entities.find(e=>e.id===j.sourceId));near(t.hp,990);near(j.source.mana,99900);assert.ok(sirenSleepProtected(g,t));g.state.time=11;tickSourceScriptJobs(g);assert.ok(isSirenSleeping(g,t));assert.equal(sirenSleepProtected(g,t),false);g.state.time=12;tickSourceScriptJobs(g);assert.equal(isSirenSleeping(g,t),false);
});
test('sleep cannot send defenders through the spawn gate while continuous waves preserve the same control',()=>{
 const f=sirenFixture();f.hit(10,f.t,f.a); // target lacks the proc; apply the normal proc to defender instead
 f.skills(f.t,['A1DO']);f.skills(f.a,[]);f.hit(10,f.t,f.a);assert.ok(isSirenSleeping(f.g,f.a));const p=spawnWarpWorld(0);f.a.worldX=p.x;f.a.worldY=p.y;f.a.nav={mode:'return'};f.g._settledLanes=[0];f.g._warpDefenders();near(f.a.worldX,p.x);near(f.a.worldY,p.y);assert.equal(f.a.status.warped,undefined);f.g.state.mode='normal';f.g.state.wave=31;f.g._advanceContinuous();assert.ok(f.g.state.entities.includes(f.a));assert.ok(isSirenSleeping(f.g,f.a));
});
test('dispel removes only owned sleep control and restoration never grants it back',()=>{
 const f=sirenFixture();f.hit();f.t.status.stunUntil=30;f.t.invulnerable=true;f.t.buffs=[];f.at(10.5);assert.equal(isSirenSleeping(f.g,f.t),false);assert.equal(f.t.status.sirenSleepProtected,false);assert.equal(f.t.invulnerable,true);near(f.t.status.stunUntil,30);const g=Game.fromSnapshot(clone(f.g.snapshot())),t=g.state.entities.find(e=>e.id===f.t.id);assert.equal(isSirenSleeping(g,t),false);assert.equal(t.invulnerable,true);
});
test('protected sleep targets are not valid weapon targets but become targetable after one second',()=>{
 const f=sirenFixture();f.hit();assert.equal(sourceWeapon(f.a,f.t,10.5),null);f.at(11);assert.ok(sourceWeapon(f.a,f.t,11));
});

test('normal simulation attacks proc sleep and prevent the victim from completing its attack',()=>{
 const f=sirenFixture();f.a.attackCd=0;f.t.attackCd=0;const hp=f.a.hp;f.g._updateEntities(.05);assert.ok(isSirenSleeping(f.g,f.t));assert.ok(f.t.hp<1000);near(f.a.hp,hp);assert.equal(f.t.pendingAttack,null);assert.ok(f.g.state.entities.some(e=>e.status.sirenAuxiliary));
});

test('compiled auxiliary sleep displays its paid reference cost without exposing a manual button',()=>{
 const f=sirenFixture();f.hit();const d=f.g.state.entities.find(e=>e.status.sirenAuxiliary),s=d.skillSpecs.find(s=>s.id==='A1DN');near(s.manaCost,100);near(s.cooldown,6);assert.equal(s.nativeCostReference,true);assert.equal(f.g.unitSkillStatus(d.id).some(s=>s.id==='A1DN'),false);
});

test('Aesara special manual descriptors cannot bypass sleeping control, including turning off her shield',()=>{
 for(const enabled of [false,true]){const f=sirenFixture();f.skills(f.t,['A0VX','A0VY']);f.t.mana=f.t.maxMana=100;if(enabled){f.t.status.aesaraShieldBuff=true;f.t.status.aesaraShieldScriptOn=true;}f.hit();const mana=f.t.mana;for(const id of ['A0VX','A0VY']){assert.equal(f.g.unitSkillStatus(f.t.id,4).find(s=>s.id===id).canStart,false);assert.equal(f.g.command('cast',{playerId:4,entityId:f.t.id,skillId:id,targetId:f.a.id}).ok,false);}near(f.t.mana,mana);}
});
test('cleared lanes queue return intent for sleeping guards and movement resumes on waking',()=>{
 const f=sirenFixture();f.skills(f.t,['A1DO']);f.skills(f.a,[]);f.hit(10,f.t,f.a);f.a.nav={mode:'guard',anchor:{x:5,y:10}};f.t.status.enteredStem=true;f.g._transferDefenders();assert.ok(f.g._settledLanes.includes(0));assert.equal(f.a.nav.mode,'return');const p=[f.a.worldX,f.a.worldY];f.g._updateEntities(.1);assert.deepEqual([f.a.worldX,f.a.worldY],p);f.at(12);f.t.hp=0;f.g._updateEntities(.1);assert.ok(f.a.worldX!==p[0]||f.a.worldY!==p[1]);
});
test('exact target checks and pre-AI phase refresh stop protection at its deadline without a job tick',()=>{
 const f=sirenFixture();f.hit();f.g.state.time=11.01;assert.equal(f.t.status.sirenSleepProtected,true);assert.equal(sourceSpellTargetState(f.t,11.01).invulnerable,false);assert.ok(sourceWeapon(f.a,f.t,11.01));f.g._aiEnabled=()=>true;f.g._aiTimer=0;let observed;f.g._aiAct=()=>{observed=sourceSpellTargetState(f.t).invulnerable;};f.g._step(.01);assert.equal(observed,false);
});
test('same-frame removal of the sleep buff clears target invulnerability without touching unrelated protection',()=>{
 const f=sirenFixture();f.hit();f.t.buffs=[];assert.equal(sourceSpellTargetState(f.t).invulnerable,false);assert.ok(sourceWeapon(f.a,f.t,10));f.t.invulnerable=true;assert.equal(sourceSpellTargetState(f.t,10).invulnerable,true);
});
