import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,manualSourceSkills,tickSourceScriptJobs,sourceAuraEffects} from '../dist/skills.js';
import {aesaraIssuedOrder} from '../dist/aesara-rules.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(){
 const g=new Game({mode:'sandbox',seed:447}),p=g.state.players[0],def=UNITS.find(u=>u.sourceRawcode==='n05H'),b={id:'queen-building',unitId:def.id,col:2,row:1};g.state.phase='combat';g.state.time=0;g.state.entities=[];g.state.sourceSkillJobs=[];for(const p of g.state.players)p.buildings=[];p.buildings.push(b);p.heroAltarCount=1;g._recordLimitOrigins(b,def);g._recordSourceCompletion(p,def);g._recordEggCompletion(p,def,b);g._spawnDefender(def,p,3,6,b.id);const e=g.state.entities[0];e.mana=e.maxMana=200;e.hp=1000;e.maxHp=100000;e.hpRegen=e.manaRegen=0;e.attackCd=e.abilityCd=1e9;return {g,e};
}
function other(g,e,{x=.5,y=0,code='h002',team=1,hp=100000,...extra}={}){
 const t=g._entity(UNIT_TEMPLATES[code],{worldX:e.worldX+x,worldY:e.worldY+y,team,side:team===0?'defender':'monster',battleTeam:0,laneId:0,ownerId:team===0?0:null,...extra});t.skillSpecs=[];t.hp=t.maxHp=hp;t.mana=0;t.attackCd=t.abilityCd=1e9;g.state.entities.push(t);return t;
}
const cast=(g,e,id,t)=>g.command('cast',{entityId:e.id,skillId:id,...(t?{targetId:t.id}:{})});
const tick=(g,at)=>{g.state.time=at;tickSourceScriptJobs(g);};
const jobs=g=>g.state.sourceSkillJobs.filter(j=>j.type==='aesara_snake'&&!j.done);
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
const requests=(e,id)=>e.status.aesaraNativeRequests?.filter(r=>r.abilityId===id)??[];
const damage=(g,t)=>325*g._typeMultiplier('spells',t.armorType,t.sourceArmorTypeRaw)*g._armorFactor(t.armor);

