import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {V14_ABILITIES} from '../dist/v14-reference.js';
import {GARROSH_ACTIVE_RULES,GARROSH_PASSIVE_RULES,castGarroshAbility,tryGarroshAutoCast,garroshActiveAfterDamage,sourceGarroshActiveDeath,tickGarroshActiveJob} from '../dist/garrosh-active-rules.js';
import {castIllidanAbility} from '../dist/illidan-rules.js';

const jass=(await readFile(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url))).toString('latin1');
const sourceFunction=name=>{const match=jass.match(new RegExp(`function ${name}\\b[\\s\\S]*?endfunction`));assert.ok(match,name);return match[0];};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(ids=['A1A1','A1A2','A1A3','A1A4']){
  let serial=0;
  const g={state:{time:0,entities:[],kings:[],players:[{id:0,buildings:[]},{id:1,buildings:[]}],sourceSkillJobs:[]},hits:[],moves:[],pauses:[],charges:[],pathing:[],events:[],randomValues:[],draws:0,
    _random(){this.draws++;return this.randomValues.shift()??0;},_event(type,e,text){this.events.push({type,id:e.id,text});},terrainBlocked:()=>false,
    add(skills=[],extra={}){const e={id:`unit-${++serial}`,ownerId:0,team:0,side:'defender',battleTeam:0,worldX:0,worldY:0,hp:100000,maxHp:100000,mana:100,damage:160,distanceScale:1/3,skillVersion:'v14.1A5',sourceVersion:'v14.1A5',skillSpecs:skills.map(id=>({id,status:'implemented'})),skillStates:{},status:{},...extra};this.state.entities.push(e);return e;},
    tick(time){this.state.time=time;const pending=this.state.sourceSkillJobs,remaining=[];for(const job of pending)if(tickGarroshActiveJob(this,job,api))remaining.push(job);this.state.sourceSkillJobs=remaining;},
    kill(victim,killer){victim.hp=0;return sourceGarroshActiveDeath(this,victim,killer,api);},
  };
  const applyDamage=(game,target,amount,source,kind,types)=>{
    if(target.hp<=.405||target.invulnerable)return 0;
    const actual=kind==='native'&&target.magicImmune?0:amount;
    game.hits.push({targetId:target.id,sourceId:source.id,amount,actual,kind,...types});target.hp-=actual;
    if(target.hp<=.405)sourceGarroshActiveDeath(game,target,source,api);
    return actual;
  };
  const api={
    universalDamage:(game,target,amount,source)=>applyDamage(game,target,amount,source,'universal'),
    nativeDamage:(game,target,amount,source,types)=>applyDamage(game,target,amount,source,'native',types),
    setUnitPosition(game,e,point){game.moves.push({id:e.id,x:point.x,y:point.y});e.worldX=point.x;e.worldY=point.y;},
    isTerrainBlocked:(game,point)=>game.terrainBlocked(point),
    pauseUnit(game,e,paused){game.pauses.push({id:e.id,paused});e.status.sourcePaused=paused;},
    setPathing(game,e,enabled){game.pathing.push({id:e.id,enabled});},
    applyAttackLevel(game,e,next,previous){game.charges.push({id:e.id,next,previous});e.damage+=next-previous;},
    scriptInvulnerable:e=>e.invulnerable||e.skillSpecs.some(s=>s.id==='Avul'),
  };
  const caster=g.add(ids,{buildingId:'persistent-garrosh'}),building={id:caster.buildingId,garroshAttackLevel:0};g.state.players[0].buildings.push(building);
  const enemy=(x=.3,extra={})=>g.add([],{ownerId:1,team:1,side:'monster',worldX:x,...extra});
  return {g,api,caster,building,enemy,cast:(id,params={})=>castGarroshAbility(g,caster,id,params,api)};
}

