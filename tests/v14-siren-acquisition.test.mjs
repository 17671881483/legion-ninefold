import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,BUILDERS,PROPHET_POOLS,UNIT_TEMPLATES} from '../dist/data.js';
import {V14_ABILITIES} from '../dist/v14-reference.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const ok=r=>assert.equal(r.ok,true,r.message);
const unit=raw=>UNITS.find(u=>u.id==='v14_'+raw);
function fixture(mode='sandbox'){
 const g=new Game({mode,builderId:'v14_builder_u03N',seed:77}),p=g.state.players[0];g._aiAct=()=>{};p.populationCap=300;p.gold=p.wood=10000;
 return {g,p,build(){const before=p.gold;ok(g.command('build',{unitId:'v14_n07F',col:2,row:5}));const b=p.buildings.at(-1);assert.equal(before-p.gold,125);g._completeConstruction(p,b);return b;}};
}
test('siren source evidence pins raw LF, damage-event attack guard, Pn and the real proc',()=>{
 const ev=JSON.parse(readFileSync(new URL('../reference/siren-sleep-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');
 assert.equal(createHash('sha256').update(raw).digest('hex'),ev.source.sha256);for(const row of ev.tables)assert.equal(createHash('sha256').update(readFileSync(new URL('../'+row.path,import.meta.url))).digest('hex'),row.sha256,row.path);for(const r of ev.sourceEvidence)assert.equal(lines[r.line-1].replace(/\r$/,''),r.text,`LF ${r.line}`);
 assert.match(lines[42269],/YDWEIsEventAttackDamage\(\) and not LoadBoolean/);assert.match(lines[32970],/GetRandomPercentageBJ\(\)<=15/);assert.match(lines[32974],/IssueTargetOrder\(Ki,"sleep",Om\)/);assert.match(lines[1125],/Pn=\$65303038/);
});
test('raw modification absence stays missing instead of becoming free zero-mana sleep',()=>{
 const ev=JSON.parse(readFileSync(new URL('../reference/siren-sleep-evidence.json',import.meta.url)));assert.deepEqual(ev.rawW3aAudit.matchedObjects,[]);assert.equal(ev.rawW3aAudit.bytes,20676);assert.equal(ev.rawW3aAudit.bytes,ev.rawW3aAudit.consumedBytes);assert.deepEqual(ev.rawW3aAudit.tableObjectCounts,{original:23,custom:1});
 const f=V14_ABILITIES.A1DN.resolved_fields;for(const k of ['Cost1','Cool1','Cast1'])assert.equal(f[k],undefined);assert.equal(f.Dur1,'2.0');assert.equal(f.HeroDur1,'2.0');assert.equal(f.DataA1,'1.0');assert.equal(f.BuffID1,'BUsl,BUsp,Bust');assert.equal(V14_ABILITIES.A1DN.object_overrides.length,0);
});
test('the real fishman builder and source prophet pool both include the base siren follower',()=>{
 assert.ok(BUILDERS.find(b=>b.rawcode==='u03N').rosterIds.includes('v14_n07F'));assert.ok(PROPHET_POOLS.some(p=>p.includes('v14_n07F')));const u=unit('n07F');assert.equal(u.isBase,true);assert.equal(u.randomPool,true);assert.deepEqual(u.requires,[]);assert.equal(u.combatRawcode,'h0UM');assert.deepEqual(u.abilityIds,['A1DO']);
});
test('normal and sandbox fishman matches can buy the base without a gift or account qualification',()=>{
 for(const mode of ['normal','sandbox']){const f=fixture(mode),b=f.build();assert.ok(f.p.roster.includes('v14_n07F'));assert.equal(b.unitId,'v14_n07F');assert.deepEqual(f.p.entitlements,{});assert.equal(f.p.boxRewards,undefined);assert.equal(f.g._population(f.p),f.p.workers+1);}
});
test('construction spends the real125 gold and two seconds before deploying h0UM',()=>{
 const {g,p}=fixture(),gold=p.gold;ok(g.command('build',{unitId:'v14_n07F',col:2,row:5}));const b=p.buildings.at(-1);assert.equal(gold-p.gold,125);assert.equal(b.construction.duration,2);g._completeConstruction(p,b);g._startCombat();const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0UM');assert.ok(e.skillSpecs.some(s=>s.id==='A1DO'));assert.equal(e.skillSpecs.some(s=>s.id==='A1DN'),false);
});
test('arena deployment retains the follower passive without directly granting the dummy sleep spell',()=>{
 const f=fixture(),b=f.build();f.g._startArena();const e=f.g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0UM');assert.ok(e.skillSpecs.some(s=>s.id==='A1DO'));assert.equal(e.skillSpecs.some(s=>s.id==='A1DN'),false);
});
test('both paid upgrades remain available without training and remove the base passive on deployment',()=>{
 for(const [raw,body,cost,ids]of [['n07G','h0UN',175,['A1DP']],['n07H','h0UO',275,['A1DQ','A1DR']]]){const f=fixture(),b=f.build(),gold=f.p.gold,id=b.id;ok(f.g.command('upgrade',{buildingId:id,unitId:'v14_'+raw}));assert.equal(gold-f.p.gold,cost);assert.equal(b.construction.duration,2);assert.equal(f.p.boxRewards,undefined);f.g._completeConstruction(f.p,b);assert.equal(b.id,id);assert.equal(f.g._population(f.p),f.p.workers+3);f.g._startCombat();const e=f.g.state.entities.find(e=>e.buildingId===id);assert.equal(e.combatRawcode,body);assert.deepEqual(e.skillSpecs.map(s=>s.id),ids);assert.equal(e.skillSpecs.some(s=>s.id==='A1DO'),false);}
});
test('an optional training gift is preserved by a normal paid upgrade',()=>{
 const f=fixture(),b=f.build();ok(f.g.command('sandboxBoxTraining'));const before=clone(f.p.boxRewards);ok(f.g.command('upgrade',{buildingId:b.id,unitId:'v14_n07G'}));assert.deepEqual(clone(f.p.boxRewards),before);
});
test('optional training uses its discounted source cost and replacement handle',()=>{
 for(const [raw,cost]of [['n07G',70],['n07H',110]]){const f=fixture(),b=f.build();ok(f.g.command('sandboxBoxTraining'));const gold=f.p.gold,id=b.id;const choice=f.g.boxTrainingStatus(id).targets.find(t=>t.unitId==='v14_'+raw);assert.ok(choice.canStart);assert.equal(choice.cost.gold,cost);ok(f.g.command('boxTrain',{buildingId:id,unitId:'v14_'+raw}));assert.equal(gold-f.p.gold,cost);const next=f.p.buildings.find(b=>b.unitId==='v14_'+raw);assert.ok(next);assert.notEqual(next.id,id);assert.equal(f.p.boxRewards.consumed,true);}
});
test('siren upgrades still enforce battle phase and current payment without partial mutation',()=>{
 for(const reason of ['phase','gold']){const f=fixture(),b=f.build();if(reason==='phase')f.g.state.phase='combat';else f.p.gold=174;const before=clone(f.g.snapshot());assert.equal(f.g.command('upgrade',{buildingId:b.id,unitId:'v14_n07G'}).ok,false);assert.deepEqual(clone(f.g.snapshot()),before);}
});
test('pending paid upgrade survives save and completes without replaying payment or granting the old passive',()=>{
 const f=fixture(),b=f.build();ok(f.g.command('upgrade',{buildingId:b.id,unitId:'v14_n07H'}));const gold=f.p.gold,id=b.id,g=Game.fromSnapshot(clone(f.g.snapshot())),p=g.state.players[0],next=p.buildings.find(b=>b.id===id);assert.equal(next.construction.targetId,'v14_n07H');assert.equal(p.gold,gold);g._completeConstruction(p,next);assert.equal(p.gold,gold);g._startArena();const e=g.state.entities.find(e=>e.buildingId===id);assert.equal(e.combatRawcode,'h0UO');assert.equal(e.skillSpecs.some(s=>s.id==='A1DO'),false);
});
test('the helper template has its own100000 mana and locust rather than spending follower mana',()=>{
 const d=UNIT_TEMPLATES.e008;assert.equal(d.mana,100000);assert.equal(d.manaStart,100000);assert.deepEqual(d.abilityIds,['Aloc']);assert.equal(unit('n07F').mana,0);
});