test('snake manual command has exact known cost/cooldown/range and shield exposes a toggle',()=>{
 const {g,e}=fixture(),s=manualSourceSkills(g,e);assert.deepEqual(s.map(s=>[s.id,s.manaCost,s.cooldown,s.targetKind]),[['A0VX',18,10,'enemy'],['A0VY',0,999,'none']]);assert.ok(s.every(s=>s.status==='partial'));
 const t=other(g,e,{x:2.667});assert.equal(cast(g,e,'A0VX',t).ok,false);near(e.mana,200);t.worldX=e.worldX+800/300;assert.equal(cast(g,e,'A0VX',t).ok,true);near(e.mana,182);assert.equal(cast(g,e,'A0VX',t).ok,false);
});
test('separate miShuYiShe listener runs while allability is disabled',()=>{
 const {g,e}=fixture(),t=other(g,e);g._sourceAbilityEffectDepth=1;assert.equal(cast(g,e,'A0VX',t).ok,true);assert.equal(cast(g,e,'A0VY').ok,true);assert.equal(jobs(g).length,1);assert.ok(has(e,'A0W2'));near(e.mana,182);
});
test('initial damage does not use a passive shield; it opens afterward for the next hit',()=>{
 const {g,e}=fixture(),t=other(g,e);g._hurt(e,100,t,{spell:true,universal:true});near(e.hp,900);near(e.mana,200);assert.equal(e.status.aesaraShieldBuff,true);assert.ok(has(e,'A0W2'));
 g._hurt(e,100,t,{spell:true,universal:true});near(e.hp,890);near(e.mana,198.5);
});
test('shield adds only self 25 HP/s and manual off removes it, returns ten mana and sets five seconds',()=>{
 const {g,e}=fixture();e.mana=50;cast(g,e,'A0VY');near(sourceAuraEffects(g,e,[]).healRate,25);assert.equal(manualSourceSkills(g,e).find(s=>s.id==='A0VY').name,'关闭魔法护盾');
 g.state.time=1;cast(g,e,'A0VY');near(e.mana,60);assert.equal(has(e,'A0W2'),false);near(sourceAuraEffects(g,e,[]).healRate,0);near(e.skillStates.A0VY.readyAt,6);assert.equal(cast(g,e,'A0VY').ok,false);g.state.time=6;assert.equal(cast(g,e,'A0VY').ok,true);
});
test('off order script requires missing native B06S, and repeated off cannot refund twice',()=>{
 const {g,e}=fixture();e.mana=10;cast(g,e,'A0VY');const api={removeAbility:(g,e,id)=>{e.skillSpecs=e.skillSpecs.filter(s=>s.id!==id);}};
 assert.equal(aesaraIssuedOrder(g,e,'manashieldoff',api),false);near(e.mana,10);e.status.aesaraShieldBuff=false;assert.equal(aesaraIssuedOrder(g,e,'manashieldoff',api),true);near(e.mana,20);assert.equal(aesaraIssuedOrder(g,e,'manashieldoff',api),false);near(e.mana,20);
});
test('mana depletion absorbs only remaining mana, then eligible damage listener cleans up and refunds once',()=>{
 const {g,e}=fixture(),t=other(g,e);e.mana=1;cast(g,e,'A0VY');g._hurt(e,100,t,{spell:true,universal:true});near(e.hp,960);near(e.mana,10);assert.equal(e.status.aesaraShieldBuff,false);assert.equal(e.status.aesaraShieldScriptOn,false);assert.equal(has(e,'A0W2'),false);near(e.skillStates.A0VY.readyAt,5);
 g._hurt(e,100,t,{spell:true,universal:true});near(e.hp,860);near(e.mana,10);
});
test('native shield can absorb nested or allied damage while script cleanup respects main listener guards',()=>{
 const {g,e}=fixture(),t=other(g,e);e.mana=1;cast(g,e,'A0VY');g._sourceDamageTriggerDepth=1;g._hurt(e,100,t,{spell:true,universal:true});g._sourceDamageTriggerDepth=0;near(e.hp,960);near(e.mana,0);assert.equal(e.status.aesaraShieldScriptOn,true);assert.ok(has(e,'A0W2'));
 const ally=other(g,e,{team:0});g._hurt(e,1,ally,{spell:true,universal:true});near(e.mana,0);g._hurt(e,1,t,{spell:true,universal:true});near(e.mana,10);assert.equal(has(e,'A0W2'),false);
});
test('A2Y7, allied, null-source and self damage cannot auto-open shield',()=>{
 for(const kind of ['A2Y7','ally','null','self']){const {g,e}=fixture(),t=other(g,e,{team:kind==='ally'?0:1});if(kind==='A2Y7')t.skillSpecs=[{id:'A2Y7',status:'marker'}];g._hurt(e,10,kind==='self'?e:kind==='null'?null:t,{spell:true,universal:true});assert.ok(!e.status.aesaraShieldScriptOn,kind);}
});
test('counter checks native melee type even on a spell event; missing movement and execution remain unclaimed',()=>{
 const {g,e}=fixture(),melee=other(g,e,{isMeleeAttacker:true}),ranged=other(g,e,{isMeleeAttacker:false});cast(g,e,'A0VY');g._hurt(e,100,melee,{spell:true,universal:true});g._hurt(e,100,ranged);
 const r=requests(e,'A0W3');assert.equal(r.length,1);assert.equal(r[0].targetId,melee.id);assert.equal(r[0].haste,-.3);assert.equal(r[0].move,null);assert.equal(r[0].duration,3);assert.equal(r[0].sharedDummy,true);assert.equal(melee.buffs.length,0,'unverified shared-dummy orders must not invent debuffs');
});
test('lost buff cleanup does not run through a prior literal elseif branch',()=>{
 const {g,e}=fixture(),t=other(g,e);e.mana=20;cast(g,e,'A0VY');e.status.aesaraShieldBuff=false;t.skillSpecs=[{id:'A0LN',status:'marker'}];g._hurt(e,10,t,{spell:true,universal:true});near(e.mana,20);assert.equal(e.status.aesaraCleanupDeferred,'prior-elseif');
 t.skillSpecs=[];g._hurt(e,10,t,{spell:true,universal:true});near(e.mana,30);assert.equal(e.status.aesaraShieldScriptOn,false);
});
test('unknown prior hashtable/random branches preserve explicit deferred cleanup instead of guessing',()=>{
 const {g,e}=fixture(),t=other(g,e,{code:'h055'});cast(g,e,'A0VY');e.status.aesaraShieldBuff=false;g._hurt(e,10,t,{spell:true,universal:true});assert.equal(e.status.aesaraCleanupDeferred,'prior-elseif-unresolved');assert.equal(e.status.aesaraShieldScriptOn,true);
});
test('snake has no zero tick, follows the current target, and moves nine source units every .02 seconds',()=>{
 const {g,e}=fixture(),t=other(g,e,{x:1});cast(g,e,'A0VX',t);const j=jobs(g)[0];tick(g,0);near(j.x,e.worldX);tick(g,.02);near(j.x-e.worldX,9/300);near(j.y,e.worldY);t.worldX=j.x;t.worldY=j.y+1;tick(g,.04);near(j.x-e.worldX,9/300);near(j.y-e.worldY,9/300);
});
test('snake applies normal/normal damage with armor, even to magic-immune targets, without independent attack hooks',()=>{
 const {g,e}=fixture(),t=other(g,e,{x:0}),expected=damage(g,t);t.skillSpecs=[{id:'Amim',kind:'immunity',status:'implemented'}];cast(g,e,'A0VX',t);tick(g,.02);near(t.hp,100000-expected);assert.ok(expected!==325);assert.equal(jobs(g)[0].hits,1);
});
test('eight unique hits then return; no random choice, no repeat, and no ninth enemy hit',()=>{
 const {g,e}=fixture(),targets=Array.from({length:9},()=>other(g,e,{x:0}));let draws=0;g._random=()=>{draws++;return .9;};cast(g,e,'A0VX',targets[0]);const j=jobs(g)[0];tick(g,.16);assert.equal(j.hits,8);assert.equal(new Set(j.hitIds).size,8);assert.equal(j.targetId,e.id);assert.equal(targets[8].hp,100000);assert.equal(draws,0,'snake targeting does not draw');tick(g,.18);assert.equal(j.done,true);assert.equal(draws,1,'return kills dummy: main death alchemy initializer draws once');assert.equal(requests(e,'A0W0').length,2);assert.equal(g.state.entities.filter(u=>u.isIllusion).length,0);
});
test('bounce selects from projectile position, excludes buildings/allies/low HP, but does not exclude Avul',()=>{
 const {g,e}=fixture(),first=other(g,e,{x:0}),structure=other(g,e,{x:0,isBuilding:true}),ally=other(g,e,{x:0,team:0}),low=other(g,e,{x:0}),inv=other(g,e,{x:0});low.hp=.65;inv.skillSpecs=[{id:'Avul',status:'implemented',kind:'invulnerability'}];cast(g,e,'A0VX',first);tick(g,.02);const j=jobs(g)[0];assert.equal(j.targetId,inv.id);tick(g,.04);near(inv.hp,100000);assert.ok(j.hitIds.includes(inv.id));for(const t of [structure,ally])near(t.hp,100000);
});
test('already-dead target requests a kill illusion at current projectile position, capped at two per flight',()=>{
 const {g,e}=fixture(),t=other(g,e,{x:2}),next=other(g,e,{x:0,hp:1}),third=other(g,e,{x:0,hp:1});cast(g,e,'A0VX',t);t.hp=0;const before={x:e.worldX,y:e.worldY};tick(g,.06);const j=jobs(g)[0];assert.equal(j.killIllusionRequests,2);assert.equal(j.hits,3);assert.equal(requests(e,'A0W0').length,2);assert.deepEqual({x:e.worldX,y:e.worldY},before);assert.equal(requests(e,'A0W0')[0].x,before.x);tick(g,.08);assert.equal(requests(e,'A0W0').length,4);
});
test('caster death does not cancel snake; dead retained caster still receives two native return requests',()=>{
 const {g,e}=fixture(),t=other(g,e,{x:0});cast(g,e,'A0VX',t);e.hp=0;g._sourceDeath(e,t);g._clearDead();assert.equal(jobs(g).length,1);tick(g,.04);assert.equal(jobs(g).length,0);assert.equal(requests(e,'A0W0').filter(r=>r.reason==='return').length,2);
});
test('e00P regeneration dispatches a death event without canceling a long chase',()=>{
 const {g,e}=fixture(),t=other(g,e,{x:2});cast(g,e,'A0VX',t);t.worldX+=100;const j=jobs(g)[0];tick(g,20.02);assert.equal(j.dummy.hp,0);assert.equal(j.dummy.status.sourceDeathHandled,true);assert.equal(j.done,undefined);assert.ok(j.x>e.worldX+20);tick(g,21);assert.equal(j.dummy.status.sourceDeathHandled,true);
});
test('JSON resume rebinds live retained handles and continues flight, shield toggle and resources identically',()=>{
 const {g,e}=fixture(),t=other(g,e,{x:.5});cast(g,e,'A0VX',t);cast(g,e,'A0VY');tick(g,.12);const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot())));assert.equal(restored.state.aesaraHandles[t.id],restored.state.entities.find(u=>u.id===t.id));
 for(const game of[g,restored]){tick(game,.8);const caster=game.state.entities.find(u=>u.id===e.id);cast(game,caster,'A0VY');tick(game,2);}
 assert.deepEqual(restored.snapshot(),g.snapshot());
});
test('round reset clears snake handles and jobs; old saves do not invent an activated shield',()=>{
 const {g,e}=fixture(),t=other(g,e);cast(g,e,'A0VX',t);g.command('sandboxReset');assert.deepEqual(g.state.aesaraHandles,{});assert.equal(jobs(g).length,0);
 const f=fixture();delete f.g.state.aesaraHandles;f.e.skillImplementationRevision='v14-content-20261026-v20-1';const restored=Game.fromSnapshot(f.g.snapshot()),queen=restored.state.entities[0];assert.equal(queen.status.aesaraShieldScriptOn,undefined);assert.equal(manualSourceSkills(restored,queen).find(s=>s.id==='A0VY').name,'魔法护盾');
});
test('coarse snake processing gives other hero autocasts the actual impact time and restores the outer clock',()=>{
 const {g,e}=fixture(),t=other(g,e,{code:'h0XA',x:0});t.skillSpecs=compileSkills({abilityIds:['A1VY'],skillVersion:'v14.1A5'});t.mana=100;cast(g,e,'A0VX',t);tick(g,1);near(g.state.time,1);near(t.skillStates.A1VY.readyAt,9.02);assert.ok(g.state.sourceSkillJobs.some(j=>j.type==='bright_arthas_shield'&&Math.abs(j.nextAt-3.02)<1e-7));
});

test('source ATTACK_TYPE_NORMAL means Spells; snake uses the fortified row and native spell resistance',()=>{
 for(const resistant of [false,true]){const {g,e}=fixture(),t=other(g,e,{x:0});t.armor=0;t.armorType='fortified';t.sourceArmorTypeRaw='fort';if(resistant)t.skillSpecs=compileSkills({abilityIds:['A19A'],skillVersion:'v14.1A5',distanceScale:1/3});cast(g,e,'A0VX',t);tick(g,.02);near(t.hp,100000-(resistant?585:975));}
});