test('all four mechanics use exact script entries and native object values, not tooltip charges/attack triggers',()=>{
  for(const id of ['A1A2','A1A3']){const r=GARROSH_ACTIVE_RULES[id],f=V14_ABILITIES[id].resolved_fields;assert.equal(r.manaCost,Number(f.Cost1));assert.equal(r.cooldown,Number(f.Cool1));assert.equal(r.range,Number(f.Rng1));assert.equal(r.cooldownPolicy,'shared_native');assert.equal(r.status,'partial');assert.ok(r.partial);}
  assert.ok(jass.includes('integer Qk=$4131395A'));
  for(let level=1;level<=100;level++)assert.equal(Number(V14_ABILITIES.A19Z.resolved_fields[`DataA${level}`]),level);
  const lethal=sourceFunction('GarroshLethalStrikeAction');assert.match(lethal,/if GetKillingUnit\(\)==Bc then/);assert.match(lethal,/GetUnitAbilityLevel\(Bc,Qk\)<100/);assert.ok(!lethal.includes('IsUnitEnemy'));
  assert.match(lethal,/UnitRemoveAbility\(Pf,Qk\)[\s\S]*?600,5000,ATTACK_TYPE_MELEE,DAMAGE_TYPE_MAGIC/);
  const clan=sourceFunction('GarroshClanGlory');assert.match(clan,/EVENT_UNIT_DAMAGED/);assert.ok(!clan.includes('EVENT_UNIT_ATTACKED'));
  assert.match(sourceFunction('GarroshClanGloryAction'),/GetRandomPercentageBJ\(\)<=5/);
  assert.ok(!sourceFunction('GarroshClanGloryAction').includes('DisableTrigger'),'the independent clan trigger has no reentry suppression');
  const allAbility=sourceFunction('Trig_allabilityActions');
  assert.match(allAbility,/local trigger Eb=GetTriggeringTrigger\(\)/);assert.match(allAbility,/call DisableTrigger\(Eb\)/);assert.match(allAbility,/call EnableTrigger\(Eb\)/);
  assert.match(sourceFunction('ChargeDistanceCondition'),/if QN\+QT>=QS then[\s\S]*?else\s+call SaveReal/);
  assert.match(sourceFunction('GarroshMeatballThrowingAction'),/PauseUnit\(a3,false\)[\s\S]*?GetUnitX\(Om\),GetUnitY\(Om\),300,75,ATTACK_TYPE_MELEE,DAMAGE_TYPE_MAGIC/);
  assert.equal(GARROSH_PASSIVE_RULES.A1A1.burstDamage,5000);
});

test('lethal strike charges one native attack level per kill, including allied kills, and bursts only on kill 101',()=>{
  const f=fixture(['A1A1']),base=f.caster.damage;
  for(let index=1;index<=100;index++){
    const victim=f.g.add([],{team:index%2,worldX:100});const result=f.g.kill(victim,f.caster);
    assert.deepEqual(result,{level:index,burst:false});f.g.state.entities=f.g.state.entities.filter(e=>e.id!==victim.id);
  }
  assert.equal(f.building.garroshAttackLevel,100);assert.equal(f.caster.damage,base+100);assert.equal(f.g.hits.length,0);
  const victim=f.enemy(10);assert.deepEqual(f.g.kill(victim,f.caster),{level:0,burst:true});
  assert.equal(f.building.garroshAttackLevel,0);assert.equal(f.caster.damage,base);
  assert.equal(sourceGarroshActiveDeath(f.g,victim,f.caster,f.api),null,'duplicate host callbacks cannot charge twice');
});

