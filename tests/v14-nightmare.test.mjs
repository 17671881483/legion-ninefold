import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {V14_ABILITIES} from '../dist/v14-reference.js';
import {compileSkills,initializeSourceClassCombat,initializeSourceSkills,beforeSourceDamage,tickSourceScriptJobs,sourceWeapon} from '../dist/skills.js';
import {initializeNightmareDeployment,nightmareMainDeath,nightmareDamagePrefix,tickNightmareJob} from '../dist/nightmare-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const souls=e=>e.status.sourceKillnum??0;
const jobs=g=>g.state.sourceSkillJobs.filter(j=>j.type==='nightmare_souls');
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function specs(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});}
function fixture(){
  const g=new Game({mode:'sandbox',seed:28});g.state.entities=[];g.state.phase='combat';g.state.roundMode='normal';g.state.time=10;g._random=()=>.99;
  const p=laneToWorld(0,3,6);
  const make=({code='h002',ids=[],side='monster',x=0,hp=2000,maxHp=hp,...extra}={})=>{
    const e=g._entity(UNIT_TEMPLATES[code],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+x,worldY:p.y,...extra});
    specs(e,ids);e.buffs=[];e.ability=null;e.hp=hp;e.maxHp=maxHp;e.damage=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.hpRegen=e.manaRegen=0;e.mana=0;e.maxMana=30;e.attackCd=e.abilityCd=1000;g.state.entities.push(e);return e;
  };
  const e=make({code:'h03L',ids:['A0XM'],side:'defender'}),a=make({x:.5});
  const hit=(n,options={spell:true,universal:true})=>g._hurt(e,n,a,options);
  const kill=(victim=a,killer=e)=>g._hurt(victim,victim.hp,killer,{spell:true,universal:true});
  const advance=t=>{g.state.time=t;tickSourceScriptJobs(g);};
  const deploy=()=>initializeSourceClassCombat(g,undefined,e);
  return {g,e,a,make,hit,kill,advance,deploy};
}
test('line evidence matches original bytes and proves timer/death/damage registrations and appearance mappings',()=>{
  const proof=JSON.parse(readFileSync(new URL('../reference/nightmare-evidence.json',import.meta.url))),bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=bytes.toString('latin1').split('\n');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),proof.source.sha256);
  for(const row of proof.sourceEvidence)assert.equal(lines[row.line-1].trim(),row.text);
  for(const [building,body] of [['h020','h03L'],['n06T','h0SX']])assert.equal(UNITS.find(u=>u.sourceRawcode===building&&!u.legacy).combatRawcode,body);
  assert.equal(lines.filter(l=>l.includes('function h03L_Timer')).length,2,'definition plus sole normal-deployment registration');
  assert.equal(lines.filter(l=>l.includes('StringHash("timenum")')).length,1,'timenum is written but never tested as a cap');
});
test('script and dynamic marker remain partial without inventing missing native mana or aura fields',()=>{
  const [s,c]=compileSkills({abilityIds:['A0XM','A0XN'],skillVersion:'v14.1A5'});assert.equal(s.status,'partial');assert.equal(c.status,'partial');assert.equal(c.kind,'nightmare_source');
  assert.match(s.effectText,/1—101/);assert.match(c.effectText,/DataA\/DataB/);assert.equal(V14_ABILITIES.A0XN.resolved_fields.DataA1,undefined);
  assert.equal(UNIT_TEMPLATES.h03L.sourceRawFields.manaN,undefined);assert.equal(UNIT_TEMPLATES.h0SX.sourceRawFields.manaN,undefined);
});
test('ordinary engine deployment registers once; arbitrary creation, arena and zero ability level do not',()=>{
  const {g,e,deploy}=fixture();initializeSourceSkills(g,e);assert.equal(jobs(g).length,0);deploy();deploy();assert.equal(jobs(g).length,1);assert.equal(jobs(g)[0].nextAt,15);
  for(const mode of ['arena-flag','arena-phase','no-ability','zero-level']){const f=fixture();if(mode==='arena-flag')f.e.isArena=true;if(mode==='arena-phase')f.g.state.roundMode='arena';if(mode==='no-ability')specs(f.e,[]);if(mode==='zero-level')f.e.abilityLevels={A0XM:0};assert.equal(initializeNightmareDeployment(f.g,f.e),false,mode);}
});
test('five-second timer heals before maximum HP change and changes attack, mana and dynamic level',()=>{
  const {g,e,deploy,advance}=fixture();e.hp=1800;deploy();advance(14.999);assert.equal(souls(e),0);advance(15);assert.equal(souls(e),1);assert.equal(e.status.nightmareTimenum,1);assert.equal(e.hp,1900);assert.equal(e.maxHp,2100);assert.equal(e.damage,110);assert.equal(e.mana,1);assert.equal(e.abilityLevels.A0XN,1);assert.equal(has(e,'A0XN'),true);
  const f=fixture();f.deploy();f.advance(15);assert.equal(f.e.hp,2000,'host clamp uses the old maximum before +100');assert.equal(f.e.maxHp,2100);assert.equal(jobs(g)[0].nextAt,20);
});
test('timer uses reserve alone, keeps ticking at fifteen and resumes after consuming six',()=>{
  const {g,e,deploy,advance,hit}=fixture();e.mana=30;deploy();advance(85);assert.equal(souls(e),15);assert.equal(e.mana,30);assert.equal(e.status.nightmareTimenum,15);const hp=e.maxHp,attack=e.damage;advance(100);assert.equal(souls(e),15);assert.equal(e.maxHp,hp);assert.equal(e.damage,attack);assert.equal(jobs(g).length,1);
  e.hp=100;assert.equal(hit(100),0);assert.equal(souls(e),9);advance(130);assert.equal(souls(e),15);assert.equal(e.status.nightmareTimenum,21);assert.equal(e.maxHp,hp);assert.equal(e.damage,attack,'total lifetime gains may exceed 15, current bonuses track reserve');
});
test('timer callback tests life at callback time, stops below one, and does not recheck the ability',()=>{
  for(const hp of [0,.999,1]){const f=fixture();f.e.hp=hp;f.deploy();f.advance(15);assert.equal(souls(f.e),hp>=1?1:0);assert.equal(jobs(f.g).length,hp>=1?1:0);}
  const f=fixture();f.deploy();specs(f.e,[]);f.advance(15);assert.equal(souls(f.e),1);assert.equal(has(f.e,'A0XN'),true);
  const x=fixture();x.deploy();x.e.hp=0;x.advance(14);x.e.hp=100;x.advance(15);assert.equal(souls(x.e),1,'a death before the first callback does not eagerly destroy the timer');
});
test('removed handles and cleared corpses cannot keep gaining souls or leave repeating jobs',()=>{
  const f=fixture();f.deploy();f.g.state.entities=f.g.state.entities.filter(e=>e.id!==f.e.id);f.advance(50);assert.equal(souls(f.e),0);assert.equal(jobs(f.g).length,0);
  const x=fixture();x.deploy();x.g._killUnit(x.e);x.g._clearDead();x.advance(15);assert.equal(souls(x.e),0);assert.equal(jobs(x.g).length,0);
});
test('kill growth maps the inclusive 1..101 real boundary, not a nominal 20 percent',()=>{
  for(const [roll,want] of [[0,1],[.19,1],[.190001,0],[.199,0],[.99,0]]){const f=fixture();let draws=0;f.g._random=()=>{draws++;return roll;};f.kill();assert.equal(souls(f.e),want,String(roll));assert.equal(draws,2,'one existing alchemy draw, then exactly one soul draw');assert.equal(f.e.status.nightmareTimenum,undefined);}
});
test('kill gates short circuit before drawing: ability, reserve and mana remain distinct',()=>{
  for(const mode of ['absent','zero-level','reserve15','mana15','mana16']){const f=fixture();if(mode==='absent')specs(f.e,[]);if(mode==='zero-level')f.e.abilityLevels={A0XM:0};if(mode==='reserve15')f.e.status.sourceKillnum=15;if(mode==='mana15')f.e.mana=15;if(mode==='mana16')f.e.mana=16;let draws=0;f.g._random=()=>{draws++;return 0;};f.kill();assert.equal(souls(f.e),mode==='reserve15'?15:0,mode);assert.equal(draws,1,mode);}
  const f=fixture();let draws=0;f.g._random=()=>{draws++;return 0;};f.e.mana=14.999;f.e.status.sourceKillnum=14;f.kill();assert.equal(souls(f.e),15);assert.equal(f.e.mana,15.999);assert.equal(draws,2);
});
test('kill branch accepts spell and friendly kills and does not resurrect a dead killer',()=>{
  for(const side of ['monster','defender']){const f=fixture();f.a.side=side;f.g._random=()=>0;f.kill();assert.equal(souls(f.e),1);}
  const f=fixture();f.e.hp=0;f.g._random=()=>0;f.kill();assert.equal(souls(f.e),1);assert.equal(f.e.hp,0);assert.equal(f.e.maxHp,2100);
});
test('main death disabled depth, Ju exclusion and killerless KillUnit prevent all soul sampling',()=>{
  for(const mode of ['reentry','Ju','no-killer']){const f=fixture();if(mode==='reentry')f.g._sourceUnitDeathTriggerDepth=1;if(mode==='Ju')f.a.status.sourceJuMember=true;let draws=0;f.g._random=()=>{draws++;return 0;};if(mode==='no-killer')f.g._killUnit(f.a);else f.kill();assert.equal(souls(f.e),0,mode);assert.equal(draws,mode==='no-killer'?1:0,mode);}
});
test('soul gain runs once before fire; nested fire kills cannot reenter its main death chain',()=>{
  const f=fixture();specs(f.e,['A0XM','A0HW']);f.e.status.sourceKillnum=14;const other=f.make({hp:10,maxHp:1000,x:.7});f.g._random=()=>0;f.kill();assert.ok(other.hp<=0);assert.equal(souls(f.e),15);assert.equal(f.g.state.events.filter(e=>e.skillId==='A0XM').length,1);assert.equal(f.g.state.events.filter(e=>e.skillId==='A0HW').length,1);
});
test('ten souls create the precise appearance once with source ownership and no expiry or inherited timer',()=>{
  for(const [body,spawn] of [['h03L','h03K'],['h0SX','h0SU']]){const f=fixture();f.e.combatRawcode=body;f.e.userData=7;f.deploy();f.advance(60);const n=f.g.state.entities.filter(e=>e.combatRawcode===spawn);assert.equal(n.length,1);assert.equal(n[0].isSummon,true);assert.equal(n[0].userData,7);assert.equal(n[0].ownerId,0);assert.equal(n[0].side,f.e.side);assert.equal(n[0].battleTeam,f.e.battleTeam);assert.equal(n[0].worldX,f.e.worldX);assert.equal(n[0].worldY,f.e.worldY);assert.equal(n[0].facing,270);assert.equal(n[0].expiresAt,undefined);assert.equal(n[0].reward,0);assert.equal(n[0].damage,30);assert.equal(n[0].maxHp,1050);assert.equal(has(n[0],'A012'),true);assert.equal(n[0].status.nightmareTimerRegistered,undefined);assert.equal(f.e.status.nightmareOne,true);
    f.e.hp=100;f.hit(100);f.advance(90);assert.equal(souls(f.e),10);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode===spawn).length,1);}
});
test('summon requires exactly ten and only the two coded rawcodes; null-create path still latches one',()=>{
  const f=fixture();f.e.combatRawcode='h020';f.e.status.sourceKillnum=9;f.deploy();f.advance(15);assert.equal(souls(f.e),10);assert.equal(f.e.status.nightmareOne,true);assert.equal(f.g.state.entities.length,2);
  const x=fixture();x.e.status.sourceKillnum=10;x.deploy();x.advance(15);assert.equal(souls(x.e),11);assert.equal(x.e.status.nightmareOne,undefined);assert.equal(x.g.state.entities.length,2);
});
test('lethal equality consumes six, overrides only the event damage and does not require six mana',()=>{
  const f=fixture();f.deploy();f.advance(40);assert.equal(souls(f.e),6);f.e.hp=100;f.e.mana=2;const prior=f.g.state.players[4].stats.damage;
  assert.equal(f.hit(100),0);assert.equal(f.e.hp,1100);assert.equal(f.e.maxHp,2000);assert.equal(f.e.damage,100);assert.equal(f.e.mana,0);assert.equal(souls(f.e),0);assert.equal(has(f.e,'A0XN'),false);assert.equal(f.e.abilityLevels.A0XN,undefined);assert.equal(f.e.status.deathCounted,undefined);assert.equal(f.g.state.players[4].stats.damage,prior);
});
test('reserve five, below-lethal hits and zero-level A0XM fall through rather than blocking duel',()=>{
  for(const mode of ['five','nonlethal','zero-level','absent']){const f=fixture();specs(f.e,mode==='absent'?['A0ID']:['A0XM','A0ID']);f.e.status.sourceKillnum=mode==='five'?5:6;if(mode==='zero-level')f.e.abilityLevels={A0XM:0};f.e.hp=100;const amount=mode==='nonlethal'?99:100;f.hit(amount);assert.equal(f.e.status.huskarDuelTag,f.a.id,mode);assert.equal(f.e.status.huskarDuelDeferred,undefined,mode);assert.equal(souls(f.e),mode==='five'?5:6);assert.equal(f.e.hp,100-amount);}
});
test('valid A0XM suppresses duel; prior fire, ice and ice-marker branches suppress A0XM',()=>{
  const f=fixture();specs(f.e,['A0XM','A0ID']);f.e.status.sourceKillnum=6;f.e.hp=100;assert.equal(f.hit(100),0);assert.equal(f.e.status.huskarDuelTag,undefined);assert.equal(f.e.status.huskarDuelDeferred,undefined);
  for(const id of ['A0HX','A0IK','ice-marker']){const x=fixture();specs(x.a,[id==='ice-marker'?'A0IK':id]);specs(x.e,['A0XM','A0ID']);x.e.status.sourceKillnum=6;x.g._random=()=>id==='ice-marker'?.99:0;if(id==='ice-marker')x.e.buffs.push({key:'B04X',expiresAt:20});x.e.hp=100;x.hit(100);assert.equal(souls(x.e),6,id);assert.equal(x.e.status.huskarDuelTag,undefined,id);assert.ok(x.e.hp<=0,id);}
});
test('zeroed event damage preserves local P8 for later unyielding and does not subtract that local value',()=>{
  const f=fixture();specs(f.e,['A0XM','A0IE']);f.e.status.sourceKillnum=6;f.e.hp=100;assert.equal(f.hit(3000),0);assert.equal(souls(f.e),0);assert.equal(f.e.status.huskarUnyielding,true);assert.equal(has(f.e,'A0IE'),false);assert.equal(has(f.e,'A0IF'),true);assert.equal(f.e.hp,1400,'HP first heals to 1100, max falls to 1400, then local 3000 triggers unyielding');
});
test('repeated lethal hits consume the current reserve and cannot reuse already spent souls',()=>{
  const f=fixture();f.e.status.sourceKillnum=12;f.e.hp=100;assert.equal(f.hit(100),0);assert.equal(souls(f.e),6);assert.equal(f.hit(f.e.hp),0);assert.equal(souls(f.e),0);assert.equal(f.hit(f.e.hp),f.e.maxHp);assert.equal(f.e.hp,0);
});
test('self, friendly, absent, zero, A2Y7 and nested main damage never consume a soul reserve',()=>{
  for(const mode of ['self','ally','null','zero','A2Y7','reentry']){const f=fixture();f.e.status.sourceKillnum=6;f.e.hp=100;if(mode==='ally')f.a.side=f.e.side;if(mode==='A2Y7')specs(f.a,['A2Y7']);if(mode==='reentry')f.g._sourceDamageTriggerDepth=1;f.g._hurt(f.e,mode==='zero'?0:100,mode==='self'?f.e:mode==='null'?null:f.a,{spell:true,universal:true});assert.equal(souls(f.e),6,mode);}
});
test('full life is healed before max-life subtraction; invalid max-life requests retain old maximum',()=>{
  const f=fixture();f.e.status.sourceKillnum=6;f.e.hp=1900;assert.equal(f.hit(1900),0);assert.equal(f.e.hp,1400);assert.equal(f.e.maxHp,1400);
  const x=fixture();x.e.maxHp=500;x.e.hp=100;x.e.status.sourceKillnum=6;assert.equal(x.hit(100),0);assert.equal(x.e.hp,500);assert.equal(x.e.maxHp,500,'YDWE rejects requested max life <=0');
  const y=fixture();y.e.maxHp=65500;y.e.hp=100;y.deploy();y.advance(15);assert.equal(y.e.maxHp,65500,'YDWE rejects requested max life >65535');assert.equal(y.e.hp,200);assert.equal(y.e.damage,110);assert.equal(souls(y.e),1);
});
test('explicitly parsed zero mana capacity does not become a fabricated fifteen-mana pool',()=>{
  const f=fixture();f.e.maxMana=f.e.mana=0;f.deploy();f.advance(40);assert.equal(souls(f.e),6);assert.equal(f.e.mana,0);f.e.hp=100;assert.equal(f.hit(100),0);assert.equal(souls(f.e),0);assert.equal(f.e.maxMana,0);
});
test('both standalone branch functions return whether their full condition actually selected a branch',()=>{
  const f=fixture();assert.equal(nightmareMainDeath(f.g,null,{}),false);assert.equal(nightmareDamagePrefix(f.g,f.e,f.a,100,{}),false);f.e.status.sourceKillnum=6;f.e.hp=101;assert.equal(nightmareDamagePrefix(f.g,f.e,f.a,100,{}),false);
  const changes=[];const api={addAbility:()=>changes.push('add'),removeAbility:()=>changes.push('remove')};f.e.hp=100;assert.equal(nightmareDamagePrefix(f.g,f.e,f.a,100,api),true);assert.deepEqual(changes,['remove']);f.g._random=()=>.2;assert.equal(nightmareMainDeath(f.g,f.e,api),false);f.g._random=()=>.19;assert.equal(nightmareMainDeath(f.g,f.e,api),true);
});
test('JSON restore resumes timer deadlines, counters, attributes and single-summon latch without aliasing',()=>{
  const f=fixture();f.deploy();f.advance(58);assert.equal(souls(f.e),9);const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),e=r.state.entities.find(e=>e.id===f.e.id);assert.equal(jobs(r)[0].nextAt,60);r.state.time=60;tickSourceScriptJobs(r);assert.equal(souls(e),10);assert.equal(e.status.nightmareTimenum,10);assert.equal(e.maxHp,3000);assert.equal(e.damage,200);assert.equal(souls(f.e),9);assert.equal(r.state.entities.filter(e=>e.combatRawcode==='h03K').length,1);
  const again=Game.fromSnapshot(JSON.parse(JSON.stringify(r.snapshot())));again.state.time=85;tickSourceScriptJobs(again);assert.equal(souls(again.state.entities.find(unit=>unit.id===e.id)),15);assert.equal(again.state.entities.filter(e=>e.combatRawcode==='h03K').length,1);
});
test('normal engine wave deployment rebuilds counters and jobs without changing persistent buildings; arena has no timer',()=>{
  const g=new Game({mode:'sandbox',seed:28});for(const p of g.state.players)p.buildings=[];const b={id:'nightmare-building',unitId:'v14_h020',col:2,row:2};g.state.players[0].buildings=[b];g._startCombat();const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h03L');assert.equal(jobs(g).length,1);g.state.time+=50;tickSourceScriptJobs(g);assert.equal(souls(e),10);g.state.phase='build';g._startCombat();const fresh=g.state.entities.find(e=>e.buildingId===b.id);assert.notEqual(fresh,e);assert.equal(souls(fresh),0);assert.equal(fresh.status.nightmareOne,undefined);assert.equal(fresh.maxHp,2500);assert.equal(fresh.damage,72);assert.equal(jobs(g).length,1);assert.equal(b.sourceKillnum,undefined);assert.equal(b.nightmareOne,undefined);
  g._startArena();const arena=g.state.entities.find(e=>e.buildingId===b.id);assert.ok(arena);assert.equal(arena.status.nightmareTimerRegistered,undefined);assert.equal(jobs(g).length,0);
});
test('continuous waves preserve survivor timer and reserve; sandbox reset clears both',()=>{
  const f=fixture();f.deploy();f.advance(20);f.g.state.mode='normal';f.g.state.wave=31;const job=jobs(f.g)[0];f.g._advanceContinuous();assert.equal(souls(f.e),2);assert.equal(jobs(f.g)[0],job);f.g.state.time=25;tickSourceScriptJobs(f.g);assert.equal(souls(f.e),3);f.g.state.mode='sandbox';f.g.command('sandboxReset');assert.equal(jobs(f.g).length,0);assert.equal(f.g.state.entities.length,0);
});
test('pause and speed use simulation time, and a large timer catch-up equals incremental ticks',()=>{
  const f=fixture();f.deploy();f.g.state.paused=true;f.g.tick(6);assert.equal(f.g.state.time,10);assert.equal(souls(f.e),0);f.g.state.paused=false;f.g.state.speed=2;f.g.tick(2.5);near(f.g.state.time,15);assert.equal(souls(f.e),1);
  const a=fixture(),b=fixture();a.deploy();b.deploy();a.advance(85);for(let t=15;t<=85;t+=5)b.advance(t);for(const key of ['hp','maxHp','damage','mana'])assert.equal(a.e[key],b.e[key],key);assert.deepEqual(a.e.status,b.e.status);
});
test('beforeSourceDamage returns the actual event override while missed conditions preserve incoming amount',()=>{
  const f=fixture();f.e.hp=100;f.e.status.sourceKillnum=5;assert.equal(beforeSourceDamage(f.g,f.e,100,f.a),100);assert.equal(souls(f.e),5);f.e.status.sourceKillnum=6;assert.equal(beforeSourceDamage(f.g,f.e,100,f.a),0);assert.equal(souls(f.e),0);assert.equal(f.e.hp,1100);
});

