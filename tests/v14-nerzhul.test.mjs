import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,manualSourceSkills,castManualSourceSkill,tickSourceScriptJobs,beforeSourceDamage,sourceDeath,tickSourceSkills,sourceClassAttackDamageEvent,matchesTargets} from '../dist/skills.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message),clone=x=>JSON.parse(JSON.stringify(x)),jobs=(g,type)=>(g.state.sourceSkillJobs??[]).filter(j=>!j.done&&(!type||j.type===type));
function skills(e,ids,levels={}){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3,abilityLevels:levels});e.abilityLevels=levels;e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A1UM','A1UN','A1UO'],levels={}){
 const g=new Game({mode:'sandbox',seed:68});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};g._sourceDamageTriggerDepth=1;for(const p of g.state.players)p.eggHistory.firstWaveClosed=true;for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const make=(dx=.5,side='monster',raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{side,ownerId:side==='defender'?0:4,sourceNativeOwnerId:side==='defender'?8:9,userData:side==='defender'?1:5,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:5+dx,worldY:8});e.hp=e.maxHp=10000;e.mana=e.maxMana=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0WM'),t=make();skills(a,ids,levels);
 return {g,a,t,make,cast:(id,target=t)=>castManualSourceSkill(g,a,id,{target}),point:(x=5.5,y=8)=>castManualSourceSkill(g,a,'A1UN',{point:{x,y}}),at:n=>{g.state.time=n;tickSourceScriptJobs(g);},bodies:()=>g.state.entities.filter(e=>['u04D','u04E'].includes(e.combatRawcode))};
}
test('source evidence records exact bytes and retains native field and upgrade gaps',()=>{
 const e=JSON.parse(readFileSync(new URL('../reference/nerzhul-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),e.source.sha256);for(const x of e.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);
 assert.equal(e.abilities.A1UL.DataE1,undefined);assert.equal(e.abilities.A1UL.Cost1,undefined);assert.equal(Number(e.abilities.A1UN.DataB3),10);assert.ok(e.boundaries.some(s=>s.includes('Web重建')));
 const c=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url)));for(const id of ['A1UK','A1UL','A1UM','A1UN','A1UO'])assert.equal(c.playerSkills.abilities.find(a=>a.rawcode===id).status,'partial');assert.ok(c.playerRuntimeForms.includes('u04D'));assert.ok(c.unitScriptBindings.some(b=>b.combatRawcode==='u04D'&&!b.abilityRequired));
});
test('two manual skills expose native fees range and shared cooldown state',()=>{
 const f=fixture();assert.deepEqual(manualSourceSkills(f.g,f.a).map(s=>[s.id,s.targetKind,s.manaCost,s.cooldown]),[['A1UM','unit',18,11],['A1UN','point',25,16]]);near(manualSourceSkills(f.g,f.a)[0].range,500/300);near(manualSourceSkills(f.g,f.a)[1].range,800/300);ok(f.cast('A1UM'));near(f.a.mana,982);near(f.a.skillStates.A1UM.readyAt,21);assert.equal(f.cast('A1UM').ok,false);
});
test('resentment rejects invalid units resources control and level zero without charge',()=>{
 for(const mode of ['dead','Aloc','range','mana','silence','stun','hidden','casterDead','level0','battle']){const f=fixture(['A1UM']);if(mode==='dead')f.t.hp=0;if(mode==='Aloc')skills(f.t,['Aloc']);if(mode==='range')f.t.worldX+=10;if(mode==='mana')f.a.mana=17;if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='stun')f.a.status.stunUntil=11;if(mode==='hidden')f.t.status.sourceHidden=true;if(mode==='casterDead')f.a.hp=0;if(mode==='level0')f.a.abilityLevels.A1UM=0;if(mode==='battle')f.t.battleTeam=1;const mana=f.a.mana;assert.equal(f.cast('A1UM').ok,false,mode);near(f.a.mana,mana);assert.equal(jobs(f.g).length,0);}
});
test('formal command enforces player ownership and pause',()=>{
 const f=fixture();assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1UM',targetId:f.t.id,playerId:1}).ok,false);f.g.state.paused=true;assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1UM',targetId:f.t.id}).ok,false);f.g.state.paused=false;ok(f.g.command('cast',{entityId:f.a.id,skillId:'A1UM',targetId:f.t.id}));
});
test('resentment accepts friendly unit centers and ancient caster',()=>{
 const f=fixture(['A1UM']),friend=f.make(.5,'defender');f.a.isAncient=true;ok(f.cast('A1UM',friend));f.at(11);near(friend.hp,10000);near(f.t.hp,9945);
});
test('nested allability trigger spends native fees but skips resentment script',()=>{
 const f=fixture(['A1UM']);f.g._sourceAbilityEffectDepth=1;ok(f.cast('A1UM'));near(f.a.mana,982);assert.equal(jobs(f.g).length,0);assert.equal(f.a.status.nerzhul.lastCast.scriptApplied,false);
});
for(const [level,damage] of [[1,55],[2,82.5],[3,110]])test(`resentment level${level} first hit at one second and exactly five ticks`,()=>{
 const f=fixture(['A1UM'],{A1UM:level});ok(f.cast('A1UM'));f.at(10.999);near(f.t.hp,10000);f.at(11);near(f.t.hp,10000-damage);f.at(15);near(f.t.hp,10000-damage*5);f.at(20);near(f.t.hp,10000-damage*5);assert.equal(jobs(f.g).length,0);assert.equal(f.t.buffs.length,0);
});
test('resentment holds original point re-enumerates each tick and includes300boundary',()=>{
 const f=fixture(['A1UM']),edge=f.make(1.5),outside=f.make(1.501),late=f.make(5);ok(f.cast('A1UM'));f.t.worldX+=20;f.at(11);near(f.t.hp,10000);near(edge.hp,9945);near(outside.hp,10000);late.worldX=5.5;f.at(12);near(late.hp,9945);
});
test('resentment survives caster death filtering and later ability changes',()=>{
 const f=fixture(['A1UM']);ok(f.cast('A1UM'));f.g._killUnit(f.a);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);skills(f.a,[]);f.at(15);near(f.t.hp,9725);
});
test('main damage victim priority does not fall back when victim lacks mana',()=>{
 const f=fixture(['A1UM']);skills(f.t,['A1UM']);f.t.mana=0;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,10,f.a,{spell:true});assert.equal(f.t.status.nerzhul.lastOrder.ok,false);assert.equal(f.a.status.nerzhul,undefined);assert.equal(jobs(f.g).length,0);
});
test('main damage attacker auto request shares cooldown with manual and ignores A2Y7',()=>{
 const f=fixture(['A1UM']);f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,10,f.a,{spell:true});near(f.a.mana,982);assert.equal(f.cast('A1UM').ok,false);assert.equal(jobs(f.g,'nerzhul_resentment').length,1);
 const x=fixture(['A1UM','A2Y7']);x.g._sourceDamageTriggerDepth=0;beforeSourceDamage(x.g,x.t,10,x.a,{spell:true});assert.equal(x.a.status.nerzhul,undefined);
});
for(const [level,damage] of [[1,105],[2,157.5],[3,525]])test(`omen level${level} waits one second and uses correct source damage`,()=>{
 const f=fixture(['A1UO'],{A1UO:level});f.g._killUnit(f.a);f.at(10.999);near(f.t.hp,10000);f.at(11);near(f.t.hp,10000-damage);f.at(20);near(f.t.hp,10000-damage);assert.equal(jobs(f.g).length,0);
});
test('omen uses corpse callback position and captured level even after filtering',()=>{
 const f=fixture(['A1UO'],{A1UO:3}),late=f.make(10.5);f.g._killUnit(f.a);f.a.worldX+=10;f.a.abilityLevels.A1UO=1;f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);f.at(11);near(f.t.hp,10000);near(late.hp,9475);
});
test('omen600boundary excludes allies Aloc Avul and includes magic immune armored targets',()=>{
 const f=fixture(['A1UO']),edge=f.make(2),outside=f.make(2.001),friend=f.make(.5,'defender'),loc=f.make(.5),inv=f.make(.5);skills(loc,['Aloc']);skills(inv,['Avul']);skills(f.t,['Amim']);f.t.armor=9999;f.g._killUnit(f.a);f.at(11);for(const t of [edge,f.t])near(t.hp,9895);for(const t of [outside,friend,loc,inv])near(t.hp,10000);
});
test('raw u04D death pulse requires no ability and chooses only initial300group',()=>{
 const f=fixture([]),body=f.make(0,'defender','u04D'),late=f.make(5),edge=f.make(1);f.g._killUnit(body);near(f.t.hp,10000);f.t.worldX+=50;late.worldX=5.5;f.at(11);near(f.t.hp,9920);near(edge.hp,9920);near(late.hp,10000);f.at(15);near(f.t.hp,9600);near(edge.hp,9600);assert.equal(jobs(f.g).length,0);
});
test('u04E death does not create u04D pulse',()=>{
 const f=fixture([]),body=f.make(0,'defender','u04E');f.g._killUnit(body);f.at(20);near(f.t.hp,10000);assert.equal(jobs(f.g).length,0);
});
test('target widget death and reincarnation cancel death loops independently of main trigger',()=>{
 for(const revival of [false,true]){const f=fixture([]),body=f.make(0,'defender','u04D');f.g._killUnit(body);if(revival)skills(f.t,['A14E']);f.g._sourceUnitDeathTriggerDepth=1;f.g._killUnit(f.t);assert.equal(jobs(f.g,'nerzhul_death_loop').length,0);if(revival)assert.equal(f.t.status.reincarnation.phase,'waiting');}
});
test('suppressed main death does not register omen or summon pulse',()=>{
 const f=fixture(['A1UO']),body=f.make(0,'defender','u04D');f.g._sourceUnitDeathTriggerDepth=1;f.g._killUnit(f.a);f.g._killUnit(body);assert.equal(jobs(f.g).length,0);
});
test('delayed omen runs after main trigger reenables so its victims register their own omen',()=>{
 const f=fixture(['A1UO']);skills(f.t,['A1UO']);f.t.hp=100;f.g._killUnit(f.a);f.at(11);assert.ok(f.t.hp<=0);assert.equal(jobs(f.g,'nerzhul_omen').length,1);f.at(12);assert.equal(jobs(f.g).length,0);
});
test('script damage retains chaos universal weapon event classification',()=>{
 const f=fixture(['A1UM','A1UO']),events=[],hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,e,o)=>{events.push({n,o});return hurt(t,n,e,o);};ok(f.cast('A1UM'));f.g._killUnit(f.a);f.at(11);assert.equal(events.length,2);for(const {o}of events){assert.equal(o.weapon,true);assert.equal(o.universal,true);assert.equal(o.attackType,'chaos');}
});
test('curse creates same-level dummy with native owner and zero userData then removes at1sec',()=>{
 const f=fixture(['A1UK'],{A1UK:3});let draws=0;f.g._random=()=>{draws++;return .5;};sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},12);const d=f.g.state.entities.find(e=>e.combatRawcode==='e008');assert.ok(d);assert.equal(d.abilityLevels.A1UL,3);assert.equal(d.userData,0);assert.equal(d.sourceNativeOwnerId,f.a.sourceNativeOwnerId);near(d.worldX,f.t.worldX);assert.equal(d.status.nerzhul.lastOrder.nativeResolution,'unresolved');assert.equal(draws,0);near(f.t.hp,10000);f.at(10.999);assert.ok(f.g.state.entities.includes(d));f.at(11);assert.equal(f.g.state.entities.includes(d),false);assert.equal(d.status.sourceRemoved,true);
});
test('curse ignores nonweapon nested busy events and removed ability',()=>{
 for(const mode of ['spell','busy','level0']){const f=fixture(['A1UK']);if(mode==='busy')f.a.status.sourceNativeAttackBusy=true;if(mode==='level0')f.a.abilityLevels.A1UK=0;sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:mode!=='spell',spell:mode==='spell'},12);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='e008'),false,mode);}
});
for(const [level,count] of [[1,4],[2,6],[3,10]])test(`ritual level${level} creates ${count} total native templates with no timed life`,()=>{
 const f=fixture(['A1UN'],{A1UN:level});f.g._random=()=>.1;ok(f.point());assert.equal(f.bodies().length,count);for(const e of f.bodies()){assert.equal(e.combatRawcode,'u04D');near(e.hp,700);assert.equal(e.isSummon,true);assert.equal(e.userData,1);assert.equal(e.status.sourceJWMember,true);assert.equal(e.status.sourceJHMember,1);assert.equal(e.expiresAt,undefined);assert.equal(e.sourceNativeOwnerId,8);}near(f.a.mana,975);near(f.a.skillStates.A1UN.readyAt,26);assert.equal(f.point().ok,false);f.at(30);assert.equal(f.bodies().filter(e=>e.hp>0).length,count);
});
test('ritual can draw only mages rather than forcing equal type counts',()=>{
 const f=fixture(['A1UN']);f.g._random=()=>.9;f.g._sourceAbilityEffectDepth=1;ok(f.point());assert.equal(f.bodies().length,4);for(const e of f.bodies()){assert.equal(e.combatRawcode,'u04E');assert.ok(e.skillSpecs.some(s=>s.id==='A1UP'));}assert.equal(f.a.status.nerzhul.lastCast.nativeTimingApproximation,true);
});
test('ritual validates ancient point restriction finite point range and funds',()=>{
 for(const mode of ['ancient','range','nan','mana']){const f=fixture(['A1UN']);if(mode==='ancient')f.a.isAncient=true;if(mode==='mana')f.a.mana=24;const mana=f.a.mana;assert.equal(f.point(mode==='range'?50:mode==='nan'?NaN:5.5).ok,false,mode);near(f.a.mana,mana);assert.equal(f.bodies().length,0);}
});
test('native summoned death army has no free water-elemental cast with zero mana',()=>{
 const f=fixture([]),body=f.make(0,'defender','u04D');skills(body,['A0BT']);body.mana=body.maxMana=0;body.manaRegen=0;tickSourceSkills(f.g,body,[body,f.t],0);assert.equal(body.skillStates.A0BT.casts,0);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='n004'),false);
});
test('A0BT counts only delivered spell events removes after second and preserves second native summon',()=>{
 const f=fixture([]),body=f.make(0,'defender','u04D');skills(body,['A0BT']);body.mana=body.maxMana=200;tickSourceSkills(f.g,body,[body,f.t],0);assert.equal(body.status.nerzhul.waterElementalCasts,1);f.g.state.time+=13;tickSourceSkills(f.g,body,[body,f.t],0);assert.equal(body.status.nerzhul.waterElementalCasts,2);assert.equal(body.skillSpecs.some(s=>s.id==='A0BT'),false);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='n004').length,4);near(body.mana,100);
 const x=fixture([]);skills(x.a,['A0BT']);x.g._sourceAbilityEffectDepth=1;tickSourceSkills(x.g,x.a,[x.a,x.t],0);assert.equal(x.a.status.nerzhul,undefined);assert.equal(x.a.skillStates.A0BT.casts,1);
});
test('mage native heal restores50 for10mana and rejects nonancient target mask',()=>{
 const f=fixture([]),body=f.make(0,'defender','u04E'),friend=f.make(.4,'defender'),ancient=f.make(.3,'defender');skills(body,['A1UP']);body.mana=12;friend.hp=9000;ancient.hp=100;ancient.isAncient=true;tickSourceSkills(f.g,body,[body,friend,ancient],0);near(friend.hp,9050);near(ancient.hp,100);near(body.mana,2);assert.equal(matchesTargets(body.skillSpecs[0],body,ancient),false);
});
test('save restore rebinds retained corpse and live target for pending death loops',()=>{
 const f=fixture(['A1UO']),body=f.make(0,'defender','u04D');f.g._killUnit(body);f.g._killUnit(f.a);f.at(10.5);f.g.state.entities=f.g.state.entities.filter(e=>e.hp>0);const r=new Game({mode:'sandbox',seed:69});assert.ok(r.restore(clone(f.g.snapshot())));const rt=r.state.entities.find(e=>e.id===f.t.id);const j=jobs(r,'nerzhul_death_loop')[0];assert.equal(j.target,rt);assert.equal(j.source.id,body.id);r._sourceDamageTriggerDepth=1;r.state.time=15;tickSourceScriptJobs(r);f.at(15);near(rt.hp,f.t.hp);assert.equal(jobs(r).length,0);
});

test('main death nested explosion and Ju exclusion suppress omen registration',()=>{
 const f=fixture(['A20D']);skills(f.t,['A1UO']);f.t.hp=100;f.g._killUnit(f.a);assert.ok(f.t.hp<=0);assert.equal(jobs(f.g,'nerzhul_omen').length,0);
 const x=fixture(['A1UO']);x.a.status.sourceJuMember=true;x.g._killUnit(x.a);assert.equal(jobs(x.g,'nerzhul_omen').length,0);
});
