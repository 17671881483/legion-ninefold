import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,sourceClassAttackDamageEvent,initializeSourceClassCombat,sourceAuraEffects,tickSourceScriptJobs,tirionBondDamageEvent} from '../dist/skills.js';
import {recordEggCompletion} from '../dist/egg-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),clone=x=>JSON.parse(JSON.stringify(x));
const skills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));};
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id),ok=r=>assert.equal(r.ok,true,r.message);
function fixture(){
 const g=new Game({mode:'sandbox',seed:45});g.state.entities=[];g.state.sourceSkillJobs=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;const p=laneToWorld(0,3,6);
 const make=(side='monster',ids=[],raw='h03E',dx=.2)=>{const e=g._entity(UNIT_TEMPLATES[raw],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=1000;e.mana=e.maxMana=100;e.damage=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;skills(e,ids);g.state.entities.push(e);return e;};
 const a=make('defender',['A0LH'],'h0M1',0),t=make();
 const at=time=>{g.state.time=time;tickSourceScriptJobs(g);},event=(amount=100,options={weapon:true})=>sourceClassAttackDamageEvent(g,t,a,options,amount);
 return{g,a,t,make,at,event};
}
test('source pins exact attack/death ordering, history unlock, both deployment paths and early enable',()=>{
 const e=JSON.parse(readFileSync(new URL('../reference/tirion-evidence.json',import.meta.url))),bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=bytes.toString('latin1').split('\n');assert.equal(createHash('sha256').update(bytes).digest('hex'),e.source.sha256);for(const r of e.sourceEvidence)assert.equal(lines[r.line-1].replace(/\r$/,''),r.text);assert.equal(e.abilities.A0LQ.DataA1,'15.0');assert.equal(e.abilities.A0LO.DataA1,undefined);assert.equal(e.abilities.A0LR.DataA1,undefined);const burn=compileSkills({abilityIds:['A0LG'],skillVersion:'v14.1A5'})[0];assert.equal(burn.kind,'immolation');assert.equal(burn.status,'partial');near(burn.dps,15);
});
test('ashbringer adds150 plus15percent maximum, ignoring currentHP/armor/magicimmunity',()=>{
 const f=fixture();f.t.hp=700;f.t.armor=100;skills(f.t,['Amim']);f.event();near(f.t.hp,400);near(f.a.status.tirionAshbringer.damage,300);f.t.maxHp=2000;f.t.hp=2000;f.event();near(f.t.hp,1550);
});
test('realweapon damage includes basehit once and nested extra doesnot recursively proc',()=>{
 const f=fixture();f.g._hurt(f.t,100,f.a,{weapon:true});near(f.t.hp,600);assert.equal(f.g.state.events.filter(e=>e.skillId==='A0LH'&&e.type==='cast').length,1);assert.equal(f.a.status.sourceNativeAttackBusy,false);
});
test('ordinary spells, zero level, old version and busy listener do not proc',()=>{
 for(const mode of ['spell','level0','old','busy']){const f=fixture();if(mode==='level0')f.a.abilityLevels={A0LH:0};if(mode==='old'){f.a.skillVersion='5.0dJF';f.a.sourceVersion='5.0dJF';delete f.a.provenance;}if(mode==='busy')f.a.status.sourceNativeAttackBusy=true;f.event(100,mode==='spell'?{spell:true}:{weapon:true});near(f.t.hp,1000);}
});
test('source doesnot requirepositive damage, hostility, life or absence ofA2Y7',()=>{
 for(const mode of ['zero','ally','self','dead','A2Y7']){const f=fixture();if(mode==='ally')f.t.side=f.a.side;if(mode==='self')f.t=f.a;if(mode==='dead')f.a.hp=0;if(mode==='A2Y7')skills(f.a,['A0LH','A2Y7']);sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},mode==='zero'?0:100);near(f.t.hp,700,mode);}
});
test('nativeinvulnerability and sharedboolean2 suppress actualbonus',()=>{
 const f=fixture();skills(f.t,['Avul']);f.event();near(f.t.hp,1000);const x=fixture();x.a.status.sourceHashtableBoolean2=true;x.event();assert.equal(x.a.status.tirionAshbringer,undefined);
});
test('earlier deterministicelseif branches suppress ash even when their proc fails',()=>{
 for(const [id,level]of[['A0P0',1],['A0PV',1],['A0N5',1],['A0TA',1],['A0SU',1]]){const f=fixture();skills(f.a,['A0LH',id]);f.a.abilityLevels={[id]:level};f.event();assert.equal(f.a.status.tirionAshbringer,undefined,id);}
 for(const raw of ['h0BR','h088','h0SI']){const f=fixture();f.a.combatRawcode=raw;f.event();assert.equal(f.a.status.tirionAshbringer,undefined,raw);}
});
test('mana selection is beforemutation and taurenprefix probability draws onlyonce',()=>{
 const f=fixture();skills(f.a,['A0LH','A0IN']);f.a.mana=14;f.event();near(f.a.mana,15);near(f.t.hp,1000);f.event();near(f.t.hp,700);
 const x=fixture();skills(x.a,['A0LH','A0JV','A0N5']);let draws=0;x.g._random=()=>{draws++;return .99;};x.event();assert.equal(draws,1);assert.equal(x.a.status.tirionAttackSkipped,'A0JV');
});
test('randomprefix failfalls through and ConvertUnitState21 is not guessed frombaseattack',()=>{
 const f=fixture();skills(f.a,['A0LH','A0TH']);f.g._random=()=>0;f.event();near(f.t.hp,700);const x=fixture();skills(x.a,['A0LH','A05R']);x.a.sourceRawFields.dmgplus1='1';x.event();assert.equal(x.a.status.tirionAttackSkipped,'A05R-native-base-unresolved');x.a.sourceNativeState21=101;x.event();near(x.t.hp,700);
});
test('any terminalkill heals18percent killermax and caps atmaximum',()=>{
 const f=fixture();f.a.hp=100;f.t.hp=1;f.g._hurt(f.t,2,f.a,{spell:true,universal:true});near(f.a.hp,280);near(f.a.status.tirionKillHeal.requested,180);const t=f.make();t.hp=1;f.a.hp=950;f.g._hurt(t,2,f.a,{spell:true});near(f.a.hp,1000);
});
test('earlierdeath prototypes andA0SF takepriority; independent main deathguard doesnot block',()=>{
 for(const raw of ['H08U','h0AX','h0AS','h0AP','h039','h038']){const f=fixture();f.t.combatRawcode=raw;f.t.hp=1;f.a.hp=100;f.g._hurt(f.t,2,f.a,{spell:true});near(f.a.hp,100,raw);}
 const f=fixture();skills(f.t,['A0SF']);f.t.hp=1;f.a.hp=100;f.g._hurt(f.t,2,f.a,{spell:true});near(f.a.hp,100);
 const x=fixture();x.g._sourceUnitDeathTriggerDepth=1;x.t.hp=1;x.a.hp=100;x.g._hurt(x.t,2,x.a,{spell:true});near(x.a.hp,280);
});
test('ash killbranch skips laterA0SBexplosion and h0CZabsorption, leaving other death listeners',()=>{
 const f=fixture();f.a.combatRawcode='h0CZ';f.a.hp=100;skills(f.t,['A0SB']);f.t.hp=1;const friend=f.make('defender');f.g._hurt(f.t,2,f.a,{spell:true});near(f.a.hp,280);near(friend.hp,1000);
 const x=fixture();x.a.hp=100;skills(x.t,['A20D']);x.t.hp=1;x.g._hurt(x.t,2,x.a,{spell:true});assert.equal(x.g.state.events.some(e=>e.skillId==='A20D'),true);
});
test('death registration respects nativeowner and excludesbuilding owners; no deadkiller resurrection',()=>{
 for(const owner of [0,7,13]){const f=fixture();f.t.sourceNativeOwnerId=owner;f.t.hp=1;f.a.hp=100;f.g._hurt(f.t,2,f.a,{spell:true});near(f.a.hp,100);}
 const f=fixture();f.a.hp=0;f.t.hp=1;f.g._hurt(f.t,2,f.a,{spell:true});near(f.a.hp,0);
});
test('reincarnation wait doesnot countaskill, terminaldeathlater heals once',()=>{
 const f=fixture();skills(f.t,['A14E']);f.a.hp=100;f.g._hurt(f.t,2000,f.a,{spell:true});near(f.a.hp,100);assert.equal(f.t.status.reincarnation.phase,'waiting');f.at(12);f.g._hurt(f.t,2000,f.a,{spell:true});near(f.a.hp,280);f.g._settleDeath(f.t,f.a);near(f.a.hp,280);
});
test('exactraw completion history grantsR01Y acrosssales andsave; skin doesnot substitute',()=>{
 const f=fixture(),p=f.g.state.players[0],unit=id=>UNITS.find(u=>u.sourceRawcode===id);p.buildings=[];p.technologies={};recordEggCompletion(p,unit('h0VU'));recordEggCompletion(p,unit('h203'));assert.equal(p.technologies.R01Y,undefined);recordEggCompletion(p,unit('h0M2'));assert.equal(p.technologies.R01Y,1);const g=Game.fromSnapshot(clone(f.g.snapshot()));assert.equal(g.state.players[0].technologies.R01Y,1);assert.equal(g.state.players[1].technologies.R01Y,undefined);
});
test('newdeployment grantsarmor orTaiLan branch frombuilding not combatname, once',()=>{
 for(const [building,code,ids,want]of[['h0M2','h0M1',['A0LP'],['A0LO','A0LQ']],['h0VU','h0VT',['A0LP'],['A0LO','A0LQ']],['h203','n203',['Af01'],['A0LR']]]){const f=fixture();f.a.combatRawcode=code;skills(f.a,ids);f.g.state.players[0].technologies.R01Y=1;initializeSourceClassCombat(f.g,{unitId:'v14_'+building},f.a);initializeSourceClassCombat(f.g,{unitId:'v14_'+building},f.a);for(const id of want)assert.equal(f.a.skillSpecs.filter(s=>s.id===id).length,1);if(want.includes('A0LQ'))near(sourceAuraEffects(f.g,f.a,[]).armor,15);assert.equal(f.a.skillSpecs.find(s=>s.id==='A0LO')?.haste,undefined);}
});
test('no latebackfill, wrongtechlevel, absentbuilding marker and ability0 do not grant',()=>{
 for(const mode of ['zero','two','nomarker','level0','summon']){const f=fixture();f.g.state.players[0].technologies.R01Y=mode==='two'?2:mode==='zero'?0:1;const b=mode==='summon'?null:{unitId:mode==='nomarker'?'v14_h09O':'v14_h0M2',...(mode==='level0'?{abilityLevels:{A0LP:0}}:{})};initializeSourceClassCombat(f.g,b,f.a);assert.equal(has(f.a,'A0LQ'),false);assert.equal(has(f.a,'A0LR'),false);}
});
test('T4 requiresatleastoneA0LR, not just Af01; own35percent andtargetonly15percent',()=>{
 for(const [own,other,roll,want]of[[false,false,0,false],[true,false,.35,true],[true,false,.35001,false],[false,true,.15,true],[false,true,.15001,false]]){const f=fixture();skills(f.a,['Af01',...(own?['A0LR']:[])]);skills(f.t,other?['A0LR']:[]);f.a.maxHp=3000;f.a.hp=1000;let n=0;f.g._random=()=>other&&n++===0?.99:roll;tirionBondDamageEvent(f.g,f.t,f.a,10);near(f.t.hp,want?800:1000);near(f.a.hp,want?2000:1000);}
});
test('T4 attack proc accepts spellinput butits200 isweaponflagged spellsnormal damage',()=>{
 const f=fixture();skills(f.a,['Af01','A0LR','A0LH']);f.g._random=()=>0;f.g._hurt(f.t,1,f.a,{spell:true,universal:true});near(f.t.hp,499);assert.equal(f.a.status.tirionAshbringer.damage,300);assert.equal(f.a.status.tirionBondAttack.threshold,35);
});
test('defense refunds beforedamage, so fullHPdoesnot immune hit; threshold uses postheal',()=>{
 const f=fixture();skills(f.t,['A0LR']);skills(f.a,[]);f.g._random=()=>0;f.g._hurt(f.t,100,f.a,{spell:true});near(f.t.hp,900);assert.equal(f.g.state.sourceSkillJobs.length,1);
 const x=fixture();skills(x.t,['A0LR']);skills(x.a,[]);x.t.maxHp=3000;x.t.hp=950;x.g._random=()=>0;x.g._hurt(x.t,100,x.a,{spell:true});near(x.t.hp,950);assert.equal(x.g.state.sourceSkillJobs.length,0);
});
test('defense integer3/4 boundary and no lowlife timer onfailedroll',()=>{
 for(const [roll,success]of [[.29999,true],[.3,false]]){const f=fixture();skills(f.t,['A0LR']);skills(f.a,[]);f.t.maxHp=3000;f.t.hp=500;f.g._random=()=>roll;f.g._hurt(f.t,100,f.a,{spell:true});near(f.t.hp,success?500:400);assert.equal(f.g.state.sourceSkillJobs.length,success?1:0);}
});
test('3sec heal doesnot require staying low, no invented1sec cooldown, repeatedhits do notduplicate',()=>{
 const f=fixture();skills(f.t,['A0LR']);skills(f.a,[]);f.t.maxHp=3000;f.t.hp=500;f.g._random=()=>0;for(let i=0;i<3;i++)f.g._hurt(f.t,100,f.a,{spell:true});assert.equal(f.g.state.sourceSkillJobs.length,1);f.t.hp=1200;f.at(12.999);near(f.t.hp,1200);f.at(13);near(f.t.hp,2200);assert.equal(f.t.status.sourceHashtableBoolean1,false);f.t.hp=500;f.g._hurt(f.t,100,f.a,{spell:true});assert.equal(f.g.state.sourceSkillJobs[0].at,16);
});
test('delayedheal save rebinds livebody; deadandremoved noresurrect or recreation',()=>{
 const f=fixture();skills(f.t,['A0LR']);skills(f.a,[]);f.t.maxHp=3000;f.t.hp=500;f.g._random=()=>0;f.g._hurt(f.t,100,f.a,{spell:true});const g=Game.fromSnapshot(clone(f.g.snapshot())),t=g.state.entities.find(e=>e.id===f.t.id);assert.equal(g.state.sourceSkillJobs[0].source,t);g.state.time=13;tickSourceScriptJobs(g);near(t.hp,1500);
 for(const removed of [false,true]){const x=fixture();skills(x.t,['A0LR']);skills(x.a,[]);x.t.hp=500;x.g._random=()=>0;tirionBondDamageEvent(x.g,x.t,x.a,10);x.t.hp=0;x.t.status.sourceRemoved=removed;x.g.state.entities=x.g.state.entities.filter(e=>e!==x.t);x.at(13);near(x.t.hp,0);assert.equal(x.g.state.sourceSkillJobs.length,0);assert.equal(x.t.status.sourceHashtableBoolean1,false);}
});
test('earlyEnable permitsnested T4 event while faileddefensekeeps itdisabled',()=>{
 const f=fixture();skills(f.t,['A0LR']);skills(f.a,['Af01','A0LR']);const draws=[0,0,.99,.99];f.g._random=()=>{assert.ok(draws.length);return draws.shift();};tirionBondDamageEvent(f.g,f.t,f.a,1);assert.equal(draws.length,0);near(f.t.hp,800);assert.equal(f.g._tirionBondTriggerDisabled,false);
 const x=fixture();skills(x.t,['A0LR']);skills(x.a,['Af01','A0LR']);let n=0;x.g._random=()=>++n===1?.99:0;tirionBondDamageEvent(x.g,x.t,x.a,1);assert.equal(n,2);near(x.t.hp,800);
});
test('realordinary andarena deployments preservehistory bond, skin upgrade andsave',()=>{
 const g=new Game({mode:'sandbox',seed:45}),p=g.state.players[0];g._aiAct=()=>{};p.buildings=[];
 const complete=code=>{const u=UNITS.find(u=>u.sourceRawcode===code),b={id:g._uid('b'),unitId:u.id,col:p.buildings.length,row:1,construction:{targetId:u.id}};p.buildings.push(b);g._completeConstruction(p,b);return b;};
 const a=complete('h0M2'),b=complete('h203');ok(g.command('ready'));for(const raw of ['h0M1','n203'])assert.ok(g.state.entities.find(e=>e.combatRawcode===raw).status.tirionBondDeployment);g._startArena();assert.ok(g.state.entities.find(e=>e.buildingId===a.id).skillSpecs.some(s=>s.id==='A0LQ'));assert.ok(g.state.entities.find(e=>e.buildingId===b.id).skillSpecs.some(s=>s.id==='A0LR'));const saved=Game.fromSnapshot(clone(g.snapshot()));assert.ok(saved.state.entities.some(e=>has(e,'A0LQ')));
});
