import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,castManualSourceSkill,manualSourceSkills,tickSourceScriptJobs,beforeSourceDamage,tickSourceSkills} from '../dist/skills.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message),clone=x=>JSON.parse(JSON.stringify(x)),jobs=(g,type)=>(g.state.sourceSkillJobs??[]).filter(j=>!j.done&&(!type||j.type===type));
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A1TV','A1TW','A1TZ']){
 const g=new Game({mode:'sandbox',seed:69});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};g._sourceDamageTriggerDepth=1;for(const p of g.state.players)p.eggHistory.firstWaveClosed=true;for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const make=(dx=.5,side='monster',raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{side,ownerId:side==='defender'?0:4,sourceNativeOwnerId:side==='defender'?8:9,userData:side==='defender'?1:5,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:5+dx,worldY:8});e.hp=e.maxHp=10000;e.mana=e.maxMana=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0WK'),t=make();skills(a,ids);
 return {g,a,t,make,cast:(id,target=t)=>castManualSourceSkill(g,a,id,{target}),at:n=>{g.state.time=n;tickSourceScriptJobs(g);},bodies:()=>g.state.entities.filter(e=>e.combatRawcode==='e01I')};
}
test('source evidence distinguishes native fields correct manual order and wrong automatic order',()=>{
 const e=JSON.parse(readFileSync(new URL('../reference/maiev-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),e.source.sha256);for(const x of e.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(e.abilities.A1TW.code,'AEsv');assert.equal(e.abilities.A1TY.Cost1,undefined);assert.equal(e.abilities.A1TV.DataD1,undefined);assert.equal(Number(e.abilities.A1TV.Dur1),8);assert.ok(lines[40774].includes('waterelemental'));assert.ok(e.boundaries.some(s=>s.includes('攻击类型')));
 const c=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url)));assert.ok(c.playerRuntimeForms.includes('e01I'));assert.equal(c.playerRuntimeForms.includes('e01J'),false);assert.equal(c.playerSkills.abilities.find(s=>s.rawcode==='A1TY').status,'unresolved');
});
test('three manual skills expose correct costs cooldowns and target kinds',()=>{
 const f=fixture();assert.deepEqual(manualSourceSkills(f.g,f.a).map(s=>[s.id,s.targetKind,s.manaCost,s.cooldown]),[['A1TV','enemy',5,9],['A1TW','none',13,15],['A1TZ','none',16,9]]);near(manualSourceSkills(f.g,f.a)[0].range,1);ok(f.cast('A1TV'));near(f.a.mana,995);near(f.a.skillStates.A1TV.readyAt,19);assert.equal(f.cast('A1TV').ok,false);
});
test('shadowstrike host schedule has75initial plus10at3and6 and cleans at8seconds',()=>{
 const f=fixture(['A1TV']);ok(f.cast('A1TV'));near(f.t.hp,9925);f.at(12.999);near(f.t.hp,9925);f.at(13);near(f.t.hp,9915);f.at(16);near(f.t.hp,9905);f.at(18);near(f.t.hp,9905);assert.equal(jobs(f.g).length,0);assert.equal(f.t.buffs.length,0);
});
test('native shadowstrike has no three second cast delay and executes under disabled allability script',()=>{
 const f=fixture(['A1TV']);f.g._sourceAbilityEffectDepth=1;ok(f.cast('A1TV'));near(f.t.hp,9925);assert.equal(f.a.status.maiev.lastCast.nativeDamageApproximation,true);
});
test('shadowstrike target range edge and air organic eligibility are applied',()=>{
 const f=fixture(['A1TV']);f.t.worldX=6;f.t.targetType='air';ok(f.cast('A1TV'));near(f.t.hp,9925);const x=fixture(['A1TV']);x.t.worldX=6.001;assert.equal(x.cast('A1TV').ok,false);near(x.a.mana,1000);
});
test('shadowstrike rejects building mechanical ally dead invulnerable hidden and magic immune targets',()=>{
 for(const mode of ['building','structure','mechanical','ally','dead','Avul','Aloc','ACmi','hidden','battle']){const f=fixture(['A1TV']);if(mode==='building')f.t.isBuilding=true;if(mode==='structure')f.t.targetType='structure';if(mode==='mechanical')f.t.traits=['mechanical'];if(mode==='ally'){f.t.team=0;f.t.side='defender';}if(mode==='dead')f.t.hp=0;if(['Avul','Aloc','ACmi'].includes(mode))skills(f.t,[mode]);if(mode==='hidden')f.t.status.sourceHidden=true;if(mode==='battle')f.t.battleTeam=1;assert.equal(f.cast('A1TV').ok,false,mode);near(f.a.mana,1000);}
});
test('manual spells reject insufficient resources or controls without spending',()=>{
 for(const id of ['A1TV','A1TW','A1TZ'])for(const mode of ['mana','silence','stun','paused','dead','level0']){const f=fixture([id]);if(mode==='mana')f.a.mana=0;if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='stun')f.a.status.stunUntil=11;if(mode==='paused')f.a.status.sourcePaused=true;if(mode==='dead')f.a.hp=0;if(mode==='level0')f.a.abilityLevels={[id]:0};const mana=f.a.mana;assert.equal(f.cast(id).ok,false,id+mode);near(f.a.mana,mana);assert.equal(jobs(f.g).length,0);}
});
test('formal command enforces ownership and paused game',()=>{
 const f=fixture();assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1TW',playerId:1}).ok,false);f.g.state.paused=true;assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1TW'}).ok,false);f.g.state.paused=false;ok(f.g.command('cast',{entityId:f.a.id,skillId:'A1TW'}));
});
test('shadowstrike follows moving target and continues after caster death',()=>{
 const f=fixture(['A1TV']);ok(f.cast('A1TV'));f.t.worldX+=100;f.g._killUnit(f.a);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);f.at(18);near(f.t.hp,9905);
});
test('shadowstrike refresh host policy retains oneB084 and restarts two tick schedule',()=>{
 const f=fixture(['A1TV']);ok(f.cast('A1TV'));f.at(12);f.a.skillStates.A1TV.readyAt=0;ok(f.cast('A1TV'));near(f.t.hp,9850);assert.equal(f.t.buffs.length,1);f.at(13);near(f.t.hp,9850);f.at(15);near(f.t.hp,9840);f.at(18);near(f.t.hp,9830);f.at(20);assert.equal(f.t.buffs.length,0);
});
test('unknown slow decay is recorded without fabricating eight second constant slowing',()=>{
 const f=fixture(['A1TV']);ok(f.cast('A1TV'));const b=f.t.buffs[0];assert.equal(b.nativeMoveDecrease,.2);assert.equal(b.nativeAttackDecrease,.2);assert.equal(b.slowResolution,'decay-unresolved');assert.equal(b.move,undefined);assert.equal(b.haste,undefined);assert.match(f.a.skillSpecs[0].effectText,/衰减参数缺失/);
});
test('removingB084 cancels remaining periodic effects',()=>{
 const f=fixture(['A1TV']);ok(f.cast('A1TV'));f.t.buffs=[];f.at(18);near(f.t.hp,9925);assert.equal(jobs(f.g).length,0);
});
test('target widget death cancels shadowstrike under main death suppression and reincarnation',()=>{
 for(const reincarnate of [false,true]){const f=fixture(['A1TV']);ok(f.cast('A1TV'));if(reincarnate)skills(f.t,['A14E']);f.g._sourceUnitDeathTriggerDepth=1;f.g._killUnit(f.t);assert.equal(jobs(f.g,'maiev_shadow').length,0);assert.equal(f.t.buffs.length,0);}
});
test('initial lethal hit does not leave a shadowstrike timer on corpse',()=>{
 const f=fixture(['A1TV']);f.t.hp=50;ok(f.cast('A1TV'));assert.ok(f.t.hp<=0);assert.equal(jobs(f.g).length,0);assert.equal(f.t.buffs.length,0);
});
test('host shadowstrike damage carries nonweapon shadow damage and ignores armor value',()=>{
 const f=fixture(['A1TV']),calls=[],hurt=f.g._hurt.bind(f.g);f.t.armor=9999;f.g._hurt=(t,n,e,o)=>{calls.push(o);return hurt(t,n,e,o);};ok(f.cast('A1TV'));f.at(18);near(f.t.hp,9905);assert.equal(calls.length,3);for(const o of calls){assert.equal(o.attackType,'spells');assert.equal(o.nativeDamageType,'shadow_strike');assert.equal(o.magic,true);assert.ok(!o.weapon);assert.ok(!o.universal);}
});
test('damage automatic shadowstrike uses victim priority with no fallback and shared cooldown',()=>{
 const f=fixture(['A1TV']);skills(f.t,['A1TV']);f.t.mana=0;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a,{spell:true});assert.equal(f.t.status.maiev.orders[0].ok,false);assert.equal(f.a.status.maiev,undefined);
 const x=fixture(['A1TV']);x.g._sourceDamageTriggerDepth=0;beforeSourceDamage(x.g,x.t,1,x.a,{spell:true});near(x.a.mana,995);assert.equal(x.cast('A1TV').ok,false);
});
test('source wrongwaterelemental request neither spends13 nor summons automatically',()=>{
 const f=fixture(['A1TW']);f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a,{spell:true});near(f.a.mana,1000);assert.equal(f.bodies().length,0);assert.equal(f.a.status.maiev.orders[0].reason,'wrong-native-order');tickSourceSkills(f.g,f.a,[f.a,f.t],0);assert.equal(f.bodies().length,0);ok(f.cast('A1TW'));assert.equal(f.bodies().length,1);
});
test('manual vengeance summons exact template30seconds with native owner and group identity',()=>{
 const f=fixture(['A1TW']);ok(f.cast('A1TW'));const e=f.bodies()[0];assert.equal(f.bodies().length,1);near(e.hp,1300);near(e.maxHp,1300);near(e.damage,65.5);near(e.mana,400);near(e.expiresAt,40);assert.equal(e.sourceNativeOwnerId,8);assert.equal(e.userData,1);assert.equal(e.status.sourceJWMember,true);assert.equal(e.status.sourceJHMember,1);assert.equal(e.isSummon,true);assert.equal(e.isNativeHero,false);assert.equal(e.skillSpecs.some(s=>s.id==='Avul'),false);near(f.a.mana,987);near(f.a.skillStates.A1TW.readyAt,25);
});
test('ancient immediate spiritofvengeance command is stopped while blade and shadowstrike are allowed',()=>{
 const f=fixture();f.a.isAncient=true;assert.equal(f.cast('A1TW').ok,false);near(f.a.mana,1000);ok(f.cast('A1TZ'));ok(f.cast('A1TV'));assert.equal(f.bodies().length,0);
});
test('native vengeance summon is not suppressed by disabled script ability trigger',()=>{
 const f=fixture(['A1TW']);f.g._sourceAbilityEffectDepth=1;ok(f.cast('A1TW'));assert.equal(f.bodies().length,1);
});
test('host repeated vengeance casts coexist and source caster death does not remove avatar',()=>{
 const f=fixture(['A1TW']);ok(f.cast('A1TW'));f.g.state.time=25;ok(f.cast('A1TW'));assert.equal(f.bodies().length,2);f.g._killUnit(f.a);assert.equal(f.bodies().filter(e=>e.hp>0).length,2);assert.match(f.a.skillSpecs[0].effectText,/多天神并存适配/);
});
test('avatar expires at30seconds without producing free corpse spirits',()=>{
 const f=fixture(['A1TW']);ok(f.cast('A1TW'));const e=f.bodies()[0];e.attackCd=99999;f.g._killUnit(f.t);f.g.state.time=39.999;f.g._updateEntities(0);assert.ok(e.hp>0);f.g.state.time=40;f.g._updateEntities(0);assert.ok(e.hp<=0);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='e01J'),false);
});
test('unresolved corpse conversion stays unavailable despite sufficient visible mana and corpses',()=>{
 const f=fixture(['A1TW']);ok(f.cast('A1TW'));const e=f.bodies()[0];f.g._killUnit(f.t);const s=e.skillSpecs.find(s=>s.id==='A1TY');assert.equal(s.status,'unresolved');assert.equal(s.runtimeImplemented,false);assert.equal(manualSourceSkills(f.g,e).some(s=>s.id==='A1TY'),false);tickSourceSkills(f.g,e,[e,f.t],0);near(e.mana,400);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='e01J'),false);
});
test('save restore keeps native shadow tick cooldown buff and sourcehandle through filtering',()=>{
 const f=fixture(['A1TV']);ok(f.cast('A1TV'));f.g._killUnit(f.a);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);f.at(13);const r=Game.fromSnapshot(clone(f.g.snapshot())),rt=r.state.entities.find(e=>e.id===f.t.id);assert.equal(jobs(r,'maiev_shadow')[0].target,rt);r._sourceDamageTriggerDepth=1;r.state.time=18;tickSourceScriptJobs(r);f.at(18);near(rt.hp,f.t.hp);assert.equal(rt.buffs.length,0);
});