test('lethal strike clears charges before its magical AoE, and burst kills immediately rebuild them',()=>{
  const f=fixture(['A1A1']);f.caster.status.garroshAttackLevel=f.building.garroshAttackLevel=100;f.caster.damage+=100;
  f.enemy(.5,{hp:4000});f.enemy(1,{hp:4000});const immune=f.enemy(.4,{magicImmune:true});
  const trigger=f.enemy(10);assert.deepEqual(f.g.kill(trigger,f.caster),{level:2,burst:true});
  assert.deepEqual(f.g.charges.map(c=>[c.previous,c.next]),[[100,0],[0,1],[1,2]]);
  assert.equal(f.caster.damage,162);assert.equal(f.building.garroshAttackLevel,2);assert.equal(immune.hp,100000);
  assert.ok(f.g.hits.every(hit=>hit.amount===5000&&hit.kind==='native'&&hit.attackType==='normal'&&hit.damageType==='magic'));
});

test('body death stops its lethal listener while a fresh deployment can restore the building attack level',()=>{
  const f=fixture(['A1A1']);f.g.kill(f.enemy(10),f.caster);assert.equal(f.building.garroshAttackLevel,1);
  f.g.kill(f.caster,f.enemy(10));f.caster.hp=100;f.g.kill(f.enemy(10),f.caster);assert.equal(f.building.garroshAttackLevel,1);
  const replacement=f.g.add(['A1A1'],{buildingId:f.building.id,damage:161,status:{garroshAttackLevel:1}});
  f.g.kill(f.enemy(10),replacement);assert.equal(f.building.garroshAttackLevel,2);assert.equal(replacement.damage,162);
  const own=fixture(['A1A1']);own.g.kill(own.caster,own.caster);assert.equal(own.building.garroshAttackLevel,1);assert.ok(!own.caster.status.garroshLethalStopped,'the source checks killer before its own death branch');
});

test('three axes have independent per-leg hit sets, exact truncated charge endpoints and universal damage',()=>{
  const f=fixture(['A1A2']),target=f.enemy(.3,{magicImmune:true}),outside=f.enemy(2.801);
  assert.equal(f.cast('A1A2',{point:{x:2,y:0}}).ok,true);near(f.caster.mana,85);
  f.g.tick(0);assert.equal(f.g.hits.filter(h=>h.targetId===target.id).length,3);assert.equal(f.g.hits.filter(h=>h.targetId===outside.id).length,0);
  const job=f.g.state.sourceSkillJobs[0];f.g.tick(.35);assert.ok(job.axes.every(a=>a.phase==='out'&&a.traveled===540));near(job.axes[0].dummy.x,1.8);
  f.g.tick(.8);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(f.g.hits.filter(h=>h.targetId===target.id).length,6);
  assert.ok(f.g.hits.every(h=>h.kind==='universal'&&h.amount===215));assert.ok(f.g.moves.length>0);
  near(job.axes[0].dummy.x,0);near(job.axes[0].dummy.y,0);near(outside.hp,100000);
});

test('an outbound blocked point is sticky and suppresses every return pull for that axe without suppressing damage',()=>{
  const f=fixture(['A1A2']);f.g.terrainBlocked=point=>point.x<.21;const target=f.enemy(.3);
  f.cast('A1A2',{point:{x:2,y:0}});f.g.tick(.35);const job=f.g.state.sourceSkillJobs[0];
  assert.ok(job.axes.every(a=>a.notPath));assert.ok(job.axes.every(a=>a.dummy.x>.21),'later walkable points do not reset not_path');
  f.g.tick(.8);assert.equal(f.g.moves.length,0);assert.equal(f.g.hits.filter(h=>h.targetId===target.id).length,6);
});

test('axe timers continue after caster death and corpse cleanup, without reactivating its stopped lethal listener',()=>{
  const f=fixture(['A1A1','A1A2']),target=f.enemy(.3,{hp:100});f.cast('A1A2',{point:{x:2,y:0}});
  f.g.kill(f.caster,f.enemy(20));f.g.state.entities=f.g.state.entities.filter(e=>e.id!==f.caster.id);
  f.g.tick(.8);assert.ok(target.hp<=0);assert.equal(f.building.garroshAttackLevel,0);assert.equal(f.g.state.sourceSkillJobs.length,0);
});

