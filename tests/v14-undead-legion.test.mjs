import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,sourceAuraEffects,refreshSourceSkills} from '../dist/skills.js';
import {prepareUndeadLegion,registerUndeadLegion,resetUndeadLegionCounters,applyUndeadLegion} from '../dist/undead-legion-rules.js';
const api={compileSkills},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(){
 const g=new Game({mode:'sandbox',seed:36});g.state.entities=[];g.state.phase='combat';g.state.time=10;
 const make=(raw='h0JR',ownerId=0)=>{const e=g._entity(UNIT_TEMPLATES[raw],{ownerId,side:'defender',battleTeam:0,laneId:ownerId,worldX:10,worldY:10});g.state.entities.push(e);return e;};
 const start=(reset=true)=>prepareUndeadLegion(g,g.state.entities,{reset},api);
 return {g,make,start};
}
test('evidence hashes and exact lines identify registered callbacks and additive bonus helper',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/undead-legion-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');assert.equal(createHash('sha256').update(raw).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);
});
test('all six categories and source skins add to the last registered recipient',()=>{
 const f=fixture(),a=f.make(),hp=a.maxHp,dmg=a.damage;
 for(const raw of ['h0JJ','h03B','h0OC','h03C','h03C','h0JN','h0OZ','h0JP','h03D'])f.make(raw);
 f.start();near(a.maxHp,hp+300);near(a.hp,hp+300);near(a.damage,dmg+25);near(sourceAuraEffects(f.g,a).haste,.08);assert.equal(a.abilityLevels.A0J2,2);assert.equal(a.abilityLevels.A0J3,2);
});
test('original owner, not allied side or lane proximity, partitions the counters',()=>{
 const f=fixture(),a=f.make(),b=f.make('h0JR',1),base=a.damage;f.make('h0JP',1).worldX=10000;f.make('h03D',0);f.start();near(a.damage,base+5);near(b.damage,base+20);
});
test('multiple recipients use last handle; A0J1 presence is not the source predicate',()=>{
 const f=fixture(),a=f.make(),b=f.make(),hp=a.maxHp;b.skillSpecs=[];f.make('h0JJ');f.start();near(a.maxHp,hp);near(b.maxHp,hp+200);assert.equal(a.status.undeadLegion,undefined);
});
test('wrong rawcodes with matching ability or translated name do not qualify',()=>{
 const f=fixture(),a=f.make(),hp=a.maxHp,dmg=a.damage;for(const raw of ['h0JK','h01Q','h01R','h01S','h0JQ']){const e=f.make(raw);e.name='骷髅王';e.skillSpecs=compileSkills({abilityIds:['A0IA'],skillVersion:'v14.1A5'});}f.start();near(a.maxHp,hp);near(a.damage,dmg);
});
test('ordinary reset clears counts but deliberately preserves recipient reference',()=>{
 const f=fixture(),a=f.make();f.make('h0JP');f.start();const damage=a.damage;f.g.state.entities=[];resetUndeadLegionCounters(f.g);assert.equal(f.g.state.undeadLegion.recipients[0],a);applyUndeadLegion(f.g,api);near(a.damage,damage);assert.equal(f.g.state.undeadLegion.counts[0].Attack20,0);
});
test('RR executes additively; zero counters do not remove earlier granted speed',()=>{
 const f=fixture(),a=f.make(),hp=a.maxHp;f.make('h03B');f.make('h03C');f.start();applyUndeadLegion(f.g,api);near(a.maxHp,hp+100);resetUndeadLegionCounters(f.g);applyUndeadLegion(f.g,api);near(sourceAuraEffects(f.g,a).haste,.01);
});
test('arena registration accumulates prior counters and targets fresh last body',()=>{
 const f=fixture(),a=f.make(),hp=a.maxHp;f.make('h03B');f.start();f.g.state.entities=[];const b=f.make();f.make('h03B');f.start(false);near(a.maxHp,hp+50);near(b.maxHp,hp+100);assert.equal(f.g.state.undeadLegion.counts[0].HP50,2);
});
test('deaths and later summons do not recompute a completed deployment snapshot',()=>{
 const f=fixture(),a=f.make(),source=f.make('h0JP');f.start();const damage=a.damage;source.hp=0;f.g.state.entities=f.g.state.entities.filter(e=>e!==source);f.make('h0JP').isSummon=true;near(a.damage,damage);assert.equal(f.g.state.undeadLegion.counts[0].Attack20,1);
});
test('70-level data uses exported native values; 71 records unsupported request',()=>{
 const f=fixture(),a=f.make();registerUndeadLegion(f.g,a);const c=f.g.state.undeadLegion.counts[0];c.Speed1=70;c.Speed3=70;applyUndeadLegion(f.g,api);near(sourceAuraEffects(f.g,a).haste,2.7999998927116394);c.Speed1=71;applyUndeadLegion(f.g,api);assert.equal(a.abilityLevels.A0J2,70);assert.equal(a.status.undeadLegion.abilityRequests[0].requestedLevel,71);assert.ok(a.status.undeadLegion.abilityRequests[0].boundary);
});
test('maximum life helper checks each add and rejects over65535 before integer conversion',()=>{
 const f=fixture(),a=f.make();a.hp=a.maxHp=65400.5;f.make('h0JJ');f.make('h03B');f.start();near(a.maxHp,65450.5);assert.deepEqual(a.status.undeadLegion.rejectedHp,['HP200']);
});
test('removed handle records boundary; dead handle is distinct and not resurrected',()=>{
 const f=fixture(),a=f.make();a.hp=0;f.make('h03B');f.start();assert.equal(a.hp,0);const max=a.maxHp;a.status.sourceRemoved=true;applyUndeadLegion(f.g,api);near(a.maxHp,max);assert.equal(a.status.undeadLegion.boundary,'removed-recipient-handle-unresolved');
});
test('player10 can register but RR only visits players0 through9',()=>{
 const f=fixture(),a=f.make('h0JR',10);const dmg=a.damage;f.make('h0JP',10);f.start();near(a.damage,dmg);assert.equal(f.g.state.undeadLegion.counts[10].Attack20,1);
});
test('JSON load rebinds recipients and preserves dynamic levels without adding twice',()=>{
 const f=fixture(),a=f.make();f.make('h03C');f.make('h03C');f.make('h0JP');f.start();const damage=a.damage,saved=JSON.parse(JSON.stringify(f.g.snapshot())),g=Game.fromSnapshot(saved);const b=g.state.entities.find(e=>e.id===a.id);assert.equal(g.state.undeadLegion.recipients[0],b);near(b.damage,damage);near(sourceAuraEffects(g,b).haste,.02);b.skillImplementationRevision='old';refreshSourceSkills(b,UNIT_TEMPLATES.h0JR);near(sourceAuraEffects(g,b).haste,.02);near(b.damage,damage);
});
test('old save does not reconstruct missed historical counters from survivors',()=>{
 const f=fixture();f.make();f.make('h0JP');const saved=JSON.parse(JSON.stringify(f.g.snapshot()));delete saved.state.undeadLegion;const g=Game.fromSnapshot(saved);assert.deepEqual(g.state.undeadLegion.counts,{});assert.deepEqual(g.state.undeadLegion.recipients,{});
});
test('normal engine deployment registers real completed buildings and skips pending work',()=>{
 const f=fixture(),p=f.g.state.players[0];p.buildings=[{id:'a',unitId:'v14_h01Q',col:0,row:0},{id:'b',unitId:'v14_h01S',col:1,row:0},{id:'c',unitId:'v14_h01R',col:2,row:0,construction:{remaining:100}}];f.g.state.phase='build';f.g._startCombat();assert.equal(f.g.state.undeadLegion.counts[0].HP50,1);assert.equal(f.g.state.undeadLegion.counts[0].Attack5,1);assert.equal(f.g.state.undeadLegion.counts[0].Speed1,0);
});
test('arena engine uses accumulated counters, sandbox reset clears context',()=>{
 const f=fixture(),p=f.g.state.players[0];p.buildings=[{id:'a',unitId:'v14_h01Q',col:0,row:0}];f.g.state.phase='build';f.g._startCombat();f.g._startArena();assert.equal(f.g.state.undeadLegion.counts[0].HP50,2);f.g._resetSandboxWave();assert.deepEqual(f.g.state.undeadLegion,{counts:{},recipients:{}});
});
test('continuous31-to32 preserves counters and recipient without counting discarded bodies',()=>{
 const f=fixture();f.g.state.mode='normal';f.g.state.wave=31;const p=f.g.state.players[0];p.buildings=[{id:'a',unitId:'v14_h01Q',col:0,row:0}];f.g.state.phase='build';f.g._startCombat();const a=f.make();registerUndeadLegion(f.g,a);applyUndeadLegion(f.g,api);const hp=a.maxHp;f.g._advanceContinuous();assert.equal(f.g.state.undeadLegion.counts[0].HP50,1);assert.equal(f.g.state.undeadLegion.recipients[0],a);near(a.maxHp,hp);
});
test('missing acquisition remains explicit; source-only abilities are not added to menus',()=>{
 assert.ok(!UNITS.some(u=>!u.legacy&&u.sourceRawcode==='n00S'));const a=compileSkills({abilityIds:['A0J1'],skillVersion:'v14.1A5'})[0];assert.equal(a.status,'partial');assert.ok(a.effectText.includes('获取入口'));
});
