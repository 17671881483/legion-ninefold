import test from 'node:test';
import assert from 'node:assert/strict';
import {SKILL_IMPLEMENTATION_REVISION,attachSkills,refreshSourceSkills,compileSkills,describeSkills,tickSourceSkills,tickSourceScriptJobs,sourceAuraEffects,sourceAttackStart,sourceOnHit,modifyIncoming,afterSourceDamage,sourceDeath} from '../dist/skills.js';
import {V14_UNITS} from '../dist/v14-reference.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const def=(abilityIds=[],extra={})=>({id:'v14_content_fixture',skillVersion:'v14.1A5',distanceScale:1/3,hp:1000,damage:10,mana:100,manaStart:100,abilityIds,...extra});
function fixture(){
 let id=0;
 return {state:{time:0,entities:[],sourceSkillJobs:[]},events:[],_random:()=>.9,_battleAuras:[[],[]],
  _event(type,e,label,extra){this.events.push({type,id:e.id,label,...extra});},
  _auraEffects:()=>({damageMultiplier:1,armor:0}),_effectiveArmor:(e,a)=>a,_typeMultiplier:()=>1,_armorFactor:()=>1,
  add(d=def(),side='defender',x=0,y=0){const e={id:++id,hp:d.hp??1000,maxHp:d.hp??1000,damage:d.damage??10,attackInterval:1,range:1,acquisitionRange:5,isBoss:!!d.isBoss,side,team:side==='defender'?0:1,battleTeam:0,ownerId:side==='defender'?0:1,status:{},worldX:x,worldY:y,createdAt:this.state.time};attachSkills(e,d);this.state.entities.push(e);return e;},
  battle(){const list=this.state.entities;list.auras=[];this._worldEntities=new Map(list.map(e=>[e.id,e]));return list;},
  _hurt(t,amount,attacker,options={}){if(t.hp<=0||amount<=0)return 0;const dealt=modifyIncoming(this,t,amount,attacker,options);if(dealt<=0)return 0;t.hp-=dealt;afterSourceDamage(this,t,dealt,attacker,options);if(t.hp<=0)sourceDeath(this,t,attacker);return dealt;},
  hit(e,t,amount=10){const attack=sourceAttackStart(this,e,t),dealt=this._hurt(t,amount,e,{});if(dealt>0&&e.hp>0)sourceOnHit(this,e,t,this.battle(),dealt,attack.procs,amount);return dealt;}
 };
}

test('verified v14 markers compile with source mechanics and preserve old-version isolation',()=>{
 const ids=['A2Y1','A2Y5','A2Y6','A0TA','A0JO','A0IC','A1Q0','A0TH','A0YD'];
 for(const s of compileSkills(def(ids)))assert.equal(s.status,['A2Y1','A2Y5'].includes(s.id)?'partial':'implemented',s.id);
 const [hurricane,ripple]=compileSkills(def(ids));near(hurricane.radius,350/300);near(hurricane.pull,20/300);assert.equal(hurricane.count,25);assert.equal(ripple.count,5);assert.equal(ripple.manaCost,15);
 assert.equal(compileSkills({abilityIds:['A0TA']})[0].status,'unresolved');
 assert.equal(compileSkills(def(['A2Y0']))[0].status,'unresolved');assert.equal(compileSkills(def(['A0BH']))[0].status,'partial');
 assert.equal(compileSkills(def(['A1DR']))[0].status,'partial','ice-shield timing and explicit attack classes are implemented; hidden native classes remain unresolved');
});