test('manual and automatic native orders share cooldown, and failed damaged-side priority never falls back',()=>{
  const f=fixture(['A1A2']),other=f.enemy(.5);other.skillSpecs=[{id:'A1A2'}];
  assert.equal(f.cast('A1A2',{point:{x:.5,y:0}}).ok,true);
  const result=tryGarroshAutoCast(f.g,f.caster,other,f.api);assert.equal(result.length,1);assert.equal(result[0].ok,false);assert.equal(result[0].casterId,f.caster.id);
  near(other.mana,100);assert.equal(other.skillStates.A1A2,undefined);near(f.caster.mana,85);
  f.g.state.time=13;assert.equal(tryGarroshAutoCast(f.g,f.caster,other,f.api)[0].ok,true);near(f.caster.mana,70);
  assert.equal(f.cast('A1A2',{point:{x:.5,y:0}}).ok,false);near(f.caster.mana,70);
});

test('auto meatball preselects an ally then selects again at spell effect; damaged-side no-ally suppresses fallback',()=>{
  const f=fixture(['A1A3']),target=f.enemy(.5),first=f.g.add([],{worldX:.1}),second=f.g.add([],{worldX:.2});
  f.g.randomValues=[0,.999];assert.equal(tryGarroshAutoCast(f.g,f.caster,target,f.api)[0].ok,true);
  const job=f.g.state.sourceSkillJobs.find(j=>j.type==='garrosh_active_throw');assert.equal(job.allyId,second.id);assert.notEqual(job.allyId,first.id);assert.equal(f.g.draws,2);
  const none=fixture(['A1A3']),attacker=none.enemy(.5);attacker.skillSpecs=[{id:'A1A3'}];none.enemy(.6);
  assert.deepEqual(tryGarroshAutoCast(none.g,none.caster,attacker,none.api),[]);near(attacker.mana,100);assert.equal(none.g.state.sourceSkillJobs.length,0);
});

test('manual meatball with no ally still pays native cost and cooldown, while invalid or distant targets do not',()=>{
  const f=fixture(['A1A3']),target=f.enemy(.5);
  assert.equal(f.cast('A1A3',{target}).ok,true);near(f.caster.mana,90);assert.equal(f.caster.skillStates.A1A3.readyAt,10);assert.equal(f.g.state.sourceSkillJobs.length,0);
  const invalid=fixture(['A1A3']);assert.equal(invalid.cast('A1A3',{}).ok,false);near(invalid.caster.mana,100);
  const far=invalid.enemy(3);assert.equal(invalid.cast('A1A3',{target:far}).ok,false);near(invalid.caster.mana,100);
});

test('another family spell-effect body suppresses Garrosh script effects after preserving native cost and cooldown',()=>{
  const f=fixture(['A1A2']),target=f.enemy(.5),illidan=f.g.add(['A1BE'],{combatRawcode:'h0SY',worldX:10});
  let nested,spawns=0;
  const result=castIllidanAbility(f.g,illidan,'A1BE',{}, {spawnUnit(){if(spawns++===0)nested=castGarroshAbility(f.g,f.caster,'A1A2',{point:{x:1,y:0}},{});return null;}});
  assert.equal(result.ok,true);assert.deepEqual(nested,{ok:true,skillId:'A1A2',scriptSuppressed:true});
  near(illidan.mana,95);near(f.caster.mana,85);assert.equal(f.caster.skillStates.A1A2.readyAt,13);assert.equal(f.caster.skillStates.A1A2.casts,1);
  assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(f.g._sourceAbilityEffectDepth,0);
  f.g.state.time=13;assert.equal(f.cast('A1A2',{point:{x:1,y:0}}).ok,true);
  f.g._sourceAbilityEffectDepth=1;f.g.tick(13);
  assert.ok(f.g.hits.some(hit=>hit.targetId===target.id),'independent timers are not spell-effect bodies');assert.equal(f.g._sourceAbilityEffectDepth,1);
});