test('coarse timer catch-up preserves scheduled summon birth, event times and creation skill registration deadlines',()=>{
  const a=fixture(),b=fixture();a.deploy();b.deploy();a.advance(85);for(let t=11;t<=85;t++)b.advance(t);
  const summon=g=>g.state.entities.find(e=>e.combatRawcode==='h03K'),x=summon(a.g),y=summon(b.g);
  assert.equal(x.createdAt,60);assert.equal(y.createdAt,60);assert.deepEqual(x.skillStates,y.skillStates);assert.equal(a.g.state.time,85);assert.equal(b.g.state.time,85);
  const events=g=>g.state.events.filter(e=>e.skillId==='A0XM').map(e=>({time:e.time,type:e.type,souls:e.souls}));assert.deepEqual(events(a.g),events(b.g));assert.equal(events(a.g).find(e=>e.type==='summon').time,60);
});
test('scheduled timer callback restores frame time even when a creation callback throws',()=>{
  const f=fixture();f.e.status.sourceKillnum=9;f.g.state.time=25;
  const api={addAbility:()=>{},spawnUnit:()=>{assert.equal(f.g.state.time,15);throw new Error('creation callback');}};
  assert.throws(()=>tickNightmareJob(f.g,{sourceId:f.e.id,nextAt:15},api),/creation callback/);assert.equal(f.g.state.time,25);
});

