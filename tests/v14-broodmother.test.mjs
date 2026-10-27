import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,tickSourceScriptJobs,sourceAuraEffects,sourceWeapon} from '../dist/skills.js';
import {queueBroodmotherAlliance} from '../dist/broodmother-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
const skills=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
const children=g=>g.state.entities.filter(e=>e.status.broodmotherSpawn);
function fixture(){
 const g=new Game({mode:'sandbox',seed:28});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;
 const p=laneToWorld(0,3,6);
 const make=(code='h03E',side='monster',ids=[],extra={})=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x,worldY:p.y,...extra});skills(e,ids);e.buffs=[];e.hp=e.maxHp=2000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;g.state.entities.push(e);return e;};
 const a=make('h0JI','defender',['A0I1']),t=make();t.hp=100;t.buffs.push({key:'B04U',expiresAt:20});
 const hit=(n=101,options={spell:true,universal:true})=>g._hurt(t,n,a,options);
 return {g,a,t,make,hit,p};
}
test('source evidence pins pre-damage strict branch, exact variant, injections and global enumeration',()=>{
 const proof=JSON.parse(readFileSync(new URL('../reference/broodmother-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');
 assert.equal(createHash('sha256').update(raw).digest('hex'),proof.source.sha256);for(const e of proof.sourceEvidence)assert.equal(lines[e.line-1].replace(/\r$/,''),e.text);
 assert.match(lines[41294],/P8>GetUnitState/);assert.match(lines[41307],/UNIT_TYPE_SUMMONED/);assert.match(lines[42885],/TriggerSleepAction\(1\)/);
});
test('spells and weapon hits both create one spider, only for strictly lethal local damage',()=>{
 for(const weapon of [false,true])for(const amount of [99,100,101]){const f=fixture();f.hit(amount,{spell:!weapon,weapon,universal:true});assert.equal(children(f.g).length,amount>100?1:0);}
});
test('spawn precedes final death and stays when later unyielding saves the victim',()=>{
 const f=fixture();skills(f.t,['A0IE']);f.hit();near(f.t.hp,100);assert.equal(f.t.status.huskarUnyielding,true);assert.equal(children(f.g).length,1);assert.equal(f.t.status.sourceDeathHandled,undefined);
});
test('buff presence and positive ability level are checked without invented poison ownership',()=>{
 for(const mode of ['missing','expired','zero-level','other-owner','native']){const f=fixture();if(mode==='missing')f.t.buffs=[];if(mode==='expired')f.g.state.time=20;if(mode==='zero-level')f.a.abilityLevels={A0I1:0};if(mode==='other-owner')f.t.buffs[0].sourceId=999;if(mode==='native'){f.t.buffs=[];f.t.nativeBuffIds=['B04U'];}f.hit();assert.equal(children(f.g).length,['other-owner','native'].includes(mode)?1:0,mode);}
});
test('main damage guards block allied self zero null A2Y7 and nested events',()=>{
 for(const mode of ['allied','self','zero','null','A2Y7','nested']){const f=fixture();if(mode==='allied')f.a.side=f.t.side;if(mode==='A2Y7')skills(f.a,['A0I1','A2Y7']);if(mode==='nested')f.g._sourceDamageTriggerDepth=1;f.g._hurt(f.t,mode==='zero'?0:101,mode==='null'?null:mode==='self'?f.t:f.a,{spell:true,universal:true});assert.equal(children(f.g).length,0,mode);}
});
test('exact h0UV source selects h0V2; no name or skin heuristic replaces rawcode',()=>{
 for(const code of ['h0UV','h0JI','h0OK','h0UW']){const f=fixture();f.a.combatRawcode=code;f.hit();assert.equal(children(f.g)[0].combatRawcode,code==='h0UV'?'h0V2':'h03E');}
});
test('new body owns source identity but uses victim position, source facing and fresh prototype stats',()=>{
 const f=fixture();f.a.worldX+=3;f.a.facing=137;f.a.userData=7;f.t.worldY+=1;f.a.status.custom=true;f.a.buffs=[{key:'unrelated',expiresAt:100}];const before={gold:f.g.state.players[0].gold,wood:f.g.state.players[0].wood,buildings:f.g.state.players[0].buildings.length};f.hit();const e=children(f.g)[0];
 assert.equal(e.ownerId,f.a.ownerId);assert.equal(e.side,f.a.side);assert.equal(e.battleTeam,f.a.battleTeam);assert.equal(e.userData,7);assert.equal(e.facing,137);near(e.worldX,f.t.worldX);near(e.worldY,f.t.worldY);near(e.hp,115);near(e.maxHp,115);near(e.damage,24.5);assert.equal(e.isSummon,true);assert.equal(e.expiresAt,undefined);assert.equal(e.buildingId,undefined);assert.equal(e.status.custom,undefined);assert.equal(e.buffs.length,0);assert.equal(e.status.sourceAttackMoveRequest.targetPlayerId,6);assert.equal(f.g.state.players[0].wood,before.wood);assert.equal(f.g.state.players[0].buildings.length,before.buildings);assert.ok(f.g.state.players[0].gold>=before.gold);
});
test('granted abilities give self armor, flat attack on both weapons and self regeneration',()=>{
 const f=fixture();f.hit();const e=children(f.g)[0];for(const id of ['A0I2','A0I4','A0I6'])assert.ok(has(e,id));assert.equal(e.abilityLevels.A0I4,10);const aura=sourceAuraEffects(f.g,e,[e]);near(aura.armor,2);near(aura.healRate,10);
 const other=f.make('h03E','defender');near(sourceAuraEffects(f.g,other,[e]).armor,0);near(sourceAuraEffects(f.g,other,[e]).healRate,0);
 e.weapon1={};e.weapon2={weapTp2:'missile',weapsOn:2,rangeN2:600,targs2:'enemies',dmgplus2:20,dice2:1,sides2:1};near(sourceWeapon(e,f.t,10).damage,31);
});
test('earlier fire or ice branch suppresses spawning, while a miss permits it',()=>{
 for(const skill of ['A0HX','A0IK'])for(const roll of [0,.99]){const f=fixture();skills(f.a,['A0I1',skill]);f.g._random=()=>roll;f.hit();assert.equal(children(f.g).length,roll===0?0:1);}
});
test('ice marker branch precedes broodmother even when the proc misses',()=>{
 const f=fixture();skills(f.a,['A0I1','A0IK']);f.t.buffs.push({key:'B04X',expiresAt:20});f.hit();assert.equal(f.t.status.iceExplosionMarked,true);assert.equal(children(f.g).length,0);
});
test('selected broodmother branch prevents duel but does not prevent later independent unyielding',()=>{
 const f=fixture();skills(f.t,['A0ID','A0IE']);f.hit();assert.equal(children(f.g).length,1);assert.equal(f.t.status.huskarDuelTag,undefined);assert.equal(f.t.status.huskarUnyielding,true);
 const x=fixture();skills(x.t,['A0ID']);x.hit(100);assert.equal(children(x.g).length,0);assert.equal(x.t.status.huskarDuelTag,x.a.id);
});
test('JSON restore preserves dynamic level and stat journal without adding attack again',()=>{
 const f=fixture();f.hit();const e=children(f.g)[0],snapshot=JSON.parse(JSON.stringify(f.g.snapshot()));snapshot.state.entities.find(x=>x.id===e.id).skillImplementationRevision='older';const r=Game.fromSnapshot(snapshot),re=r.state.entities.find(x=>x.id===e.id);near(re.damage,24.5);assert.equal(re.abilityLevels.A0I4,10);near(re.skillSpecs.find(s=>s.id==='A0I4').flatDamage,10);near(sourceAuraEffects(r,re,[re]).healRate,10);
});
test('FightStart grants after one second globally, including opposing and distant registered types',()=>{
 const f=fixture();f.a.worldX+=100;const remote=f.make('h03F','monster',[],{battleTeam:1}),skin=f.make('h0V2');queueBroodmotherAlliance(f.g);f.g.state.time=10.999;tickSourceScriptJobs(f.g);assert.equal(has(remote,'A0I4'),false);f.g.state.time=11;tickSourceScriptJobs(f.g);assert.equal(has(remote,'A0I4'),true);near(remote.damage,UNIT_TEMPLATES.h03F.damage+10);assert.equal(has(skin,'A0I4'),false);assert.equal(has(f.a,'A0I4'),true);
});
test('variant mother alone does not satisfy the exact global h0JI/h0OK gate',()=>{
 const f=fixture();f.a.combatRawcode='h0UV';queueBroodmotherAlliance(f.g);f.g.state.time=11;tickSourceScriptJobs(f.g);assert.equal(has(f.t,'A0I4'),false);assert.equal(has(f.a,'A0I4'),false);
});
test('repeated global grants do not stack or rebuild existing unrelated bonuses',()=>{
 const f=fixture();f.a.damage+=7;queueBroodmotherAlliance(f.g);f.g.state.time=11;tickSourceScriptJobs(f.g);const damage=f.a.damage;queueBroodmotherAlliance(f.g);f.g.state.time=12;tickSourceScriptJobs(f.g);near(f.a.damage,damage);near(damage,UNIT_TEMPLATES.h0JI.damage+17);
});
test('global enumeration retains cleaned corpses but excludes explicit removed handles',()=>{
 for(const removed of [false,true]){const f=fixture();queueBroodmotherAlliance(f.g);f.a.hp=0;if(removed)f.a.status.sourceRemoved=true;f.g._clearDead();f.g.state.time=11;tickSourceScriptJobs(f.g);assert.equal(has(f.t,'A0I4'),!removed);}
});
test('spiders created after queueing are retained if cleared before the grant',()=>{
 const f=fixture();queueBroodmotherAlliance(f.g);const later=f.make('h03F');later.hp=0;f.g._clearDead();f.g.state.time=11;tickSourceScriptJobs(f.g);assert.equal(has(later,'A0I4'),true);
});
test('save restoration rebinds current handles for delayed grants and retains a dead mother gate',()=>{
 const f=fixture();queueBroodmotherAlliance(f.g);f.a.hp=0;f.g._clearDead();const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot())));r.state.time=11;tickSourceScriptJobs(r);const rt=r.state.entities.find(e=>e.id===f.t.id);assert.equal(has(rt,'A0I4'),true);near(rt.damage,24.5);assert.equal(has(f.t,'A0I4'),false);
});
test('real start queues the source hook; pause freezes it; sandbox reset cancels it',()=>{
 const g=new Game({mode:'sandbox',seed:28}),p=g.state.players[0],unit=UNITS.find(u=>u.combatRawcode==='h0JI');assert.ok(unit);p.roster=[unit.id];assert.equal(g.command('build',{unitId:unit.id,col:2,row:2}).ok,true);assert.equal(g.command('ready').ok,true);assert.equal(g.state.sourceSkillJobs.filter(j=>j.type==='broodmother_alliance').length,1);const e=g.state.entities.find(e=>e.combatRawcode==='h0JI');g.state.paused=true;g.tick(2);assert.equal(has(e,'A0I4'),false);g.state.paused=false;g.tick(1.01);assert.equal(has(e,'A0I4'),true);g.command('sandboxReset');assert.equal(g.state.sourceSkillJobs.some(j=>j.type==='broodmother_alliance'),false);
});
test('continuous transition preserves pending old grants but does not run a new FightStart grant',()=>{
 const f=fixture();queueBroodmotherAlliance(f.g);f.g.state.mode='normal';f.g.state.wave=31;f.g._advanceContinuous();assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='broodmother_alliance').length,1);f.g.state.time=11;tickSourceScriptJobs(f.g);f.g._advanceContinuous();assert.equal(f.g.state.sourceSkillJobs.some(j=>j.type==='broodmother_alliance'),false);
});
test('published skill labels distinguish known injections from native timing boundaries',()=>{
 const list=compileSkills({abilityIds:['A0I1','A0I2','A0I4','A0I6'],abilityLevels:{A0I4:10},skillVersion:'v14.1A5'});assert.deepEqual(list.map(s=>s.status),['partial','partial','implemented','implemented']);assert.match(list[0].effectText,/伤害结算前/);assert.match(list[1].effectText,/不检查同玩家/);near(list[2].flatDamage,10);near(list[3].selfRegen,10);
});
