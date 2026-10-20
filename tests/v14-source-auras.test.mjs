import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,tickSourceScriptJobs} from '../dist/skills.js';
import {tickSourceAuraRules} from '../dist/source-aura-rules.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const raw=(await readFile(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url))).toString('latin1');
function fixture(){const g=new Game({mode:'sandbox',seed:42});g.state.phase='combat';g.state.entities=[];g.state.sourceSkillJobs=[];g.state.time=0;return g;}
function add(g,side='monster',ids=[]){const e=g._entity({id:'aura-test',sourceVersion:'v14.1A5',hp:1000,damage:10,armor:0,abilityIds:ids,distanceScale:1/3},{ownerId:side==='defender'?0:null,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:1,worldY:1});g.state.entities.push(e);return e;}
test('Heartstopper uses the source global buff scan and direct life writes rather than damaged events',()=>{
 const body=raw.match(/function ph takes[\s\S]*?endfunction/)[0];assert.match(body,/GetUnitLifePercent\(GetEnumUnit\(\)\)>2/);assert.match(body,/-1\.2/);assert.match(body,/set L7=\.8/);assert.doesNotMatch(body,/Damage/);
 assert.match(raw,/TriggerRegisterTimerEventPeriodic\(Uu,1\.\)/);assert.match(raw,/TriggerAddCondition\(Uu,Condition\(function lh\)\)/);
 const g=fixture(),t=add(g);t.nativeBuffIds=['B03Q'];let calls=0;g._hurt=()=>{calls++;throw new Error('direct life must not damage');};tickSourceAuraRules(g);g.state.time=1;tickSourceAuraRules(g);near(t.hp,988);assert.equal(calls,0);
});
test('Heartstopper is one global pulse even with duplicate overlapping sources and explicit native buff absence wins',()=>{
 const g=fixture(),a=add(g,'defender',['A0BH']),b=add(g,'defender',['A0BH']),t=add(g),absent=add(g);absent.nativeBuffIds=[];
 assert.equal(a.skillSpecs[0].status,'partial');tickSourceScriptJobs(g);g.state.time=1;tickSourceScriptJobs(g);near(t.hp,988);near(a.hp,1000);near(b.hp,1000);near(absent.hp,1000);tickSourceScriptJobs(g);near(t.hp,988);
});
test('Heartstopper keeps the strict two percent condition and original sub-one-percent clamp',()=>{
 const g=fixture(),low=add(g),edge=add(g),higher=add(g);for(const e of g.state.entities)e.nativeBuffIds=['B03Q'];low.hp=20;edge.hp=21;higher.hp=22;tickSourceAuraRules(g);g.state.time=1;tickSourceAuraRules(g);near(low.hp,20);near(edge.hp,8);near(higher.hp,10);g.state.time=2;tickSourceAuraRules(g);near(edge.hp,8);near(higher.hp,10);
});
test('Heartstopper global phase and live buff membership survive save/restore and never catch up a cleared build interval',()=>{
 const g=fixture(),t=add(g);t.nativeBuffIds=['B03Q'];g.state.time=.4;tickSourceAuraRules(g);const r=Game.fromSnapshot(g.snapshot());g.state.time=r.state.time=3;tickSourceAuraRules(g);tickSourceAuraRules(r);assert.deepEqual(r.snapshot(),g.snapshot());near(t.hp,964);
 g.command('sandboxReset');g.state.time=100.4;g._startCombat();assert.equal(g.state.sourceAuraNextAt,101);
});
