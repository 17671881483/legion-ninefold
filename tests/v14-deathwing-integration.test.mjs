import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES,UNITS} from '../dist/data.js';
import {compileSkills,sourceAuraEffects,tickSourceScriptJobs,manualSourceSkills} from '../dist/skills.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(ids=[]){
 const g=new Game({mode:'sandbox',seed:73});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];g._spawnQueue=[];g._aiAct=()=>{};
 for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const skills=(e,abilities)=>{e.skillSpecs=compileSkills({abilityIds:abilities,skillVersion:'v14.1A5',distanceScale:1/3,abilityLevels:e.abilityLevels});e.skillStates={};};
 const make=(raw='h0PC',enemy=false,x=0)=>{const e=g._entity(UNIT_TEMPLATES[raw],{side:enemy?'monster':'defender',team:enemy?1:0,ownerId:enemy?4:0,sourceNativeOwnerId:enemy?9:8,userData:enemy?5:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:5+x,worldY:8});e.hp=e.maxHp=10000;e.mana=e.maxMana=100;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=999;e.buffs=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make();skills(a,ids);const t=make('h0PC',true,.5);return {g,a,t,make,skills,at:time=>{g.state.time=time;tickSourceScriptJobs(g);}};
}
test('explicit dragon glory melee and ranged flags admit both sapper weapon classes',()=>{
 for(const id of ['A0YR','A201']){const f=fixture([id]),t=f.make();t.traits=['sapper'];t.range=.5;near(sourceAuraEffects(f.g,t,[f.a]).damage,.11);t.range=3;near(sourceAuraEffects(f.g,t,[f.a]).damage,.11);assert.equal(f.a.skillSpecs[0].rangedOnly,false);}
});
test('dragon glory still requires sapper allegiance and actual aura range',()=>{
 const f=fixture(['A0YR']),t=f.make();t.range=.5;t.traits=[];near(sourceAuraEffects(f.g,t,[f.a]).damage,0);t.traits=['sapper'];t.team=1;t.side='monster';near(sourceAuraEffects(f.g,t,[f.a]).damage,0);t.team=0;t.side='defender';t.worldX=f.a.worldX+2.001;near(sourceAuraEffects(f.g,t,[f.a]).damage,0);t.worldX=f.a.worldX+2;near(sourceAuraEffects(f.g,t,[f.a]).damage,.11);
});
test('dragon glory variants share all four native buff groups instead of doubling their bonuses',()=>{
 const f=fixture(['A0YR','A0YS','A0YT','A0YU']),second=f.make(),t=f.make();f.skills(second,['A201','A202','A203','A204']);t.traits=['sapper'];t.range=.5;
 const a=sourceAuraEffects(f.g,t,[f.a,second]);near(a.damage,.11);near(a.move,.13);near(a.healRate,14);near(a.haste,.12);near(a.armor,1);
});
test('deathwing building spellbook and explanatory icons are not injected into its combat body',()=>{
 const f=fixture(),p=f.g.state.players[0];for(const q of f.g.state.players)q.buildings=[];p.buildings=[{id:'dw-entry',unitId:'v14_h0PD',col:2,row:4,construction:null}];f.g.state.phase='build';f.g._startCombat();const e=f.g.state.entities.find(e=>e.buildingId==='dw-entry');
 assert.equal(e.combatRawcode,'h0PC');for(const id of ['A0YF','A0YH','A0YR','A0YS','A0YT','A0YU'])assert.ok(e.skillSpecs.some(s=>s.id===id),id);for(const id of ['A0YL','A0YM','A0YN','A0YO','A0YP','A0YQ'])assert.equal(e.skillSpecs.some(s=>s.id===id),false,id);assert.equal(e.isNativeHero??e.isHero,false);
});
test('the real manual command pays human skill cost and applies one three-second BEer damage stream',()=>{
 const f=fixture(['A0YF']);f.t.sourceArmorTypeRaw='none';f.t.armorType='unarmored';const before=f.t.hp;
 const m=manualSourceSkills(f.g,f.a).find(s=>s.id==='A0YF');assert.equal(m.canStart,true);assert.equal(m.manaCost,12);assert.equal(m.cooldown,7);assert.equal(m.targetKind,'enemy');
 assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A0YF',targetId:f.t.id,playerId:0}).ok,true);near(f.a.mana,88);assert.equal(f.t.status.rootUntil,13);assert.ok(f.t.buffs.some(b=>b.disarm&&b.dps===0));
 f.g._step(1);near(f.t.hp,before-500);f.g._step(1);f.g._step(1);near(f.t.hp,before-1500);assert.equal(f.t.buffs.some(b=>b.key==='BEer'),false);assert.equal(f.g.state.sourceSkillJobs.some(j=>j.type==='deathwing_human_root'),false);
});
test('human and dragon active commands obey current owner, phase, silence, mana and cooldown gates',()=>{
 for(const id of ['A0YF','A0YJ']){const f=fixture([id]);f.a.status.silenceUntil=11;assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:id,targetId:f.t.id,playerId:0}).ok,false);f.a.status.silenceUntil=0;f.a.mana=11;assert.equal(manualSourceSkills(f.g,f.a)[0].canStart,false);f.a.mana=100;assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:id,targetId:f.t.id,playerId:4}).ok,false);assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:id,targetId:f.t.id,playerId:0}).ok,true);assert.equal(manualSourceSkills(f.g,f.a)[0].canStart,false);near(f.a.mana,88);}
});
test('blood uses pre-hit truncated loss level and its explicit per-level regeneration in the actual engine',()=>{
 const f=fixture(['A0YE']);f.a.hp=5000;f.a.hpRegen=50;f.g._hurt(f.a,100,f.t,{spell:true});assert.equal(f.a.abilityLevels.A0YE,5);near(f.a.hp,4900);near(sourceAuraEffects(f.g,f.a,[f.a]).healRate,20);
 near(compileSkills({abilityIds:['A0YE'],skillVersion:'v14.1A5',abilityLevels:f.a.abilityLevels})[0].regen,20);f.g._updateEntities(1);near(f.a.hp,4970);
 f.a.hp=f.a.maxHp;f.g._hurt(f.a,1,f.t,{spell:true});assert.equal(f.a.status.deathwingHuman.bloodLevelRequest.requestedLevel,0);assert.equal(f.a.abilityLevels.A0YE,5);
});
test('blood trigger does not run for zero allied nested or A2Y7 damage',()=>{
 for(const mode of ['zero','allied','nested','excluded']){const f=fixture(['A0YE']);f.a.hp=4000;if(mode==='allied')f.t.side=f.a.side;if(mode==='nested')f.g._sourceDamageTriggerDepth=1;if(mode==='excluded')f.skills(f.t,['A2Y7']);f.g._hurt(f.a,mode==='zero'?0:1,f.t,{spell:true});assert.equal(f.a.status.deathwingHuman,undefined,mode);}
});
test('dragon defense zero wins over preceding bright Arthas reduction while thresholds still execute',()=>{
 const f=fixture(['A0YJ','A1W2']);f.a.hp=6000;f.g._random=()=>.1;const before=f.a.hp,enemy=f.t.hp;f.g._hurt(f.a,100,f.t,{spell:true});near(f.a.hp,before);assert.equal(f.a.status.deathwingDragon.threshold70,true);assert.ok(f.t.hp<enemy);assert.equal(f.g._sourceDamageTriggerDepth,0);
});
test('ordinary death waits three seconds and then creates a new correctly mapped non-hero dragon',()=>{
 for(const [human,dragon] of [['h0PC','h0PE'],['h0UY','h0V0'],['h0XE','h0XG']]){const f=fixture();f.a.combatRawcode=human;f.skills(f.a,['A0YH']);f.g.state.wave=20;f.t.worldX=50;f.g._hurt(f.a,20000,f.t,{spell:true});assert.equal(f.a.status.sourceDeathHandled,true);assert.equal(f.a.status.deathwingDragon.revival.pending,true);f.g._clearDead();assert.ok(f.g.state.entities.includes(f.a));f.at(12.999);assert.equal(f.g.state.entities.length,2);f.at(13);const body=f.g.state.entities.find(e=>e.status.deathwingDragon?.originId===f.a.id);assert.ok(body);assert.equal(body.combatRawcode,dragon);assert.notEqual(body.id,f.a.id);assert.equal(body.userData,1);assert.equal(body.ownerId,0);assert.equal(body.isNativeHero,false);assert.equal(body.isSummon,false);assert.equal(body.status.sourceJHMember,1);assert.equal(f.g.state.entities.includes(f.a),false);assert.ok(body.skillSpecs.some(s=>s.id==='A0YJ'));}
});
test('wave 21 ordinary death and inactive userdata cancel dragon revival',()=>{
 for(const mode of ['late','inactive']){const f=fixture(['A0YH']);if(mode==='late')f.g.state.wave=21;else f.a.userData=0;f.g._hurt(f.a,20000,f.t,{spell:true});f.at(13);assert.equal(f.g.state.entities.some(e=>e.status.deathwingDragon?.originId===f.a.id),false);f.g._clearDead();assert.equal(f.g.state.entities.includes(f.a),false);}
});
test('native reincarnation postpones ordinary Deathwing death instead of scheduling both revivals',()=>{
 const f=fixture(['A18C','A0YH']);f.g._hurt(f.a,20000,f.t,{spell:true});assert.equal(f.a.status.reincarnation.phase,'waiting');assert.equal(f.a.status.deathwingDragon,undefined);f.at(12);assert.ok(f.a.hp>0);f.g._hurt(f.a,20000,f.t,{spell:true});assert.equal(f.a.status.deathwingDragon.revival.pending,true);
});
test('pending dragon prevents the last monster wave from ending early',()=>{
 const f=fixture();f.skills(f.t,['A0YH']);f.g._hurt(f.t,20000,f.a,{spell:true});f.g._step(1);assert.equal(f.g.state.phase,'combat');assert.ok(f.g.state.entities.includes(f.t));f.g._step(1);assert.equal(f.g.state.phase,'combat');
});
test('pending dragon prevents arena winner selection until the actual replacement',()=>{
 const f=fixture(['A0YH']);f.g.state.phase='arena';f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;f.g._hurt(f.a,20000,f.t,{spell:true});f.g._step(1);assert.equal(f.g.state.phase,'arena');assert.ok(f.g.state.entities.includes(f.a));
});
test('pending dragon save restores the source alias and original absolute deadline exactly once',()=>{
 const f=fixture(['A0YH']);f.t.worldX=50;f.g._hurt(f.a,20000,f.t,{spell:true});f.at(11);const g=Game.fromSnapshot(clone(f.g.snapshot())),old=g.state.entities.find(e=>e.id===f.a.id),job=g.state.sourceSkillJobs.find(j=>j.type==='deathwing_revive');assert.equal(job.source,old);assert.equal(job.nextAt,13);g.state.time=13;tickSourceScriptJobs(g);assert.equal(g.state.entities.filter(e=>e.status.deathwingDragon?.originId===f.a.id).length,1);g.state.time=13.1;tickSourceScriptJobs(g);assert.equal(g.state.entities.filter(e=>e.status.deathwingDragon?.originId===f.a.id).length,1);
});
test('kill bonus changes the real weapon interval and keeps the shared source counter',()=>{
 const f=fixture(['A0YJ']);f.a.hp=9000;f.a.status.sourceKillnum=24;f.g._hurt(f.t,20000,f.a,{spell:true});near(f.a.hp,9100);assert.equal(f.a.status.sourceKillnum,25);near(sourceAuraEffects(f.g,f.a,[]).haste,.06);const next=f.make('h0PC',true,.5),battle=[f.a,next];battle.auras=[];f.g._attack(f.a,next,battle);near(f.a.attackCd,f.a.attackInterval/1.06);
 f.g._hurt(next,20000,f.a,{spell:true});assert.equal(f.a.status.sourceKillnum,25);near(sourceAuraEffects(f.g,f.a,[]).haste,.06);
});
test('real fissure command and pending path survive snapshot without repeated payment',()=>{
 const f=fixture(['A0YJ']);f.t.sourceArmorTypeRaw='none';f.t.armorType='unarmored';f.t.armor=0;f.g._sourceAbilityEffectDepth=1;
 assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A0YJ',targetId:f.t.id,playerId:0}).ok,true);f.g._sourceAbilityEffectDepth=0;f.at(11.5);const g=Game.fromSnapshot(clone(f.g.snapshot()));f.at(11.8);g.state.time=11.8;tickSourceScriptJobs(g);const a=g.state.entities.find(e=>e.id===f.a.id),t=g.state.entities.find(e=>e.id===f.t.id);near(t.hp,f.t.hp);near(t.worldX,f.t.worldX);near(a.mana,88);assert.equal(a.skillStates.A0YJ.casts,1);assert.equal(a.status.deathwingDragon.lastFissure.traveled,500);assert.ok(t.hp<10000);
});
test('root snapshot restore coalesces the shared dummy and completes damage without duplicating commands',()=>{
 const f=fixture(['A0YF']);f.t.sourceArmorTypeRaw='none';f.t.armorType='unarmored';f.g.command('cast',{entityId:f.a.id,skillId:'A0YF',targetId:f.t.id,playerId:0});f.at(11);const g=Game.fromSnapshot(clone(f.g.snapshot())),roots=g.state.sourceSkillJobs.filter(j=>j.type==='deathwing_human_root'),dummy=g.state.sourceSkillJobs.find(j=>j.type==='deathwing_human_dummy').dummy;assert.ok(roots.every(j=>j.dummy===dummy));f.at(13);g.state.time=13;tickSourceScriptJobs(g);near(g.state.entities.find(e=>e.id===f.t.id).hp,f.t.hp);near(g.state.entities.find(e=>e.id===f.a.id).mana,88);
});