test('hurricane waits for a damage event, then deals 25 exact pulses and keeps a fixed center after caster death',()=>{
 const g=fixture(),caster=g.add(def(['A2Y1'])),target=g.add(def(),'monster',2),nearby=g.add(def(),'monster',2.5),immune=g.add(def(['Amim']),'monster',2.2),outside=g.add(def(),'monster',2+350/300+.001),ally=g.add(def(),'defender',2.2),invul=g.add(def(['Avul']),'monster',2.2);
 tickSourceSkills(g,caster,g.battle(),0);assert.equal(g.state.sourceSkillJobs.length,0);
 g._hurt(target,1,caster,{});near(caster.mana,80);assert.equal(g.state.sourceSkillJobs.length,1);
 g.state.time=.199;tickSourceScriptJobs(g);near(target.hp,999);near(nearby.hp,1000);
 g.state.time=.2;tickSourceScriptJobs(g);near(target.hp,986);near(nearby.hp,987);near(nearby.worldX,2.5-20/300);near(immune.hp,987);near(outside.hp,1000);near(ally.hp,1000);near(invul.hp,1000);
 caster.worldX=20;caster.hp=0;g.state.time=5;tickSourceScriptJobs(g);near(target.hp,674);near(nearby.hp,675);near(immune.hp,675);near(nearby.worldX,2);near(outside.hp,1000);assert.equal(g.state.sourceSkillJobs.length,0);
 g.state.time=10;tickSourceScriptJobs(g);near(nearby.hp,675);
});

test('hurricane honors scripted mana/cooldown boundaries and survives serialization',()=>{
 const g=fixture(),caster=g.add(def(['A2Y1'])),target=g.add(def(),'monster',1);caster.mana=19;
 g._hurt(target,1,caster,{});assert.equal(g.state.sourceSkillJobs.length,0);caster.mana=20;g._hurt(target,1,caster,{});near(caster.mana,0);
 g.state=JSON.parse(JSON.stringify(g.state));g.state.time=.2;tickSourceScriptJobs(g);const live=g.state.entities.find(e=>e.id===caster.id),enemy=g.state.entities.find(e=>e.id===target.id);near(enemy.hp,985);
 live.mana=100;g.state.time=14.999;g._hurt(enemy,1,live,{});near(live.mana,100);assert.equal(live.skillStates.A2Y1.casts,1);
 g.state.time=15;g._hurt(enemy,1,live,{});near(live.mana,80);assert.equal(live.skillStates.A2Y1.casts,2);
});

test('damage-event autocast gives the damaged unit priority and falls back when it lacks mana',()=>{
 for(const ability of ['A2Y1','A2Y5']){
  const g=fixture(),attacker=g.add(def([ability])),victim=g.add(def([ability]),'monster',1);g._hurt(victim,10,attacker,{});
  near(attacker.mana,100);near(victim.mana,ability==='A2Y1'?80:85);assert.equal(g.state.sourceSkillJobs[0].sourceId,victim.id);
  victim.mana=0;g._hurt(victim,10,attacker,{});near(attacker.mana,ability==='A2Y1'?80:85);assert.ok(g.state.sourceSkillJobs.some(j=>j.sourceId===attacker.id));
 }
});

test('ripple snapshots targets and applies five delayed universal hits without tooltip slows',()=>{
 const g=fixture(),caster=g.add(def(['A2Y5'])),target=g.add(def(),'monster',2),leaver=g.add(def(),'monster',2.5),late=g.add(def(),'monster',4),immune=g.add(def(['Amim']),'monster',2.2),invul=g.add(def(['Avul']),'monster',2.2);
 g._hurt(target,1,caster,{});near(caster.mana,85);assert.equal(g.state.sourceSkillJobs.length,3);leaver.worldX=20;late.worldX=2.5;caster.hp=0;
 g.state.time=.999;tickSourceScriptJobs(g);near(leaver.hp,1000);
 g.state.time=1;tickSourceScriptJobs(g);near(leaver.hp,985);near(immune.hp,985);near(late.hp,1000);near(invul.hp,1000);assert.deepEqual(leaver.buffs,[]);
 g.state.time=4.5;tickSourceScriptJobs(g);near(leaver.hp,940);assert.equal(g.state.sourceSkillJobs.length,3);
 g.state.time=5;tickSourceScriptJobs(g);near(leaver.hp,925);near(target.hp,924);near(immune.hp,925);assert.equal(g.state.sourceSkillJobs.length,0);near(sourceAuraEffects(g,leaver,[]).haste,0);near(sourceAuraEffects(g,leaver,[]).move,0);
});

