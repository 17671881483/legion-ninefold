import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {EGG_REQUIREMENTS,recordEggCompletion,restoreEggHistory} from '../dist/egg-rules.js';
const u=code=>UNITS.find(d=>!d.legacy&&d.sourceRawcode===code);
const byId=Object.fromEntries(UNITS.map(d=>[d.id,d]));
const clone=x=>JSON.parse(JSON.stringify(x));
const ok=r=>assert.equal(r.ok,true,r.message);
function fixture(){const g=new Game({mode:'sandbox',seed:47});g._aiAct=()=>{};return g;}
function finish(g,code,playerId=0){
 const p=g.state.players[playerId],d=u(code),b={id:g._uid('b'),unitId:d.id,col:p.buildings.length%6,row:Math.floor(p.buildings.length/6),construction:{targetId:d.id}};
 p.buildings.push(b);g._completeConstruction(p,b);g._result(true,'sync');return b;
}
function history(p,codes){for(const code of codes)recordEggCompletion(p,u(code)??UNIT_TEMPLATES[code],{buildingId:`proof-${code}`,wave:1,unitsById:byId});}
function ready(){const g=fixture(),p=g.state.players[0];history(p,['h09U','h0J3']);p.entitlements.h230=1;const b=finish(g,'h00T');return{g,p,b};}
const upgrade=({g,b})=>g.command('upgrade',{buildingId:b.id,unitId:u('h203').id});

test('source pins normal recipe, completion wiring, manual heal and dormant veteran flags',()=>{
 const ev=JSON.parse(readFileSync(new URL('../reference/tailan-acquisition-evidence.json',import.meta.url))),bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),text=bytes.toString('latin1'),lines=text.split('\n');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),ev.source.sha256);
 for(const row of ev.sourceEvidence)assert.equal(lines[row.line-1].replace(/\r$/,''),row.text);
 for(const name of ['T2','T3']){assert.equal((text.match(new RegExp(`boolean array ${name}\\b`,'g'))??[]).length,1);assert.equal((text.match(new RegExp(`\\bset\\s+${name}\\s*\\[`,'g'))??[]).length,0);assert.equal((text.match(new RegExp(`\\b${name}\\[BF\\]`,'g'))??[]).length,2);}
 for(const name of ['H4','H5'])assert.equal((text.match(new RegExp(`set ${name}=false`,'g'))??[]).length,0);
 assert.deepEqual(EGG_REQUIREMENTS.R00M.groups,ev.normalRecipe);assert.equal(EGG_REQUIREMENTS.R00M.completionMode,'raw');
});