test('Garrosh shares its active spell-effect depth with a nested foreign family and releases it after the body',()=>{
  const f=fixture(['A1A3']),target=f.enemy(.5);f.g.add([],{worldX:.1});
  const illidan=f.g.add(['A1BE'],{combatRawcode:'h0SY',worldX:10}),base=f.api.pauseUnit;
  let nested,spawns=0;
  f.api.pauseUnit=(game,e,paused)=>{base(game,e,paused);if(paused)nested=castIllidanAbility(game,illidan,'A1BE',{}, {spawnUnit(){spawns++;return null;}});};
  assert.equal(f.cast('A1A3',{target}).ok,true);assert.equal(nested.scriptSuppressed,true);assert.equal(nested.ok,true);
  near(illidan.mana,95);assert.equal(illidan.skillStates.A1BE.casts,1);assert.equal(spawns,0);assert.equal(f.g._sourceAbilityEffectDepth,0);
  assert.equal(f.g.state.sourceSkillJobs[0].type,'garrosh_active_throw');
});

test('a host bridge error releases the shared spell-effect depth in finally',()=>{
  const f=fixture(['A1A2','A1A3']),target=f.enemy(.5);f.g.add([],{worldX:.1});
  f.api.pauseUnit=()=>{throw new Error('test host bridge failure');};
  assert.throws(()=>f.cast('A1A3',{target}),/test host bridge failure/);assert.equal(f.g._sourceAbilityEffectDepth,0);
  near(f.caster.mana,90);assert.equal(f.caster.skillStates.A1A3.casts,1);
  assert.equal(f.cast('A1A2',{point:{x:1,y:0}}).ok,true);assert.equal(f.g.state.sourceSkillJobs[0].type,'garrosh_active_axe');assert.equal(f.g._sourceAbilityEffectDepth,0);
});

test('meatball jumps only 95% toward the original position but deals landing damage at its moving target current position',()=>{
  const f=fixture(['A1A3']),ally=f.g.add([],{worldX:.1,flyHeight:30}),target=f.enemy(1.5),nearMoved=f.enemy(3.2),oldPlace=f.enemy(1.5);
  f.cast('A1A3',{target});assert.equal(ally.status.sourcePaused,true);assert.deepEqual(f.g.pathing,[{id:ally.id,enabled:false}]);
  f.g.tick(.03);near(ally.worldX,.1);near(ally.status.garroshActiveFlyHeight,125);
  target.worldX=3;f.g.tick(.6);near(ally.worldX,.1+1.4*.95);assert.equal(ally.status.sourcePaused,false);assert.equal(ally.status.garroshActiveNoPathing,true);
  assert.equal(f.g.hits.filter(h=>h.targetId===nearMoved.id).length,1);assert.equal(f.g.hits.filter(h=>h.targetId===oldPlace.id).length,0);
  assert.ok(f.g.hits.every(h=>h.kind==='native'&&h.amount===75&&h.attackType==='normal'&&h.damageType==='magic'));
  f.g.tick(.63);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(ally.status.garroshActiveNoPathing,false);near(ally.status.garroshActiveFlyHeight,30);
  assert.deepEqual(f.g.pauses.map(p=>p.paused),[true,false]);assert.deepEqual(f.g.pathing.map(p=>p.enabled),[false,true]);
});

test('meatball ally enumeration includes a nearby king and respects an already higher jump priority',()=>{
  const f=fixture(['A1A3']),target=f.enemy(.5),king=f.g.add([],{isKing:true,isBuilding:true,worldX:.2,status:{garroshActiveJumpPriority:4}});
  f.g.state.entities=f.g.state.entities.filter(e=>e.id!==king.id);f.g.state.kings.push(king);
  assert.equal(f.cast('A1A3',{target}).ok,true);const job=f.g.state.sourceSkillJobs[0];assert.equal(job.allyId,king.id);assert.equal(job.movement,false);
  f.g.tick(.6);near(king.worldX,.2);assert.equal(king.status.sourcePaused,false);assert.equal(king.status.garroshActiveJumpPriority,4);assert.equal(f.g.pathing.length,0);
});