test('tide boon triggers only on actual basic hits, separates armor/haste expiry, and enforces its cooldown',()=>{
 const g=fixture(),shaman=g.add(def(['A2Y6'])),ally=g.add(def(),'defender',1.5),outside=g.add(def(),'defender',2.001),invul=g.add(def(['Avul']),'defender',1),enemy=g.add(def(),'monster',.2);g._random=()=>.1;
 g._hurt(shaman,10,enemy,{spell:true});assert.equal(shaman.buffs.length,0);
 g._hurt(shaman,10,enemy,{});near(sourceAuraEffects(g,ally,[]).armor,3);near(sourceAuraEffects(g,ally,[]).haste,.15);assert.equal(outside.buffs.length,0);assert.equal(invul.buffs.length,0);near(shaman.skillStates.A2Y6.readyAt,5);
 g.state.time=2;g._hurt(shaman,10,enemy,{});near(ally.buffs.find(b=>b.key==='A2Y8').expiresAt,3);
 g.state.time=3;near(sourceAuraEffects(g,ally,[]).armor,0);near(sourceAuraEffects(g,ally,[]).haste,.15);
 g.state.time=5;near(sourceAuraEffects(g,ally,[]).haste,0);g._hurt(shaman,10,enemy,{});near(sourceAuraEffects(g,ally,[]).armor,3);near(ally.buffs.find(b=>b.key==='A2Y8').expiresAt,8);
});

test('two shamans refresh the same boon ability instead of stacking its statistics',()=>{
 const g=fixture(),first=g.add(def(['A2Y6'])),second=g.add(def(['A2Y6'])),ally=g.add(def()),enemy=g.add(def(),'monster',.1);g._random=()=>.1;
 g._hurt(first,1,enemy,{});g.state.time=2;g._hurt(second,1,enemy,{});near(sourceAuraEffects(g,ally,[]).armor,3);near(sourceAuraEffects(g,ally,[]).haste,.15);assert.equal(ally.buffs.length,2);near(ally.buffs.find(b=>b.key==='A2Y8').expiresAt,5);near(ally.buffs.find(b=>b.key==='A2Y9').expiresAt,7);
});

test('bite stacks independently for each attacker/victim pair and retains stacks when switching targets',()=>{
 const g=fixture(),a=g.add(def(['A0TA'])),b=g.add(def(['A0TA'])),first=g.add(def(),'monster',.1),second=g.add(def(),'monster',.2);
 g.hit(a,first);near(first.hp,985);g.hit(a,first);near(first.hp,965);g.hit(a,second);near(second.hp,985);g.hit(b,first);near(first.hp,950);g.hit(a,first);near(first.hp,925);
 sourceOnHit(g,a,first,g.battle(),0);near(first.hp,925);
});

test('blood boil uses current self health, strict ten-percent threshold, and maximum-health divine damage',()=>{
 const g=fixture(),warrior=g.add(def(['A0IC'])),target=g.add(def(['Amim']),'monster',.1);warrior.hp=110;g.hit(warrior,target);near(warrior.hp,103.4);near(target.hp,950);
 warrior.hp=100;g.hit(warrior,target);near(warrior.hp,100);near(target.hp,940);
 warrior.hp=1000;g._hurt(target,10,warrior,{spell:true});near(warrior.hp,1000);near(target.hp,930);
});

test('source mana restores on actual enemy damage events rather than attack starts, capped at maximum',()=>{
 const g=fixture(),phoenix=g.add(def(['A0JO'])),target=g.add(def(),'monster',.1),ally=g.add(def());phoenix.mana=50;
 sourceAttackStart(g,phoenix,target);near(phoenix.mana,50);g._hurt(target,10,phoenix,{spell:true});near(phoenix.mana,52);
 g._hurt(target,0,phoenix,{});g._hurt(ally,10,phoenix,{});g._sourceDamageTriggerDepth=1;g._hurt(target,10,phoenix,{spell:true,scripted:true});g._sourceDamageTriggerDepth=0;near(phoenix.mana,52);
 g._hurt(target,10,phoenix,{spell:true,scripted:true});near(phoenix.mana,54,'a standalone timer damage is a fresh source event');
 phoenix.mana=99;g.hit(phoenix,target);near(phoenix.mana,100);
});