test('both raw stages unlock in either order; neither alone or duplicates suffice',()=>{
 for(const codes of [['h09U','h0J3'],['h0J3','h09U']]){const p=fixture().state.players[0];history(p,[codes[0],codes[0]]);assert.equal(p.technologies.R00M,undefined);history(p,[codes[1]]);assert.equal(p.technologies.R00M,1);}
});
test('n02I exact appearance alone is sufficient without inventing its acquisition',()=>{
 const p=fixture().state.players[0];history(p,['n02I']);assert.equal(p.technologies.R00M,1);assert.equal(p.eggHistory.rawCompleted.h09U,undefined);
});
test('expanded base aliases and combat forms cannot fabricate raw recipe completions',()=>{
 const p=fixture().state.players[0];p.completedSourceUnits={h09U:true,h0J3:true};restoreEggHistory(p,{wave:1,unitsById:byId});assert.equal(p.technologies.R00M,undefined);
 recordEggCompletion(p,{provenance:'v14.1A5-dataset',sourceRawcode:'skin',appearanceBaseRawcode:'h0J3'},{buildingId:'skin'});history(p,['h09U']);assert.equal(p.technologies.R00M,undefined);
 history(p,['h028','n203']);assert.equal(p.technologies.R00M,undefined);
});
test('construction start is not completion; completed sold stages permanently satisfy recipe',()=>{
 const g=fixture(),p=g.state.players[0],knight=finish(g,'h09U');ok(g.command('sell',{buildingId:knight.id}));
 const d=u('h0J3'),b={id:'pending-paladin',unitId:d.id,construction:{targetId:d.id}};p.buildings.push(b);restoreEggHistory(p,{wave:1,unitsById:byId});assert.equal(p.technologies.R00M,undefined);
 g._completeConstruction(p,b);assert.equal(p.technologies.R00M,1);assert.equal(p.buildings.some(b=>b.unitId===u('h09U').id),false);
});
test('normal upgrade uses 600 gold and source duration without training or a gift',()=>{
 const f=ready(),{g,p,b}=f,gold=p.gold,id=b.id;ok(upgrade(f));assert.equal(gold-p.gold,600);assert.equal(p.boxRewards,undefined);assert.equal(b.unitId,u('h00T').id);assert.equal(b.construction.duration,Number(u('h203').buildingRawFields.bldtm));assert.equal(g.kingHealFraction(0),.5);
 g._completeConstruction(p,b);assert.equal(b.id,id);assert.equal(b.unitId,u('h203').id);assert.equal(g.kingHealFraction(0),.6);
});
test('optional training costs 240 gold, completes immediately and consumes only its gift',()=>{
 const f=ready(),{g,p,b}=f;ok(g.command('sandboxBoxTraining'));const gold=p.gold;ok(g.command('boxTrain',{buildingId:b.id,unitId:u('h203').id}));assert.equal(gold-p.gold,240);assert.equal(p.boxRewards.consumed,true);assert.ok(p.buildings.some(b=>b.unitId===u('h203').id&&!b.construction));assert.equal(g.kingHealFraction(0),.6);
});
test('direct upgrade preserves an available training gift',()=>{
 const f=ready();ok(f.g.command('sandboxBoxTraining'));const before=clone(f.p.boxRewards);ok(upgrade(f));assert.deepEqual(f.p.boxRewards,before);
});
test('honor remains independent from recipe and ordinary/super sponsorship',()=>{
 const f=ready();delete f.p.entitlements.h230;f.p.entitlements.h210=f.p.entitlements.h220=1;const before=clone(f.g.snapshot());assert.equal(upgrade(f).ok,false);assert.deepEqual(clone(f.g.snapshot()),before);f.p.entitlements.h230=1;ok(upgrade(f));
});
test('combat, resources and pending one-unit cap still reject direct upgrades',()=>{
 for(const mutate of [f=>f.g.state.phase='combat',f=>f.p.gold=599,f=>{const other=finish(f.g,'h00T');ok(f.g.command('upgrade',{buildingId:other.id,unitId:u('h203').id}));}]){const f=ready();mutate(f);const before=clone(f.g.snapshot());assert.equal(upgrade(f).ok,false);assert.deepEqual(clone(f.g.snapshot()),before);}
});
test('same-team completion boosts every teammate heal and never the opposing team',()=>{
 for(const id of [0,1,3,4,7]){const g=fixture(),team=g.state.players[id].team;finish(g,'h203',id);assert.equal(g.kingHealFraction(team),.6);assert.equal(g.kingHealFraction(1-team),.5);const k=g.state.kings[team];k.hp=1;ok(g.command('heal',{playerId:team===0?2:5}));assert.equal(k.hp,1+k.maxHp*.6);}
});
test('enhanced heal caps at max, consumes one charge, retains per-player and two-second locks',()=>{
 const g=fixture();finish(g,'h203');const k=g.state.kings[0];k.hp=k.maxHp-1;ok(g.command('heal'));assert.equal(k.hp,k.maxHp);assert.equal(k.healCharges,3);k.hp=1;assert.equal(g.command('heal').ok,false);assert.equal(g.command('heal',{playerId:1}).ok,false);assert.equal(k.healCharges,3);g.state.time=2;ok(g.command('heal',{playerId:1}));assert.equal(k.hp,1+k.maxHp*.6);assert.equal(k.healCharges,2);
});
test('heal uses current maximum after a king life upgrade',()=>{
 const g=fixture();finish(g,'h203');ok(g.command('king',{stat:'hp'}));assert.equal(g.kingHealAmount(),g.state.kings[0].maxHp*.6);
});
test('sale, absent combat bodies and sandbox trial reset retain permanent enhancement',()=>{
 const g=fixture(),b=finish(g,'h203');ok(g.command('sell',{buildingId:b.id}));g.state.entities=[];g._resetSandboxWave();assert.equal(g.kingHealFraction(),.6);assert.equal(g.state.players[0].buildings.length,0);
});
test('pending h203, expanded alias, combat n203 and Af01 alone grant no team enhancement',()=>{
 const g=fixture(),p=g.state.players[0];p.buildings.push({id:'pending',unitId:u('h00T').id,construction:{targetId:u('h203').id}});p.completedSourceUnits={h203:true};history(p,['n203']);restoreEggHistory(p,{wave:1,unitsById:byId});g.state.entities.push({combatRawcode:'n203',team:0,skillSpecs:[{id:'Af01'}]});assert.equal(g.kingHealFraction(),.5);
});
test('completed sold history and unfinished paid upgrade survive repeated save/load',()=>{
 const f=ready();ok(upgrade(f));const gold=f.p.gold;let g=Game.fromSnapshot(clone(f.g.snapshot())),p=g.state.players[0],b=p.buildings.find(b=>b.id===f.b.id);assert.equal(g.kingHealFraction(),.5);assert.equal(p.technologies.R00M,1);g._completeConstruction(p,b);assert.equal(p.gold,gold);ok(g.command('sell',{buildingId:b.id}));g=Game.fromSnapshot(clone(Game.fromSnapshot(clone(g.snapshot())).snapshot()));assert.equal(g.kingHealFraction(),.6);assert.equal(g.state.players[0].technologies.R00M,1);
});
test('old saves recover actual event or standing completed stages, never expanded sold aliases',()=>{
 for(const mode of ['events','standing','aliases']){const g=fixture(),p=g.state.players[0];if(mode==='standing')finish(g,'h203');else p.buildings=[];delete p.eggHistory;p.completedSourceUnits={h203:true};if(mode==='events')p.eggHistory={events:{'sold:h203':true}};const next=Game.fromSnapshot(clone(g.snapshot()));assert.equal(next.kingHealFraction(),mode==='aliases'?.5:.6);}
});
test('new matches start without another match team history',()=>{
 const g=fixture();finish(g,'h203');assert.equal(g.kingHealFraction(),.6);assert.equal(fixture().kingHealFraction(),.5);
});
