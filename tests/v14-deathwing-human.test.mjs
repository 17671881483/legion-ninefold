import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,matchesTargets,sourceDamage,sourceMoveFactor,sourceAuraEffects} from '../dist/skills.js';
import {DEATHWING_HUMAN_RULES,DEATHWING_ROOT_NATIVE_REFERENCE,canDeathwingHumanCast,castDeathwingHuman,deathwingHumanMainDamage,tickDeathwingHumanJobs,restoreDeathwingHuman} from '../dist/deathwing-human.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),clone=x=>JSON.parse(JSON.stringify(x));
const skills=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
const api={compileAbility:(g,e,id)=>compileSkills({abilityIds:[id],skillVersion:'v14.1A5',distanceScale:e.distanceScale??1/3})[0],matchesTargets,scriptInvulnerable:e=>e.invulnerable||e.skillSpecs?.some(s=>s.kind==='invulnerability'),sourceDamage,magicImmune:e=>e.skillSpecs?.some(s=>s.kind==='immunity'&&s.status==='implemented')};
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type&&!j.done);
export function createDeathwingHumanFixture(){
 const g=new Game({mode:'sandbox',seed:73});g.state.phase='combat';g.state.time=10;g.state.entities=[];for(const k of g.state.kings){k.worldX=k.worldY=10000;}
 const make=(side='monster',ids=[],x=0)=>{const e=g._entity(UNIT_TEMPLATES.h0PC,{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,userData:side==='defender'?1:5,worldX:x,worldY:0});skills(e,ids);e.hp=e.maxHp=1000;e.mana=e.maxMana=100;e.hpRegen=e.manaRegen=0;e.armor=0;e.armorType='unarmored';e.sourceArmorTypeRaw='none';e.traits=[];e.isNativeHero=e.isHero=false;e.attackCd=e.abilityCd=1000;e.ability=null;e.buffs=[];g.state.entities.push(e);return e;};
 const a=make('defender',['A0YF','A0YE']),t=make('monster',[],.2);
 const at=n=>{g.state.time=n;tickDeathwingHumanJobs(g,api);};
 const cast=target=>castDeathwingHuman(g,a,'A0YF',{target:target??t},api);
 return {g,a,t,make,cast,at,api};
}
test('human rules retain explicit active prices and partial helper-native boundaries',()=>{
 assert.equal(DEATHWING_HUMAN_RULES.A0YF.manaCost,12);assert.equal(DEATHWING_HUMAN_RULES.A0YF.cooldown,7);assert.equal(DEATHWING_HUMAN_RULES.A0YF.range,800);
 for(const id of ['A0YF','A0YG','A0YE'])assert.equal(DEATHWING_HUMAN_RULES[id].status,'partial');
 assert.deepEqual(DEATHWING_ROOT_NATIVE_REFERENCE.versions,['1.24.4','1.27.1']);assert.equal(DEATHWING_ROOT_NATIVE_REFERENCE.customInheritanceVerified,false);
 const f=createDeathwingHumanFixture();assert.equal(canDeathwingHumanCast(f.a,'A0YF'),true);assert.equal(canDeathwingHumanCast(f.a,'A0YG'),false);
});
test('manual root pays twelve mana and seven-second cooldown at the exact eight-hundred range',()=>{
 const f=createDeathwingHumanFixture();f.t.worldX=800/300;assert.equal(f.cast().ok,true);near(f.a.mana,88);near(f.a.skillStates.A0YF.readyAt,17);assert.equal(f.a.skillStates.A0YF.casts,1);assert.equal(f.cast().ok,false);near(f.a.mana,88);
});
test('rejected manual casts consume neither mana nor a cooldown nor a dummy',()=>{
 for(const mode of ['range','mana','cooldown','dead','caster-stun','caster-silence','caster-paused','caster-hidden','ally','other-battle','target-dead','target-immune','target-invulnerable','target-cyclone','missing-skill']){
  const f=createDeathwingHumanFixture();if(mode==='range')f.t.worldX=801/300;if(mode==='mana')f.a.mana=11;if(mode==='cooldown')f.a.skillStates.A0YF={readyAt:99,casts:0};if(mode==='dead')f.a.hp=0;if(mode==='caster-stun')f.a.status.stunUntil=11;if(mode==='caster-silence')f.a.status.silenceUntil=11;if(mode==='caster-paused')f.a.status.sourcePaused=true;if(mode==='caster-hidden')f.a.status.sourceHidden=true;if(mode==='ally')f.t.team=f.a.team;if(mode==='other-battle')f.t.battleTeam=1;if(mode==='target-dead')f.t.hp=0;if(mode==='target-immune')skills(f.t,['Amim']);if(mode==='target-invulnerable')f.t.invulnerable=true;if(mode==='target-cyclone')f.t.status.cycloneUntil=11;if(mode==='missing-skill')skills(f.a,[]);
  const mana=f.a.mana,prior=clone(f.a.skillStates);assert.equal(f.cast().ok,false,mode);near(f.a.mana,mana);assert.deepEqual(f.a.skillStates,prior,mode);assert.equal(jobs(f.g,'deathwing_human_dummy').length,0);
 }
});
test('a genuine source-owned e008 retains native template resources and three-second remove request',()=>{
 const f=createDeathwingHumanFixture();f.cast();const j=jobs(f.g,'deathwing_human_dummy')[0],d=j.dummy;
 assert.equal(d.combatRawcode,'e008');assert.equal(d.ownerId,f.a.ownerId);assert.equal(d.userData,1);assert.equal(d.isSummon,true);assert.deepEqual(d.sourceGroups,['JW','JH']);near(d.maxHp,60);near(d.lifeRequest,10000);near(d.mana,100000-75);near(d.manaRegen,1000);assert.equal(d.castPoint,null);assert.equal(d.castBackswing,null);assert.equal(d.abilityLevels.A0YG,undefined);
 f.at(12.999);assert.equal(d.status.sourceRemoved,undefined);f.at(13);assert.equal(d.status.sourceRemoved,true);near(d.hp,0);
});
test('the first seven enemy requests do not add the selected target ahead of native enumeration',()=>{
 const f=createDeathwingHumanFixture();const first=[];for(let i=0;i<7;i++)first.push(f.make('monster',[],.21+i*.01));f.g.state.entities=[f.a,...first,f.t];f.cast();const report=f.a.status.deathwingHuman.lastRootCast;
 assert.deepEqual(report.requests.map(r=>r.targetId),first.map(e=>e.id));assert.equal(report.requests.length,7);assert.equal(f.t.buffs.length,0);assert.equal(report.missingFingerOfDeathDamage,true);
});
test('ineligible enemies consume request slots but cannot become seven guaranteed successful roots',()=>{
 const f=createDeathwingHumanFixture(),air=f.make(),mechanical=f.make(),immune=f.make(),invul=f.make(),dead=f.make(),hero=f.make();air.targetType='air';mechanical.traits=['mechanical'];skills(immune,['Amim']);invul.invulnerable=true;dead.hp=0;hero.isNativeHero=true;f.make();f.cast();const r=f.a.status.deathwingHuman.lastRootCast.requests;
 assert.equal(r.length,7);assert.equal(r.every(r=>r.requested&&r.nativeOutcome==='unverified'),true);assert.equal(r.filter(r=>r.hostAccepted).length,2);assert.equal(r.filter(r=>r.applied).length,2);assert.equal(r.find(r=>r.targetId===air.id).rejectedByHost,'native-target-mask');assert.equal(jobs(f.g,'deathwing_human_root').length,2);
});
test('the actual radius includes the two-hundred-fifty edge but excludes allies and other battle instances',()=>{
 const f=createDeathwingHumanFixture(),edge=f.make('monster',[],f.t.worldX+250/300),out=f.make('monster',[],f.t.worldX+251/300),ally=f.make('defender',[],.25),other=f.make('monster',[],.25);other.battleTeam=1;f.cast();const ids=f.a.status.deathwingHuman.lastRootCast.requests.map(r=>r.targetId);
 assert.ok(ids.includes(edge.id));for(const e of [out,ally,other])assert.ok(!ids.includes(e.id));
});
test('accepted roots immediately prevent movement and attacks without being a stun',()=>{
 const f=createDeathwingHumanFixture();f.t.pendingAttack={targetId:f.a.id};f.cast();near(sourceMoveFactor(f.g,f.t,{auras:[]}),0);assert.equal(f.t.pendingAttack,null);assert.equal(f.t.buffs[0].disarm,true);assert.equal(f.t.status.stunUntil,undefined);near(f.t.hp,1000);f.at(13);assert.equal(f.t.buffs.some(b=>b.disarm),false);assert.ok(sourceMoveFactor(f.g,f.t,{auras:[]})>0);
});
test('dynamic five-percent DPS snapshots maximum life once and does not add finger-of-death damage',()=>{
 const f=createDeathwingHumanFixture();f.cast();near(f.t.hp,1000);f.at(10.25);near(f.t.hp,987.5);f.t.maxHp=2000;f.at(11);near(f.t.hp,950);f.at(13);near(f.t.hp,850);f.at(20);near(f.t.hp,850);assert.equal(jobs(f.g,'deathwing_human_root').length,0);
});
test('hero and boss labels do not shorten the explicit three-second duration',()=>{
 for(const tag of ['isNativeHero','isBoss']){const f=createDeathwingHumanFixture();f.t[tag]=true;f.cast();near(f.t.buffs[0].expiresAt,13);f.at(13);near(f.t.hp,850);}
});
test('magic damage respects target armor-type factors and later immunity',()=>{
 const f=createDeathwingHumanFixture();f.t.sourceArmorTypeRaw='hero';f.t.armorType='hero';f.cast();f.at(11);near(f.t.hp,1000-50*f.g._typeMultiplier('spells','hero','hero'));const hp=f.t.hp;skills(f.t,['Amim']);f.at(12);near(f.t.hp,hp);
});
test('source death and source removal do not erase an already accepted native root',()=>{
 for(const mode of ['death','remove']){const f=createDeathwingHumanFixture();f.cast();if(mode==='death')f.a.hp=0;else f.a.status.sourceRemoved=true;f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);f.at(13);near(f.t.hp,850);}
});
test('a replaced BEer is not stacked or integrated twice',()=>{
 const f=createDeathwingHumanFixture();f.cast();f.at(11);f.t.maxHp=2000;f.a.skillStates.A0YF.readyAt=0;f.cast();assert.equal(f.t.buffs.filter(b=>b.key==='BEer').length,1);f.at(12);near(f.t.hp,850);f.at(14);near(f.t.hp,650);
});
test('removed buffs or a dead target stop further native damage integration',()=>{
 for(const mode of ['buff','dead']){const f=createDeathwingHumanFixture();f.cast();f.at(11);if(mode==='buff')f.t.buffs=[];else f.t.hp=0;const hp=f.t.hp;f.at(13);near(f.t.hp,hp);assert.equal(jobs(f.g,'deathwing_human_root').length,0);}
});
test('dispel releases only this root while preserving another longer control deadline',()=>{
 for(const longer of [false,true]){const f=createDeathwingHumanFixture();if(longer)f.t.status.rootUntil=99;f.cast();f.at(11);f.a.skillStates.A0YF.readyAt=0;f.cast();f.t.buffs=[];f.at(12);near(f.t.status.rootUntil,longer?99:12);}
});
test('paused timers produce no new damage or dummy removal',()=>{
 const f=createDeathwingHumanFixture();f.cast();f.g.state.paused=true;f.at(20);near(f.t.hp,1000);assert.equal(jobs(f.g,'deathwing_human_dummy').length,1);
});
test('spell-effect suppression still pays the native cast but creates no requests',()=>{
 const f=createDeathwingHumanFixture();f.g._sourceAbilityEffectDepth=1;assert.equal(f.cast().scriptSuppressed,true);near(f.a.mana,88);near(f.a.skillStates.A0YF.readyAt,17);assert.equal(jobs(f.g,'deathwing_human_dummy').length,0);assert.equal(f.g._sourceAbilityEffectDepth,1);
});
test('arena sides use actual teams and the same battle without assuming monster-defender names',()=>{
 const f=createDeathwingHumanFixture();f.a.side='arena0';f.t.side='arena1';assert.equal(f.cast().ok,true);f.at(13);near(f.t.hp,850);
});
test('restoration reconnects one shared dummy and continues paid casts and fractional damage exactly',()=>{
 const f=createDeathwingHumanFixture();f.make();f.cast();f.at(10.25);const restored=Game.fromSnapshot(clone(f.g.snapshot()));restoreDeathwingHuman(restored);
 const rjobs=jobs(restored,'deathwing_human_root'),d=jobs(restored,'deathwing_human_dummy')[0].dummy;assert.ok(rjobs.every(j=>j.dummy===d));assert.ok(rjobs.every(j=>j.source===restored.state.entities.find(e=>e.id===f.a.id)));
 f.at(13);restored.state.time=13;tickDeathwingHumanJobs(restored,api);assert.deepEqual(restored.state.entities.map(e=>e.hp),f.g.state.entities.map(e=>e.hp));near(restored.state.entities[0].mana,88);near(restored.state.entities[0].skillStates.A0YF.readyAt,17);
});
test('all saved dummy and request numeric fields remain finite before JSON serialization',()=>{
 const f=createDeathwingHumanFixture();f.cast();const scan=(v,path='state')=>{if(typeof v==='number')assert.ok(Number.isFinite(v),path);else if(v&&typeof v==='object')for(const [key,x]of Object.entries(v))scan(x,path+'.'+key);};scan(f.g.state.sourceSkillJobs);scan(f.a.status.deathwingHuman);
});
test('blood level uses pre-event life truncation without adding one or reaching level eleven',()=>{
 for(const [hp,level]of [[1000,0],[999,0],[900,1],[800,2],[300,7],[1,9],[0,10]]){const f=createDeathwingHumanFixture();f.a.hp=hp;deathwingHumanMainDamage(f.g,f.a,f.t,50,api);const r=f.a.status.deathwingHuman.bloodLevelRequest;assert.equal(r.requestedLevel,level);assert.equal(r.preDamageHp,hp);assert.equal(f.a.hp,hp);assert.equal(f.a.abilityLevels?.A0YE??1,level||1);}
});
test('zero-level blood requests preserve the prior valid ability and explicitly missing level-one regeneration',()=>{
 const f=createDeathwingHumanFixture();f.a.hp=300;deathwingHumanMainDamage(f.g,f.a,f.t,50,api);assert.equal(f.a.abilityLevels.A0YE,7);f.a.hp=1000;deathwingHumanMainDamage(f.g,f.a,f.t,50,api);assert.equal(f.a.abilityLevels.A0YE,7);assert.equal(f.a.status.deathwingHuman.bloodLevelRequest.nativeOutcome,'level-zero-unverified');
 f.a.hp=900;deathwingHumanMainDamage(f.g,f.a,f.t,50,api);assert.equal(f.a.status.deathwingHuman.bloodLevelRequest.explicitRegen,null);f.a.hp=800;deathwingHumanMainDamage(f.g,f.a,f.t,50,api);assert.equal(f.a.status.deathwingHuman.bloodLevelRequest.explicitRegen,5);
});
test('blood-level hook observes main-event guards and never auto-casts A0YF',()=>{
 for(const mode of ['zero','ally','self','null','A2Y7','missing']){const f=createDeathwingHumanFixture();f.a.hp=300;if(mode==='ally')f.t.team=f.a.team;if(mode==='A2Y7')skills(f.t,['A2Y7']);if(mode==='missing')skills(f.a,['A0YF']);deathwingHumanMainDamage(f.g,f.a,mode==='null'?null:mode==='self'?f.a:f.t,mode==='zero'?0:50,api);assert.equal(f.a.status.deathwingHuman,undefined,mode);assert.equal(jobs(f.g,'deathwing_human_dummy').length,0);near(f.a.mana,100);}
 const f=createDeathwingHumanFixture();deathwingHumanMainDamage(f.g,f.a,f.t,50,api);assert.equal(jobs(f.g,'deathwing_human_dummy').length,0);near(f.a.mana,100);
});
test('the real command and engine timer apply paid roots without charging the human helper cost',()=>{
 const f=createDeathwingHumanFixture();f.g.state.players[0].workers=0;const gold=f.g.state.players[0].gold,wood=f.g.state.players[0].wood;
 assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A0YF',targetId:f.t.id}).ok,true);near(f.a.mana,88);f.g.tick(1);near(f.t.hp,950);f.g.tick(2);near(f.t.hp,850);
 near(f.g.state.players[0].gold,gold);near(f.g.state.players[0].wood,wood);assert.equal(jobs(f.g,'deathwing_human_root').length,0);
});
test('real incoming damage updates blood before subtraction and the aura consumes only that explicit level',()=>{
 const f=createDeathwingHumanFixture();f.a.hp=800;f.g._hurt(f.a,150,f.t,{spell:true,universal:true});near(f.a.hp,650);assert.equal(f.a.abilityLevels.A0YE,2);assert.equal(f.a.status.deathwingHuman.bloodLevelRequest.preDamageHp,800);near(sourceAuraEffects(f.g,f.a,[f.a]).healRate,5);near(sourceAuraEffects(f.g,f.t,[f.a]).healRate,0);
});
