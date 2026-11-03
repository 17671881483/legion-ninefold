import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,sourceAttackIssued,tickSourceSkills,sourceClassAttackDamageEvent,tickSourceScriptJobs} from '../dist/skills.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const skills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));};
function fixture(){
 const g=new Game({mode:'sandbox',seed:45});g.state.entities=[];g.state.sourceSkillJobs=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;const p=laneToWorld(0,3,6);
 const make=(side='monster',ids=[],raw='h03E',dx=.2)=>{const e=g._entity(UNIT_TEMPLATES[raw],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=1000;e.mana=e.maxMana=100;e.damage=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;skills(e,ids);g.state.entities.push(e);return e;};
 const a=make('defender',['A0LH'],'h0M1',0),t=make();
 const at=time=>{g.state.time=time;tickSourceScriptJobs(g);},event=(amount=100,options={weapon:true})=>sourceClassAttackDamageEvent(g,t,a,options,amount);
 return{g,a,t,make,at,event};
}

test('source pins actual marker recipient, registry, branch order and native pulse fields',()=>{
 const ev=JSON.parse(readFileSync(new URL('../reference/tirion-holy-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url));assert.equal(createHash('sha256').update(b).digest('hex'),ev.source.sha256);const lines=b.toString('latin1').split('\n');for(const r of ev.sourceEvidence)assert.equal(lines[r.line-1].replace(/\r$/,''),r.text);assert.equal(ev.ability.DataA1,'15.0');assert.equal(ev.ability.Dur1,'1.0');
});
test('attacking Tirion marks attacker only; allied attack event has no added enemy gate',()=>{
 for(const same of [false,true]){const f=fixture();if(same)f.t.side=f.a.side;sourceAttackIssued(f.g,f.t,f.a);assert.equal(f.t.status.sourceHashtableBoolean1,true);assert.equal(f.a.status.sourceHashtableBoolean1,undefined);}
});
test('exact h0M1, nativeowner8..12 and registry gate; no A0LG or A0LH ability required',()=>{
 const f=fixture();skills(f.a,[]);sourceAttackIssued(f.g,f.t,f.a);assert.equal(f.t.status.sourceHashtableBoolean1,true);
 for(const raw of ['h0VT','h0M2']){const x=fixture();x.a.combatRawcode=raw;sourceAttackIssued(x.g,x.t,x.a);assert.equal(x.t.status.sourceHashtableBoolean1,undefined);}
 for(const owner of [0,7,13]){const x=fixture();x.a.sourceNativeOwnerId=owner;sourceAttackIssued(x.g,x.t,x.a);assert.equal(x.t.status.sourceHashtableBoolean1,undefined);}
});
test('earlier attack raw branches consume marker even when nested mana or random fails',()=>{
 for(const raw of ['h0OS','h088','h0SI','h04M','h0P9','h04N','n205','h06G','h16G','n1S2','n1S4','h03B','h0OC','n007','n0SB','h06Z','h09P','h19P','h0A7','h0AV','h0AW','h06C','h069','h06A','h0O9','h0OE','h08T','h02D','h0P4','h2AA']){const f=fixture();f.t.combatRawcode=raw;f.t.mana=0;sourceAttackIssued(f.g,f.t,f.a);assert.equal(f.t.status.sourceHashtableBoolean1,undefined,raw);}
});
test('attack prefix checks positive ability, fullmana, buff, timer and exact mana thresholds',()=>{
 for(const id of ['A06O','A0TB']){const f=fixture();skills(f.t,[id]);sourceAttackIssued(f.g,f.t,f.a);assert.equal(f.t.status.sourceHashtableBoolean1,undefined);f.t.abilityLevels={[id]:0};sourceAttackIssued(f.g,f.t,f.a);assert.equal(f.t.status.sourceHashtableBoolean1,true);}
 for(const raw of ['h074','h075','h092','h02U']){const f=fixture();f.t.combatRawcode=raw;sourceAttackIssued(f.g,f.t,f.a);assert.equal(f.t.status.sourceHashtableBoolean1,undefined);f.t.mana=99;sourceAttackIssued(f.g,f.t,f.a);assert.equal(f.t.status.sourceHashtableBoolean1,true);}
 const f=fixture();skills(f.t,['S006']);f.t.mana=17;sourceAttackIssued(f.g,f.t,f.a);assert.equal(f.t.status.sourceHashtableBoolean1,undefined);f.t.status.sourceS006Timer=true;sourceAttackIssued(f.g,f.t,f.a);assert.equal(f.t.status.sourceHashtableBoolean1,true);
 const x=fixture();x.t.combatRawcode='h08B';sourceAttackIssued(x.g,x.t,x.a);assert.equal(x.t.status.sourceHashtableBoolean1,undefined);x.t.buffs=[{key:'B02Y',expiresAt:99}];sourceAttackIssued(x.g,x.t,x.a);assert.equal(x.t.status.sourceHashtableBoolean1,true);
});
test('later h02H branch cannot suppress the earlier Tirion mark; mark persists across target changes',()=>{
 const f=fixture();f.t.combatRawcode='h02H';sourceAttackIssued(f.g,f.t,f.a);sourceAttackIssued(f.g,f.t,f.make());assert.equal(f.t.status.sourceHashtableBoolean1,true);
});
test('real monster windup marks before attack release and cancellation does not erase it',()=>{
 const f=fixture();f.t.weapon1={...f.t.weapon1,dmgpt1:'1'};f.g._beginMonsterAttack(f.t,f.a,Object.assign([f.t,f.a],{auras:[]}));assert.equal(f.t.status.sourceHashtableBoolean1,true);assert.ok(f.t.pendingAttack);f.t.pendingAttack=null;assert.equal(f.t.status.sourceHashtableBoolean1,true);
});
test('exact15-event adds105 without requiring A0LG; 14.9999 and16 do not',()=>{
 for(const n of [15,14.9999,16]){const f=fixture();skills(f.a,[]);f.t.status.sourceHashtableBoolean1=true;f.g._hurt(f.t,n,f.a,{spell:true});near(f.t.hp,1000-n-(n===15?105:0));assert.equal(!!f.a.status.tirionHolyBonus,n===15);}
});
test('skin and unmarked target do not proc; own marker is not a substitute for victim marker',()=>{
 for(const mode of ['skin','unmarked','own']){const f=fixture();if(mode==='skin'){f.a.combatRawcode='h0VT';f.t.status.sourceHashtableBoolean1=true;}if(mode==='own')f.a.status.sourceHashtableBoolean1=true;f.g._hurt(f.t,15,f.a,{spell:true});near(f.t.hp,985);}
});
test('A2Y7, self, allied and disabled main listener suppress extra',()=>{
 for(const mode of ['illusion','self','ally','disabled']){const f=fixture();skills(f.a,mode==='illusion'?['A2Y7']:[]);f.t.status.sourceHashtableBoolean1=true;if(mode==='ally')f.t.side=f.a.side;if(mode==='self'){f.t=f.a;f.t.status.sourceHashtableBoolean1=true;}if(mode==='disabled')f.g._sourceDamageTriggerDepth=1;f.g._hurt(f.t,15,f.a,{spell:true});near(f.t.hp,985);}
});
test('sharedkey2 is set through nested damage and explicitly cleared; no recursive ash bonus',()=>{
 const f=fixture();f.t.status.sourceHashtableBoolean1=true;let innerFlag;const old=f.g._hurt.bind(f.g);f.g._hurt=(t,n,e,o)=>{if(n===105)innerFlag=e.status.sourceHashtableBoolean2;return old(t,n,e,o);};f.g._hurt(f.t,15,f.a,{spell:true});near(f.t.hp,880);assert.equal(innerFlag,true);assert.equal(f.a.status.sourceHashtableBoolean2,false);assert.equal(f.a.status.tirionAshbringer,undefined);
});
test('exact15 weapon event permits one independent ash bonus after holybonus',()=>{
 const f=fixture();f.t.status.sourceHashtableBoolean1=true;f.g._hurt(f.t,15,f.a,{weapon:true});near(f.t.hp,580);assert.equal(f.g.state.events.filter(x=>x.skillId==='A0LH').length,1);
});
test('healing checks victim own mark, occurs before damage and caps at maximum',()=>{
 for(const hp of [400,1000]){const f=fixture();f.a.hp=hp;f.a.status.sourceHashtableBoolean1=true;f.g._hurt(f.a,100,f.t,{spell:true});near(f.a.hp,hp===400?350:900);near(f.a.status.tirionHolyHeal.requested,50);}
 const f=fixture();f.t.status.sourceHashtableBoolean1=true;f.g._hurt(f.a,100,f.t,{spell:true});near(f.a.hp,900);assert.equal(f.a.status.tirionHolyHeal,undefined);
});
test('bonus branch consumes elseif before marked Tirion victim healing',()=>{
 const f=fixture();f.t.combatRawcode='h0M1';f.t.hp=500;f.t.status.sourceHashtableBoolean1=true;f.g._hurt(f.t,15,f.a,{spell:true});near(f.t.hp,380);assert.equal(f.t.status.tirionHolyHeal,undefined);
});
test('huskar and malfurion earlier branches block holyheal and no duplicate random draw',()=>{
 for(const id of ['A0II','A0JA']){const f=fixture();f.a.hp=400;f.a.status.sourceHashtableBoolean1=true;if(id==='A0II')skills(f.a,[id]);else skills(f.t,[id]);f.g._hurt(f.a,100,f.t,{spell:true});assert.equal(f.a.status.tirionHolyHeal,undefined);}
 const f=fixture();f.a.hp=400;f.a.status.sourceHashtableBoolean1=true;f.t.combatRawcode='h055';let draws=0;f.g._random=()=>{draws++;return .4;};f.g._hurt(f.a,100,f.t,{spell:true});near(f.a.hp,300);assert.equal(f.a.status.tirionHolySkipped,'h055');assert.equal(draws,1);
});
test('prefix h02F strict range, failed h055 roll, and A0LN exact level',()=>{
 for(const [raw,n,roll,id,lv,expected]of[['h02F',500,.99,null,1,false],['h02F',450,.99,null,1,true],['h055',100,.99,null,1,true],['h03E',100,.99,'A0LN',1,false],['h03E',100,.99,'A0LN',2,true]]){const f=fixture();f.a.hp=700;f.a.status.sourceHashtableBoolean1=true;f.t.combatRawcode=raw;f.g._random=()=>roll;if(id){skills(f.t,[id]);f.t.abilityLevels={[id]:lv};}f.g._hurt(f.a,n,f.t,{spell:true});assert.equal(!!f.a.status.tirionHolyHeal,expected);}
});
test('native15 burn is one event per second, catches up whole pulses and keeps fractional remainder',()=>{
 const f=fixture();skills(f.a,['A0LG']);f.t.status.sourceHashtableBoolean1=true;const battle=Object.assign([f.a,f.t],{auras:[]});for(let i=0;i<9;i++)tickSourceSkills(f.g,f.a,battle,.1);near(f.t.hp,1000);tickSourceSkills(f.g,f.a,battle,.1);near(f.t.hp,880);tickSourceSkills(f.g,f.a,battle,2.5);near(f.t.hp,640);near(f.a.skillStates.A0LG.tirionBurnElapsed,.5);
});
test('burn pulse respects immunity, range and skin retains only baseburn',()=>{
 const f=fixture();skills(f.a,['A0LG']);f.a.combatRawcode='h0VT';f.t.status.sourceHashtableBoolean1=true;tickSourceSkills(f.g,f.a,[f.a,f.t],1);near(f.t.hp,985);skills(f.t,['Amim']);tickSourceSkills(f.g,f.a,[f.a,f.t],1);near(f.t.hp,985);skills(f.t,[]);f.t.worldX+=100;tickSourceSkills(f.g,f.a,[f.a,f.t],1);near(f.t.hp,985);
});
test('reduced event damage is no longer15 and must not receive fabricated105',()=>{
 const f=fixture();skills(f.a,['A0LG']);f.t.status.incomingMultiplier=.5;f.t.status.sourceHashtableBoolean1=true;tickSourceSkills(f.g,f.a,[f.a,f.t],1);assert.ok(f.t.hp>880);assert.equal(f.a.status.tirionHolyBonus,undefined);
});
test('save restores marker and fractional burn timer',()=>{
 const f=fixture();skills(f.a,['A0LG']);sourceAttackIssued(f.g,f.t,f.a);tickSourceSkills(f.g,f.a,[f.a,f.t],.4);const saved=JSON.parse(JSON.stringify(f.g.snapshot())),r=Game.fromSnapshot(saved);const a=r.state.entities.find(x=>x.id===f.a.id),t=r.state.entities.find(x=>x.id===f.t.id);assert.equal(t.status.sourceHashtableBoolean1,true);near(a.skillStates.A0LG.tirionBurnElapsed,.4);tickSourceSkills(r,a,[a,t],.6);near(t.hp,880);
});
test('zero-level A0LG does not burn or accumulate a hidden pulse',()=>{
 const f=fixture();skills(f.a,['A0LG']);f.a.abilityLevels={A0LG:0};tickSourceSkills(f.g,f.a,[f.a,f.t],3);near(f.t.hp,1000);assert.equal(f.a.skillStates.A0LG.tirionBurnElapsed,undefined);f.a.abilityLevels.A0LG=1;tickSourceSkills(f.g,f.a,[f.a,f.t],.5);near(f.t.hp,1000);
});
