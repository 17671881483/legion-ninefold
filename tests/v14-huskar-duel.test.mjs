import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,tickSourceScriptJobs} from '../dist/skills.js';
import {laneToWorld} from '../dist/layout.js';
const setSkills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});};
const jobs=g=>g.state.sourceSkillJobs.filter(j=>j.type==='huskar_duel'&&!j.done);
const hit=(g,e,a,n=1)=>g._hurt(e,n,a,{spell:true,universal:true});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){
  const g=new Game({mode:'sandbox',seed:21});g.state.phase='combat';g.state.time=10;g.state.entities=[];
  const at=laneToWorld(0,3,6);
  const make=(side='monster',maxHp=2000,dx=0,dy=0,ids=[])=>{const e=g._entity(UNIT_TEMPLATES.h0JL,{ownerId:side==='defender'?0:null,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,worldX:at.x+dx,worldY:at.y+dy});e.hp=e.maxHp=maxHp;e.hpRegen=e.manaRegen=0;e.attackCd=e.abilityCd=1000;setSkills(e,ids);g.state.entities.push(e);return e;};
  const e=make('defender',3500,0,0,['A0ID']),a=make('monster',100,0,1);
  return {g,e,a,make};
}
test('selection is centered on damage source, not Huskar, and is not nearest sorting',()=>{
  const {g,e,a,make}=fixture();e.worldY-=6;const first=make('monster',1800,0,3.5),nearer=make('monster',5000,0,1.1);
  hit(g,e,a);assert.equal(e.status.huskarDuelTag,first.id);assert.notEqual(e.targetId,nearer.id);assert.equal(first.targetId,e.id);assert.equal(jobs(g).length,1);
  assert.equal(e.status.huskarPathingOff,true);assert.equal(first.status.huskarPathingOff,undefined);
});
test('source threshold includes exactly 1800; Avul, ally, out-of-range and other battle are excluded',()=>{
  const {g,e,a,make}=fixture();make('monster',1799);make('monster',5000,0,1,['Avul']);make('defender',5000);make('monster',5000,0,8);make('monster',5000,0,1,['Aloc']);const hidden=make('monster',5000,0,1);hidden.status.yseraHidden=true;const elsewhere=make();elsewhere.battleTeam=1;
  const selected=make('monster',1800,0,1);selected.isSummon=true;hit(g,e,a);assert.equal(e.status.huskarDuelTag,selected.id);
});
test('the script does not filter corpses, and a rejected attack order does not erase stored tag',()=>{
  const {g,e,a,make}=fixture(),dead=make();dead.hp=0;dead.status.sourceDeathHandled=true;make();hit(g,e,a);
  assert.equal(e.status.huskarDuelTag,dead.id);g._updateEntities(.01);assert.equal(e.status.huskarDuelTag,dead.id);assert.equal(e.status.huskarAttackOrder,undefined);
});
test('no eligible target allows retry on a later event; existing tag prevents duplicate registrations',()=>{
  const {g,e,a,make}=fixture();hit(g,e,a);assert.equal(jobs(g).length,0);const t=make();hit(g,e,a);hit(g,e,a);assert.equal(jobs(g).length,1);assert.equal(e.status.huskarDuelTag,t.id);
});
test('main damage guards reject self, ally, absent source, zero, A2Y7 and recursive events',()=>{
  for(const mode of ['self','ally','null','zero','A2Y7','recursive']){const {g,e,a,make}=fixture();make();if(mode==='ally')a.side=e.side;if(mode==='A2Y7')setSkills(a,['A2Y7']);if(mode==='recursive')g._sourceDamageTriggerDepth=1;hit(g,e,mode==='null'?null:mode==='self'?e:a,mode==='zero'?0:1);assert.equal(jobs(g).length,0,mode);}
});
test('resolved prefix branches fall through only on a miss; remaining earlier conditions still block',()=>{
  for(const skill of ['A0HX','A0IK']){const {g,e,a,make}=fixture();make();setSkills(a,[skill]);g._random=()=>0;hit(g,e,a);assert.equal(jobs(g).length,0);assert.equal(e.status.huskarDuelDeferred,undefined);g._random=()=>.9;g.state.time+=2;hit(g,e,a);assert.equal(jobs(g).length,1);}
  const {g,e,a,make}=fixture();make();setSkills(e,['A0ID','A0I5']);e.mana=25;hit(g,e,a);assert.equal(jobs(g).length,0);e.mana=24;hit(g,e,a);assert.equal(jobs(g).length,1);
});
test('duel and unyielding run in separate if chains on the same lethal event',()=>{
  const {g,e,a,make}=fixture();make();setSkills(e,['A0ID','A0IE']);e.hp=100;hit(g,e,a,200);near(e.hp,100);assert.equal(jobs(g).length,1);assert.equal(e.status.huskarUnyielding,true);
});
test('caster death to any attacker kills its tag without a damage event or kill credit',()=>{
  const {g,e,a,make}=fixture(),t=make();hit(g,e,a);setSkills(t,['A0IE','Avul']);t.status.shield=999999;t.status.cycloneUntil=999;
  const gold=g.state.players[0].gold,damage=g.state.players[0].stats.damage;
  hit(g,e,a,99999);assert.equal(e.hp<=0,true);assert.equal(t.hp,0);assert.equal(t.status.sourceDeathHandled,true);assert.equal(t.status.huskarUnyielding,undefined);
  assert.equal(g.state.players[0].gold,gold);assert.equal(g.state.players[0].stats.damage,damage);assert.equal(g.state.players[0].stats.kills,0);assert.equal(jobs(g).length,0);
});
test('opponent dies first: survivor keeps dangling tag, receives no immunity and never reselects',()=>{
  const {g,e,a,make}=fixture(),t=make();hit(g,e,a);g._killUnit(t);assert.equal(jobs(g).length,0);assert.equal(e.status.huskarDuelImmune,undefined);assert.equal(e.status.huskarDuelTag,t.id);assert.equal(e.status.huskarPathingOff,true);
  g._clearDead();make();hit(g,e,a);assert.equal(jobs(g).length,0);assert.equal(e.status.huskarDuelTag,t.id);g._killUnit(e);assert.equal(a.hp>0,true);
});
test('death callback follows dead opponent own tag, even when it points to a third unit',()=>{
  const {g,e,a,make}=fixture(),t=make(),third=make();hit(g,e,a);t.status.huskarDuelTag=third.id;g._killUnit(t);assert.equal(third.hp,0);assert.equal(e.hp>0,true);assert.equal(jobs(g).length,0);
});
test('reciprocal registrations and nested KillUnit terminate and do not double-settle death',()=>{
  const {g,e,a,make}=fixture(),t=make('monster',2000,0,1,['A0ID']);hit(g,e,a);hit(g,t,e);assert.equal(jobs(g).length,2);assert.equal(t.status.huskarDuelTag,e.id);
  g._killUnit(e);assert.equal(t.hp,0);assert.equal(jobs(g).length,0);const killed=g.state.metrics.killed;assert.equal(g._killUnit(t),false);assert.equal(g.state.metrics.killed,killed);
});
test('issued order retains distant target beyond acquisition range, while normal orders can override it',()=>{
  const {g,e,a,make}=fixture(),t=make('monster',2000,0,4);a.worldY=t.worldY;const closer=make('monster',100,0,.2);e.acquisitionRange=.5;e.range=.3;e.moveSpeed=0;t.moveSpeed=0;
  hit(g,e,a);g._updateEntities(.01);assert.equal(e.targetId,t.id);
  e.targetId=closer.id;g._updateEntities(.01);assert.equal(e.status.huskarAttackOrder,undefined);assert.equal(e.targetId,closer.id);assert.equal(e.status.huskarDuelTag,t.id);
});
test('T interrupts the monster attack order without clearing the caster duel record',()=>{
  const {g,e,a,make}=fixture(),t=make();hit(g,e,a);assert.equal(t.status.huskarAttackOrder.targetId,e.id);
  assert.equal(g.command('interfere',{worldX:t.worldX,worldY:t.worldY}).ok,true);g._updateEntities(.01);assert.equal(t.status.huskarAttackOrder,undefined);assert.equal(e.status.huskarDuelTag,t.id);
});
test('pathing-off suppresses only caster unit repulsion, not terrain or the other unit collision',()=>{
  const {g,e,make}=fixture(),t=make('defender',100,.1,.1),destination={x:e.worldX+1,y:e.worldY},start={x:e.worldX,y:e.worldY};g._nearby=()=>[t];g._canSegment=()=>true;e.moveSpeed=1;
  g._moveWorld(e,destination,[],.1);assert.notEqual(e.worldY,start.y);e.worldX=start.x;e.worldY=start.y;e.status.huskarPathingOff=true;g._moveWorld(e,destination,[],.1);near(e.worldX,start.x+.1);near(e.worldY,start.y);assert.equal(t.status.huskarPathingOff,undefined);
});
test('save restoration retains live registrations and uses restored handles for KillUnit',()=>{
  const {g,e,a,make}=fixture(),t=make();hit(g,e,a);const r=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))),re=r.state.entities.find(x=>x.id===e.id),rt=r.state.entities.find(x=>x.id===t.id);
  assert.equal(jobs(r).length,1);r._killUnit(re);assert.equal(rt.hp,0);assert.equal(t.hp,2000);assert.equal(jobs(r).length,0);
});
test('continuous waves preserve registrations; ordinary reset clears them',()=>{
  const {g,e,a,make}=fixture();make();hit(g,e,a);g.state.mode='normal';g.state.wave=31;g._advanceContinuous();assert.equal(jobs(g).length,1);assert.ok(g.state.entities.some(x=>x.id===e.id));g.state.mode='sandbox';g.command('sandboxReset');assert.equal(jobs(g).length,0);
});
test('unreachable self-tag branch retains only its five-second marker, without invented invulnerability',()=>{
  const {g,e,a,make}=fixture();make();hit(g,e,a);e.status.huskarDuelTag=e.id;g._killUnit(e);assert.equal(e.status.huskarDuelImmune,true);assert.equal(e.status.huskarDuelTag,undefined);
  g.state.time=14.99;tickSourceScriptJobs(g);assert.equal(e.status.huskarDuelImmune,true);g.state.time=15;tickSourceScriptJobs(g);assert.equal(e.status.huskarDuelImmune,undefined);assert.equal(e.skillSpecs.some(s=>s.id==='A0IM'),false);
});
test('source labels and evidence retain literal callback behavior and native limitations',()=>{
  const s=compileSkills({abilityIds:['A0ID'],skillVersion:'v14.1A5'})[0];assert.equal(s.status,'partial');assert.match(s.effectText,/伤害来源为圆心/);assert.match(s.effectText,/死者自身tag/);assert.match(s.effectText,/原生枚举顺序/);
  const raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n'),evidence=JSON.parse(readFileSync(new URL('../reference/huskar-duel-evidence.json',import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'),evidence.source.sha256);for(const v of evidence.sourceEvidence)assert.equal(lines[v.line-1].replace(/\r$/,''),v.text);
});
