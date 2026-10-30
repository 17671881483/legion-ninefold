import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {laneToWorld} from '../dist/layout.js';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,sourceDeath} from '../dist/skills.js';
import {unstableAlchemyDeath} from '../dist/unstable-alchemy-rules.js';
const skills=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
function fixture(){
 const g=new Game({mode:'sandbox',seed:37});g.state.entities=[];g.state.phase='combat';g.state.time=10;
 const make=(code='h06W',ownerId=0)=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId,userData:ownerId+1,team:ownerId<4?0:1,side:ownerId<4?'defender':'monster',battleTeam:0,laneId:0,worldX:10,worldY:10});g.state.entities.push(e);return e;};
 const a=make(),t=make('h03E',4);skills(t,[]);const base=g.state.players.map(p=>p.gold),stats=g.state.players.map(p=>p.stats.goldEarned);
 let draws=0;const rolls=(...values)=>{draws=0;g._random=()=>{assert.ok(draws<values.length,'unexpected random draw');return values[draws++];};};
 const delta=id=>g.state.players[id].gold-base[id];
 return {g,a,t,make,rolls,delta,draws:()=>draws,stats};
}
test('JASS source evidence and missing native spirit-link split field are preserved',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/unstable-alchemy-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');assert.equal(createHash('sha256').update(raw).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);const audit=JSON.parse(readFileSync(new URL('../reference/soul-link-source-audit.json',import.meta.url)));assert.equal(audit.abilities.A0JJ.DataA1,undefined);
});
test('death draws 1..20 inclusively after the unconditional Singed draw',()=>{
 for(const [draw,gold]of [[0,1],[.5,11],[.999999,20]]){const f=fixture();f.rolls(.9,draw);f.a.hp=0;sourceDeath(f.g,f.a,f.t);assert.equal(f.delta(0),gold);assert.equal(f.draws(),2);assert.equal(f.g.state.players[0].stats.goldEarned-f.stats[0],gold);}
});
test('exact level1 is required; level0 and level2 are not death payouts',()=>{
 for(const level of [0,2]){const f=fixture();f.a.abilityLevels={A0UA:level};f.rolls(.9);sourceDeath(f.g,f.a,f.t);assert.equal(f.delta(0),0);assert.equal(f.draws(),1);}
});
test('dead holder wins over eligible killer without a killer chance draw',()=>{
 const f=fixture();skills(f.t,['A0UA']);f.rolls(.9,.45);sourceDeath(f.g,f.a,f.t);assert.equal(f.delta(0),10);assert.equal(f.delta(4),0);assert.equal(f.draws(),2);assert.equal(f.a.status.unstableAlchemy.branch,'death');
});
test('kill chance preserves real1..101<=1 rather than granting a1% roll',()=>{
 for(const draw of [.000001,.005,.01,.99]){const f=fixture();f.rolls(.9,draw);sourceDeath(f.g,f.t,f.a);assert.equal(f.delta(0),0);assert.equal(f.draws(),2);assert.ok(f.t.status.unstableAlchemy.roll>1);}
});
test('exact real lower endpoint admits killer payout and its separate amount draw',()=>{
 const f=fixture();f.rolls(.9,0,.999999);sourceDeath(f.g,f.t,f.a);assert.equal(f.delta(0),20);assert.equal(f.draws(),3);assert.equal(f.t.status.unstableAlchemy.roll,1);
});
test('death payout works with no killer, allied killer, self-kill and illusions',()=>{
 for(const kind of ['none','ally','self','illusion']){const f=fixture();if(kind==='ally')f.t.side=f.a.side;if(kind==='illusion')f.a.isIllusion=true;f.rolls(.9,0);sourceDeath(f.g,f.a,kind==='none'?null:kind==='self'?f.a:f.t);assert.equal(f.delta(0),1);}
});
test('killer payout has no enemy test and does not require living killer',()=>{
 const f=fixture();f.t.side=f.a.side;f.t.team=f.a.team;f.a.hp=0;f.rolls(.9,0,.2);sourceDeath(f.g,f.t,f.a);assert.equal(f.delta(0),5);
});
test('recipient uses userData not changed owner or source lane',()=>{
 const f=fixture();f.a.ownerId=4;f.a.sourceLaneId=5;f.a.userData=3;f.rolls(.9,.2);sourceDeath(f.g,f.a,f.t);assert.equal(f.delta(2),5);assert.equal(f.delta(0),0);assert.equal(f.delta(4),0);
});
test('invalid or absent native player requests do not fall back to owner',()=>{
 for(const data of [undefined,0,11,1.5]){const f=fixture();f.a.userData=data;f.rolls(.9,.3);sourceDeath(f.g,f.a,f.t);assert.equal(f.delta(0),0);assert.equal(f.a.status.unstableAlchemy.amount,7);assert.equal(f.a.status.unstableAlchemy.boundary,'native-player-not-represented');assert.equal(f.draws(),2);}
});
test('no eligible holders consume only the existing Singed initializer draw',()=>{
 const f=fixture();skills(f.a,[]);f.rolls(.9);sourceDeath(f.g,f.a,f.t);assert.equal(f.draws(),1);assert.equal(f.a.status.unstableAlchemy,undefined);
});
test('Ju exclusion and main death suppression consume no A0UA or Singed draws',()=>{
 for(const kind of ['ju','nested']){const f=fixture();if(kind==='ju')f.a.status.sourceJuMember=true;else f.g._sourceUnitDeathTriggerDepth=1;f.rolls();sourceDeath(f.g,f.a,f.t);assert.equal(f.draws(),0);assert.equal(f.delta(0),0);}
});
test('ordinary damage and spell trigger disabling do not disable the death listener',()=>{
 const f=fixture();f.g._sourceDamageTriggerDepth=1;f.g._sourceAbilityEffectDepth=1;f.rolls(.9,.05);sourceDeath(f.g,f.a,f.t);assert.equal(f.delta(0),2);
});
test('death branch pays before the final fire elseif and only once per handled death',()=>{
 const f=fixture();skills(f.t,['A0HW']);f.t.worldX=100;f.rolls(.9,.1);sourceDeath(f.g,f.a,f.t);sourceDeath(f.g,f.a,f.t);assert.equal(f.delta(0),3);assert.equal(f.draws(),2);
});
test('nested A20D death cannot pay A0UA, outer A0UA remains eligible',()=>{
 const f=fixture();f.g.state.wave=31;skills(f.a,['A20D','A0UA']);skills(f.t,['A0UA']);f.t.hp=1;f.t.maxHp=100;f.rolls(.9,.25);f.g._killUnit(f.a,f.t);assert.equal(f.delta(0),6);assert.equal(f.delta(4),0);assert.equal(f.t.status.unstableAlchemy,undefined);assert.equal(f.draws(),2);
});
test('ability compilation remains partial and does not invent an active cast',()=>{
 const f=fixture(),s=f.a.skillSpecs.find(s=>s.id==='A0UA');assert.equal(s.kind,'unstable_alchemy_source');assert.equal(s.status,'partial');assert.ok(s.effectText.includes('≤1'));
});
test('live and already-paid snapshots preserve RNG/payout and do not repeat grants',()=>{
 const f=fixture();f.a.hp=0;const a=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),b=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot())));sourceDeath(a,a.state.entities[0],a.state.entities[1]);sourceDeath(b,b.state.entities[0],b.state.entities[1]);assert.equal(a.state.players[0].gold,b.state.players[0].gold);assert.equal(a._rng,b._rng);const c=Game.fromSnapshot(JSON.parse(JSON.stringify(a.snapshot()))),gold=c.state.players[0].gold;sourceDeath(c,c.state.entities[0],c.state.entities[1]);assert.equal(c.state.players[0].gold,gold);
});
test('legacy deployed unit derives userData only from an identifiable persistent building',()=>{
 for(const withBuilding of [true,false]){const f=fixture();delete f.a.userData;f.a.buildingId='mutant';if(withBuilding)f.g.state.players[0].buildings=[{id:'mutant',unitId:'v14_h06I',col:0,row:0}];const g=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot())));assert.equal(g.state.entities[0].userData,withBuilding?1:undefined);}
});
test('real engineer-to-mutant upgrade paths stamp original player for normal and arena death',()=>{
 for(const next of ['v14_h06I','v14_h076','v14_h0T3']){const g=new Game({mode:'sandbox',builderId:'v14_builder_u00H',seed:37}),p=g.state.players[0],ok=r=>assert.equal(r.ok,true,r.message);ok(g.command('build',{unitId:'v14_h06J',col:0,row:0}));ok(g.command('sandboxComplete'));const b=p.buildings[0];ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_h078'}));ok(g.command('sandboxComplete'));ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_h06I'}));ok(g.command('sandboxComplete'));if(next!=='v14_h06I'){ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_h076'}));ok(g.command('sandboxComplete'));}if(next==='v14_h0T3'){assert.equal(g.command('upgrade',{buildingId:b.id,unitId:next}).ok,false);ok(g.command('sandboxQualification',{key:'R0BJ',enabled:true}));ok(g.command('upgrade',{buildingId:b.id,unitId:next}));ok(g.command('sandboxComplete'));}ok(g.command('ready'));let e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,next==='v14_h06I'?'h06W':next==='v14_h076'?'h077':'h0T5');assert.equal(e.userData,1);let gold=p.gold;g._random=()=>.5;g._killUnit(e,null);assert.equal(p.gold-gold,11);g._startArena();e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.userData,1);gold=p.gold;g._killUnit(e,null);assert.equal(p.gold-gold,11);}
});
test('skin h0T5 retains same exact-level death rule and original player userdata',()=>{
 const f=fixture(),e=f.make('h0T5',2);f.rolls(.9,.4);sourceDeath(f.g,e,null);assert.equal(f.delta(2),9);
});

test('natural combat death awards once after pause resumes, without direct death calls',()=>{
 const f=fixture(),p=laneToWorld(0,3,6);for(const e of [f.a,f.t]){e.worldX=p.x;e.worldY=p.y;}f.t.worldX+=.3;f.a.hp=1;f.a.attackCd=1000;f.a.hpRegen=0;f.a.moveSpeed=0;f.t.moveSpeed=0;f.t.attackCd=0;f.t.damage=10000;f.g._aiAct=()=>{};f.g.state.paused=true;f.g.tick(1);assert.equal(f.a.status.unstableAlchemy,undefined);f.g.state.paused=false;for(let i=0;i<40&&!f.a.status.unstableAlchemy;i++)f.g.tick(.05);const report=f.a.status.unstableAlchemy;assert.ok(report);assert.equal(report.branch,'death');assert.ok(report.awarded>=1&&report.awarded<=20);assert.equal(f.a.hp<=0,true);const awarded=report.awarded;sourceDeath(f.g,f.a,f.t);assert.equal(report.awarded,awarded);
});