test('clan glory is a 5% independent received-damage proc, always spins and does not refresh its first timer',()=>{
  const f=fixture(['A1A4']),target=f.enemy(.9),immune=f.enemy(.8,{magicImmune:true}),outside=f.enemy(1.001);
  f.g.randomValues=[.05];assert.equal(garroshActiveAfterDamage(f.g,f.caster,0,f.api),true);
  assert.equal(target.hp,99925);assert.equal(immune.hp,100000);assert.equal(outside.hp,100000);assert.equal(f.caster.status.garroshSpin,true);
  assert.ok(f.g.hits.every(h=>h.kind==='native'&&h.amount===75));
  f.g.state.time=.39;f.g.randomValues=[.050001];assert.equal(garroshActiveAfterDamage(f.g,f.caster,1,f.api),false);assert.equal(f.g.state.sourceSkillJobs.length,1);near(f.g.state.sourceSkillJobs[0].at,.4);
  f.g.tick(.4);assert.equal(f.caster.status.garroshSpin,false);assert.equal(f.caster.status.garroshSpinTimerRunning,false);
  f.g.kill(f.caster,target);f.caster.hp=100;assert.equal(garroshActiveAfterDamage(f.g,f.caster,0,f.api),false);
});

test('opposing clan glory listeners can reenter according to each independent source chance roll',()=>{
  const f=fixture(['A1A4']),other=f.enemy(.5);other.skillSpecs=[{id:'A1A4'}];
  const base=f.api.nativeDamage;
  f.api.nativeDamage=(game,target,amount,source,types)=>{
    const actual=base(game,target,amount,source,types);
    garroshActiveAfterDamage(game,target,actual,f.api);
    return actual;
  };
  f.g.randomValues=[0,0,0,.9];f.caster.hp-=1;
  assert.equal(garroshActiveAfterDamage(f.g,f.caster,1,f.api),true);
  assert.equal(f.g.draws,4,'the original listener rolls again when the opposing proc damages it');
  assert.deepEqual(f.g.hits.map(h=>h.targetId),[other.id,f.caster.id,other.id]);
  assert.equal(f.g.state.sourceSkillJobs.length,2,'each body still owns just one nonrefreshed spin timer');
  assert.equal(other.status.garroshSpin,true);assert.equal(f.caster.status.garroshSpin,true);
});

test('all axe, throw and spin job data serialize and continue to equivalent source callbacks',()=>{
  const f=fixture(['A1A2','A1A3','A1A4']),target=f.enemy(.5);f.g.add([],{worldX:.1});
  f.cast('A1A2',{point:{x:2,y:0}});f.cast('A1A3',{target});garroshActiveAfterDamage(f.g,f.caster,1,f.api);f.g.tick(.2);
  const saved=JSON.parse(JSON.stringify({state:f.g.state,hits:f.g.hits,moves:f.g.moves,pauses:f.g.pauses,charges:f.g.charges,pathing:f.g.pathing,events:f.g.events,draws:f.g.draws,randomValues:f.g.randomValues}));
  const restored=fixture([]);Object.assign(restored.g,saved);
  const output=g=>JSON.parse(JSON.stringify({state:g.state,hits:g.hits,moves:g.moves,pauses:g.pauses,charges:g.charges,pathing:g.pathing,events:g.events}));
  for(const time of [.39,.4,.6,.63,.8]){f.g.tick(time);restored.g.tick(time);assert.deepEqual(output(restored.g),output(f.g),`${time}s continuation`);}
  assert.equal(f.g.state.sourceSkillJobs.length,0);
});
