import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,beforeSourceDamage,sourceAttackIssued} from '../dist/skills.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const specs=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function fixture(ids=['A0HX'],enemyIds=[]){
  const g=new Game({mode:'sandbox',seed:26});g.state.entities=[];g.state.phase='combat';g.state.time=10;
  const at=laneToWorld(0,3,6);
  const make=(side='monster',abilities=[])=>{const e=g._entity(UNIT_TEMPLATES.h0JL,{ownerId:side==='defender'?0:null,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,worldX:at.x+.3,worldY:at.y});e.skillSpecs=[];e.buffs=[];e.ability=null;specs(e,abilities);e.hp=e.maxHp=1000;e.hpRegen=e.manaRegen=0;e.armor=0;e.armorType='unarmored';e.sourceArmorTypeRaw='none';e.attackCd=e.abilityCd=1000;g.state.entities.push(e);return e;};
  const a=make('defender',ids),t=make('monster',enemyIds);a.worldX=at.x;
  a.weapon1={weapTp1:'missile',weapsOn:1,rangeN1:600,dmgpt1:.5,cool1:1,atkType1:'normal',targs1:'air,ground,enemies'};a.weapon2={};a.damage=10;a.attackType='normal';a.range=2;a.attackInterval=1;
  const lane=g.state.entities;lane.auras=[];g._worldEntities=new Map(lane.map(e=>[e.id,e]));
  g._random=()=>0;const hit=(amount=1,options={spell:true,universal:true})=>g._hurt(t,amount,a,options);
  return {g,a,t,make,lane,hit};
}
test('source evidence proves strict fire roll, inclusive ice roll, local P8 and unregistered Frost1',()=>{
  const proof=JSON.parse(readFileSync(new URL('../reference/elemental-proc-evidence.json',import.meta.url))),bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),jass=bytes.toString('latin1'),lines=jass.split('\n');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),proof.source.sha256);
  for(const e of proof.sourceEvidence)assert.equal(lines[e.line-1].trim(),e.text);
  assert.equal((jass.match(/\bFrost1\b/g)??[]).length,1);
  const body=lines.slice(41259,41287).join('\n');assert.match(body,/GetRandomReal\(0,100\)<5/);assert.match(body,/GetRandomPercentageBJ\(\)<=30/);assert.doesNotMatch(body,/YDWESetEventDamage/);
});
test('fire proc is additional 70% maximum HP damage; original event amount is unchanged',()=>{
  const {g,a,t,hit}=fixture();let rolls=0;g._random=()=>{rolls++;return 0;};const amount=hit(100);near(amount,100);near(t.hp,200);assert.equal(rolls,1);near(g.state.players[0].stats.damage,800);
});
test('fire cap is 3000 and the exact 5% boundary fails',()=>{
  const {g,t,hit}=fixture();t.hp=t.maxHp=10000;hit();near(t.hp,6999);
  const x=fixture();x.g._random=()=>.05;x.hit();near(x.t.hp,999);
});
test('damage-event proc accepts spells and separate arrows but rejects main-listener guards',()=>{
  for(const options of [{spell:true,universal:true},{spell:false,weapon:true,barrage:true}]){const f=fixture();f.hit(1,options);near(f.t.hp,299);}
  for(const mode of ['self','ally','null','zero','reentry','A2Y7','zero-level']){const f=fixture();let rolls=0;f.g._random=()=>{rolls++;return 0;};if(mode==='ally')f.a.side=f.t.side;if(mode==='reentry')f.g._sourceDamageTriggerDepth=1;if(mode==='A2Y7')specs(f.a,['A0HX','A2Y7']);if(mode==='zero-level')f.a.abilityLevels={A0HX:0};f.g._hurt(f.t,mode==='zero'?0:1,mode==='null'?null:mode==='self'?f.t:f.a,{spell:true,universal:true});assert.equal(rolls,0,mode);}
});
test('fire and ice share one elseif chain and do not reroll during nested scripted damage',()=>{
  const f=fixture(['A0HX','A0IK']);let rolls=0;f.g._random=()=>{rolls++;return 0;};f.hit();near(f.t.hp,299);assert.equal(rolls,1);assert.equal(f.t.status.iceExplosionBoltRequest,undefined);
  const x=fixture(['A0HX','A0IK']);const random=[.05,.3];x.g._random=()=>{assert.ok(random.length);return random.shift();};x.hit();near(x.t.hp,874);assert.equal(random.length,0);assert.equal(x.t.status.iceExplosionBoltRequest.applied,true);
});
test('fire local P8 feeds unyielding after bonus damage but does not replace original damage',()=>{
  const {a,t,hit}=fixture(['A0HX'],['A0IE']);hit(10);near(t.hp,990);assert.equal(t.status.huskarUnyielding,true);assert.equal(t.status.huskarDamageLocalUnresolved,undefined);assert.equal(has(t,'A0IE'),false);
  const x=fixture(['A0HX'],['A0IE']);x.t.hp=x.t.maxHp=10000;x.hit(8000);assert.equal(x.t.hp,-1000);assert.equal(x.t.status.huskarUnyielding,undefined,'local 3000 is not lethal at 7000 HP even though the original 8000 is');
});
test('resolved prefix skips duel only when a branch is selected; misses fall through',()=>{
  for(const id of ['A0HX','A0IK']){const f=fixture([id],['A0ID']);f.a.hp=f.a.maxHp=2000;f.g._random=()=>0;f.hit();assert.equal(f.t.status.huskarDuelTag,undefined);assert.equal(f.t.status.huskarDuelDeferred,undefined);
    const x=fixture([id],['A0ID']);x.a.hp=x.a.maxHp=2000;x.g._random=()=>.9;x.hit();assert.equal(x.t.status.huskarDuelTag,x.a.id);assert.equal(x.t.status.huskarDuelDeferred,undefined);}
});
test('ice adds 125 physical damage with armor and a known 1.75-second B04X stun',()=>{
  const {g,t,hit}=fixture(['A0IK']);t.armor=10;hit(1);near(t.hp,999-125*g._armorFactor(10));near(t.status.stunUntil,11.75);assert.ok(t.buffs.some(b=>b.key==='B04X'&&b.expiresAt===11.75));assert.equal(t.status.iceExplosionBoltRequest.missingNativeDamage,true);
});
test('ice exact 30% succeeds and above it fails without a buff marker',()=>{
  for(const [roll,loss] of [[.3,126],[.3000001,1]]){const f=fixture(['A0IK']);f.g._random=()=>roll;f.hit();near(f.t.hp,1000-loss);}
});
test('Aphx/A1SD suppress only the bolt request; mechanical and magic immune targets still take physical bonus',()=>{
  for(const id of ['Aphx','A1SD']){const f=fixture(['A0IK'],[id]);f.hit();near(f.t.hp,874);assert.equal(f.t.status.iceExplosionBoltRequest,undefined);assert.equal(f.t.status.stunUntil,undefined);}
  for(const mode of ['mechanical','immune']){const f=fixture(['A0IK']);if(mode==='mechanical')f.t.traits=['mechanical'];else specs(f.t,['Amim']);f.hit();near(f.t.hp,874);assert.equal(f.t.status.iceExplosionBoltRequest.applied,false);assert.equal(f.t.status.stunUntil,undefined);}
});
test('direct ice bonus kill grants barrage without fabricating a three-attack counter',()=>{
  const {g,a,t,hit}=fixture(['A0IK']);t.hp=100;hit();assert.ok(t.hp<=0);assert.equal(has(a,'A0IL'),true);assert.equal(a.status.iceExplosionCharges,undefined);
  for(let i=0;i<5;i++)sourceAttackIssued(g,a);assert.equal(has(a,'A0IL'),true);
});
test('ordinary lethal hit only marks a pre-frozen target; no post-damage charge grant is invented',()=>{
  const {g,a,t,hit}=fixture(['A0IK']);g._random=()=>.9;t.hp=50;t.buffs.push({key:'B04X',expiresAt:20});hit(100);
  assert.equal(t.status.iceExplosionMarked,true);assert.ok(t.hp<=0);assert.equal(has(a,'A0IL'),false);assert.equal(a.status.iceExplosionCharges,undefined);
});
test('frozen marker is applied on non-proc branch and expires with buff rather than granting on every hit',()=>{
  const f=fixture(['A0IK'],['A0ID']);f.a.hp=f.a.maxHp=2000;f.g._random=()=>.9;f.t.buffs.push({key:'B04X',expiresAt:11});f.hit();assert.equal(f.t.status.iceExplosionMarked,true);assert.equal(f.t.status.huskarDuelTag,undefined);
  f.g.state.time=11;f.hit();assert.equal(f.t.status.huskarDuelTag,f.a.id);assert.equal(f.a.status.iceExplosionCharges,undefined);
});
test('already-dead marked target branch grants the current source three charges without requiring its A0IK',()=>{
  const {g,a,t}=fixture([]);t.hp=0;t.status.iceExplosionMarked=true;beforeSourceDamage(g,t,1,a,{spell:true});assert.equal(a.status.iceExplosionCharges,3);assert.equal(has(a,'A0IL'),true);sourceAttackIssued(g,a);assert.equal(a.status.iceExplosionCharges,3);
  beforeSourceDamage(g,t,1,a,{spell:true});assert.equal(a.status.iceExplosionCharges,6);assert.equal(t.status.iceExplosionMarked,true);
});
test('literal charge removal occurs at new value one, not zero or after three hits',()=>{
  const {g,a}=fixture(['A0IK','A0IL']);a.status.iceExplosionCharges=3;sourceAttackIssued(g,a);assert.equal(a.status.iceExplosionCharges,2);assert.equal(has(a,'A0IL'),true);sourceAttackIssued(g,a);assert.equal(a.status.iceExplosionCharges,1);assert.equal(has(a,'A0IL'),false);sourceAttackIssued(g,a);assert.equal(a.status.iceExplosionCharges,0);
  specs(a,['A0IK','A0IL']);a.status.iceExplosionCharges=1;sourceAttackIssued(g,a);assert.equal(has(a,'A0IL'),true,'1 to 0 does not execute the source removal branch');
});
test('windup consumes a charge on initiation, cancellation preserves that consumption, release does not double count',()=>{
  const {g,a,t,lane}=fixture(['A0IK','A0IL']);g._random=()=>.9;a.side='monster';a.team=1;t.side='defender';t.team=0;a.status.iceExplosionCharges=3;
  g._beginMonsterAttack(a,t,lane);assert.ok(a.pendingAttack);assert.equal(a.status.iceExplosionCharges,2);
  assert.equal(g.command('interfere',{worldX:a.worldX,worldY:a.worldY}).ok,true);assert.equal(a.pendingAttack,null);assert.equal(a.status.iceExplosionCharges,2);
  g._beginMonsterAttack(a,t,lane);assert.equal(a.status.iceExplosionCharges,1);assert.equal(has(a,'A0IL'),false);g.state.time+=1;g._advanceMonsterAttack(a,lane);assert.equal(a.status.iceExplosionCharges,1);
});
test('zero-windup and immediate attack paths consume one charge, including a miss',()=>{
  for(const windup of [0,.5]){const {g,a,t,lane}=fixture(['A0IK','A0IL']);g._random=()=>.9;a.status.iceExplosionCharges=3;a.weapon1.dmgpt1=windup;a.buffs.push({expiresAt:20,miss:1});if(windup===0)g._beginMonsterAttack(a,t,lane);else g._attack(a,t,lane);assert.equal(a.status.iceExplosionCharges,2);near(t.hp,1000);}
});
test('barrage can proc on each arrow but each attack initiation consumes at most one charge',()=>{
  const {g,a,t,make,lane}=fixture(['A0IK','A0IL']);const targets=[t,...Array.from({length:8},()=>make())];a.status.iceExplosionCharges=3;g._attack(a,t,lane);assert.equal(a.status.iceExplosionCharges,2);
  assert.equal(targets.filter(t=>t.hp<1000).length,7);for(const target of targets.slice(0,7))near(target.hp,865);assert.equal(targets[7].hp,1000);
});
test('save restoration preserves granted barrage, counter, marked target and pending attack',()=>{
  const {g,a,t,lane}=fixture(['A0IK','A0IL']);a.status.iceExplosionCharges=3;t.status.iceExplosionMarked=true;g._beginMonsterAttack(a,t,lane);
  const r=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))),ra=r.state.entities.find(e=>e.id===a.id),rt=r.state.entities.find(e=>e.id===t.id);
  assert.equal(ra.status.iceExplosionCharges,2);assert.equal(has(ra,'A0IL'),true);assert.equal(rt.status.iceExplosionMarked,true);assert.ok(ra.pendingAttack);assert.equal(ra.pendingAttack.targetId,rt.id);
});

test('ice uses the source Spells attack row, while fire uses Melee/normal; both retain their distinct damage types',()=>{
  const ice=fixture(['A0IK']);ice.t.armorType='fortified';ice.t.sourceArmorTypeRaw='fort';ice.hit();near(ice.t.hp,624);
  const fire=fixture(['A0HX']);fire.t.armorType='fortified';fire.t.sourceArmorTypeRaw='fort';fire.hit();near(fire.t.hp,439);
  const resisted=fixture(['A0IK'],['A19A']);resisted.hit();near(resisted.t.hp,924);
  const immune=fixture(['A0HX'],['Amim']);immune.hit();near(immune.t.hp,999);
});