test('azure fire adds exactly twenty universal damage on a basic hit, including against magic immunity',()=>{
 const g=fixture(),dragon=g.add(def(['A1Q0'])),target=g.add(def(['Amim']),'monster',.1);g._typeMultiplier=()=>.1;g._armorFactor=()=>.1;
 g.hit(dragon,target);near(target.hp,970);g._hurt(target,10,dragon,{spell:true});near(target.hp,960);
});

test('native item-stat fields supply missing personal armor and haste without aura-range or target checks',()=>{
 const g=fixture(),marine=g.add(V14_UNITS.find(u=>u.sourceRawcode==='h0WC')),self=g.add(def(['A2Y8','A2Y9']));
 near(sourceAuraEffects(g,marine,[]).armor,10);near(sourceAuraEffects(g,self,[]).armor,3);near(sourceAuraEffects(g,self,[]).haste,.15);
 const [armor]=compileSkills(def(['A1R3']));assert.equal(armor.status,'implemented');near(armor.armor,10);
});

test('anchor smash uses its actual probability boundary, pauses its caster, and hits only nearby enemies',()=>{
 const g=fixture(),giant=g.add(def(['A0TH'])),target=g.add(def(),'monster',.2),nearby=g.add(def(['Amim']),'monster',.49),outside=g.add(def(),'monster',.501),friend=g.add(def(),'defender',.1),invul=g.add(def(['Avul']),'monster',.1);
 g._random=()=>.669;g.hit(giant,target);near(target.hp,990);assert.equal(giant.status.stunUntil,undefined);
 g._random=()=>.67;g.hit(giant,target);near(target.hp,970);near(nearby.hp,990);near(outside.hp,1000);near(friend.hp,1000);near(invul.hp,1000);near(giant.status.stunUntil,1);
});

test('dragon soul follows the original real-random threshold and native hero classification instead of boss labels',()=>{
 const g=fixture(),dragon=g.add(def(['A0YD'])),nativeHero=g.add(def([],{isHero:true}),'monster',.1),boss=g.add(def([],{hp:200000,isBoss:true}),'monster',.1),immune=g.add(def(['Amim']),'monster',.1);
 assert.equal(boss.isBoss,true);assert.equal(boss.isHero,false);
 g._random=()=>.3;g.hit(dragon,nativeHero);near(nativeHero.hp,990);
 g._random=()=>.29;g.hit(dragon,nativeHero);near(nativeHero.hp,680);g.hit(dragon,boss);near(boss.hp,99991);g.hit(dragon,immune);assert.ok(immune.hp<=0);
});

test('lumber economy skill is shown as implemented with its exclusive payout limits and never executes in skill hooks',()=>{
 const [skill]=compileSkills(def(['A0LM'])),[shown]=describeSkills(def(['A0LM']));assert.equal(skill.kind,'economic_marker');assert.equal(shown.status,'implemented');
 for(const text of ['35%','1木材','h0OU','31波','经济结算'])assert.ok(shown.effectText.includes(text),text);
 const g=fixture(),saw=g.add(def(['A0LM'],{rawcode:'h00W'})),target=g.add(def(),'monster',.1);g.state.players=[{gold:10,wood:10}];g._random=()=>0;
 tickSourceSkills(g,saw,g.battle(),0);g.hit(saw,target,10000);assert.deepEqual(g.state.players,[{gold:10,wood:10}]);assert.equal(g.state.sourceSkillJobs.length,0);
 const legacy=compileSkills({id:'legacy_saw',abilityIds:['A0LM']})[0];assert.notEqual(legacy.kind,'economic_marker');
});

test('both farmer building and combat rawcodes show the player-level registration economy',()=>{
 for(const rawcode of ['n085','h0W1']){
  const list=describeSkills(def([],{rawcode}));assert.equal(list.length,1);const [skill]=list;assert.equal(skill.id,'economy:farmer');assert.equal(skill.status,'implemented');
  for(const text of ['15%','0.5个百分点','开始建造','升级完成后注销','出售','不会注销','没有对战技能'])assert.ok(skill.effectText.includes(text),`${rawcode}: ${text}`);
 }
 const legacy=describeSkills({id:'legacy_farmer',rawcode:'h0W1',abilityIds:[]});assert.deepEqual(legacy,[]);
});

