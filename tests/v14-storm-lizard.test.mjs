import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,sourceClassAttackDamageEvent} from '../dist/skills.js';
import {stormLizardSpellEffect,stormLizardChanneling} from '../dist/storm-lizard-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const skills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));};
const ok=r=>assert.equal(r.ok,true,r.message);
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const g=new Game({mode:'sandbox',seed:38});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;g._aiAct=()=>{};for(const k of g.state.kings){k.worldX=10000;k.worldY=10000;}
 const p=laneToWorld(0,3,6);
 const make=(dx=.2,side='monster',raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=5000;e.mana=e.maxMana=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;e.moveSpeed=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0Q5'),t=make();skills(a,['A12F','A12H']);
 const cast=(point={x:t.worldX,y:t.worldY})=>g.command('cast',{entityId:a.id,skillId:'A12F',worldX:point.x,worldY:point.y});
 return {g,a,t,p,make,cast};
}
test('source evidence pins registration, exact filters, ring damage and missing native fields',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/storm-lizard-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');assert.equal(createHash('sha256').update(raw).digest('hex'),p.source.sha256);for(const e of p.sourceEvidence)assert.equal(lines[e.line-1].replace(/\r$/,''),e.text);assert.equal(p.abilities.A12F.DataA1,undefined);assert.equal(p.abilities.A12G.DataC1,undefined);assert.equal(p.abilities.A12F.Cost1,'18');
});
test('manual point cast consumes18 mana, shares5s cooldown and exposes scaled800 range',()=>{
 const f=fixture(),ui=f.g.unitSkillStatus(f.a.id)[0];assert.equal(ui.id,'A12F');assert.equal(ui.targetKind,'point');assert.equal(ui.cooldownMode,'shared_native');near(ui.range,800/300);ok(f.cast());near(f.a.mana,82);near(f.a.skillStates.A12F.readyAt,15);near(f.t.hp,4000);near(f.t.status.stunUntil,15);assert.equal(f.a.status.stormLizardStrike.primaryId,f.t.id);assert.equal(f.cast().ok,false);near(f.a.mana,82);
});
test('cast rejects invalid point, range, unavailable caster, resources and pause without spending',()=>{
 for(const mode of ['point','range','dead','hidden','removed','stun','mana','cooldown','pause']){const f=fixture();let point={x:f.t.worldX,y:f.t.worldY};if(mode==='point')point={x:NaN,y:0};if(mode==='range')point.x=f.a.worldX+800/300+.01;if(mode==='dead')f.a.hp=0;if(mode==='hidden')f.a.status.sourceHidden=true;if(mode==='removed')f.a.status.sourceRemoved=true;if(mode==='stun')f.a.status.stunUntil=20;if(mode==='mana')f.a.mana=17;if(mode==='cooldown')f.a.skillStates.A12F.readyAt=20;if(mode==='pause')f.g.state.paused=true;const mana=f.a.mana;assert.equal(f.cast(point).ok,false,mode);near(f.a.mana,mana);assert.equal(f.a.status.stormLizardStrike,undefined);}
});
test('ring boundaries use spell point and exclude only chosen primary from splash',()=>{
 const f=fixture(),point={x:f.t.worldX,y:f.t.worldY};const offsets=[100,100.01,200,200.01,300,300.01],bodies=offsets.map(d=>f.make(.2+d/300));ok(f.cast());assert.deepEqual(bodies.map(e=>5000-e.hp),[200,150,150,100,100,0]);assert.equal(f.a.status.stormLizardStrike.areaIds.includes(f.t.id),false);assert.deepEqual(bodies.map(e=>e.status.stormLizardStunRequest?.level),[1,1,1,1,1,undefined]);
});
test('main selection is random100 around point, consumes one draw per candidate and has no target lock',()=>{
 const f=fixture(),other=f.make(.3);let draws=0;f.g._random=()=>{draws++;return 0;};ok(f.cast());assert.equal(f.a.status.stormLizardStrike.primaryId,other.id);assert.equal(draws,2);near(f.t.hp,4800);near(other.hp,4000);
});
test('empty100 center still splashes living enemies300 away; empty area still consumes cast',()=>{
 const f=fixture();f.t.worldX=f.a.worldX+200/300;ok(f.cast({x:f.a.worldX,y:f.a.worldY}));assert.equal(f.a.status.stormLizardStrike.primaryId,null);near(f.t.hp,4850);const z=fixture();z.t.worldX+=100;ok(z.cast({x:z.a.worldX,y:z.a.worldY}));near(z.a.mana,82);assert.deepEqual(z.a.status.stormLizardStrike.areaIds,[]);
});
test('GetRandomTarget permits corpse and Avul while SelectRange excludes them',()=>{
 for(const mode of ['corpse','Avul']){const f=fixture(),other=f.make(.25);if(mode==='corpse')f.t.hp=0;else skills(f.t,['Avul']);const initial=f.t.hp;ok(f.cast());assert.equal(f.a.status.stormLizardStrike.primaryId,f.t.id);near(f.t.hp,initial);near(other.hp,4800);assert.equal(f.t.status.stormLizardStunRequest.controlAdapted,false);}
});
test('enumeration excludes allies, another battle, locust, hidden and removed',()=>{
 for(const mode of ['ally','battle','locust','hidden','removed']){const f=fixture();if(mode==='ally')f.t.side=f.a.side;if(mode==='battle')f.t.battleTeam=1;if(mode==='locust')skills(f.t,['Aloc']);if(mode==='hidden')f.t.status.sourceHidden=true;if(mode==='removed')f.t.status.sourceRemoved=true;ok(f.cast());near(f.t.hp,5000);assert.equal(f.a.status.stormLizardStrike.primaryId,null);assert.equal(f.a.status.stormLizardStrike.areaIds.length,0);}
});
test('hero controls use2.5 and0.5, mechanical rejects control but retains script damage',()=>{
 for(const mode of ['hero','mechanical','building']){const f=fixture(),other=f.make(.8);if(mode==='hero'){f.t.isNativeHero=other.isNativeHero=true;}if(mode==='mechanical')f.t.traits=other.traits=['mechanical'];if(mode==='building')f.t.isBuilding=other.isBuilding=true;ok(f.cast());near(f.t.hp,4000);near(other.hp,4850);if(mode==='hero'){near(f.t.status.stunUntil,12.5);near(other.status.stunUntil,10.5);}else{assert.equal(f.t.status.stunUntil,undefined);assert.equal(other.status.stunUntil,undefined);}}
});
test('normal attack type and magic damage respect type matrix/immunity but ignore armor reduction',()=>{
 const f=fixture();f.t.armor=100;f.t.sourceArmorTypeRaw='fort';const multiplier=f.g._typeMultiplier('normal',f.t.armorType,'fort');ok(f.cast());near(f.t.hp,5000-1000*multiplier);const m=fixture();skills(m.t,['Amim']);ok(m.cast());near(m.t.hp,5000);assert.equal(m.t.status.stormLizardStunRequest.controlAdapted,false);
});
test('vertigo request precedes each damage; area is enumerated after primary damage',()=>{
 const f=fixture(),calls=[];stormLizardSpellEffect(f.g,f.a,{x:f.t.worldX,y:f.t.worldY},{compileAbility:(g,e,id)=>compileSkills({abilityIds:[id],skillVersion:'v14.1A5'})[0],applyNativeStun:(g,a,t,id,d)=>{calls.push(['stun',t.id,d]);return true;},nativeDamage:(g,t,n,a,opts)=>{calls.push(['damage',t.id,n,opts]);if(n===1000)f.make(.4);}});assert.deepEqual(calls.map(c=>c[0]),['stun','damage','stun','damage']);assert.equal(calls[3][2],200);assert.deepEqual(calls[1][3],{attackType:'normal',damageType:'magic',weapon:true});
});
test('weapon listener triggers on both sides, attacker monsoon has precedence even if it fails',()=>{
 for(const mode of ['source','target','both-failed']){const f=fixture();if(mode!=='source'){skills(f.t,['A12F']);skills(f.a,mode==='both-failed'?['A12F']:[]);}if(mode==='both-failed')f.a.mana=0;sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},0);assert.equal(!!f.a.status.stormLizardMonsoonRequest,mode!=='target');assert.equal(!!f.t.status.stormLizardMonsoonRequest,mode==='target');}
});
test('ordinary spell does not trigger listener; weapon spell does, amount0 and same side do not gate it',()=>{
 for(const mode of ['spell','weapon','zero','ally']){const f=fixture();if(mode==='ally')f.t.side=f.a.side;sourceClassAttackDamageEvent(f.g,f.t,f.a,mode==='spell'?{spell:true}:{spell:true,weapon:true},mode==='zero'?0:50);assert.equal(!!f.a.status.stormLizardMonsoonRequest,mode!=='spell');}
});
test('busy damage-source guard blocks nested script requests and resets on completion',()=>{
 const f=fixture();f.a.status.sourceNativeAttackBusy=true;sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},50);assert.equal(f.a.status.stormLizardMonsoonRequest,undefined);f.a.status.sourceNativeAttackBusy=false;sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},50);assert.equal(f.a.skillStates.A12F.casts,1);assert.equal(f.a.status.sourceNativeAttackBusy,false);
});
test('main spell trigger disabling suppresses script but preserves native resource/order adapter',()=>{
 const f=fixture();f.g._sourceAbilityEffectDepth=1;ok(f.cast());near(f.a.mana,82);assert.equal(f.a.status.stormLizardCast.scriptApplied,false);near(f.t.hp,5000);assert.equal(f.g._sourceAbilityEffectDepth,1);assert.equal(stormLizardChanneling(f.g,f.a),true);
});
test('successful monsoon precedes A12H and prevents attacker probability draw',()=>{
 const f=fixture();let draws=0;f.g._random=()=>{draws++;return .99;};sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},50);assert.equal(draws,1);assert.equal(f.a.status.stormLizardProc,undefined);assert.equal(f.a.status.stormLizardMonsoonRequest.outcome,'adapted-success');
});
test('failed monsoon permits30percent endpoint and retains granted A12G without guessed native damage',()=>{
 for(const [draw,success]of [[0,true],[.3,true],[.300001,false],[.99,false]]){const f=fixture();f.a.mana=0;f.g._random=()=>draw;sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},50);assert.equal(f.a.skillSpecs.some(s=>s.id==='A12G'),success);near(f.t.hp,5000);near(f.a.mana,0);if(success){assert.equal(f.a.status.stormLizardProc.request.outcome,'native-unresolved');const g=Game.fromSnapshot(clone(f.g.snapshot()));assert.ok(g.state.entities.find(e=>e.id===f.a.id).skillSpecs.some(s=>s.id==='A12G'));}}
});
test('attacker proc failure does not fall back to defender and draws once',()=>{
 const f=fixture();skills(f.a,['A12H']);skills(f.t,['A12H']);let draws=0;f.g._random=()=>{draws++;return .9;};sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},50);assert.equal(draws,1);assert.ok(f.a.status.stormLizardProc);assert.equal(f.t.status.stormLizardProc,undefined);
});
test('defender branch checks ATTACKER current order even while defender starts monsoon',()=>{
 for(const order of ['', 'monsoon']){const f=fixture();skills(f.a,[]);skills(f.t,['A12F','A12H']);f.a.currentOrder=order;f.g._random=()=>0;sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},50);assert.equal(f.t.status.stormLizardMonsoonRequest.outcome,'adapted-success');assert.equal(f.t.skillSpecs.some(s=>s.id==='A12G'),order==='');}
});
test('unknown rain keeps unresolved request and never invents damage cost or branch fallback',()=>{
 const f=fixture();skills(f.a,['A12E']);skills(f.t,['A12F']);sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},50);assert.equal(f.a.status.stormLizardMonsoonRequest.reason,'native-ANmo-unresolved');assert.equal(f.t.status.stormLizardMonsoonRequest,undefined);near(f.a.mana,100);near(f.t.hp,5000);assert.equal(f.g.unitSkillStatus(f.a.id).length,0);
});
test('channel survives JSON restore, expires after1s and ends on control interruption',()=>{
 const f=fixture();ok(f.cast());const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);assert.equal(stormLizardChanneling(g,a),true);g.state.time=10.999;assert.equal(stormLizardChanneling(g,a),true);g.state.time=11;assert.equal(stormLizardChanneling(g,a),false);assert.equal(a.status.stormLizardChannel,undefined);f.a.status.stunUntil=10.2;assert.equal(stormLizardChanneling(f.g,f.a),false);
});
test('natural channel pauses attacks but continues poison damage and mana regeneration',()=>{
 const f=fixture();ok(f.cast());const hp=f.a.hp;f.a.status.poisonUntil=11;f.a.status.poisonDps=20;f.a.status.poisonOwner=f.t;f.a.manaRegen=2;f.a.attackCd=0;const enemyHp=f.t.hp;f.g.tick(.1);assert.ok(f.a.hp<hp);assert.ok(f.a.mana>82);near(f.t.hp,enemyHp);
});
test('source-selected random continuation and native cooldown remain deterministic after restore',()=>{
 const f=fixture();f.make(.3);delete f.g._random;const g=Game.fromSnapshot(clone(f.g.snapshot()));ok(f.cast());ok(g.command('cast',{entityId:f.a.id,skillId:'A12F',worldX:f.t.worldX,worldY:f.t.worldY}));assert.equal(g._rng,f.g._rng);assert.deepEqual(g.state.entities.map(e=>e.hp),f.g.state.entities.map(e=>e.hp));assert.deepEqual(g.state.entities[0].status.stormLizardStrike,f.a.status.stormLizardStrike);
});
test('real desert-lizard upgrade chain deploys correct combat body and permits manual point cast',()=>{
 const g=new Game({mode:'sandbox',builderId:'v14_builder_u01X',seed:38}),p=g.state.players[0];ok(g.command('build',{unitId:'v14_n05U',col:1,row:1}));ok(g.command('sandboxComplete'));const b=p.buildings[0];for(const unitId of ['v14_n05X','v14_n05Y']){ok(g.command('upgrade',{buildingId:b.id,unitId}));ok(g.command('sandboxComplete'));}ok(g.command('ready'));const a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(a.combatRawcode,'h0Q5');a.mana=20;ok(g.command('cast',{entityId:a.id,skillId:'A12F',worldX:a.worldX,worldY:a.worldY}));near(a.mana,2);
});
test('natural attacks eventually auto-cast, while pause does not trigger or consume mana',()=>{
 const f=fixture();f.a.attackCd=0;f.a.damage=10;f.a.mana=20;f.t.hp=100000;f.g.state.paused=true;f.g.tick(1);assert.equal(f.a.status.stormLizardCast,undefined);f.g.state.paused=false;for(let n=0;n<50&&!f.a.status.stormLizardCast;n++)f.g.tick(.05);assert.ok(f.a.status.stormLizardCast);assert.equal(f.a.skillStates.A12F.casts,1);near(f.a.mana,2);
});
