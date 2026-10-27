import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS} from '../dist/data.js';
import {compileSkills} from '../dist/skills.js';
import {relocationStatus} from '../dist/relocation-rules.js';
import {laneToWorld} from '../dist/layout.js';
const clone=v=>JSON.parse(JSON.stringify(v));
const unit=raw=>UNITS.find(u=>!u.legacy&&u.sourceRawcode===raw);
const ok=r=>assert.equal(r.ok,true,r.message);
function fixture(){const g=new Game({mode:'sandbox',seed:42});return {g,p:g.state.players[0]};}
function completed(g,raw='h011',playerId=0){
  const p=g.state.players[playerId],def=unit(raw);assert.ok(def,raw);
  const b={id:g._uid('b'),unitId:def.id,col:p.buildings.length%6,row:0,spent:123,totalSpent:234,builtWave:1,treasureArmor:3,construction:{targetId:def.id}};
  p.buildings.push(b);g._completeConstruction(p,b);return b;
}
const move=(g,b,col=2,row=5,extra={})=>g.command('relocate',{buildingId:b.id,col,row,...extra});
function rejectsUnchanged(g,run){for(const p of g.state.players)p.popUsed=g._population(p);const before=clone(g.state);assert.equal(run().ok,false);assert.deepEqual(clone(g.state),before);}
test('ordinary move preserves the building handle, progression, resources and removes A118',()=>{
  const {g,p}=fixture(),b=completed(g),before=clone(b),assets={gold:p.gold,wood:p.wood,pop:g._population(p),history:clone(p.eggHistory)};
  assert.equal(g.relocationStatus(b.id).remaining,3);ok(move(g,b));assert.equal(p.buildings[0],b);
  assert.deepEqual(b,{...before,col:2,row:5,sourceRemovedBuildingAbilities:['A118']});
  assert.deepEqual({gold:p.gold,wood:p.wood,pop:g._population(p),history:clone(p.eggHistory)},assets);
  assert.equal(p.relocationsRemaining,2);assert.match(g.relocationStatus(b.id).reason,/已使用/);rejectsUnchanged(g,()=>move(g,b,3,5));
});
test('exactly three ordinary buildings can move; selling/rebuilding does not reset the shared budget',()=>{
  const {g,p}=fixture(),bs=Array.from({length:4},()=>completed(g));
  for(let i=0;i<3;i++){ok(move(g,bs[i],i,5));assert.equal(p.relocationsRemaining,2-i);}
  rejectsUnchanged(g,()=>move(g,bs[3],4,5));ok(g.command('sell',{buildingId:bs[0].id}));
  const next=completed(g);assert.equal(g.relocationStatus(next.id).remaining,0);rejectsUnchanged(g,()=>move(g,next,5,5));
});
test('actual Huskar and appearance carrier repeat movement without consuming the global budget',()=>{
  for(const raw of ['h0NP','h0SS']){
    const {g,p}=fixture(),b=completed(g,raw);assert.equal(g.relocationStatus(b.id).exempt,true);
    for(let n=0;n<8;n++)ok(move(g,b,n%2+2,5));assert.equal(p.relocationsRemaining,3);assert.equal(b.sourceRemovedBuildingAbilities,undefined);
    p.relocationsRemaining=1;ok(move(g,b,4,6));assert.equal(p.relocationsRemaining,1);
    p.relocationsRemaining=0;assert.match(g.relocationStatus(b.id).reason,/已用完/);rejectsUnchanged(g,()=>move(g,b,3,6));
  }
});
test('source exemptions use A0IH or exact prototypes, never A0IG alone',()=>{
  const state={phase:'build'},p={relocationsRemaining:3},b={};
  for(const sourceRawcode of ['h0JM','h0ST'])assert.equal(relocationStatus(state,p,b,{sourceRawcode,buildingAbilityIds:['A118']}).exempt,true);
  assert.equal(relocationStatus(state,p,b,{sourceRawcode:'h011',buildingAbilityIds:['A118','A0IG']}).exempt,false);
  assert.equal(relocationStatus(state,p,b,{sourceRawcode:'h011',buildingAbilityIds:['A118','A0IH']}).exempt,true);
});
test('every actual A118 carrier exposes the action, including traps and walls',()=>{
  const {g,p}=fixture(),carriers=UNITS.filter(u=>!u.legacy&&u.buildingAbilityIds?.includes('A118'));
  assert.equal(carriers.length,411);
  for(const def of carriers){const b={id:'carrier',unitId:def.id,col:0,row:0};p.buildings=[b];assert.equal(g.relocationStatus(b.id).canStart,true,def.sourceRawcode);}
  for(const raw of ['n04D','n04L','n04K','n04H','n04F','n04N','n04Q']){const next=fixture().g;ok(move(next,completed(next,raw)));}
});
test('ownership, unsupported ability and target lane are checked before mutation',()=>{
  const {g,p}=fixture(),b=completed(g),other=completed(g,'h011',1);
  rejectsUnchanged(g,()=>move(g,other));rejectsUnchanged(g,()=>move(g,b,2,5,{playerId:1}));rejectsUnchanged(g,()=>move(g,b,2,5,{targetPlayerId:1}));
  assert.equal(g.relocationStatus('missing').canStart,false);assert.equal(g.relocationStatus('missing',999).canStart,false);
  const noMove=UNITS.find(u=>!u.legacy&&!u.buildingAbilityIds?.includes('A118'));assert.ok(noMove);b.unitId=noMove.id;rejectsUnchanged(g,()=>move(g,b));
  b.unitId=unit('h011').id;ok(move(g,other,3,5,{playerId:1,targetPlayerId:1}));assert.equal(p.relocationsRemaining,3);assert.equal(g.state.players[1].relocationsRemaining,2);
});
test('occupied origin/destination and malformed/out-of-bounds coordinates consume nothing',()=>{
  const {g}=fixture(),b=completed(g),other=completed(g);
  for(const [col,row] of [[b.col,b.row],[other.col,other.row],[-1,0],[6,0],[0,-1],[0,8],[.5,1],[1,NaN],[Infinity,1],[null,1],['1',1]])rejectsUnchanged(g,()=>move(g,b,col,row));
  ok(move(g,b,5,7));
});
test('construction, combat, ended match and both arena preparation stages deny relocation',()=>{
  const {g,p}=fixture(),b=completed(g);
  b.construction={targetId:b.unitId,startAt:0,finishAt:2,duration:2};rejectsUnchanged(g,()=>move(g,b));g._completeConstruction(p,b);
  for(const phase of ['combat','ended']){g.state.phase=phase;rejectsUnchanged(g,()=>move(g,b));}
  g.state.phase='build';for(const roundMode of ['arena-prep','arena-transition']){g.state.roundMode=roundMode;rejectsUnchanged(g,()=>move(g,b));}
  g.state.roundMode='normal';ok(move(g,b));
});
test('new footprint frees the old cell and is used for actual next-wave deployment',()=>{
  const {g,p}=fixture(),def=UNITS.find(u=>p.roster.includes(u.id)&&u.buildingAbilityIds?.includes('A118'));
  assert.ok(def);ok(g.command('build',{unitId:def.id,col:0,row:0}));ok(g.command('sandboxComplete'));
  const b=p.buildings[0];ok(move(g,b,4,6));ok(g.command('build',{unitId:def.id,col:0,row:0}));ok(g.command('sandboxComplete'));
  ok(g.command('ready'));const e=g.state.entities.find(e=>e.buildingId===b.id),expected=laneToWorld(0,4.5,10.5);
  assert.ok(e);assert.equal(e.worldX,expected.x);assert.equal(e.worldY,expected.y);assert.equal(p.relocationsRemaining,2);
});
test('save/restore retains spent budget, same-building lock and exempt moves',()=>{
  const {g,p}=fixture(),b=completed(g),h=completed(g,'h0NP');ok(move(g,b));ok(move(g,h,3,5));
  const restored=Game.fromSnapshot(clone(g.snapshot()));assert.equal(restored.state.players[0].relocationsRemaining,2);
  rejectsUnchanged(restored,()=>move(restored,b,4,5));ok(move(restored,h,4,5));assert.equal(restored.state.players[0].relocationsRemaining,2);
  assert.equal(p.relocationsRemaining,2);
});
test('pre-feature saves initialize three moves; corrupt counters never grant new ones',()=>{
  const {g}=fixture(),b=completed(g),saved=clone(g.snapshot());
  delete saved.state.players[0].relocationsRemaining;const restored=Game.fromSnapshot(saved);assert.equal(restored.relocationStatus(b.id).remaining,3);
  for(const bad of [null,-1,4,1.5,'3']){const s=clone(saved);s.state.players[0].relocationsRemaining=bad;assert.equal(Game.fromSnapshot(s).relocationStatus(b.id).canStart,false);}
});
test('sandbox reset, clearing and normal wave completion keep match-lifetime counters',()=>{
  const {g,p}=fixture(),b=completed(g);ok(move(g,b));
  for(const command of ['sandboxReset','sandboxComplete','sandboxClear']){ok(g.command(command));assert.equal(p.relocationsRemaining,2);}
  const normal=new Game({mode:'normal',seed:42}),bp=completed(normal);ok(move(normal,bp));normal.state.phase='combat';normal._endCombat();assert.equal(normal.state.players[0].relocationsRemaining,2);
});
test('ordinary upgrades preserve the same handle and its consumed relocation ability',()=>{
  const {g,p}=fixture(),b=completed(g),def=unit('h011'),next=def.upgrades.map(id=>UNITS.find(u=>u.id===id)).find(u=>g.requirementStatus(u.id).canStart);
  assert.ok(next);ok(move(g,b));ok(g.command('upgrade',{buildingId:b.id,unitId:next.id}));g._completeConstruction(p,b);
  assert.equal(g.relocationStatus(b.id).canStart,false);assert.equal(p.relocationsRemaining,2);assert.equal(p.buildings[0],b);
});
test('skill labels expose partial placement and identify A0IG as a description marker',()=>{
  const s=compileSkills({abilityIds:['A118','A0IH','A0IG'],skillVersion:'v14.1A5'});
  assert.deepEqual(s.map(s=>s.status),['partial','partial','marker']);assert.match(s[0].effectText,/6×8/);assert.match(s[1].effectText,/耗尽/);assert.match(s[2].effectText,/不以A0IG/);
});
test('source evidence matches registered callbacks and excludes the unused alternate implementation',()=>{
  const bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=bytes.toString('latin1').split('\n'),evidence=JSON.parse(readFileSync(new URL('../reference/relocation-evidence.json',import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),evidence.source.sha256);
  for(const entry of evidence.sourceEvidence)assert.equal(lines[entry.line-1].replace(/\r$/,''),entry.text,`line ${entry.line}`);
  for(const name of ['C_Moving_Triggering','A_Moving_Triggering','C_Moving_Finishing','A_Moving_Finishing','C_Moving_Canceling','A_Moving_Canceling'])assert.equal(lines.filter(s=>s.includes(name)).length,1,name);
});