test('farm master descriptions cover survival settlement and original corpse-count behavior without extra payouts',()=>{
 for(const rawcode of ['n084','h0W0']){
  const [skill]=describeSkills(def([],{rawcode}));assert.equal(skill.id,'economy:master');assert.equal(skill.status,'implemented');
  for(const text of ['存活','3×','本波农夫','尸体','皮肤农夫'])assert.ok(skill.effectText.includes(text),`${rawcode}: ${text}`);
 }
 const list=describeSkills(def([],{rawcode:'n084',combatRawcode:'h0W0'}));assert.equal(list.filter(s=>s.id==='economy:master').length,1);
 const legacy=describeSkills({id:'legacy_master',rawcode:'h0W0',abilityIds:[]});assert.deepEqual(legacy,[]);
});

test('new entities record the current skill implementation and current saves are left untouched',()=>{
 const g=fixture(),entity=g.add(def(['A0JO'])),specs=entity.skillSpecs,states=entity.skillStates;assert.equal(entity.skillImplementationRevision,SKILL_IMPLEMENTATION_REVISION);
 assert.equal(refreshSourceSkills(entity,def(['A0JO'])),false);assert.equal(entity.skillSpecs,specs);assert.equal(entity.skillStates,states);
});

test('old pending save skills recompile with definition scale while keeping resources, runtime states and injected abilities',()=>{
 const g=fixture(),definition=def(['A0JO']),entity=g.add(definition),enemy=g.add(def(),'monster',.1);entity.hp=321;entity.mana=23;entity.distanceScale=99;
 entity.buffs=[{key:'saved-buff',expiresAt:40,armor:2}];entity.status={savedCounter:7};entity.skillStates={A0JO:{readyAt:9,casts:4,customCounter:3}};
 entity.skillSpecs=[{id:'A0JO',kind:'pending',status:'unresolved'},{id:'A2Y6',kind:'pending',status:'unresolved'},{id:'A2Y8',kind:'pending',status:'unresolved'}];delete entity.skillImplementationRevision;
 const states=entity.skillStates,buffs=entity.buffs,status=entity.status;
 assert.equal(refreshSourceSkills(entity,definition),true);assert.deepEqual(entity.skillSpecs.map(s=>s.id),['A0JO','A2Y6','A2Y8']);assert.ok(entity.skillSpecs.every(s=>s.status==='implemented'));near(entity.skillSpecs.find(s=>s.id==='A2Y6').radius,2);
 near(entity.hp,321);near(entity.mana,23);assert.equal(entity.skillStates,states);assert.deepEqual(states,{A0JO:{readyAt:9,casts:4,customCounter:3}});assert.equal(entity.buffs,buffs);assert.equal(entity.status,status);assert.equal(entity.skillImplementationRevision,SKILL_IMPLEMENTATION_REVISION);
 assert.equal(entity.skillStates.A2Y6,undefined);g._random=()=>.1;g._hurt(entity,1,enemy,{});assert.equal(entity.skillStates.A2Y6.casts,1);g._hurt(enemy,1,entity,{});near(entity.mana,25);assert.deepEqual(entity.skillStates.A0JO,{readyAt:9,casts:4,customCounter:3});
});

test('saved mirror images retain an empty runtime skill set even when their source template has abilities',()=>{
 const g=fixture(),definition=def(['A1TN']),mirror=g.add(definition);mirror.skillSpecs=[];mirror.isIllusion=true;mirror.skillStates={A1TN:{readyAt:999,casts:1}};mirror.status.incomingMultiplier=1;mirror.hp=123;mirror.mana=17;
 const restored=JSON.parse(JSON.stringify({...mirror,skillImplementationRevision:'old-content'})),before=JSON.parse(JSON.stringify(restored));assert.equal(refreshSourceSkills(restored,definition),true);assert.deepEqual(restored.skillSpecs,[]);
 const expected={...before,skillImplementationRevision:SKILL_IMPLEMENTATION_REVISION};assert.deepEqual(restored,expected);assert.equal(refreshSourceSkills(restored,definition),false);
});
