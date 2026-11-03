import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {recordEggCompletion} from '../dist/egg-rules.js';
import {compileSkills,manualSourceSkills,castManualSourceSkill,initializeSourceClassCombat,tickSourceScriptJobs,beforeSourceDamage,sourceDeath,sourceAuraEffects} from '../dist/skills.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message),clone=x=>JSON.parse(JSON.stringify(x)),has=(e,id)=>e.skillSpecs.some(s=>s.id===id),jobs=g=>g.state.sourceSkillJobs.filter(j=>j.type==='nozdormu_history'&&!j.done);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A154'],code='h0QS'){
 const g=new Game({mode:'sandbox',seed:65});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};g._sourceDamageTriggerDepth=1;for(const p of g.state.players)p.eggHistory.firstWaveClosed=true;for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const make=(dx=.5,side='monster',raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{side,ownerId:side==='defender'?0:4,sourceNativeOwnerId:side==='defender'?8:9,userData:side==='defender'?1:5,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:5+dx,worldY:8});e.hp=e.maxHp=10000;e.mana=e.maxMana=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender',code),t=make();skills(a,ids);
 return {g,a,t,make,cast:(id,point={x:5.5,y:8})=>castManualSourceSkill(g,a,id,{point}),hit:(n=100)=>{g._sourceDamageTriggerDepth=0;return g._hurt(a,n,t,{spell:true,universal:true});},at:n=>{g.state.time=n;tickSourceScriptJobs(g);},register:(ids=['A15A'])=>initializeSourceClassCombat(g,{sourceRawcode:'test',abilityIds:ids},a)};
}
test('source evidence and coverage preserve the missing history and native aura split',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/nozdormu-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.historyRegistrationOccurrences,1);assert.ok(!p.units.n064.abilList.includes('A15A'));assert.ok(!p.units.h0QT.abilList.includes('A157'));assert.equal(p.units.h0QT.movetp,'fly');assert.equal(p.units.h0QT.targType,'ground');
 const c=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url)));for(const id of ['A154','A158','A159','A15A'])assert.equal(c.playerSkills.abilities.find(a=>a.rawcode===id).status,'partial');for(const id of ['A155','A206'])assert.equal(c.playerSkills.abilities.find(a=>a.rawcode===id).status,'marker');
});
test('manual abilities expose breath and rewind but no fabricated jump spell effect',()=>{
 const f=fixture(['A154','A159','A15A']);assert.deepEqual(manualSourceSkills(f.g,f.a).map(s=>[s.id,s.targetKind,s.manaCost,s.cooldown]),[['A159','point',10,11],['A15A','none',5,15]]);assert.equal(f.cast('A154').ok,false);
});
test('jump cancels damage pays native plus explicit mana and sets8second cooldown',()=>{
 const f=fixture();f.a.mana=10;f.g._random=()=>.5;f.hit();near(f.a.hp,10000);near(f.a.mana,0);near(f.a.skillStates.A154.readyAt,18);near(f.a.worldX,4);near(f.a.worldY,8);assert.equal(f.a.skillStates.A154.casts,1);f.hit();near(f.a.hp,9900);
});
test('jump requires5native mana and additional deduction clamps ratherthan requiring10',()=>{
 for(const [mana,jumps,remaining]of [[4,false,4],[5,true,0],[7,true,0],[11,true,1]]){const f=fixture();f.a.mana=mana;f.g._random=()=>.5;f.hit();near(f.a.hp,jumps?10000:9900);near(f.a.mana,remaining);}
});
test('jump uses userdata region rather than current lane or economic owner',()=>{
 const f=fixture();f.a.ownerId=3;f.a.laneId=3;f.g._random=()=>.5;f.hit();near(f.a.worldX,4);assert.equal(f.a.status.nozdormu.jump.inOwnRegion,true);
 const x=fixture();x.a.userData=2;let calls=0;x.g._random=()=>{calls++;return .5;};x.hit();near(x.a.hp,10000);near(x.a.worldX,5);assert.equal(calls,0);
});
test('jump redraws outofregion candidates before a valid destination',()=>{
 const f=fixture();f.a.worldX=7.9;const rng=[1,0,.5,.5];f.g._random=()=>rng.shift();f.hit();near(f.a.worldX,6.9);assert.equal(f.a.status.nozdormu.jump.attempts,2);assert.equal(rng.length,0);
});
test('invalid userdata retains zero damage and dispel without consuming random movement',()=>{
 const f=fixture();f.a.userData=0;let calls=0;f.g._random=()=>{calls++;return .5;};f.hit();near(f.a.hp,10000);near(f.a.worldX,5);assert.equal(calls,0);
});
test('pathological random stream reports boundary instead of freezing the host',()=>{
 const f=fixture();f.a.worldX=7.9;let n=0;f.g._random=()=>n++%2?0:1;f.hit();near(f.a.worldX,7.9);assert.equal(f.a.status.nozdormu.jump.boundary,'random-region-rejection-limit');assert.equal(n,512);
});
test('jump removes known positive buffs but keeps debuffs abilities and unknown effects',()=>{
 const f=fixture();const positive=compileSkills({abilityIds:['Ablo'],skillVersion:'v14.1A5'})[0];assert.equal(positive.base,'Ablo');f.a.buffs=[{skillId:'Ablo',key:'positive'},{skillId:'Aslo',key:'slow'},{skillId:'custom',key:'unknown'}];f.a.status.rootUntil=100;f.g._random=()=>.5;f.hit();assert.deepEqual(f.a.buffs.map(b=>b.key),['slow','unknown']);near(f.a.status.rootUntil,100);assert.ok(has(f.a,'A154'));assert.deepEqual(f.a.status.nozdormu.unclassifiedBuffs,['unknown']);
});
test('jump native command fails under silence stun pause death and abilitylevelzero',()=>{
 for(const mode of ['silence','stun','pause','dead','level']){const f=fixture();if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='stun')f.a.status.stunUntil=11;if(mode==='pause')f.a.status.sourcePaused=true;if(mode==='dead')f.a.hp=0;if(mode==='level')f.a.abilityLevels={A154:0};const mana=f.a.mana;f.hit();near(f.a.mana,mana);assert.equal(f.a.status.nozdormu?.jump,undefined);}
});
test('main damage gates zero friendly self A2Y7 and nested trigger',()=>{
 for(const mode of ['zero','friend','self','A2Y7','nested']){const f=fixture();f.g._sourceDamageTriggerDepth=mode==='nested'?1:0;if(mode==='friend'){f.t.team=f.a.team;f.t.side=f.a.side;}if(mode==='A2Y7')skills(f.t,['A2Y7']);beforeSourceDamage(f.g,f.a,mode==='zero'?0:100,mode==='self'?f.a:f.t);near(f.a.mana,1000);assert.equal(f.a.status.nozdormu?.jump,undefined);}
});
test('jump remains targetonly while later brightshield event write overrides zero',()=>{
 const f=fixture();f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,100,f.a);near(f.a.mana,1000);
 const x=fixture(['A154','A1W2']);x.g._random=()=>.5;x.hit();near(x.a.hp,9920);assert.equal(x.a.status.nozdormu.jump.moved,true);
});
test('rewind without registered history restores full health and pays5',()=>{
 const f=fixture(['A15A'],'h0QT');f.a.hp=1000;ok(f.cast('A15A'));near(f.a.hp,10000);near(f.a.mana,995);near(f.a.skillStates.A15A.readyAt,25);assert.equal(f.a.status.nozdormu.rewind.hasHistory,false);assert.equal(f.cast('A15A').ok,false);
});
test('default building has no history even though death dragon has A15A',()=>{
 const f=fixture(['A15A']);initializeSourceClassCombat(f.g,{unitId:'v14_n064'},f.a);assert.equal(jobs(f.g).length,0);assert.equal(f.a.status.nozdormu,undefined);
});
test('explicit building history registers once and yields to earlier fissure branches',()=>{
 const f=fixture(['A15A']);f.register();f.register();assert.equal(jobs(f.g).length,1);
 for(const id of ['A14Y','A14Z']){const x=fixture(['A15A']);x.register([id,'A15A']);assert.equal(jobs(x.g).length,0);assert.ok(x.g.state.sourceSkillJobs.some(j=>j.type==='bronze_fissure'));}
});
test('history shifts six samples and reads third slot not an absolute time lookup',()=>{
 const f=fixture(['A15A']);f.register();for(let i=1;i<=7;i++){f.a.hp=i*1000;f.at(10+i);}assert.deepEqual(jobs(f.g)[0].values,[70,60,50,40,30,20]);f.a.hp=9000;ok(f.cast('A15A'));near(f.a.hp,5000);near(f.a.status.nozdormu.rewind.percent,50);
});
test('history percentage is applied to current maximum and can lower currentlife',()=>{
 const f=fixture(['A15A']);f.register();f.a.hp=2000;f.at(11);f.a.hp=4000;f.at(12);f.a.hp=8000;f.at(13);f.a.maxHp=20000;f.a.hp=15000;ok(f.cast('A15A'));near(f.a.hp,4000);
});
test('empty and zero third slots use100percent fallback',()=>{
 for(const values of [[],[20,30,0]]){const f=fixture(['A15A']);f.register();jobs(f.g)[0].values=values;f.a.hp=1000;ok(f.cast('A15A'));near(f.a.hp,10000);}
});
test('history survives ability removal and is destroyed only on next timer after death',()=>{
 const f=fixture(['A15A']);f.register();skills(f.a,[]);f.a.hp=5000;f.at(11);assert.deepEqual(jobs(f.g)[0].values,[50]);f.g._killUnit(f.a);const j=jobs(f.g)[0];assert.ok(j);f.at(11.9);assert.equal(jobs(f.g).length,1);f.at(12);assert.equal(jobs(f.g).length,0);assert.deepEqual(j.values,[]);
});
test('breath is immediate400universalweapon in400radius400ahead',()=>{
 const f=fixture(['A159']),edge=f.make(800/300),outside=f.make(800/300+.001),friend=f.make(1,'defender'),dead=f.make(1),inv=f.make(1);dead.hp=0;skills(inv,['Avul']);const seen=[],hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,e,o)=>{seen.push(o);return hurt(t,n,e,o);};ok(f.cast('A159'));near(f.t.hp,9600);near(edge.hp,9600);near(outside.hp,10000);near(friend.hp,10000);near(dead.hp,0);near(inv.hp,10000);assert.ok(seen.every(o=>o.weapon&&o.attackType==='chaos'&&o.nativeDamageType==='universal'));near(f.a.mana,990);near(f.a.skillStates.A159.readyAt,21);
});
test('breath damage center follows cast direction but not target distance',()=>{
 const f=fixture(['A159']);f.t.worldX=5;f.t.worldY=10;ok(f.cast('A159',{x:5,y:11}));near(f.t.hp,9600);near(f.a.status.nozdormu.breath.center.x,5);near(f.a.status.nozdormu.breath.center.y,8+400/300);
});
test('invalid breath points range mana silence and cooldown do not start effects',()=>{
 for(const mode of ['NaN','range','mana','silence','cooldown']){const f=fixture(['A159']);if(mode==='mana')f.a.mana=9;if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='cooldown')f.a.skillStates.A159.readyAt=11;const mana=f.a.mana,r=f.cast('A159',mode==='NaN'?{x:NaN,y:8}:mode==='range'?{x:10,y:8}:{x:6,y:8});assert.equal(r.ok,false,mode);near(f.a.mana,mana);near(f.t.hp,10000);}
});
test('ancient and nested spell trigger pay native costs without script effects',()=>{
 for(const mode of ['ancient','nested']){const f=fixture(['A159','A15A']);if(mode==='ancient')f.a.isAncient=true;else f.g._sourceAbilityEffectDepth=1;f.a.hp=5000;ok(f.cast('A159'));ok(f.cast('A15A'));near(f.t.hp,10000);near(f.a.hp,5000);near(f.a.mana,985);}
});
test('automatic rewind is attackeronly and breath is targetonly',()=>{
 const f=fixture(['A15A','A159']);f.a.hp=1000;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);near(f.a.hp,10000);near(f.a.mana,995);near(f.t.hp,10000);
 const x=fixture(['A15A','A159']);x.a.hp=1000;x.g._sourceDamageTriggerDepth=0;beforeSourceDamage(x.g,x.a,1,x.t);near(x.a.hp,1000);near(x.a.mana,990);near(x.t.hp,9600);
});
test('jump can consume allmana before target breath while attacker rewind is independent',()=>{
 const f=fixture(['A154','A159']);skills(f.t,['A15A']);f.a.mana=10;f.t.hp=5000;f.g._random=()=>.5;f.hit();near(f.a.mana,0);near(f.t.hp,10000);near(f.t.mana,995);assert.equal(f.a.skillStates.A159.casts,0);
});
test('automatic breath rejects a retained deadsource while manual groundcast is still valid',()=>{
 const f=fixture(['A159']);f.t.hp=0;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.a,100,f.t);near(f.a.mana,1000);ok(f.cast('A159'));near(f.a.mana,990);
});
test('death spawns fresh7500hp dragon with native identity and no new history',()=>{
 const f=fixture(['A158']);f.a.hp=1;f.a.mana=0;f.a.facing=45;f.g._killUnit(f.a);const d=f.g.state.entities.find(e=>e.combatRawcode==='h0QT');assert.ok(d);near(d.maxHp,7500);near(d.damage,585);near(d.attackInterval,.6);near(d.mana,30);near(d.armor,3);assert.equal(d.userData,1);assert.equal(d.sourceNativeOwnerId,8);assert.equal(d.isSummon,true);assert.equal(d.targetType,'ground');assert.equal(d.sourceRawFields.movetp,'fly');assert.ok(d.traits.includes('summoned'));assert.equal(has(d,'A158'),false);assert.equal(has(d,'A157'),false);assert.equal(has(d,'A201'),false);assert.equal(jobs(f.g).length,0);near(d.facing,45);sourceDeath(f.g,f.a,null);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='h0QT').length,1);
});
test('deathblast uses old caster and1000normal weapon damage after creating new body',()=>{
 const f=fixture(['A158']),inside=f.make(400/300),outside=f.make(400/300+.001),friend=f.make(1,'defender');const records=[],hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,e,o)=>{records.push({e,o,dragon:!!f.g.state.entities.find(e=>e.combatRawcode==='h0QT')});return hurt(t,n,e,o);};f.g._killUnit(f.a);near(f.t.hp,9000);near(inside.hp,9000);near(outside.hp,10000);near(friend.hp,10000);assert.ok(records.every(r=>r.e===f.a&&r.o.weapon&&r.o.attackType==='normal'&&r.o.nativeDamageType==='normal'&&r.dragon));
});
test('deathblast retains armor factor and excludes dead or Avul targets',()=>{
 const f=fixture(['A158']),inv=f.make(.2),dead=f.make(.3);skills(inv,['Avul']);dead.hp=0;f.t.armor=10;f.g._killUnit(f.a);near(f.t.hp,10000-1000*f.g._armorFactor(10));near(inv.hp,10000);near(dead.hp,0);
});
test('nested death and Ju members cannot trigger main dragon creation',()=>{
 for(const mode of ['nested','Ju']){const f=fixture(['A158']);if(mode==='nested')f.g._sourceUnitDeathTriggerDepth=1;else f.a.status.sourceJuMember=true;f.g._killUnit(f.a);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='h0QT'),false);near(f.t.hp,10000);}
});
test('blast killing another Nozdormu suppresses its main death but keeps independent Alex revive',()=>{
 const f=fixture(['A158']);skills(f.t,['A158']);f.t.hp=900;const alex=f.make(.6);skills(alex,['A172']);alex.hp=900;initializeSourceClassCombat(f.g,{sourceRawcode:'test',abilityIds:['A172']},alex);f.g._killUnit(f.a);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='h0QT').length,1);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='h0R0').length,1);
});
test('combatability removal disables death transform without building registration',()=>{
 const f=fixture(['A158']);skills(f.a,[]);f.g._killUnit(f.a);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='h0QT'),false);
});
test('new dragon rewind restores itself rather than the dead elf or other dragon',()=>{
 const f=fixture(['A158']);f.g._killUnit(f.a);const d=f.g.state.entities.find(e=>e.combatRawcode==='h0QT');d.hp=1000;ok(castManualSourceSkill(f.g,d,'A15A'));near(d.hp,7500);near(d.mana,25);near(f.a.hp,0);
});
test('blessing is20percent damage and20percent movement only with different native buff keys',()=>{
 const f=fixture(['A155','A156','A157']),friend=f.make(1,'defender');const effects=sourceAuraEffects(f.g,friend,[f.a]);near(effects.damage,.2);near(effects.move,.2);near(effects.haste,0);skills(f.a,['A155']);near(sourceAuraEffects(f.g,friend,[f.a]).damage,0);
});
test('dragon glory requires native sapper classification and respects600radius',()=>{
 const f=fixture(['A201','A202','A203','A204','A206']),dragon=f.make(2,'defender'),named=f.make(1,'defender'),far=f.make(2.001,'defender');dragon.traits=['sapper'];far.traits=['sapper'];named.name='红龙';const e=sourceAuraEffects(f.g,dragon,[f.a]);near(e.damage,.11);near(e.move,.13);near(e.haste,.12);near(e.armor,1);near(e.healRate,14);near(sourceAuraEffects(f.g,named,[f.a]).damage,0);near(sourceAuraEffects(f.g,far,[f.a]).damage,0);
});
test('blessing and dragon glory add by distinct buffs without doubling duplicate sources',()=>{
 const f=fixture(['A156','A157','A201','A202','A203','A204']),friend=f.make(1,'defender'),copy=f.make(.5,'defender');friend.traits=['sapper'];skills(copy,f.a.skillSpecs.map(s=>s.id));const e=sourceAuraEffects(f.g,friend,[f.a,copy]);near(e.damage,.31);near(e.move,.33);near(e.haste,.12);near(e.armor,1);near(e.healRate,14);
});
test('pause and snapshot retain history ownership cooldown and sample sequence',()=>{
 const f=fixture(['A15A']);f.register();f.a.hp=5000;f.at(12);f.g.state.paused=true;const snapshot=clone(f.g.snapshot());f.g.tick(10);assert.deepEqual(clone(f.g.snapshot()),snapshot);const g=Game.fromSnapshot(snapshot),a=g.state.entities.find(e=>e.id===f.a.id);assert.equal(jobs(g)[0].source,a);a.hp=f.a.hp=2000;g.state.time=13;tickSourceScriptJobs(g);f.at(13);ok(castManualSourceSkill(g,a,'A15A'));ok(f.cast('A15A'));near(a.hp,f.a.hp);near(a.mana,f.a.mana);
});
test('restored corpse history cleans next second and sandbox reset removes pending histories',()=>{
 const f=fixture(['A15A']);f.register();f.g._killUnit(f.a);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);const g=Game.fromSnapshot(clone(f.g.snapshot()));g.state.time=11;tickSourceScriptJobs(g);assert.equal(jobs(g).length,0);const x=fixture(['A15A']);x.register();ok(x.g.command('sandboxReset'));assert.equal(jobs(x.g).length,0);
});
test('formal command obeys pause andownership with immediate rewind andpoint breath',()=>{
 const f=fixture(['A159','A15A']);assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A15A',playerId:1}).ok,false);f.g.state.paused=true;assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A15A'}).ok,false);f.g.state.paused=false;f.a.hp=5000;ok(f.g.command('cast',{entityId:f.a.id,skillId:'A15A'}));near(f.a.hp,10000);ok(f.g.command('cast',{entityId:f.a.id,skillId:'A159',worldX:5.5,worldY:8}));near(f.t.hp,9600);
});
test('source completion history unlocks550gold directupgrade and real combat body',()=>{
 const g=new Game({mode:'sandbox'}),p=g.state.players[0];p.roster=['v14_h0QP'];ok(g.command('build',{unitId:'v14_h0QP',col:2,row:4}));ok(g.command('sandboxComplete'));const b=p.buildings[0];assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_n064'}).ok,false);recordEggCompletion(p,UNIT_TEMPLATES.h201,{buildingId:'holy-dragon',wave:1});assert.equal(p.technologies.R08F,1);const gold=p.gold;ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_n064'}));near(gold-p.gold,550);ok(g.command('sandboxComplete'));ok(g.command('ready'));const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0QS');assert.ok(has(e,'A158'));assert.equal(jobs(g).length,0);
});
test('natural arena ticks keep transformed dragon finite and can save resume',()=>{
 const f=fixture(['A158']);f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;f.g._killUnit(f.a);f.g.tick(2);const g=Game.fromSnapshot(clone(f.g.snapshot()));g.tick(.1);assert.ok(g.state.entities.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.damage)&&Number.isFinite(e.worldX)));assert.ok(g.state.entities.some(e=>e.combatRawcode==='h0QT'));
});
