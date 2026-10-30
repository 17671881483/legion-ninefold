import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,sourceClassAttackDamageEvent,sourceAttackStart,sourceAuraEffects,tickSourceSkills} from '../dist/skills.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const clone=x=>JSON.parse(JSON.stringify(x));
const skills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));};
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
const ok=r=>assert.equal(r.ok,true,r.message);
function fixture(){
 const g=new Game({mode:'sandbox',seed:40});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;g._aiAct=()=>{};for(const k of g.state.kings){k.worldX=k.worldY=10000;}const p=laneToWorld(0,3,6);
 const make=(dx=.2,side='monster',raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=5000;e.mana=e.maxMana=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0Q3'),t=make();skills(a,['A12A','A12C']);a.hp=4000;
 const event=(options={weapon:true},amount=10)=>sourceClassAttackDamageEvent(g,t,a,options,amount);
 return {g,a,t,make,event};
}
test('source evidence pins registration, both independent counters, heal and raw object coefficients',()=>{
 const e=JSON.parse(readFileSync(new URL('../reference/desert-lizard-evidence.json',import.meta.url))),bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=bytes.toString('latin1').split('\n');assert.equal(createHash('sha256').update(bytes).digest('hex'),e.source.sha256);for(const row of e.sourceEvidence)assert.equal(lines[row.line-1].replace(/\r$/,''),row.text);assert.equal(e.abilities.A12B.Cost1,undefined);assert.equal(e.abilities.A12B.Cool1,'1.0');assert.equal(e.abilities.A12I.DataB1,'10.0');assert.equal(e.abilities.A12K.DataA1,'0.65');assert.equal(e.abilities.A12K.DataE1,'0.65');
});
test('A1297percent andA12A8percent real endpoints reset5/6 and request their exact order sequences',()=>{
 for(const [id,chance,count,orders]of [['A129',7,5,['bloodlust']],['A12A',8,6,['bloodlustoff','bloodlust']]])for(const [roll,hit]of [[0,true],[chance,true],[chance+.001,false],[99,false]]){const f=fixture();skills(f.a,[id]);f.g._random=()=>roll/100;f.event();const st=f.a.skillStates[id];assert.equal(st.remainingHits??0,hit?count:0);assert.equal(has(f.a,'A12B'),hit);assert.deepEqual(st.lastEvent.orders.map(o=>o.order),hit?orders:[]);near(f.a.mana,100);if(hit)assert.equal(st.lastEvent.orders.at(-1).targetId,f.a.id);}
});
test('counter decrements before chance, expiry removes shared Bblo but retains A12B ability',()=>{
 const f=fixture();skills(f.a,['A129']);f.g._random=()=>0;f.event();f.a.buffs=[{key:'Bblo',haste:3,expiresAt:100},{key:'other',haste:1,expiresAt:100}];f.g._random=()=>.99;for(let i=0;i<4;i++)f.event();assert.equal(f.a.skillStates.A129.remainingHits,1);assert.equal(f.a.buffs.length,2);f.event();assert.equal(f.a.skillStates.A129.remainingHits,0);assert.deepEqual(f.a.buffs.map(b=>b.key),['other']);assert.equal(has(f.a,'A12B'),true);
});
test('retriggers overwrite remaining count rather than add and do not recreate removed native buff',()=>{
 const f=fixture();skills(f.a,['A12A']);f.g._random=()=>0;f.event();f.a.skillStates.A12A.remainingHits=1;f.a.buffs=[{key:'Bblo',haste:3,expiresAt:100}];f.event();assert.equal(f.a.skillStates.A12A.remainingHits,6);assert.equal(f.a.skillStates.A12A.lastEvent.removedBuff,true);assert.equal(f.a.buffs.length,0);assert.equal(f.a.skillStates.A12A.lastEvent.orders[0].outcome,'native-unresolved');
});
test('both branches roll inA129 thenA12A order and can remove each others shared buff',()=>{
 const f=fixture();skills(f.a,['A129','A12A']);f.a.skillStates.A12A.remainingHits=1;f.a.buffs=[{buffId:'Bblo',key:'other-key',haste:3,expiresAt:100}];const rolls=[.07,.081];f.g._random=()=>rolls.shift();f.event();assert.equal(rolls.length,0);assert.equal(f.a.skillStates.A129.remainingHits,5);assert.equal(f.a.skillStates.A12A.remainingHits,0);assert.equal(f.a.buffs.length,0);assert.equal(has(f.a,'A12B'),true);
});
test('counts belong to source handles and do not decrement just because time passes',()=>{
 const f=fixture();skills(f.a,['A129']);f.g._random=()=>0;f.event();const other=f.make(0,'defender','h0Q2');skills(other,['A129']);f.g.state.time=100;f.g._random=()=>.99;tickSourceSkills(f.g,f.a,f.g.state.entities,.1);assert.equal(f.a.skillStates.A129.remainingHits,5);assert.equal(other.skillStates.A129.remainingHits,undefined);assert.equal(sourceAuraEffects(f.g,f.a,[]).haste,0);
});
test('A12B dynamic grant remains unresolved and does not leak into generic zero-cost friendly autocast',()=>{
 const f=fixture();skills(f.a,['A129']);f.g._random=()=>0;f.event();const b=f.make(.1,'defender');tickSourceSkills(f.g,f.a,f.g.state.entities,.1);assert.equal(f.a.skillSpecs.find(s=>s.id==='A12B').status,'unresolved');assert.equal(f.a.buffs.length,0);assert.equal(b.buffs.length,0);near(f.a.mana,100);assert.equal(f.g.unitSkillStatus(f.a.id).length,0);
});
test('ordinary spell skips counters; weapon spells and zero damage events count',()=>{
 for(const [options,amount,expected]of [[{spell:true},10,0],[{spell:true,weapon:true},10,1],[{weapon:true},0,1],[{},-10,1]]){const f=fixture();skills(f.a,['A12C']);f.event(options,amount);assert.equal(f.a.skillStates.A12C.hits??0,expected);}
});
test('independent listener has no friendly self dead-source orA2Y7 gate',()=>{
 for(const mode of ['ally','self','dead','A2Y7']){const f=fixture();skills(f.a,['A12C',...(mode==='A2Y7'?['A2Y7']:[])]);if(mode==='ally')f.t.side=f.a.side;if(mode==='dead')f.a.hp=0;sourceClassAttackDamageEvent(f.g,mode==='self'?f.a:f.t,f.a,{weapon:true},10);assert.equal(f.a.skillStates.A12C.hits,1);}
});
test('busy independent guard blocks all lizard counters and resets after successful event',()=>{
 const f=fixture();f.a.status.sourceNativeAttackBusy=true;f.event();assert.equal(f.a.skillStates.A12C.hits,undefined);assert.equal(f.a.skillStates.A12A.lastEvent,undefined);f.a.status.sourceNativeAttackBusy=false;f.event();assert.equal(f.a.skillStates.A12C.hits,1);assert.equal(f.a.status.sourceNativeAttackBusy,false);
});
test('every eighth damage event heals200 and grants critical; the next event removes it',()=>{
 const f=fixture();skills(f.a,['A12C']);for(let n=1;n<=17;n++){const before=f.a.hp;f.event();assert.equal(f.a.skillStates.A12C.hits,n%8);assert.equal(has(f.a,'A12I'),n%8===0);near(f.a.hp,before+(n%8===0?200:0));}
});
test('direct heal caps at maximum and does not turn dead handle into a resurrection',()=>{
 for(const hp of [4900,5000,0]){const f=fixture();skills(f.a,['A12C']);f.a.hp=hp;f.a.skillStates.A12C.hits=7;f.event();near(f.a.hp,hp===0?0:5000);assert.equal(f.a.skillStates.A12C.lastHeal.requested,hp+200);assert.equal(f.a.skillStates.A12C.lastHeal.deadHandleUnresolved,hp===0);assert.equal(has(f.a,'A12I'),true);}
});
test('counter greater than8 resets too; removingA12C freezes its stored count and leaves granted ability',()=>{
 const f=fixture();skills(f.a,['A12C']);f.a.skillStates.A12C.hits=20;f.event();assert.equal(f.a.skillStates.A12C.hits,0);f.a.skillSpecs=f.a.skillSpecs.filter(s=>s.id!=='A12C');f.event();assert.equal(has(f.a,'A12I'),true);near(f.a.hp,4200);
});
test('actual sequential weapon attacks crit on9th and17th, not8th, and heal twice',()=>{
 const f=fixture();skills(f.a,['A12C']);f.a.damage=10;const damage=[];for(let n=0;n<17;n++){const before=f.t.hp;f.g._attack(f.a,f.t,f.g.state.entities);damage.push(before-f.t.hp);}assert.deepEqual(damage,[10,10,10,10,10,10,10,10,100,10,10,10,10,10,10,10,100]);near(f.a.hp,4400);assert.equal(has(f.a,'A12I'),false);
});
test('extra weapon event consumes critical window before next attack while ordinary spell does not',()=>{
 for(const weapon of [false,true]){const f=fixture();skills(f.a,['A12C']);f.a.skillStates.A12C.hits=7;f.event();f.event({spell:true,weapon});const result=sourceAttackStart(f.g,f.a,f.t);assert.equal(result.critical,!weapon);near(result.multiplier,weapon?1:10);}
});
test('critical respects native target filters and adds no scripted fixed damage',()=>{
 const f=fixture();skills(f.a,['A12I']);assert.equal(sourceAttackStart(f.g,f.a,f.t).critical,true);f.t.side=f.a.side;assert.equal(sourceAttackStart(f.g,f.a,f.t).critical,false);near(f.t.hp,5000);
});
test('thick hide reads0.65 for pierce magic and spells but leaves normal siege chaos hero untouched',()=>{
 for(const type of ['pierce','magic','spells','normal','siege','chaos','hero']){const f=fixture();skills(f.t,['A12K']);f.g._hurt(f.t,100,f.a,{spell:true,attackType:type,magic:type==='magic'});near(f.t.hp,5000-(['pierce','magic','spells'].includes(type)?65:100));}
});
test('thick hide uses explicit attack type over spell transport flag and leaves universal damage outside adapter',()=>{
 for(const options of [{spell:true,attackType:'normal',nativeDamageType:'magic'},{spell:true,universal:true,attackType:'spells'},{spell:true,universal:true,attackType:'pierce'}]){const f=fixture();skills(f.t,['A12K']);f.g._hurt(f.t,100,f.a,options);near(f.t.hp,4900);}
});
test('thick hide handles host spell defaults and normal weapon source type without altering attack output',()=>{
 const f=fixture();skills(f.t,['A12K']);f.a.attackType='pierce';f.g._hurt(f.t,100,f.a,{});near(f.t.hp,4935);f.g._hurt(f.t,100,f.a,{spell:true});near(f.t.hp,4870);skills(f.a,['A12K']);near(sourceAttackStart(f.g,f.a,f.t).outgoingFactor,1);
});
test('armor and thick hide both affect actual piercing weapon damage',()=>{
 const f=fixture();skills(f.a,[]);skills(f.t,['A12K']);f.a.damage=100;f.a.weapon1={...f.a.weapon1,atkType1:'pierce'};f.t.armor=10;f.g._attack(f.a,f.t,f.g.state.entities);near(f.t.hp,5000-100*f.g._armorFactor(10)*.65);
});
test('JSON roundtrip preserves counters, dynamic abilities and next RNG result',()=>{
 const f=fixture();skills(f.a,['A129','A12C']);delete f.g._random;f.a.skillStates.A129.remainingHits=1;f.a.skillStates.A12C.hits=7;const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id),t=g.state.entities.find(e=>e.id===f.t.id);f.event();sourceClassAttackDamageEvent(g,t,a,{weapon:true},10);assert.equal(g._rng,f.g._rng);assert.deepEqual(a.skillStates,f.a.skillStates);assert.deepEqual(a.skillSpecs.map(s=>s.id),f.a.skillSpecs.map(s=>s.id));near(a.hp,f.a.hp);
});
test('real desert upgrade branch deploys king h0Q3 and gains critical from registered damage events',()=>{
 const g=new Game({mode:'sandbox',builderId:'v14_builder_u01X',seed:40}),p=g.state.players[0];ok(g.command('build',{unitId:'v14_n05U',col:1,row:1}));ok(g.command('sandboxComplete'));const b=p.buildings[0];for(const unitId of ['v14_n05V','v14_n05W']){ok(g.command('upgrade',{buildingId:b.id,unitId}));ok(g.command('sandboxComplete'));}ok(g.command('ready'));const a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(a.combatRawcode,'h0Q3');const t=g.state.kings.find(k=>k.side!==a.side);for(let i=0;i<8;i++)sourceClassAttackDamageEvent(g,t,a,{weapon:true},10);assert.equal(has(a,'A12I'),true);assert.equal(g.unitSkillStatus(a.id).length,0);
});
test('natural tick attacks progress counters and pause preserves them',()=>{
 const f=fixture();skills(f.a,['A12C']);f.a.attackCd=0;f.a.damage=10;f.g.state.paused=true;f.g.tick(1);assert.equal(f.a.skillStates.A12C.hits,undefined);f.g.state.paused=false;for(let n=0;n<200&&!has(f.a,'A12I');n++)f.g.tick(.05);assert.equal(has(f.a,'A12I'),true);near(f.a.hp,4200);
});
