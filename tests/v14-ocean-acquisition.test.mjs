import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {recordEggCompletion} from '../dist/egg-rules.js';

const unit=raw=>UNITS.find(u=>u.id==='v14_'+raw);
const byId=Object.fromEntries(UNITS.map(u=>[u.id,u]));
const clone=x=>JSON.parse(JSON.stringify(x));
const ok=r=>assert.equal(r.ok,true,r.message);
function fixture(stage='h07T'){
 const g=new Game({mode:'sandbox',seed:76}),p=g.state.players[0];g._aiAct=()=>{};
 p.roster=['v14_h07S'];p.populationCap=300;p.gold=10000;p.wood=10000;
 ok(g.command('build',{unitId:'v14_h07S',col:2,row:5}));const b=p.buildings.at(-1);g._completeConstruction(p,b);
 if(stage==='h0SJ'){
  // A pre-existing skin carrier is a fixture, not a claim that its unresolved
  // account gate can be acquired for free. Its outgoing source edge is known.
  b.construction={targetId:'v14_h0SJ'};g._completeConstruction(p,b);
 }else{ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_'+stage}));g._completeConstruction(p,b);}
 return {g,p,b};
}
function qualify(p,raw='h0H4'){
 recordEggCompletion(p,unit(raw)??UNIT_TEMPLATES[raw],{buildingId:'proof-'+raw,wave:1,unitsById:byId});
}
const upgrade=f=>f.g.command('upgrade',{buildingId:f.b.id,unitId:'v14_h107'});

test('ocean evidence pins exact LF branches and the independent unconditioned spell trigger',()=>{
 const ev=JSON.parse(readFileSync(new URL('../reference/ocean-caster-evidence.json',import.meta.url)));
 const bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),text=bytes.toString('latin1'),lines=text.split('\n');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),ev.source.sha256);
 for(const row of ev.sourceEvidence)assert.equal(lines[row.line-1].replace(/\r$/,''),row.text,`LF ${row.line}`);
 assert.equal(lines.slice(26469,26472).join('\n').includes('A050Condition'),false);
 assert.match(lines[26470],/EVENT_PLAYER_UNIT_SPELL_EFFECT/);assert.match(lines[26471],/function A313/);
 const conditionUses=[...text.matchAll(/TriggerAddCondition\(t,Condition\(function A050Condition\)\)/g)];assert.equal(conditionUses.length,2);
});
test('the h0xk saved-heal-count writer is dormant and round start invokes the distinct item callback',()=>{
 const text=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url),'latin1');
 assert.equal((text.match(/\bh0xk\b/g)??[]).length,1,'definition only, including no ExecuteFunc string');
 assert.equal((text.match(/SaveInteger\(K,\$41304842,/g)??[]).length,1);
 const writer=text.match(/function h0xk takes[\s\S]*?endfunction/)?.[0];assert.match(writer,/U2\[Ej\+19\]\*5/);
 const round=text.match(/function ok takes[\s\S]*?endfunction/)?.[0];assert.match(round,/function CountUnitsInGroupEnum_I101/);assert.doesNotMatch(round,/function h0xk\)/);
});
test('normal noble and an already-owned noble skin reach the queen by paid upgrade without a training gift',()=>{
 for(const stage of ['h07T','h0SJ']){
  const f=fixture(stage),{g,p,b}=f;qualify(p);const gold=p.gold,id=b.id;
  ok(upgrade(f));assert.equal(gold-p.gold,250);assert.equal(b.construction.duration,2);assert.equal(b.unitId,'v14_'+stage);assert.equal(p.boxRewards,undefined);
  g._completeConstruction(p,b);assert.equal(b.id,id);assert.equal(b.unitId,'v14_h107');assert.equal(g._population(p),p.workers+2);
 }
});
test('the unresolved noble-skin account gate is not silently bypassed by the queen acquisition path',()=>{
 const g=new Game({mode:'sandbox',seed:76}),p=g.state.players[0];p.roster=['v14_h07S'];ok(g.command('build',{unitId:'v14_h07S',col:2,row:5}));const b=p.buildings.at(-1);g._completeConstruction(p,b);
 const before=clone(g.snapshot()),r=g.command('upgrade',{buildingId:b.id,unitId:'v14_h0SJ'});assert.equal(r.ok,false);assert.match(r.message,/外观档位待核定/);assert.deepEqual(clone(g.snapshot()),before);
});
test('either completed level-eleven Medusa appearance alone grants R00X',()=>{
 for(const raw of ['h0H4','n01F']){const f=fixture();assert.equal(f.p.technologies.R00X,undefined);qualify(f.p,raw);assert.equal(f.p.technologies.R00X,1);ok(upgrade(f));}
});
test('nobles, a lower Medusa stage and the combat appearance do not grant the recipe',()=>{
 for(const raw of ['h07T','h0SJ','h0H3','h0HL']){const f=fixture();qualify(f.p,raw);assert.equal(f.p.technologies.R00X,undefined,raw);assert.equal(upgrade(f).ok,false,raw);}
});
test('a Medusa construction only qualifies at actual completion and remains known after leaving the board',()=>{
 const f=fixture(),{g,p}=f,b={id:g._uid('b'),unitId:'v14_h0H4',col:0,row:0,construction:{targetId:'v14_h0H4'}};p.buildings.push(b);
 assert.equal(upgrade(f).ok,false);g._completeConstruction(p,b);assert.equal(p.technologies.R00X,1);
 p.buildings=p.buildings.filter(x=>x!==b);ok(upgrade(f));
});
test('normal queen upgrade preserves an offered optional training gift',()=>{
 const f=fixture();qualify(f.p);ok(f.g.command('sandboxBoxTraining'));const gift=clone(f.p.boxRewards);ok(upgrade(f));assert.deepEqual(clone(f.p.boxRewards),gift);
});
test('optional queen training pays its actual discount and replaces the carrier',()=>{
 const f=fixture();qualify(f.p);ok(f.g.command('sandboxBoxTraining'));const gold=f.p.gold,id=f.b.id;
 const choice=f.g.boxTrainingStatus(id).targets.find(t=>t.unitId==='v14_h107');assert.equal(choice.cost.gold,100);assert.equal(choice.canStart,true);
 ok(f.g.command('boxTrain',{buildingId:id,unitId:'v14_h107'}));assert.equal(gold-f.p.gold,100);assert.equal(f.p.boxRewards.consumed,true);
 const b=f.p.buildings.find(b=>b.unitId==='v14_h107');assert.ok(b);assert.notEqual(b.id,id);assert.equal(b.construction,undefined);
});
test('direct queen upgrade retains phase and current-resource gates',()=>{
 for(const mode of ['combat','gold']){const f=fixture();qualify(f.p);if(mode==='combat')f.g.state.phase='combat';else f.p.gold=249;const before=clone(f.g.snapshot());assert.equal(upgrade(f).ok,false);assert.deepEqual(clone(f.g.snapshot()),before,mode);}
});
test('paid pending queen upgrade restores without charging again or needing a training reward',()=>{
 const f=fixture();qualify(f.p);ok(upgrade(f));const gold=f.p.gold,id=f.b.id;
 const g=Game.fromSnapshot(clone(f.g.snapshot())),p=g.state.players[0],b=p.buildings.find(b=>b.id===id);assert.equal(p.gold,gold);assert.equal(p.technologies.R00X,1);assert.equal(b.construction.targetId,'v14_h107');
 g._completeConstruction(p,b);assert.equal(p.gold,gold);assert.equal(b.unitId,'v14_h107');assert.equal(p.boxRewards,undefined);
});
test('real wave and arena deployment use h108 combat abilities rather than h107 building summon',()=>{
 for(const mode of ['wave','arena']){const f=fixture();qualify(f.p);ok(upgrade(f));f.g._completeConstruction(f.p,f.b);
  if(mode==='wave')f.g._startCombat();else f.g._startArena();
  const e=f.g.state.entities.find(e=>e.ownerId===0&&e.combatRawcode==='h108');assert.ok(e,mode);
  const ids=e.skillSpecs.map(s=>s.id);for(const id of ['A313','A07Y','A314'])assert.ok(ids.includes(id),mode+' '+id);assert.equal(ids.includes('A06W'),false);assert.equal(e.mana,25);assert.equal(e.maxMana,30);
 }
});
