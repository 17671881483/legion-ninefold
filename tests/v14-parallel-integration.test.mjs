import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,tickSourceScriptJobs} from '../dist/skills.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const specs=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
const spiders=g=>g.state.entities.filter(e=>e.status.broodmotherSpawn);
function fixture(){
 const g=new Game({mode:'sandbox',seed:28});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;
 const p=laneToWorld(0,3,6);
 const make=(code='h03E',side='monster',ids=[],extra={})=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,userData:side==='defender'?1:5,worldX:p.x,worldY:p.y,...extra});specs(e,ids);e.buffs=[];e.hp=e.maxHp=2000;e.mana=e.maxMana=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;e.traits=[];e.isNativeHero=e.isHero=false;g.state.entities.push(e);return e;};
 const at=time=>{g.state.time=time;tickSourceScriptJobs(g);};
 const hit=(target,amount,source)=>g._hurt(target,amount,source,{spell:true,universal:true});
 return {g,make,at,hit,p};
}
test('five souls fall through to spider birth while six souls cancel event damage and block later branches',()=>{
 for(const n of [5,6]){const f=fixture(),a=f.make('h0JI','defender',['A0I1']),t=f.make('h03L','monster',['A0XM','A0ID']);t.hp=100;t.status.sourceKillnum=n;t.buffs=[{key:'B04U',expiresAt:20}];const dealt=f.hit(t,101,a);
 assert.equal(spiders(f.g).length,n===5?1:0);assert.equal(t.status.huskarDuelTag,undefined);assert.equal(t.status.sourceKillnum,n===5?5:0);assert.equal(dealt,n===5?101:0);}
});
test('toxin command failure still occupies its elseif before spider birth and duel',()=>{
 const f=fixture(),a=f.make('h0JI','defender',['A0I1']),t=f.make('h03L','monster',['A0XM','A0I5','A0ID']);t.hp=100;t.status.sourceKillnum=5;t.buffs=[{key:'B04U',expiresAt:20}];a.worldX+=20;f.hit(t,101,a);
 assert.equal(t.status.soulToxinOrderRequest.reason,'out-of-range');assert.equal(spiders(f.g).length,0);assert.equal(t.status.huskarDuelTag,undefined);
});
test('six souls suppress toxin but original local damage still reaches the separate unyielding branch',()=>{
 const f=fixture(),a=f.make('h0JI','defender',['A0I1']),t=f.make('h03L','monster',['A0XM','A0I5','A0IE']);t.hp=100;t.status.sourceKillnum=6;t.buffs=[{key:'B04U',expiresAt:20}];near(f.hit(t,3000,a),0);
 assert.equal(t.status.soulToxinOrderRequest,undefined);assert.equal(spiders(f.g).length,0);assert.equal(t.status.huskarUnyielding,true);near(t.hp,1400);
});
test('spider creation can coexist with later unyielding but does not also start duel',()=>{
 const f=fixture(),a=f.make('h0JI','defender',['A0I1']),t=f.make('h0JJ','monster',['A0ID','A0IE']);t.hp=100;t.buffs=[{key:'B04U',expiresAt:20}];f.hit(t,101,a);
 assert.equal(spiders(f.g).length,1);assert.equal(t.status.huskarDuelTag,undefined);assert.equal(t.status.huskarUnyielding,true);near(t.hp,100);
});
test('an actual elemental prefix suppresses both toxin and spider without a broad ability guard',()=>{
 for(const roll of [0,.99]){const f=fixture(),a=f.make('h0JI','defender',['A0HX','A0I1']),t=f.make('h03L','monster',['A0I5']);t.hp=100;t.buffs=[{key:'B04U',expiresAt:20}];f.g._random=()=>roll;f.hit(t,1,a);
 assert.equal(!!t.status.soulToxinOrderRequest,roll===.99);assert.equal(spiders(f.g).length,0);}
});
test('poison tick spawns a spider before death and queues skeleton revival after death, preserved through JSON',()=>{
 const f=fixture(),caster=f.make('h0JI','defender',['A0I5','A0I1']),primary=f.make(),king=f.make('h0JJ','monster',['A0IA']);primary.worldX+=.3;king.worldX+=.4;king.hp=9;f.g.state.skeletonKingGate.li=true;
 f.hit(caster,1,primary);f.at(11);assert.ok(king.hp<=0);assert.equal(spiders(f.g).length,1);assert.ok(f.g.state.sourceSkillJobs.some(j=>j.type==='skeleton_king_revive'&&j.at===12));f.g._clearDead();
 const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot())));r.state.time=12;tickSourceScriptJobs(r);const body=r.state.entities.find(e=>e.combatRawcode==='h0JJ'&&e.id!==king.id&&e.hp>0);
 assert.ok(body);near(body.createdAt,12);assert.equal(body.status.skeletonKingU1,true);assert.equal(body.status.sourceRemoved,undefined);assert.equal(body.buffs.some(b=>b.key==='B04U'),false);assert.equal(r.state.sourceSkillJobs.some(j=>j.type==='soul_toxin'),false);
});
test('fire kills inside main death neither add another soul nor queue skeleton revival',()=>{
 const f=fixture(),killer=f.make('h03L','defender',['A0XM','A0HW']),first=f.make(),king=f.make('h0JJ','monster',['A0IA']);killer.mana=0;king.hp=10;f.g.state.skeletonKingGate.li=true;f.g._random=()=>0;f.hit(first,1e6,killer);
 assert.ok(king.hp<=0);assert.equal(killer.status.sourceKillnum,1);assert.equal(f.g.state.sourceSkillJobs.some(j=>j.type==='skeleton_king_revive'),false);assert.equal(f.g._sourceUnitDeathTriggerDepth,0);
});
test('a retained dead toxin caster can kill and revive a skeleton on the next scheduled callback',()=>{
 const f=fixture(),caster=f.make('h0JI','defender',['A0I5']),primary=f.make(),king=f.make('h0JJ','monster',['A0IA']);primary.worldX+=.3;king.worldX+=.4;king.hp=80;f.g.state.skeletonKingGate.li=true;
 f.hit(caster,1,primary);f.g._killUnit(caster);f.g._clearDead();f.at(11);assert.ok(king.hp<=0);assert.ok(f.g.state.sourceSkillJobs.some(j=>j.type==='skeleton_king_revive'));f.at(12);assert.ok(f.g.state.entities.some(e=>e.combatRawcode==='h0JJ'&&e.id!==king.id&&e.hp>0));
});
