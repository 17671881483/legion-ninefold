import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES,UNITS} from '../dist/data.js';
import {compileSkills,castManualSourceSkill,manualSourceSkills,tickSourceScriptJobs,sourceClassAttackDamageEvent,beforeSourceDamage,initializeSourceClassCombat,sourceDeath} from '../dist/skills.js';
import {musketeerGrenades,tickMusketeerJob} from '../dist/musketeer-rules.js';
import {laneToWorld} from '../dist/layout.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message),has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A1PG']){
 const g=new Game({mode:'sandbox',seed:52});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const p=laneToWorld(0,3,6),make=(dx=.3,side='monster',code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{side,ownerId:side==='defender'?0:null,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,sourceNativeOwnerId:side==='defender'?8:9,userData:side==='defender'?1:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=10000;e.mana=e.maxMana=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0VG'),t=make();skills(a,ids);g._random=()=>.5;
 return{g,a,t,p,make,cast:(id,point={x:p.x+1,y:p.y})=>castManualSourceSkill(g,a,id,{point}),at:n=>{g.state.time=n;tickSourceScriptJobs(g);},event:(options={},amount=10)=>sourceClassAttackDamageEvent(g,t,a,options,amount)};
}
test('source evidence pins actual registration, motion ordering and native object differences',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/musketeer-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.abilities.A1PH.Cost1,'19');assert.equal(p.abilities.A1PJ.DataA1,'35.0');
});
test('manual commands use explicit mana cooldown range and positive ability level',()=>{
 const f=fixture(['A1PG','A1PH']);assert.equal(manualSourceSkills(f.g,f.a).length,2);ok(f.cast('A1PG'));near(f.a.mana,992);near(f.a.skillStates.A1PG.readyAt,18);assert.equal(f.cast('A1PG').ok,false);ok(f.cast('A1PH'));near(f.a.mana,973);near(f.a.skillStates.A1PH.readyAt,16);
 for(const mode of ['range','mana','zero','silence','pause','dead']){const z=fixture();if(mode==='mana')z.a.mana=7;if(mode==='zero')z.a.abilityLevels={A1PG:0};if(mode==='silence')z.a.status.silenceUntil=11;if(mode==='pause')z.a.status.sourcePaused=true;if(mode==='dead')z.a.hp=0;assert.equal(z.cast('A1PG',mode==='range'?{x:z.p.x+2,y:z.p.y}:undefined).ok,false,mode);assert.equal(z.g.state.sourceSkillJobs.length,0);}
});
test('shot uses zero first tick then100 range and only one147 hit per projectile',()=>{
 const f=fixture();ok(f.cast('A1PG'));near(f.t.hp,10000);f.at(10);near(f.t.hp,9853);f.at(10.08);near(f.t.hp,9853);assert.equal(f.g.state.sourceSkillJobs.find(j=>j.type==='musketeer_shot').hitIds.length,1);
});
test('shot nine moves total720 ends at0.36 without imaginary final800 step',()=>{
 const f=fixture(),far=f.make(2.8);f.t.worldY+=10;ok(f.cast('A1PG'));f.at(10.32);const j=f.g.state.sourceSkillJobs[0];near(j.x,f.p.x+2.4);assert.equal(j.steps,9);near(far.hp,10000);f.at(10.36);assert.equal(f.g.state.sourceSkillJobs.length,0);near(f.a.status.musketeerChargeEnd.moved,720);near(f.g.state.time,10.36);
});
test('coarse timer catchup hits multiple enemies while respecting caster-relative side and battle',()=>{
 const f=fixture(),b=f.make(1.5),ally=f.make(.5,'defender'),other=f.make(.6),inv=f.make(.4),air=f.make(.7),immune=f.make(.8);other.battleTeam=1;skills(inv,['Avul']);air.targetType='air';skills(immune,['Amim']);ok(f.cast('A1PG'));f.at(11);for(const e of [f.t,b,air,immune])near(e.hp,9853);for(const e of [ally,other,inv])near(e.hp,10000);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('shot survives caster death, ability removal and controls; global pause freezes jobs',()=>{
 const f=fixture();ok(f.cast('A1PG'));skills(f.a,[]);f.a.status.sourcePaused=true;f.a.hp=0;sourceDeath(f.g,f.a,f.t);f.g.state.paused=true;f.g.tick(.2);near(f.t.hp,10000);f.g.state.paused=false;f.at(10.1);near(f.t.hp,9853);
});
test('independent magazine consumes15 weapon events and keeps counter after regrant',()=>{
 const f=fixture(['A1PJ']);for(let i=1;i<=15;i++){f.event();assert.equal(f.a.status.musketeerMagazineCount,i);near(f.t.hp,10000-i*35);}assert.equal(has(f.a,'A1PJ'),false);skills(f.a,['A1PJ']);f.event();near(f.t.hp,9475);assert.equal(f.a.status.musketeerMagazineCount,15);
});
test('magazine marker alone does nothing, level0 and ordinary spells do not consume rounds',()=>{
 for(const mode of ['marker','zero','spell','busy']){const f=fixture([mode==='marker'?'A1PI':'A1PJ']);if(mode==='zero')f.a.abilityLevels={A1PJ:0};if(mode==='busy')f.a.status.sourceNativeAttackBusy=true;f.event(mode==='spell'?{spell:true}:{});near(f.t.hp,10000);assert.equal(f.a.status.musketeerMagazineCount,undefined);}
 const f=fixture(['A1PJ']);f.event({spell:true,weapon:true},0);near(f.t.hp,9965);assert.equal(f.a.status.musketeerMagazineCount,1);
});
test('147 scripted weapon hit also consumes a magazine round without recursive extra rounds',()=>{
 const f=fixture(['A1PG','A1PJ']);ok(f.cast('A1PG'));f.at(10);near(f.t.hp,9818);assert.equal(f.a.status.musketeerMagazineCount,1);assert.equal(f.a.status.sourceNativeAttackBusy,false);
});
test('knockback moves four34 steps, not170, and stops on target widget death',()=>{
 const f=fixture(['A1PJ']),x=f.t.worldX;f.event();f.at(10.16);near(f.t.worldX,x+136/300);assert.equal(f.g.state.sourceSkillJobs.length,0);
 const z=fixture(['A1PJ']);z.event();z.t.hp=0;sourceDeath(z.g,z.t,z.a);z.at(11);near(z.t.worldX,z.p.x+.3);assert.equal(z.g.state.sourceSkillJobs.length,0);
});
test('lethal35 has no knockback and additional damage precedes original weapon damage',()=>{
 const f=fixture(['A1PJ']);f.t.hp=30;f.event();assert.ok(f.t.hp<=0);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='musketeer_push').length,0);
 const z=fixture(['A1PJ']);near(z.g._hurt(z.t,100,z.a,{attackType:'chaos'}),100);near(z.t.hp,9865);assert.equal(z.a.status.musketeerMagazineCount,1);
});
test('main damage auto orders source first even for spell damage; failed source does not fall back',()=>{
 const f=fixture(['A1PG','A1PH']);skills(f.t,['A1PG','A1PH']);beforeSourceDamage(f.g,f.t,1,f.a,{spell:true});assert.equal(f.a.skillStates.A1PG.casts,1);assert.equal(f.a.skillStates.A1PH.casts,1);assert.equal(f.t.skillStates.A1PG.casts,0);near(f.a.mana,973);
 const z=fixture(['A1PG']);skills(z.t,['A1PG']);z.a.mana=0;beforeSourceDamage(z.g,z.t,1,z.a);assert.equal(z.t.skillStates.A1PG.casts,0);assert.equal(z.a.status.musketeerOrderA1PG.outcome,'failed');
});
test('receiver auto-casts only if attacker lacks ability; main-event guards retain independent ammo',()=>{
 const f=fixture([]);skills(f.t,['A1PG']);beforeSourceDamage(f.g,f.t,1,f.a);assert.equal(f.t.skillStates.A1PG.casts,1);
 for(const mode of ['zero','ally','suppressed','A2Y7']){const z=fixture(['A1PG','A1PJ',...(mode==='A2Y7'?['A2Y7']:[])]);if(mode==='ally')z.t.side=z.a.side;if(mode==='suppressed')z.g._sourceDamageTriggerDepth=1;beforeSourceDamage(z.g,z.t,mode==='zero'?0:1,z.a);assert.equal(z.a.skillStates.A1PG.casts,0,mode);z.event();assert.equal(z.a.status.musketeerMagazineCount,1);}
});
test('grenades draw radius then angle and require userData after the first two draws',()=>{
 const f=fixture(['A1PH']);let n=0;f.a.userData=0;f.g._random=()=>{n++;return .5;};const r=musketeerGrenades(f.g,f.a,f.p);assert.equal(n,2);assert.equal(r.attempts,1);assert.equal(r.rejected,'missing-user-data');assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('grenade rejection is capped at40 attempts while caster outside rectangle accepts all4',()=>{
 const f=fixture(['A1PH']);f.g._random=()=>.999;let r=musketeerGrenades(f.g,f.a,{x:f.p.x+30,y:f.p.y});assert.equal(r.attempts,40);assert.equal(r.points.length,0);f.a.worldX+=30;r=musketeerGrenades(f.g,f.a,{x:f.p.x+30,y:f.p.y});assert.equal(r.attempts,4);assert.equal(r.points.length,4);
});
test('landing at0.2 uses300 range137 nonweapon and does not spend magazine rounds',()=>{
 const f=fixture(['A1PH','A1PJ']);f.g._random=()=>0;ok(f.cast('A1PH',f.p));f.at(10.19);near(f.t.hp,10000);f.at(10.2);near(f.t.hp,9452);assert.equal(f.a.status.musketeerMagazineCount,undefined);assert.equal(f.g.state.sourceSkillJobs.length,0);near(f.a.worldX,f.p.x);
});
test('landing detection filters alive Avul but DamageAoe second enumeration is enemy-only',()=>{
 const f=fixture(['A1PH']),inv=f.make(.4);skills(inv,['Avul']);const dead=f.make(.5);dead.hp=0;const j={type:'musketeer_mine',sourceId:f.a.id,source:f.a,x:f.p.x,y:f.p.y,stage:'flight',nextAt:10};const calls=[];
 assert.equal(tickMusketeerJob(f.g,j,{nativeDamage:(g,t,n,s,o)=>calls.push([t.id,n,o.weapon])}),false);assert.deepEqual(calls,[[f.t.id,137,false],[inv.id,137,false],[dead.id,137,false]]);
});
test('armed mine triggers on200 entry and damages all enemies within300 including air and king',()=>{
 const f=fixture(['A1PH']);f.t.worldX=f.p.x+2;f.g._random=()=>0;musketeerGrenades(f.g,f.a,f.p);f.at(10.2);f.a.mana=0;assert.equal(f.g.state.sourceSkillJobs.every(j=>j.stage==='armed'),true);const outer=f.make(.9),outside=f.make(1.001);outer.targetType='air';const k=f.g.state.kings[0];k.side='monster';k.hp=k.maxHp=10000;k.worldX=f.p.x+.8;k.worldY=f.p.y;f.t.worldX=f.p.x+200/300;f.at(10.3);for(const e of [f.t,outer,k])near(e.hp,9452);near(outside.hp,10000);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('range detonation is weapon damage and each victim consumes its own magazine round',()=>{
 const f=fixture(['A1PH','A1PJ']);f.t.worldX=f.p.x+2;f.g._random=()=>0;musketeerGrenades(f.g,f.a,f.p);f.at(10.2);f.g.state.sourceSkillJobs=f.g.state.sourceSkillJobs.slice(0,1);f.t.worldX=f.p.x+.3;const b=f.make(.8);f.at(10.3);near(f.t.hp,9828);near(b.hp,9828);assert.equal(f.a.status.musketeerMagazineCount,2);
});
test('six-second timeout and caster death clean armed mines without137 damage',()=>{
 for(const mode of ['timeout','death']){const f=fixture(['A1PH']);f.t.worldX=f.p.x+2;f.g._random=()=>0;musketeerGrenades(f.g,f.a,f.p);f.at(10.2);f.t.worldX=f.p.x+.9;if(mode==='death'){f.a.hp=0;sourceDeath(f.g,f.a,f.t);f.at(10.3);}else f.at(16.2);near(f.t.hp,10000);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(f.a.status.musketeerMineEnd.damage,0);}
});
test('caster death before landing does not destroy unregistered flight timer',()=>{
 const f=fixture(['A1PH']);f.g._random=()=>0;musketeerGrenades(f.g,f.a,f.p);f.a.hp=0;sourceDeath(f.g,f.a,f.t);f.at(10.2);near(f.t.hp,9452);
});
test('owner reincarnation widget death removes armed mines and does not restart them',()=>{
 const f=fixture(['A1PH','A14E']);f.t.worldX=f.p.x+2;f.g._random=()=>0;musketeerGrenades(f.g,f.a,f.p);f.at(10.2);f.a.hp=1;f.g._hurt(f.a,999,f.t,{spell:true,universal:true});assert.equal(f.a.status.reincarnation.phase,'waiting');f.at(12.3);assert.ok(f.a.hp>0);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='musketeer_mine').length,0);
});
test('real three building templates carryPK notPH, so no free mines are invented',()=>{
 for(const code of ['n07R','h2A7','n07S']){const f=fixture(['A1PH']);initializeSourceClassCombat(f.g,{unitId:'v14_'+code},f.a);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(f.a.status.musketeerDeploymentChecked.registered,false);}
 const f=fixture(['A1PH']);initializeSourceClassCombat(f.g,{unitId:'custom',abilityIds:['A1PH']},f.a);assert.equal(f.g.state.sourceSkillJobs.length,4);initializeSourceClassCombat(f.g,{unitId:'custom',abilityIds:['A1PH']},f.a);assert.equal(f.g.state.sourceSkillJobs.length,4);near(f.a.mana,1000);
});
test('saved shots mines counters and removed ability continue deterministically',()=>{
 const f=fixture(['A1PG','A1PH','A1PJ']);f.g._random=()=>0;ok(f.cast('A1PG'));musketeerGrenades(f.g,f.a,{x:f.p.x-2,y:f.p.y});f.event();f.at(10.04);
 const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);for(const j of g.state.sourceSkillJobs.filter(j=>j.sourceId===a.id))assert.equal(j.source,a);
 g._random=f.g._random;g.state.time=10.4;tickSourceScriptJobs(g);f.at(10.4);assert.deepEqual(g.state.entities.map(e=>[e.hp,e.worldX,e.worldY,e.status.musketeerMagazineCount]),f.g.state.entities.map(e=>[e.hp,e.worldX,e.worldY,e.status.musketeerMagazineCount]));
 for(let n=a.status.musketeerMagazineCount??0;n<15;n++)sourceClassAttackDamageEvent(g,g.state.entities[1],a,{},1);const restored=Game.fromSnapshot(clone(g.snapshot())).state.entities.find(e=>e.id===a.id);assert.equal(has(restored,'A1PJ'),false);assert.equal(restored.status.musketeerMagazineCount,15);
});
test('retained dead-source jobs share one restored handle and new rounds reset independent counters',()=>{
 const f=fixture(['A1PH']);f.t.worldX+=10;f.g._random=()=>0;musketeerGrenades(f.g,f.a,f.p);f.a.hp=0;sourceDeath(f.g,f.a,f.t);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);const g=Game.fromSnapshot(clone(f.g.snapshot()));assert.equal(g.state.sourceSkillJobs[0].source,g.state.sourceSkillJobs[1].source);ok(g.command('sandboxReset'));assert.equal(g.state.sourceSkillJobs.length,0);
});
test('actual upgrade and combat expose both commands with true combat form and no opening mines',()=>{
 const g=new Game({mode:'sandbox',builderId:'v14_builder_u000',seed:52}),p=g.state.players[0];p.roster=['v14_h00Y'];p.entitlements.h210=1;p.technologies.R0DU=1;ok(g.command('build',{unitId:'v14_h00Y',col:2,row:2}));ok(g.command('sandboxComplete'));const b=p.buildings[0],gold=p.gold;ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_n07R'}));near(p.gold,gold-375);ok(g.command('sandboxComplete'));ok(g.command('ready'));const a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(a.combatRawcode,'h0VG');assert.deepEqual(g.unitSkillStatus(a.id).map(s=>s.id),['A1PG','A1PH']);assert.equal(a.status.musketeerDeploymentChecked.registered,false);assert.equal(g.state.sourceSkillJobs.filter(j=>j.type==='musketeer_mine').length,0);
});
test('removed handles and old saves do not fabricate past grenades or attack counts',()=>{
 const f=fixture(['A1PH']);f.g._random=()=>0;musketeerGrenades(f.g,f.a,f.p);f.a.status.sourceRemoved=true;f.at(11);near(f.t.hp,10000);assert.equal(f.g.state.sourceSkillJobs.length,0);
 const z=fixture(['A1PG','A1PJ']);z.a.skillImplementationRevision='old';const g=Game.fromSnapshot(clone(z.g.snapshot()));assert.equal(g.state.sourceSkillJobs.length,0);assert.equal(g.state.entities[0].status.musketeerMagazineCount,undefined);
});
test('coverage keeps native boundaries partial and separates two inert descriptions',()=>{
 for(const c of ['n07R','h2A7','n07S']){const u=UNITS.find(u=>u.sourceRawcode===c),ss=compileSkills(u);for(const id of ['A1PG','A1PH','A1PJ'])assert.equal(ss.find(s=>s.id===id).status,'partial');assert.equal(ss.find(s=>s.id==='A1PI').status,'marker');const pk=compileSkills({...u,abilityIds:['A1PK']})[0];assert.equal(pk.status,'marker');assert.match(pk.effectText,/不会/);}
});