test('AIat soul bonus reaches both selected weapons exactly once through gain, consumption and JSON restore',()=>{
  const f=fixture();f.e.sourcePassiveStatBonuses={existing:{flatDamage:5}};f.e.damage+=5;
  f.e.weapon1={weapsOn:3,weapTp1:'normal',targs1:'ground,enemies',dmgplus1:99,dice1:1,sides1:1,atkType1:'normal'};
  f.e.weapon2={weapsOn:3,weapTp2:'missile',targs2:'air,enemies',dmgplus2:20,dice2:1,sides2:1,atkType2:'normal'};
  const air=f.make({x:.4,hp:5000});air.targetType='air';f.a.targetType='ground';f.a.hp=f.a.maxHp=5000;
  const damages=(g,e)=>[sourceWeapon(e,g.state.entities.find(unit=>unit.id===f.a.id),g.state.time).damage,sourceWeapon(e,g.state.entities.find(unit=>unit.id===air.id),g.state.time).damage];
  assert.deepEqual(damages(f.g,f.e),[105,26]);f.deploy();f.advance(40);assert.equal(f.e.sourceNightmareStatBonuses.flatDamage,60);assert.deepEqual(damages(f.g,f.e),[165,86]);
  f.g._attack(f.e,f.a,f.g.state.entities);f.g._attack(f.e,air,f.g.state.entities);assert.equal(f.a.hp,4835);assert.equal(air.hp,4914);
  const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),e=r.state.entities.find(unit=>unit.id===f.e.id),attacker=r.state.entities.find(unit=>unit.id===f.a.id);assert.equal(e.sourceNightmareStatBonuses.flatDamage,60);assert.deepEqual(damages(r,e),[165,86]);
  e.hp=100;assert.equal(r._hurt(e,100,attacker,{spell:true,universal:true}),0);assert.equal(e.sourceNightmareStatBonuses.flatDamage,0);assert.deepEqual(damages(r,e),[105,26]);
  const again=Game.fromSnapshot(JSON.parse(JSON.stringify(r.snapshot()))),re=again.state.entities.find(unit=>unit.id===e.id);assert.deepEqual(damages(again,re),[105,26]);assert.equal(f.e.sourceNightmareStatBonuses.flatDamage,60,'restored journal is not an alias to the original live object');
});
