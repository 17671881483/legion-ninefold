import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES,MERCENARIES} from '../dist/data.js';
import {compileSkills,sourceDeath,tickSourceScriptJobs,initializeSourceSkills} from '../dist/skills.js';
import {isReincarnating} from '../dist/reincarnation-rules.js';
import {initializeSapperCreation} from '../dist/sapper-rules.js';
import {laneToWorld} from '../dist/layout.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});for(const id of ids)(e.skillStates??={})[id]??={readyAt:0,casts:0};}
function fixture(){
 const g=new Game({mode:'sandbox',seed:51});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];g._spawnQueue=[];g._aiAct=()=>{};g._random=()=>.99;for(const k of g.state.kings)k.worldX=k.worldY=10000;const point=laneToWorld(0,3,6);
 const make=(dx=.3,side='monster',code='h03E',extra={})=>{const e=g._entity(UNIT_TEMPLATES[code],{side,ownerId:side==='defender'?0:null,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:point.x+dx,worldY:point.y,...extra});e.hp=e.maxHp=5000;e.armor=0;e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=9999;if(!['h0WI','h0WJ'].includes(code))skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0WI'),t=make(),at=time=>{g.state.time=time;tickSourceScriptJobs(g);};return{g,a,t,make,at};
}
test('source evidence proves creation registration, widget death and uncalled low-life function',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/sapper-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),source=b.toString('latin1'),lines=source.split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal((source.match(/X9WoodSkillThree/g)??[]).length,1);assert.doesNotMatch(source,/A1TU|\$41315455|1093751893/);
});
test('first pulse occurs one second after creation, not first skill update',()=>{
 const f=fixture();assert.equal(f.a.status.sapperTimer.nextAt,11);f.at(10.999);near(f.t.hp,5000);f.at(11);near(f.t.hp,4995);f.at(11.5);near(f.t.hp,4995);f.at(12);near(f.t.hp,4990);assert.equal(f.a.status.sapperTimer.pulses,2);
});
test('coarse timer catchup retains exact one-second ticks and restores frame time',()=>{
 const f=fixture();f.at(13.4);near(f.t.hp,4985);assert.equal(f.a.status.sapperTimer.pulses,3);assert.equal(f.a.status.sapperTimer.lastPulseAt,13);assert.equal(f.g.state.time,13.4);
});
test('unit pause stun silence and hidden caster do not stop independent timer',()=>{
 for(const condition of ['sourcePaused','yseraHidden','stunUntil','silenceUntil']){const f=fixture();f.a.status[condition]=condition.endsWith('Until')?100:true;f.at(11);near(f.t.hp,4995);}
});
test('global game pause freezes clock and the independent timer',()=>{
 const f=fixture();f.g.state.paused=true;f.g.tick(2);near(f.g.state.time,10);near(f.t.hp,5000);f.g.state.paused=false;f.a.status.sourcePaused=true;for(let i=0;i<20;i++)f.g.tick(.05);near(f.t.hp,4995);
});
test('removing A1TT or setting level zero after creation does not undo registration',()=>{
 for(const method of ['remove','zero']){const f=fixture();if(method==='remove')f.a.skillSpecs=f.a.skillSpecs.filter(s=>s.id!=='A1TT');else f.a.abilityLevels={A1TT:0};f.at(11);near(f.t.hp,4995);f.g._killUnit(f.a);near(f.t.hp,4939);}
});
test('A1TU alone and A1TT gained after creation do not create a listener',()=>{
 const f=fixture();f.g.state.entities=[f.t];const late=f.make(0,'defender');skills(late,['A1TU']);f.at(11);near(f.t.hp,5000);skills(late,['A1TT','A1TU']);initializeSourceSkills(f.g,late);f.at(12);near(f.t.hp,5000);f.g._killUnit(late);near(f.t.hp,5000);assert.equal(late.status.sapperTimer,undefined);
});
test('zero-level A1TT at creation remains unregistered across saves',()=>{
 const f=fixture(),a=f.make(.1,'defender','h0WI',{abilityLevels:{A1TT:0}});assert.equal(a.status.sapperTimer,undefined);const restored=Game.fromSnapshot(clone(f.g.snapshot())),r=restored.state.entities.find(e=>e.id===a.id);assert.equal(r.status.sapperTimer,undefined);assert.equal(r.status.sapperCreationChecked,true);
});
test('A1TT and A1TU together register one timer and cannot double-register',()=>{
 const f=fixture();for(let i=0;i<3;i++)initializeSapperCreation(f.g,f.a);f.at(11);near(f.t.hp,4995);assert.equal(f.a.status.sapperTimer.pulses,1);
});
test('periodic200 and death300 ranges preserve exact boundary and enemy-only selection',()=>{
 const f=fixture(),pulse=f.make(200/300),outer=f.make(300/300),outside=f.make(300/300+.001),ally=f.make(.2,'defender');f.at(11);near(pulse.hp,4995);near(outer.hp,5000);f.g._killUnit(f.a);near(pulse.hp,4939);near(outer.hp,4944);near(outside.hp,5000);near(ally.hp,5000);
});
test('Avul corpses and another battle are excluded, magic immune and mechanical enemies are not',()=>{
 const f=fixture(),inv=f.make(),dead=f.make(),foreign=f.make(),immune=f.make(),mechanical=f.make();skills(inv,['Avul']);dead.hp=0;foreign.battleTeam=1;skills(immune,['Amim']);mechanical.traits=['mechanical'];f.at(11);f.g._killUnit(f.a);for(const e of [inv,foreign])near(e.hp,5000);near(dead.hp,0);for(const e of [immune,mechanical])near(e.hp,4939);
});
test('king participates in the same independent range listener',()=>{
 const f=fixture();f.a.side='monster';f.a.team=1;const k=f.g.state.kings[0];k.worldX=f.a.worldX+.3;k.worldY=f.a.worldY;k.hp=k.maxHp=5000;f.at(11);near(k.hp,4995);f.g._killUnit(f.a);near(k.hp,4939);
});
test('death disables its timer before damage and cannot explode twice',()=>{
 const f=fixture();f.g._killUnit(f.a);near(f.t.hp,4944);assert.equal(f.a.status.sapperTimer.active,false);assert.equal(f.a.status.sapperTimer.deathExploded,true);sourceDeath(f.g,f.a,null);f.at(50);near(f.t.hp,4944);assert.equal(f.a.status.sapperTimer.pulses,0);
});
test('widget explosion fires before reincarnation and never restarts on the same handle',()=>{
 const f=fixture();skills(f.a,['A1TT','A1TU','A14E']);f.g._hurt(f.a,6000,f.t,{spell:true,scripted:true});assert.equal(isReincarnating(f.a),true);assert.equal(f.a.status.sourceDeathHandled,undefined);near(f.t.hp,4944);assert.equal(f.a.status.sapperTimer.active,false);f.at(12);near(f.a.hp,5000);f.at(13);near(f.t.hp,4944);f.g._killUnit(f.a);near(f.t.hp,4944);
});
test('nested main death suppression does not disable the independent widget explosion',()=>{
 const f=fixture();f.g._sourceUnitDeathTriggerDepth=1;f.g._killUnit(f.a);near(f.t.hp,4944);assert.equal(f.g._sourceUnitDeathTriggerDepth,1);
});
test('independent sapper explosions can kill and trigger another sapper once each',()=>{
 const f=fixture();f.g.state.entities=[f.a];const other=f.make(.3,'monster','h0WJ'),ally=f.make(.4,'defender');other.hp=50;f.g._killUnit(f.a);assert.ok(other.hp<=0);near(ally.hp,4944);assert.equal(other.status.sapperTimer.deathExploded,true);assert.equal(f.a.status.sapperTimer.deathExploded,true);
});
test('the unregistered15percent function is not fabricated as88 extra damage',()=>{
 const f=fixture();f.a.hp=700;f.g._hurt(f.a,1,f.t,{spell:true,scripted:true});near(f.t.hp,5000);f.at(11);near(f.t.hp,4995);
});
test('removed handles do not fabricate death explosions or keep host damage running',()=>{
 const f=fixture();f.a.status.sourceRemoved=true;f.at(11);near(f.t.hp,5000);assert.equal(f.a.status.sapperTimer.active,false);assert.equal(f.a.status.sapperTimer.removedOutcomeUnknown,true);
});
test('legacy live timer keeps previous phase; dead and reincarnating saves get no retroactive explosion',()=>{
 for(const kind of ['live','dead','reviving']){const f=fixture();delete f.a.status.sapperTimer;delete f.a.status.sapperCreationChecked;f.a.skillStates.A1TT.nextPulseAt=10.7;if(kind!=='live')f.a.hp=0;if(kind==='dead')f.a.status.sourceDeathHandled=true;if(kind==='reviving')f.a.status.reincarnation={phase:'waiting',reviveAt:12};const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities[0];assert.equal(a.status.sapperTimer.nextAt,10.7);assert.equal(a.status.sapperTimer.active,kind==='live');g.state.time=11;tickSourceScriptJobs(g);near(g.state.entities[1].hp,kind==='live'?4995:5000);}
});
test('saved active and stopped timers continue deterministically',()=>{
 const f=fixture();f.at(11.2);const restored=Game.fromSnapshot(clone(f.g.snapshot()));f.at(12);restored.state.time=12;tickSourceScriptJobs(restored);near(restored.state.entities[1].hp,f.t.hp);assert.deepEqual(restored.state.entities[0].status.sapperTimer,f.a.status.sapperTimer);f.g._killUnit(f.a);const stopped=Game.fromSnapshot(clone(f.g.snapshot()));stopped.state.time=20;tickSourceScriptJobs(stopped);near(stopped.state.entities[1].hp,f.t.hp);
});
test('actual wave11 purchase and creation register one timer; mechanical variant remains preview',()=>{
 const g=new Game({mode:'sandbox',seed:51}),m=MERCENARIES.find(m=>m.combatRawcode==='h0WI'),v=MERCENARIES.find(m=>m.combatRawcode==='h0WJ');assert.equal(g.command('merc',{mercId:m.id}).ok,false);ok(g.command('sandboxWave',{wave:11}));const wood=g.state.players[0].wood;ok(g.command('merc',{mercId:m.id}));near(g.state.players[0].wood,wood-480);assert.equal(g.command('merc',{mercId:v.id}).ok,false);ok(g.command('ready'));g.tick(.2);const e=g.state.entities.find(e=>e.combatRawcode==='h0WI');assert.ok(e.status.sapperTimer);near(e.status.sapperTimer.nextAt,e.createdAt+1);
});
test('coverage descriptions identify one shared script and preserve partial native boundaries',()=>{
 const specs=compileSkills({skillVersion:'v14.1A5',abilityIds:['A1TT','A1TU']});assert.ok(specs.every(s=>s.status==='partial'));assert.ok(specs[0].effectText.includes('88'));assert.ok(specs[1].effectText.includes('不能重复计算'));assert.ok(specs[1].effectText.includes('300码'));
});
