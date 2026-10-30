import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,initializeSourceClassCombat,tickSourceScriptJobs,sourceClassAttackDamageEvent,sourceAttackIssued,sourceBarrageTargets,sourceWeapon} from '../dist/skills.js';
import {BRONZE_ATTACK_REGISTRY} from '../dist/bronze-dragon-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`),clone=x=>JSON.parse(JSON.stringify(x));
const skills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));};
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id),ok=r=>assert.equal(r.ok,true,r.message);
function fixture(building='h0QP'){
 const g=new Game({mode:'sandbox',seed:41});g.state.entities=[];g.state.sourceSkillJobs=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;const p=laneToWorld(0,3,6);
 const make=(dx=.2,side='monster',raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=1000;e.mana=e.maxMana=100;e.damage=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender',building==='h0QO'?'h0QQ':'h0QR'),t=make();a.sourceRawFields={...a.sourceRawFields,damage_min_1:'90',damage_max_1:'110',damage_avg_1:'100'};
 if(building)initializeSourceClassCombat(g,{unitId:'v14_'+building},a);
 const at=time=>{g.state.time=time;tickSourceScriptJobs(g);},event=(amount=100,options={weapon:true})=>sourceClassAttackDamageEvent(g,t,a,options,amount);
 return{g,a,t,make,at,event};
}
test('source pins building branches, history index, damage local, attack registry and object fields',()=>{
 const e=JSON.parse(readFileSync(new URL('../reference/bronze-dragon-evidence.json',import.meta.url))),bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=bytes.toString('latin1').split('\n');assert.equal(createHash('sha256').update(bytes).digest('hex'),e.source.sha256);for(const r of e.sourceEvidence)assert.equal(lines[r.line-1].replace(/\r$/,''),r.text);assert.deepEqual([...BRONZE_ATTACK_REGISTRY],e.attackRegistry);assert.equal(e.abilities.A150.DataC1,'3');assert.equal(e.abilities.A150.Area1,'500.0');assert.equal(e.abilities.A0I7.Dur1,'1.0');assert.equal(e.abilities.A0I7.HeroDur1,'0.5');
});
test('building abilities select5/4s despite combat abilities being crossed; no summon auto-registration',()=>{
 for(const[building,code,id,period]of[['h0QO','h0QQ','A14Y',5],['h0QP','h0QR','A14Z',4]]){const f=fixture(building);assert.equal(f.a.combatRawcode,code);assert.equal(f.g.state.sourceSkillJobs[0].abilityId,id);assert.equal(f.g.state.sourceSkillJobs[0].period,period);initializeSourceClassCombat(f.g,{unitId:'v14_'+building},f.a);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='bronze_fissure').length,1);}
 const f=fixture(null);skills(f.a,['A14Y','A14Z']);initializeSourceClassCombat(f.g,null,f.a);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('A14Y wins when both building abilities exist and level0 does not register',()=>{
 const f=fixture(null);initializeSourceClassCombat(f.g,{unitId:'custom',abilityIds:['A14Z','A14Y']},f.a);assert.equal(f.g.state.sourceSkillJobs[0].period,5);const z=fixture(null);initializeSourceClassCombat(z.g,{unitId:'v14_h0QO',abilityLevels:{A14Y:0}},z.a);assert.equal(z.g.state.sourceSkillJobs.length,0);
});
test('five-second cycle restores sample atsecond2, not rolling2seconds ago and can lower life',()=>{
 const f=fixture('h0QO');for(const[n,hp]of[[1,500],[2,400],[3,100],[4,900]]){f.a.hp=hp;f.at(10+n);}assert.equal(has(f.a,'A150'),false);f.at(15);near(f.a.hp,400);assert.equal(has(f.a,'A150'),true);assert.equal(f.a.status.bronzeRewind.percent,40);
});
test('four-second cycle applies saved percentage to current maximum and repeats',()=>{
 const f=fixture();f.a.hp=700;f.at(11);f.a.hp=400;f.at(12);f.a.hp=200;f.at(13);f.a.maxHp=2000;f.at(14);near(f.a.hp,800);f.a.hp=1000;f.at(15);f.a.hp=500;f.at(16);f.a.hp=100;f.at(17);f.at(18);near(f.a.hp,500);
});
test('registered timer survives marker removal and regrant does not reset attack count',()=>{
 const f=fixture();skills(f.a,[]);f.a.status.bronzeAttackCount=1;for(let n=11;n<=18;n++)f.at(n);assert.equal(has(f.a,'A150'),true);assert.equal(f.a.status.bronzeAttackCount,1);assert.equal(f.g.state.sourceSkillJobs.length,1);
});
test('death outside rewind tick records then destroys timer without revival',()=>{
 const f=fixture();f.a.hp=0;f.at(11);near(f.a.hp,0);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(has(f.a,'A150'),false);
});
test('death on rewind tick still requests write and grantsA150 before stopping',()=>{
 const f=fixture();f.a.hp=600;f.at(11);f.at(12);f.at(13);f.a.hp=0;f.g.state.entities=f.g.state.entities.filter(e=>e.id!==f.a.id);f.at(14);near(f.a.hp,0);assert.equal(f.a.status.bronzeRewind.requested,600);assert.equal(f.a.status.bronzeRewind.deadHandleUnresolved,true);assert.equal(has(f.a,'A150'),true);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('removed handles stop at next callback; missing historical sample does not become free healing',()=>{
 const f=fixture();f.a.status.sourceRemoved=true;f.a.hp=0;f.at(11);assert.equal(f.g.state.sourceSkillJobs.length,0);const z=fixture();const j=z.g.state.sourceSkillJobs[0];j.phase=3;z.at(11);near(z.a.hp,0);assert.equal(z.a.status.deathCounted,true);assert.equal(z.g.state.sourceSkillJobs.length,0);
});
test('save restoration binds timer to live body and keeps exact history and phase',()=>{
 const f=fixture();f.a.hp=700;f.at(11);f.a.hp=350;f.at(12);const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);assert.equal(g.state.sourceSkillJobs[0].source,a);a.hp=f.a.hp=200;f.at(13);g.state.time=13;tickSourceScriptJobs(g);a.maxHp=f.a.maxHp=2000;f.at(14);g.state.time=14;tickSourceScriptJobs(g);near(a.hp,700);assert.deepEqual(a.status.bronzeRewind,f.a.status.bronzeRewind);
});
test('old save with no source timer does not invent unavailable health history',()=>{
 const f=fixture();f.g.state.sourceSkillJobs=[];delete f.a.status.bronzeFissureRegistered;const g=Game.fromSnapshot(clone(f.g.snapshot()));g.state.time=20;tickSourceScriptJobs(g);assert.equal(g.state.sourceSkillJobs.filter(j=>j.type==='bronze_fissure').length,0);
});
test('A150 persists against unregistered units and is removed on second eligible attack start',()=>{
 const f=fixture();skills(f.a,['A150']);for(let i=0;i<3;i++)sourceAttackIssued(f.g,f.a,f.t);assert.equal(has(f.a,'A150'),true);assert.equal(f.a.status.bronzeAttackCount,undefined);f.t.combatRawcode='h0Q2';sourceAttackIssued(f.g,f.a,f.t);assert.equal(f.a.status.bronzeAttackCount,1);assert.equal(has(f.a,'A150'),true);sourceAttackIssued(f.g,f.a,f.t);assert.equal(f.a.status.bronzeAttackCount,0);assert.equal(has(f.a,'A150'),false);
});
test('registered target ownership and earlier branches gate removal counter',()=>{
 for(const mode of ['owner7','building','targetEntangle','frostNova','hydra','poisonPrior']){const f=fixture();skills(f.a,['A150']);f.t.combatRawcode='h0Q2';if(mode==='owner7')f.t.sourceNativeOwnerId=7;if(mode==='building')f.t.isBuilding=true;if(mode==='targetEntangle')f.t.combatRawcode='h02Y';if(mode==='frostNova')f.t.combatRawcode='n00K';if(mode==='hydra')skills(f.a,['A150','A0TB']);if(mode==='poisonPrior')skills(f.a,['A150','A06O']);sourceAttackIssued(f.g,f.a,f.t);assert.equal(f.a.status.bronzeAttackCount,undefined,mode);}
 const f=fixture();skills(f.a,['A150']);f.a.mana=19;f.t.combatRawcode='n00K';f.t.sourceNativeOwnerId=12;sourceAttackIssued(f.g,f.a,f.t);assert.equal(f.a.status.bronzeAttackCount,1);
});
test('interrupted windup still consumes attack start while direct weapon damage never does',()=>{
 const f=fixture();skills(f.a,['A150']);f.t.combatRawcode='h0Q2';f.g._beginMonsterAttack(f.a,f.t,f.g.state.entities);assert.equal(f.a.status.bronzeAttackCount,1);f.a.pendingAttack=null;f.event();assert.equal(f.a.status.bronzeAttackCount,1);f.g._beginMonsterAttack(f.a,f.t,f.g.state.entities);assert.equal(has(f.a,'A150'),false);
});
test('stasis usesinclusive20percent and normal1s hero0.5s stun with1.5s animation request',()=>{
 for(const[roll,hero,hit]of[[.2,false,true],[.2,true,true],[.20001,false,false]]){const f=fixture();skills(f.a,['A151']);f.t.isNativeHero=hero;f.g._random=()=>roll;f.event();if(hit){near(f.t.status.stunUntil,10+(hero?.5:1));near(f.t.status.sourceAnimationFrozenUntil,11.5);}else assert.equal(f.t.status.stunUntil,undefined);}
});
test('mechanical andmagicimmune targets keepanimation request without adapted stun',()=>{
 for(const mode of ['mechanical','immune']){const f=fixture();skills(f.a,['A151']);if(mode==='mechanical')f.t.traits=['mechanical'];else skills(f.t,['Amim']);f.g._random=()=>0;f.event();near(f.t.status.sourceAnimationFrozenUntil,11.5);assert.equal(f.t.status.stunUntil,undefined);}
});
test('independent damage gate skips ordinaryspell and busy listener but permitszero friendly self dead-source events',()=>{
 for(const mode of ['spell','busy','zero','ally','self','dead','A2Y7']){const f=fixture();skills(f.a,['A151',...(mode==='A2Y7'?['A2Y7']:[])]);f.g._random=()=>0;if(mode==='busy')f.a.status.sourceNativeAttackBusy=true;if(mode==='ally')f.t.side=f.a.side;if(mode==='dead')f.a.hp=0;sourceClassAttackDamageEvent(f.g,mode==='self'?f.a:f.t,f.a,mode==='spell'?{spell:true}:{weapon:true},mode==='zero'?0:100);assert.equal(!!f.a.status.bronzeStasis,!['spell','busy'].includes(mode),mode);}
});
test('guardA150 replaces damage by randomattackhalf, not prioramount plusbonus',()=>{
 for(const[roll,expected]of[[0,45],[.5,50],[1,55]]){const f=fixture();skills(f.a,['A150']);f.g._random=()=>roll;near(f.event(999),expected);assert.equal(f.a.status.bronzeDamage.localP8,0);}
 const f=fixture('h0QO');skills(f.a,['A150']);near(f.event(999),999);assert.equal(f.a.status.bronzeDamage,undefined);
});
test('weapon event replacement ignores alreadycomputed armor factor and applies to barrage separately',()=>{
 const f=fixture();skills(f.a,['A150']);f.g._random=()=>.5;f.t.armor=100;f.g._attack(f.a,f.t,f.g.state.entities);near(f.t.hp,950);assert.equal(f.g.state.events.filter(e=>e.type==='projectile').at(-1).text,'50');const b=f.make(.4);f.g._hurt(b,5,f.a,{spell:true,weapon:true,barrage:true});near(b.hp,950);
 for(const mode of ['invulnerable','magicImmune']){const z=fixture();skills(z.a,['A150']);if(mode==='invulnerable')z.t.invulnerable=true;else skills(z.t,['Amim']);near(z.g._hurt(z.t,100,z.a,{magic:mode==='magicImmune',weapon:true}),0);near(z.t.hp,1000);}
});
test('stasis consumes itsdraw before damage sample and primaryweapon bounds include directattack changes',()=>{
 const f=fixture();skills(f.a,['A151','A150']);f.a.damage=120;const draws=[.99,.25];f.g._random=()=>draws.shift();near(f.event(4),57.5);assert.equal(draws.length,0);near(f.a.status.bronzeDamage.min,110);near(f.a.status.bronzeDamage.max,130);
});
test('unknown mixedP8 branches are explicitly retained rather than assumingeventdamage aslocal',()=>{
 for(const ids of [['A150','A16Z'],['A150','A11Y','A11S']]){const f=fixture();skills(f.a,ids);near(f.event(77),77);assert.equal(f.a.status.bronzeDamage.boundary,'unimplemented-prior-P8-branch');}
});
test('missingattackbound fields do not silently coerce tozero',()=>{
 for(const missing of [undefined,'']){const f=fixture();skills(f.a,['A150']);f.a.sourceRawFields.damage_min_1=missing;near(f.event(66),66);assert.equal(f.a.status.bronzeDamage.boundary,'missing-native-attack-bounds');}
});
test('native barrage selectsfour additional enemies500away, suppressescritical andusesmissile only',()=>{
 const f=fixture();skills(f.a,['A150']);for(let i=0;i<6;i++)f.make(.3+i*.1);const weapon=sourceWeapon(f.a,f.t);assert.equal(sourceBarrageTargets(f.a,f.t,f.g.state.entities,weapon).length,4);assert.equal(sourceBarrageTargets(f.a,f.t,f.g.state.entities,weapon,true).length,0);assert.equal(sourceBarrageTargets(f.a,f.t,f.g.state.entities,{...weapon,type:'normal'}).length,0);for(const t of f.g.state.entities.filter(t=>t!==f.a&&t!==f.t))t.worldX=f.a.worldX+500/300+.001;assert.equal(sourceBarrageTargets(f.a,f.t,f.g.state.entities,weapon).length,0);
});
test('realprimary andfour splitarrows each applydamage replacement andstasis draw',()=>{
 const f=fixture();skills(f.a,['A150','A151']);for(let i=0;i<5;i++)f.make(.3+i*.1);let draws=0;f.g._random=()=>{draws++;return .5;};f.g._attack(f.a,f.t,f.g.state.entities);assert.deepEqual(f.g.state.entities.filter(e=>e.side==='monster').map(e=>1000-e.hp),[50,50,50,50,50,0]);assert.equal(draws,10);
});
test('ordinarysandboxbuild upgrade andarena createcorrect timer frompersistentbuilding',()=>{
 const g=new Game({mode:'sandbox',builderId:'v14_builder_u01X',seed:41}),p=g.state.players[0];ok(g.command('build',{unitId:'v14_h0QO',col:1,row:1}));ok(g.command('sandboxComplete'));const b=p.buildings[0];ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_h0QP'}));ok(g.command('sandboxComplete'));ok(g.command('ready'));let a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(a.combatRawcode,'h0QR');assert.equal(a.status.bronzeFissureRegistered.abilityId,'A14Z');assert.equal(g.state.sourceSkillJobs.find(j=>j.sourceId===a.id).period,4);g._startArena();a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(g.state.sourceSkillJobs.filter(j=>j.sourceId===a.id&&j.type==='bronze_fissure').length,1);
});
test('natural ticks andpause preservetimer phase; nextnormaldeployment startsfresh',()=>{
 const f=fixture();f.g.state.paused=true;f.g.tick(1);assert.equal(f.g.state.sourceSkillJobs[0].phase,0);f.g.state.paused=false;for(let i=0;i<41;i++)f.g.tick(.1);assert.equal(has(f.a,'A150'),true);const b=f.make(0,'defender','h0QR');initializeSourceClassCombat(f.g,{unitId:'v14_h0QP'},b);const j=f.g.state.sourceSkillJobs.find(j=>j.sourceId===b.id);assert.equal(j.phase,0);assert.deepEqual(j.history,{});
});
