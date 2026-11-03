import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES,UNITS} from '../dist/data.js';
import {compileSkills,initializeSourceClassCombat,tickSourceScriptJobs,sourceDeath} from '../dist/skills.js';
import {countsForBattle,isReincarnating} from '../dist/reincarnation-rules.js';
import {laneToWorld} from '../dist/layout.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message),has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
const pjobs=g=>g.state.sourceSkillJobs.filter(j=>j.type==='phoenix_revive');
function fixture({blue=false,register=true,side='defender'}={}){
 const g=new Game({mode:'sandbox',seed:53});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};g._random=()=>.9;for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const p=laneToWorld(0,3,6),make=(dx=.3,s='monster',code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{side:s,ownerId:s==='defender'?0:4,sourceNativeOwnerId:s==='defender'?8:9,userData:s==='defender'?1:5,team:s==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y,facing:73});e.hp=e.maxHp=10000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,side,blue?'h0WW':'h0VX'),t=make(.3,side==='defender'?'monster':'defender');skills(a,['A1SB','A1SC','A1SE']);
 const b={id:'phoenix-building',unitId:blue?'v14_n08N':'v14_n083'};g.state.players[a.ownerId].buildings=[b];a.buildingId=b.id;
 if(register)initializeSourceClassCombat(g,b,a);
 const kill=e=>g._hurt(e,1e8,t,{spell:true,universal:true}),at=n=>{g.state.time=n;tickSourceScriptJobs(g);};
 return{g,a,t,p,b,make,kill,at,egg:()=>g.state.entities.find(e=>e.combatRawcode==='h0VY'),body:()=>g.state.entities.find(e=>e.combatRawcode==='h0VZ'&&e.hp>0)};
}
test('source evidence pins unit-death registration, egg kill/create ordering and object fields',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/phoenix-revival-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.units.h0VY.weapsOn,undefined);assert.equal(p.units.h0VY.spd,undefined);assert.equal(p.units.h0VZ.HP,'2000');
});
test('building registers once, combat marker alone and zero-level building do not',()=>{
 const f=fixture();assert.equal(pjobs(f.g).length,1);initializeSourceClassCombat(f.g,f.b,f.a);assert.equal(pjobs(f.g).length,1);
 for(const mode of ['none','combat-only','zero']){const z=fixture({register:false});initializeSourceClassCombat(z.g,mode==='none'?null:mode==='combat-only'?{unitId:'custom',abilityIds:[]}:{...z.b,abilityLevels:{A1SE:0}},z.a);z.kill(z.a);assert.equal(z.egg(),undefined);assert.equal(pjobs(z.g).length,0);}
});
test('death instantly deals102 and creates a new invulnerable egg before removing original',()=>{
 const f=fixture();f.kill(f.a);near(f.t.hp,9898);const e=f.egg();assert.ok(e);assert.notEqual(e.id,f.a.id);assert.equal(e.maxHp,4000);assert.equal(e.invulnerable,true);assert.equal(f.g.state.entities.includes(f.a),false);assert.equal(f.a.status.sourceRemoved,true);assert.equal(pjobs(f.g)[0].phase,'egg');near(pjobs(f.g)[0].at,13);near(f.g._hurt(e,500,f.t,{spell:true,universal:true}),0);
});
test('range400 includes exact boundary and king while excluding allies dead Avul other battles',()=>{
 const f=fixture(),edge=f.make(400/300),beyond=f.make(400/300+.001),ally=f.make(.3,'defender'),dead=f.make(.3),inv=f.make(.3),other=f.make(.3),air=f.make(.5),immune=f.make(.6);dead.hp=0;skills(inv,['Avul']);other.battleTeam=1;air.targetType='air';skills(immune,['Amim']);const k=f.g.state.kings[0];k.side='monster';k.hp=k.maxHp=10000;k.worldX=f.p.x+.7;k.worldY=f.p.y;
 f.kill(f.a);for(const e of [f.t,edge,air,immune,k])near(e.hp,9898);for(const e of [beyond,ally,inv,other])near(e.hp,10000);near(dead.hp,0);
});
test('3second hatch kills egg then creates fresh2000HP190attack body with one more revival',()=>{
 const f=fixture();f.a.maxHp=50000;f.a.damage=10000;f.a.buffs=[{key:'fixture',expiresAt:999}];f.kill(f.a);const egg=f.egg();f.at(12.999);assert.equal(f.body(),undefined);f.at(13);const b=f.body();assert.ok(b);near(b.hp,2000);near(b.damage,190);near(b.mana,30);assert.notEqual(b.id,egg.id);assert.equal(b.buildingId,undefined);assert.equal(b.isSummon,false);assert.equal(b.buffs.length,0);assert.equal(has(b,'A1SE'),true);assert.equal(pjobs(f.g)[0].count,1);assert.equal(egg.status.deathCounted,true);assert.equal(egg.status.sourceRemoved,true);near(f.t.hp,9898);
});
test('two complete cycles use same body stats, second body has no listener and no third explosion',()=>{
 const f=fixture();f.kill(f.a);f.at(13);const b=f.body();f.kill(b);near(f.t.hp,9796);f.at(16);const c=f.body();assert.notEqual(c.id,b.id);near(c.hp,2000);near(c.damage,190);assert.equal(has(c,'A1SE'),false);assert.equal(pjobs(f.g).length,0);f.kill(c);near(f.t.hp,9796);assert.equal(f.egg(),undefined);f.at(30);assert.equal(f.body(),undefined);
});
test('userData owner facing and JH/JW group identity survive both new handles',()=>{
 const f=fixture();f.a.userData=3;f.a.sourceNativeOwnerId=9;f.a.worldX+=.1;f.kill(f.a);const e=f.egg();for(const u of [e]){assert.equal(u.userData,3);assert.equal(u.sourceNativeOwnerId,9);assert.equal(u.ownerId,0);assert.equal(u.status.sourceJHMember,3);assert.equal(u.status.sourceJWMember,true);near(u.worldX,f.a.worldX);near(u.facing,73);}f.at(13);const b=f.body();assert.equal(b.userData,3);assert.equal(b.sourceNativeOwnerId,9);near(b.facing,73);assert.equal(b.status.sourceJHMember,3);
});
test('blue prototype retains skin flag through both eggs and both generich0VZ bodies',()=>{
 const f=fixture({blue:true});assert.equal(f.a.status.phoenixBlue,true);for(const at of [13,16]){f.kill(at===13?f.a:f.body());assert.equal(f.egg().sourceModelOverride,'Phoenix2_Blue.mdx');f.at(at);assert.equal(f.body().combatRawcode,'h0VZ');assert.equal(f.body().sourceModelOverride,'Phoenix_Blue.mdx');assert.equal(f.body().status.phoenixBlue,true);}
 const z=fixture();z.kill(z.a);assert.equal(z.egg().sourceModelOverride,'Phoenix2.mdl');z.at(13);assert.equal(z.body().sourceModelOverride,'Phoenix.mdx');
});
test('removingA1SE after registration terminates on death and regrant before death is accepted',()=>{
 for(const restore of [false,true]){const f=fixture();skills(f.a,restore?['A1SE']:[]);if(!restore)f.a.status.sourcePaused=true;f.kill(f.a);if(restore)assert.ok(f.egg());else{assert.equal(f.egg(),undefined);f.at(11);assert.equal(pjobs(f.g).length,0);near(f.t.hp,10000);}}
 const z=fixture();z.a.abilityLevels={A1SE:0};z.kill(z.a);assert.equal(z.egg(),undefined);
});
test('no killer and disabled main death trigger still dispatch independent unit-death listener',()=>{
 const f=fixture();f.g._sourceUnitDeathTriggerDepth=1;f.g._killUnit(f.a);assert.ok(f.egg());near(f.t.hp,9898);assert.equal(f.g._sourceUnitDeathTriggerDepth,1);
});
test('ACrn widget waiting does not prematurely trigger phoenix unit death',()=>{
 const f=fixture();skills(f.a,['A1SE','A14E']);f.kill(f.a);assert.equal(isReincarnating(f.a),true);assert.equal(f.egg(),undefined);near(f.t.hp,10000);f.at(12);assert.ok(f.a.hp>0);f.kill(f.a);assert.ok(f.egg());near(f.t.hp,9898);
});
test('death damage is weapon-classified and can consume another explicit attack ability',()=>{
 const f=fixture();skills(f.a,['A1SE','A1PJ']);f.kill(f.a);near(f.t.hp,9863);assert.equal(f.a.status.musketeerMagazineCount,1);
});
test('death explosion can trigger another phoenix without recursively duplicating either egg',()=>{
 const f=fixture(),other=f.t;other.combatRawcode='h0VX';skills(other,['A1SE']);other.hp=50;initializeSourceClassCombat(f.g,{unitId:'v14_n083'},other);f.kill(f.a);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='h0VY').length,2);assert.equal(pjobs(f.g).length,2);sourceDeath(f.g,f.a,other);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='h0VY').length,2);
});
test('killing an egg early does not cancel its retained3second hatch timer',()=>{
 const f=fixture();f.kill(f.a);const e=f.egg();f.g._killUnit(e);assert.equal(e.status.deathCounted,true);f.g._clearDead();assert.equal(f.g.state.entities.includes(e),false);f.at(13);assert.ok(f.body());near(f.body().hp,2000);assert.equal(e.status.sourceRemoved,true);
});
test('removed egg handle is explicitly unresolved instead of spawning from invented coordinates',()=>{
 const f=fixture();f.kill(f.a);const e=f.egg();e.status.sourceRemoved=true;f.g.state.entities=f.g.state.entities.filter(x=>x!==e);const j=pjobs(f.g)[0];f.at(13);assert.equal(f.body(),undefined);assert.equal(j.reason,'removed-egg-native-outcome-unverified');assert.equal(pjobs(f.g).length,0);
});
test('egg retains unknown native action fields instead of importer combat fallback',()=>{
 const f=fixture();f.kill(f.a);const e=f.egg();assert.deepEqual(e.status.phoenixEgg.missingNativeFields,['spd','weapsOn']);assert.equal(e.status.sourcePaused,true);assert.equal(e.status.phoenixEggActionBoundary,true);assert.equal(e.sourceRawFields.spd,undefined);assert.equal(e.sourceRawFields.weapsOn,undefined);assert.equal(countsForBattle(e),true);
});
test('game pause freezes hatch; unit controls and removed old ability do not delay timer',()=>{
 const f=fixture();f.kill(f.a);const e=f.egg();skills(f.a,[]);f.g.state.paused=true;f.g.tick(5);assert.equal(f.body(),undefined);near(f.g.state.time,10);f.g.state.paused=false;e.status.stunUntil=999;f.at(13);assert.ok(f.body());near(f.body().hp,2000);
});
test('save during egg waits rebinds retained and live identities and hatches once',()=>{
 const f=fixture({blue:true});f.kill(f.a);f.at(11);const saved=clone(f.g.snapshot()),g=Game.fromSnapshot(saved),j=pjobs(g)[0],egg=g.state.entities.find(e=>e.id===j.eggId);assert.equal(j.egg,egg);assert.equal(j.source.status.sourceRemoved,true);g.state.time=13;tickSourceScriptJobs(g);f.at(13);const b=g.state.entities.find(e=>e.combatRawcode==='h0VZ');assert.equal(pjobs(g)[0].source,b);assert.deepEqual([b.hp,b.damage,b.mana,b.sourceModelOverride],[f.body().hp,f.body().damage,f.body().mana,f.body().sourceModelOverride]);assert.equal(g.state.entities.filter(e=>e.combatRawcode==='h0VZ').length,1);
});
test('save after first hatch keeps used cycle and second hatch cannot regainA1SE on reload',()=>{
 const f=fixture();f.kill(f.a);f.at(13);const g=Game.fromSnapshot(clone(f.g.snapshot())),b=g.state.entities.find(e=>e.combatRawcode==='h0VZ');assert.equal(pjobs(g)[0].source,b);g._killUnit(b);g.state.time=16;tickSourceScriptJobs(g);const h=Game.fromSnapshot(clone(g.snapshot())),c=h.state.entities.find(e=>e.combatRawcode==='h0VZ');assert.equal(has(c,'A1SE'),false);assert.equal(pjobs(h).length,0);
});
test('legacy migration requires a live original deployed body and actual building evidence',()=>{
 const f=fixture({register:false}),g=Game.fromSnapshot(clone(f.g.snapshot()));assert.equal(pjobs(g).length,1);assert.equal(g.state.entities[0].status.phoenixRevivalRegistered.migrated,true);
 for(const mode of ['no-building','dead','revived-body']){const z=fixture({register:false});if(mode==='no-building')z.a.buildingId=undefined;if(mode==='dead')z.a.hp=0;if(mode==='revived-body')z.a.combatRawcode='h0VZ';const g=Game.fromSnapshot(clone(z.g.snapshot()));assert.equal(pjobs(g).length,0,mode);}
});
test('round reset destroys pending hatch, while continuous31to32 keeps live egg and timer',()=>{
 const f=fixture();f.kill(f.a);const id=f.egg().id;f.g.state.mode='standard';f.g._advanceContinuous();assert.equal(f.g.state.wave,32);assert.ok(f.g.state.entities.some(e=>e.id===id));assert.equal(pjobs(f.g).length,1);f.at(13);assert.ok(f.body());
 const z=fixture();z.kill(z.a);ok(z.g.command('sandboxReset'));z.at(13);assert.equal(z.body(),undefined);assert.equal(pjobs(z.g).length,0);
});
test('dead original and KillUnit egg each settle once without crediting an extra killer reward',()=>{
 const f=fixture({side:'monster'});f.g.state.wave=1;f.a.reward=5;const p=f.g.state.players[0],kills=p.stats.kills;f.kill(f.a);assert.equal(p.stats.kills,kills+1);const e=f.egg(),gold=p.gold;sourceDeath(f.g,f.a,f.t);assert.equal(p.stats.kills,kills+1);f.at(13);assert.equal(p.gold,gold);assert.equal(p.stats.kills,kills+1);assert.equal(e.status.deathCounted,true);
});
test('normal deployment and arena both register from original building without extra summon registration',()=>{
 const f=fixture({register:false});f.g.state.entities=[];const u=UNITS.find(u=>u.sourceRawcode==='n083');f.g._spawnDefender(u,f.g.state.players[0],3,6,f.b.id);assert.equal(pjobs(f.g).length,1);assert.equal(pjobs(f.g)[0].source.combatRawcode,'h0VX');f.g._startArena();assert.equal(pjobs(f.g).length,1);assert.equal(pjobs(f.g)[0].source.isArena,true);
});
test('natural arena frames hold egg in place and do not prematurely end before its hatch',()=>{
 const f=fixture();f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;f.kill(f.a);const egg=f.egg(),x=egg.worldX,y=egg.worldY;f.g.tick(1);assert.equal(f.g.state.phase,'combat');near(egg.worldX,x);near(egg.worldY,y);assert.equal(f.body(),undefined);for(let i=0;i<22;i++)f.g.tick(.1);assert.equal(f.g.state.phase,'combat');assert.ok(f.body());assert.equal(f.egg(),undefined);
});
test('actual570gold direct upgrade deploys original phoenix and enters egg after lethal damage',()=>{
 const g=new Game({mode:'sandbox',seed:53}),p=g.state.players[0];p.roster=['v14_h08F'];p.entitlements.h230=1;for(let col=0;col<5;col++)ok(g.command('build',{unitId:'v14_h08F',col,row:1}));ok(g.command('sandboxComplete'));assert.equal(p.technologies.R00N,undefined);ok(g.command('ready'));g._endCombat();assert.equal(p.technologies.R00N,1);const b=p.buildings[0];for(const unitId of ['v14_h08I','v14_h18I']){ok(g.command('upgrade',{buildingId:b.id,unitId}));ok(g.command('sandboxComplete'));}const gold=p.gold;ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_n083'}));near(p.gold,gold-570);ok(g.command('sandboxComplete'));ok(g.command('ready'));const a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(a.combatRawcode,'h0VX');assert.equal(pjobs(g).length,1);g._killUnit(a);assert.ok(g.state.entities.some(e=>e.combatRawcode==='h0VY'));assert.equal(b.unitId,'v14_n083');
});
test('coverage includes egg and reborn body while active phoenix skills retain partial boundaries',()=>{
 for(const u of [UNITS.find(u=>u.sourceRawcode==='n083'),UNITS.find(u=>u.sourceRawcode==='n08N')]){const ss=compileSkills(u);assert.equal(ss.find(s=>s.id==='A1SE').status,'partial');for(const id of ['A1SB','A1SC'])assert.equal(ss.find(s=>s.id===id).status,'partial');}
});
