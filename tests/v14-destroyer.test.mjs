import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,sourceAttackStart,sourceClassAttackDamageEvent,tickSourceSkills,sourceAuraEffects} from '../dist/skills.js';
import {laneToWorld,spawnWarpWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const setSkills=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
function fixture(code='h106'){
 const g=new Game({mode:'sandbox',seed:34});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;for(const k of g.state.kings){k.worldX=10000;k.worldY=10000;}
 const p=laneToWorld(0,3,6);
 const make=(side='monster',dx=.2,raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,userData:side==='defender'?1:5,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=10000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;g.state.entities.push(e);return e;};
 const a=make('defender',0,code),t=make();setSkills(t,[]);
 const hit=(target=t,source=a,options={spell:false})=>g._hurt(target,1,source,options);
 const hits=n=>{for(let i=0;i<n;i++)hit();};
 const children=()=>g.state.entities.filter(e=>e.status.destroyerOffspring);
 return {g,a,t,make,hit,hits,children};
}
test('Destroyer source evidence and explicit fields match the packet',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/destroyer-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');assert.equal(createHash('sha256').update(raw).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.abilities.A0J5.Cost1,'15');assert.equal(p.abilities.A0J5.Cool1,undefined);assert.equal(p.units.h106.mana0,undefined);
});
test('fifteenth damage event casts; sixteenth breeds; second child at32 with lifetime cap2',()=>{
 const f=fixture();f.hits(14);near(f.a.mana,14);assert.equal(f.children().length,0);f.hit();near(f.a.mana,0);near(f.t.hp,9935);assert.equal(f.children().length,0);f.hit();assert.equal(f.children().length,1);f.hits(15);assert.equal(f.children().length,1);f.hit();assert.equal(f.children().length,2);f.hits(32);assert.equal(f.children().length,2);assert.equal(f.a.status.destroyerAttackCount,32);
});
test('damage events count independently of attack start, health damage amount or multiple targets',()=>{
 const f=fixture();sourceAttackStart(f.g,f.a,f.t);assert.equal(f.a.status.destroyerAttackCount,undefined);f.hit(f.t,f.a,{spell:true,universal:true});near(f.a.mana,0);setSkills(f.t,['Amim']);f.hit(f.t,f.a,{spell:true,magic:true,weapon:true});near(f.a.mana,1);near(f.t.hp,9999);const t=f.make();setSkills(t,[]);f.hit(t);near(f.a.mana,2);assert.equal(f.a.status.destroyerAttackCount,2);
});
test('independent listener is not disabled by main damage/spell triggers and blocks own reentry',()=>{
 const f=fixture();f.a.status.sourceNativeAttackBusy=true;f.hit();near(f.a.mana,0);f.a.status.sourceNativeAttackBusy=false;f.g._sourceDamageTriggerDepth=1;f.g._sourceAbilityEffectDepth=1;f.hits(15);near(f.a.mana,0);assert.equal(f.a.skillStates.A0J5.casts,1);assert.equal(f.a.status.destroyerAttackCount,15,'native spell hits must not increment the weapon counter');
});
test('ordinary and skinned parents produce distinct fresh hunter bodies and new routes',()=>{
 for(const [raw,childRaw]of [['h106','n0SD'],['h2A8','h2AC'],['h2A9','h2AC']]){const f=fixture(raw==='h2A9'?'h2A8':raw);f.a.combatRawcode=raw;f.a.damage=999;f.a.facing=73;f.a.targetId=f.t.id;f.a.buffs=[{key:'parent',expiresAt:99,damage:1}];f.a.nav={mode:'chase',goal:{x:1,y:1}};f.hits(16);const child=f.children()[0];assert.equal(child.combatRawcode,childRaw);near(child.hp,300);near(child.damage,5.5);near(child.facing,73);near(child.worldX,f.a.worldX);assert.equal(child.userData,1);assert.equal(child.ownerId,0);assert.equal(child.isSummon,true);assert.equal(child.isIllusion,false);assert.equal(child.buildingId,undefined);assert.equal(child.expiresAt,undefined);assert.equal(child.buffs.length,0);assert.notEqual(child.targetId,f.t.id);assert.ok(child.status.sourceJWMember);assert.equal(child.status.sourceJHMember,1);assert.equal(child.nav.mode,'return');assert.deepEqual(child.nav.goal,spawnWarpWorld(0));}
});
test('newborn has hunter abilities but no inherited breeding or parent mana',()=>{
 const f=fixture();f.hits(16);const c=f.children()[0];assert.ok(c.skillSpecs.some(s=>s.id==='A0SB'));assert.equal(c.skillSpecs.some(s=>s.id==='A0IO'),false);near(c.mana,0);for(let i=0;i<32;i++)f.hit(f.t,c);assert.equal(f.children().length,1);assert.equal(c.status.destroyerAttackCount,32);
});
test('losing a child does not return a birth slot; parents have independent caps',()=>{
 const f=fixture();f.hits(32);for(const c of f.children())f.g._killUnit(c);f.g._clearDead();f.hits(32);assert.equal(f.children().length,0);assert.equal(f.a.status.destroyerOffspringCount,2);const second=f.make('defender',.1,'h106');for(let i=0;i<16;i++)f.hit(f.t,second);assert.equal(f.children().length,1);assert.equal(second.status.destroyerOffspringCount,1);
});
test('absent ability still counts; late ability addition does not restart its hashtable',()=>{
 const f=fixture();setSkills(f.a,[]);f.hits(15);setSkills(f.a,['A0IO']);f.hit();assert.equal(f.children().length,1);const late=fixture();setSkills(late.a,[]);late.hits(16);setSkills(late.a,['A0IO']);late.hit();assert.equal(late.children().length,0);assert.equal(late.a.status.destroyerAttackCount,17);
});
test('zero-level breeding and mana abilities do nothing; positive levels are allowed',()=>{
 const f=fixture();f.a.abilityLevels={A0IO:0,A0IN:0};f.hits(15);near(f.a.mana,0);f.a.abilityLevels={A0IO:2,A0IN:2};f.hit();assert.equal(f.children().length,1);near(f.a.mana,1);
});
test('illusion parents are not excluded and children are fresh real summons',()=>{
 const f=fixture();f.a.isIllusion=true;f.hits(16);assert.equal(f.children().length,1);assert.equal(f.children()[0].isIllusion,false);
});
test('mana equality is literal15, fractional mana clamps, values above15 do not cast',()=>{
 for(const [start,max,next,casts]of [[15,15,15,0],[14.5,15,0,1],[14,14,14,0],[16,30,17,0],[14.5,30,15.5,0]]){const f=fixture();f.a.mana=start;f.a.maxMana=max;f.hit();near(f.a.mana,next);assert.equal(f.a.skillStates.A0J5.casts,casts);}
});
test('native order is requested even if the executing ability is absent, but no mana is spent',()=>{
 const f=fixture();setSkills(f.a,['A0IN']);f.a.mana=14;f.hit();near(f.a.mana,15);assert.equal(f.a.status.destroyerClapRequest.outcome,'missing-ability');near(f.t.hp,9999);
});
test('failed command does not get automatically retried at full mana after stun or cooldown',()=>{
 for(const cause of ['stun','cooldown']){const f=fixture();f.a.mana=14;if(cause==='stun')f.a.status.stunUntil=11;else f.a.skillStates.A0J5.readyAt=11;f.hit();near(f.a.mana,15);assert.equal(f.a.status.destroyerClapRequest.outcome,cause==='stun'?'blocked':'cooldown');f.g.state.time=12;f.hit();assert.equal(f.a.skillStates.A0J5.casts,0);near(f.a.mana,15);assert.equal(f.a.status.destroyerClapRequest.at,10);}
});
test('A0IN branch decision is preserved before mana fills or is spent, blocking Tauren elseif',()=>{
 for(const blocked of [true,false]){const f=fixture();setSkills(f.a,['A0IN','A0J5','A0N5']);f.a.mana=14;if(blocked)f.a.status.stunUntil=11;let draws=0;f.g._random=()=>{draws++;return 0;};f.hit();assert.equal(f.a.status.taurenSkippedBranch,'A0IN');assert.equal(f.a.status.taurenLastRoll,undefined);assert.equal(draws,0);}
 const f=fixture();setSkills(f.a,['A0IN','A0N5']);f.a.mana=15;f.g._random=()=>0;sourceClassAttackDamageEvent(f.g,f.t,f.a,{spell:false},1);assert.equal(f.a.status.taurenLastRoll.roll,1);
});
test('clap uses caster-centered300 and50 damage, with enemy and immunity filtering',()=>{
 const f=fixture(),edge=f.make('monster',1),out=f.make('monster',1.001),friend=f.make('defender',.1),immune=f.make('monster',.1),inv=f.make('monster',.1),other=f.make('monster',.1);for(const t of [edge,out,friend,other])setSkills(t,[]);setSkills(immune,['Amim']);setSkills(inv,['Avul']);other.battleTeam=1;f.a.mana=14;f.hit();near(edge.hp,9950);for(const e of [out,friend,immune,inv,other])near(e.hp,10000);assert.equal(edge.status.stunUntil,undefined);assert.equal(edge.buffs.length,0);
});
test('clap damage adapter respects spell resistance and does not invent damage on friendly/locust units',()=>{
 const f=fixture(),armored=f.make('monster',.3),resistant=f.make('monster',.4),locust=f.make('monster',.5);setSkills(armored,[]);armored.armor=100;setSkills(resistant,['A19A']);setSkills(locust,['Aloc']);f.a.mana=14;f.hit();near(armored.hp,9950);near(resistant.hp,9970);near(locust.hp,10000);assert.ok(f.a.status.destroyerClapRequest.missingNativeFields.includes('Cool1'));
});
test('proximity tick cannot cast clap by itself at full mana',()=>{
 const f=fixture();f.a.mana=15;tickSourceSkills(f.g,f.a,f.g.state.entities,1);near(f.a.mana,15);near(f.t.hp,10000);assert.equal(f.a.skillStates.A0J5.casts,0);
});
test('unverified healing aura stays unresolved and does not advertise runtime healing',()=>{
 const f=fixture();const s=f.a.skillSpecs.find(s=>s.id==='A116');assert.equal(s.status,'unresolved');assert.equal(s.runtimeImplemented,false);const aura=sourceAuraEffects(f.g,f.a,[f.a]);near(aura.healRate,0);
});
test('JSON restore and pause preserve per-parent history, cap, mana and child route',()=>{
 const f=fixture();f.hits(31);f.g.state.paused=true;f.g.tick(20);near(f.g.state.time,10);const g=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),a=g.state.entities.find(e=>e.id===f.a.id),t=g.state.entities.find(e=>e.id===f.t.id);near(a.mana,1);assert.equal(a.status.destroyerAttackCount,15);g._hurt(t,1,a,{spell:false});assert.equal(g.state.entities.filter(e=>e.status.destroyerOffspring).length,2);assert.equal(a.status.destroyerOffspringCount,2);assert.equal(a.status.destroyerAttackCount,0);
});
test('legacy rules do not acquire v14 breeding or mana behavior',()=>{
 const f=fixture();f.a.skillVersion='5.0dJF';f.a.sourceVersion='5.0dJF';f.a.provenance='legacy';f.a.id='legacy-destroyer';f.a.unitId='legacy';f.hits(16);assert.equal(f.children().length,0);near(f.a.mana,0);
});
test('v33 snapshot refresh removes proximity casting without inventing attack history or spending saved mana',()=>{
 const f=fixture();f.a.mana=15;f.a.skillImplementationRevision='v14-content-20261029-v33-1';Object.assign(f.a.skillSpecs.find(s=>s.id==='A0J5'),{kind:'stomp',status:'implemented'});Object.assign(f.a.skillSpecs.find(s=>s.id==='A116'),{kind:'aura_regen',status:'implemented'});f.a.skillStates.A0J5={casts:3,readyAt:10.1};
 const g=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),a=g.state.entities.find(e=>e.id===f.a.id),t=g.state.entities.find(e=>e.id===f.t.id);assert.equal(a.skillSpecs.find(s=>s.id==='A0J5').kind,'destroyer_source');assert.equal(a.skillSpecs.find(s=>s.id==='A116').status,'unresolved');near(a.mana,15);assert.equal(a.skillStates.A0J5.casts,3);near(a.skillStates.A0J5.readyAt,10.1);assert.equal(a.status.destroyerAttackCount,undefined);g.state.time=11;tickSourceSkills(g,a,g.state.entities,0);g._hurt(t,1,a,{spell:false});near(a.mana,15);assert.equal(a.status.destroyerAttackCount,1);assert.equal(a.skillStates.A0J5.casts,3);
});
test('real build and egg upgrade commands deploy both skins, with fresh counters each round',()=>{
 for(const skin of [false,true]){const g=new Game({mode:'sandbox',builderId:'v14_builder_h0S0',seed:34}),p=g.state.players[0];p.populationCap=300;const ok=r=>assert.equal(r.ok,true,r.message),finish=()=>ok(g.command('sandboxComplete'));
 for(let i=0;i<20;i++)ok(g.command('build',{unitId:'v14_h0SC',col:i%6,row:Math.floor(i/6)}));finish();
 for(let i=0;i<10;i++)ok(g.command('upgrade',{buildingId:p.buildings[i].id,unitId:'v14_h0SD'}));finish();near(g._military(p),1300);const b=p.buildings[0];ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_h105'}));finish();
 if(skin){assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_h2A9'}).ok,false);ok(g.command('sandboxQualification',{key:'R0J4',enabled:true}));ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_h2A9'}));finish();}
 ok(g.command('ready'));let e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,skin?'h2A8':'h106');near(e.mana,0);for(let i=0;i<32;i++)sourceClassAttackDamageEvent(g,e,e,{spell:false},1);assert.equal(g.state.entities.filter(e=>e.status.destroyerOffspring).length,2);assert.ok(g.state.entities.filter(e=>e.status.destroyerOffspring).every(e=>e.combatRawcode===(skin?'h2AC':'n0SD')));
 ok(g.command('sandboxReset'));ok(g.command('ready'));e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.status.destroyerOffspringCount,undefined);assert.equal(e.status.destroyerAttackCount,undefined);near(e.mana,0);}
});
test('natural combat loop casts and breeds twice without external hit injection',()=>{
 const f=fixture();f.a.attackCd=0;f.a.moveSpeed=0;f.t.moveSpeed=0;f.t.hp=f.t.maxHp=100000;f.g._aiAct=()=>{};
 for(let i=0;i<400;i++)f.g.tick(.05);
 assert.equal(f.a.status.destroyerOffspringCount,2);assert.equal(f.children().length,2);assert.ok(f.a.skillStates.A0J5.casts>=2);assert.ok(f.t.hp<100000);assert.ok(Number.isFinite(f.t.hp)&&Number.isFinite(f.a.mana));
});
