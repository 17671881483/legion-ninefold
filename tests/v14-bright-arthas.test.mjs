import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {tickSourceScriptJobs,manualSourceSkills,compileSkills,sourceAuraEffects} from '../dist/skills.js';
import {initializeBrightArthasDeployment} from '../dist/bright-arthas-rules.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(){
  const g=new Game({mode:'sandbox',seed:421});g.state.phase='combat';g.state.time=0;g.state.entities=[];g.state.sourceSkillJobs=[];for(const p of g.state.players)p.buildings=[];
  const p=g.state.players[0],def=UNITS.find(u=>u.sourceRawcode==='n08Z'),b={id:'bright-arthas-building',unitId:def.id,col:2,row:1};p.buildings.push(b);p.heroAltarCount=1;
  g._recordLimitOrigins(b,def);g._recordSourceCompletion(p,def);g._recordEggCompletion(p,def,b);g._spawnDefender(def,p,3,6,b.id);
  const e=g.state.entities[0];e.mana=e.maxMana=200;e.hp=1000;e.maxHp=100000;e.attackCd=e.abilityCd=1e9;return {g,e,p,b,def};
}
function other(g,e,{code='h002',x=.5,y=0,team=1,hp=100000,...extra}={}){
  const t=g._entity(UNIT_TEMPLATES[code],{worldX:e.worldX+x,worldY:e.worldY+y,team,side:team===0?'defender':'monster',battleTeam:0,laneId:0,ownerId:team===0?0:null,...extra});
  t.skillSpecs=[];t.hp=t.maxHp=hp;t.mana=0;t.attackCd=t.abilityCd=1e9;g.state.entities.push(t);return t;
}
const cast=(g,e,id,t)=>g.command('cast',{entityId:e.id,skillId:id,...(t?{targetId:t.id}:{})});
const tick=(g,at)=>{g.state.time=at;tickSourceScriptJobs(g);};
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===`bright_arthas_${type}`&&!j.done);
const retain=(e,ids)=>{e.skillSpecs=e.skillSpecs.filter(s=>ids.includes(s.id));};
const kill=(g,t,e)=>g._hurt(t,t.hp*10,e,{spell:true,universal:true});
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id);

test('four native unit/no-target commands expose exact costs, ranges, cooldowns and partial boundaries',()=>{
  const {g,e}=fixture();assert.deepEqual(manualSourceSkills(g,e).map(s=>[s.id,s.manaCost,s.cooldown,s.targetKind]),[
    ['A1VX',16,12,'none'],['A1VY',14,9,'none'],['A1W0',17,14,'enemy'],['A1W1',13,20,'enemy']]);
  assert.ok(manualSourceSkills(g,e).every(s=>s.status==='partial'&&s.cooldownMode==='shared_native'));
  const t=other(g,e,{x:1.334});assert.equal(cast(g,e,'A1W1',t).ok,false);near(e.mana,200);t.worldX=e.worldX+400/300;assert.equal(cast(g,e,'A1W1',t).ok,true);near(e.mana,187);assert.equal(cast(g,e,'A1W1',t).ok,false);
  assert.equal(g.command('cast',{entityId:e.id,skillId:'A1W0',worldX:t.worldX,worldY:t.worldY}).ok,false,'native DataB1=1 requires a unit');
});

test('light adds thirty armor, starts at .04, heals 40 per orb, and releases once after 150 pulses',()=>{
  const {g,e}=fixture(),base=e.armor;cast(g,e,'A1VX');near(e.armor,base+30);tick(g,0);near(e.hp,1000);tick(g,.04);near(e.hp,1120);
  assert.deepEqual(jobs(g,'light').map(j=>j.angle),[7,127,247]);tick(g,5.999);near(e.hp,1000+149*120);near(e.armor,base+30);
  tick(g,6);near(e.hp,19000);near(e.armor,base);assert.equal(jobs(g,'light').length,0);assert.equal(e.status.brightFuryActive,false,'timed KillUnit(e008) is a real global death');tick(g,7);near(e.armor,base);
});

test('orbit follows caster current position and excludes dead, enemy and Avul allies',()=>{
  const {g,e}=fixture(),friend=other(g,e,{team:0,x:10}),enemy=other(g,e,{x:10}),inv=other(g,e,{team:0,x:10}),dead=other(g,e,{team:0,x:10});
  friend.hp=enemy.hp=inv.hp=100;dead.hp=0;inv.skillSpecs=[{id:'Avul',kind:'invulnerability',status:'implemented'}];cast(g,e,'A1VX');e.worldX+=10;tick(g,.04);near(friend.hp,220);near(enemy.hp,100);near(inv.hp,100);near(dead.hp,0);
  for(const j of jobs(g,'light'))near(Math.hypot(j.x-e.worldX,j.y-e.worldY),200/300);
});

test('orb death releases only its own ten armor; caster death leaves un-killed orphan dummies',()=>{
  const {g,e}=fixture(),t=other(g,e),base=e.armor;cast(g,e,'A1VX');e.mana=0;const j=jobs(g,'light')[0];j.dummy.hp=0;g._sourceDeath(j.dummy,null);near(e.armor,base+20);assert.equal(jobs(g,'light').length,2);
  kill(g,e,t);near(e.armor,base);assert.equal(jobs(g,'orphan').length,2);assert.ok(jobs(g,'orphan').every(j=>j.dummy.hp===60&&!j.dummy.status.sourceDeathHandled));
  tick(g,8);assert.equal(jobs(g,'orphan').length,2);near(e.armor,base);
});

test('separate light casts own separate armor contributions and expiration times',()=>{
  const {g,e}=fixture(),base=e.armor;cast(g,e,'A1VX');g.state.time=1;e.skillStates.A1VX.readyAt=1;cast(g,e,'A1VX');near(e.armor,base+60);tick(g,6);near(e.armor,base+30);assert.equal(jobs(g,'light').length,3);tick(g,7);near(e.armor,base);
});

test('barrier selects self first then two group entries without excluding self or rolling random',()=>{
  const {g,e}=fixture(),a=other(g,e,{team:0}),b=other(g,e,{team:0}),outside=other(g,e,{team:0,x:1.667}),enemy=other(g,e);let draws=0;g._random=()=>{draws++;return 0;};
  cast(g,e,'A1VY');assert.equal(draws,0);assert.ok(has(e,'A1W2')&&has(a,'A1W2'));assert.ok(!has(b,'A1W2')&&!has(outside,'A1W2')&&!has(enemy,'A1W2'));assert.equal(jobs(g,'shield').length,2);
});

test('barrier clears supported positive native buffs, retains negatives, raw abilities and unknown script buffs',()=>{
  const {g,e}=fixture();e.buffs=[{key:'frenzy',skillId:'A0RA',haste:.5,expiresAt:100},{key:'slow',skillId:'A1CV',move:-.5,expiresAt:100},{key:'custom-positive',haste:.8,expiresAt:100}];
  const base=compileSkills({abilityIds:['A0RA'],skillVersion:'v14.1A5'})[0].base;assert.ok(['Ablo','Aroa','Ainf','Afzy','AUfa','Absk'].includes(base),base);
  e.status.stunUntil=0;e.status.rootUntil=50;cast(g,e,'A1VY');assert.deepEqual(e.buffs.map(b=>b.key),['slow','custom-positive']);assert.equal(e.status.rootUntil,50);assert.ok(has(e,'A1W2'));assert.ok(e.status.brightUnclassifiedBuffs.includes('custom-positive'));
});

test('barrier refresh cancels previous removal and target death removes its ability immediately',()=>{
  const {g,e}=fixture(),a=other(g,e,{team:0}),enemy=other(g,e);cast(g,e,'A1VY');g.state.time=2;e.skillStates.A1VY.readyAt=2;cast(g,e,'A1VY');e.mana=0;
  tick(g,3);assert.ok(has(e,'A1W2'));assert.equal(jobs(g,'shield').length,2);kill(g,a,enemy);assert.ok(!has(a,'A1W2'));tick(g,4.99);assert.ok(has(e,'A1W2'));tick(g,5);assert.ok(!has(e,'A1W2'));
});

test('main damage shield is twenty-percent reduction, applies after same-hit autocast and composes with QC',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1VY']);g._hurt(e,100,t,{spell:true,universal:true});near(e.hp,920);assert.ok(has(e,'A1W2'));near(e.mana,186);
  e.skillSpecs.push(...compileSkills({abilityIds:['A2ZG'],skillVersion:'v14.1A5'}));g._hurt(e,100,t,{spell:true,universal:true});near(e.hp,852);
  g._sourceDamageTriggerDepth=1;g._hurt(e,100,t,{spell:true,universal:true});g._sourceDamageTriggerDepth=0;near(e.hp,752,'nested main listener is disabled');
});

test('A1W2 preserves main listener self, ally, A2Y7 and null-source exclusions',()=>{
  const {g,e}=fixture();cast(g,e,'A1VY');retain(e,['A1W2']);e.mana=0;const ally=other(g,e,{team:0}),enemy=other(g,e);enemy.skillSpecs=[{id:'A2Y7',status:'marker'}];
  for(const a of [e,ally,enemy,null])g._hurt(e,100,a,{spell:true,universal:true});near(e.hp,600);enemy.skillSpecs=[];g._hurt(e,100,enemy,{spell:true,universal:true});near(e.hp,520);
});

test('hunger sees pre-wall main P8 then the independently reduced attack damage',()=>{
  const {g,e}=fixture(),dark=other(g,e,{code:'h0X9'});cast(g,e,'A1VY');retain(e,['A1W2']);dark.skillSpecs=compileSkills({abilityIds:['A1VR'],skillVersion:'v14.1A5'});dark.maxHp=1000;dark.hp=500;
  g._hurt(e,100,dark);near(e.hp,920);near(dark.status.arthasHungerDamage,180);
});

test('judgment changes movement only, restores template default rather than prior modified speed, then damages',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1W0']);t.moveSpeed=9;cast(g,e,'A1W0',t);e.mana=0;near(t.moveSpeed,0);assert.equal(t.status.stunUntil,undefined);assert.equal(t.status.rootUntil,undefined);
  const before=e.hp;g._attack(t,e,{auras:[]});assert.ok(e.hp<before,'a judged target can still attack');tick(g,2.999);near(t.hp,100000);tick(g,3);near(t.hp,100000-311);near(t.moveSpeed,UNIT_TEMPLATES.h002.sourceSpeed/300);
});

test('overlapping judgments are independent timers, not a merged longest root',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1W0']);cast(g,e,'A1W0',t);g.state.time=1;e.skillStates.A1W0.readyAt=1;cast(g,e,'A1W0',t);e.mana=0;
  tick(g,3);near(t.moveSpeed,UNIT_TEMPLATES.h002.sourceSpeed/300);near(t.hp,100000-311);assert.equal(jobs(g,'judgment').length,1);tick(g,4);near(t.hp,100000-622);
});

test('judgment keeps its original selected handles, survives caster death and does not add new entrants',()=>{
  const {g,e}=fixture(),t=other(g,e),far=other(g,e,{x:4});retain(e,['A1W0']);cast(g,e,'A1W0',t);e.mana=0;t.worldX+=10;far.worldX=e.worldX+.5;kill(g,e,far);g._clearDead();tick(g,3);near(t.hp,100000-311);near(far.hp,100000);
});

test('dead judgment target still receives its timer cleanup on retained handle, never damages a replacement',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1W0']);cast(g,e,'A1W0',t);e.mana=0;kill(g,t,e);g._clearDead();assert.equal(jobs(g,'judgment').length,1);const replacement=other(g,e);tick(g,3);near(t.moveSpeed,UNIT_TEMPLATES.h002.sourceSpeed/300);near(replacement.hp,100000);assert.equal(jobs(g,'judgment').length,0);
});

test('hammer flies fixed direction to 480, finishes at .16 and damages/stuns terminal area only',()=>{
  const {g,e}=fixture(),t=other(g,e,{x:1}),edge=other(g,e,{x:2.6}),out=other(g,e,{x:2.601});retain(e,['A1W1']);cast(g,e,'A1W1',t);e.mana=0;tick(g,0);const j=jobs(g,'hammer')[0];near(j.x-e.worldX,.4);t.worldY+=3;
  tick(g,.12);near(j.x-e.worldX,1.6);near(edge.hp,100000);tick(g,.16);near(edge.hp,100000-266);near(out.hp,100000);near(t.hp,100000);near(edge.status.stunUntil,3.16);assert.equal(j.done,true);
});

test('hammer terminal damage is universal; native stun excludes mechanical/immune and halves native hero duration',()=>{
  const {g,e}=fixture(),target=other(g,e,{x:1}),hero=other(g,e,{x:1.6,isNativeHero:true}),immune=other(g,e,{x:1.6}),mech=other(g,e,{x:1.6});retain(e,['A1W1']);
  immune.skillSpecs=[{id:'Amim',kind:'immunity',status:'implemented'}];immune.armor=100;mech.traits=['mechanical'];cast(g,e,'A1W1',target);e.mana=0;tick(g,.16);
  for(const t of [hero,immune,mech])near(t.hp,100000-266);near(hero.status.stunUntil,1.66);assert.equal(immune.status.stunUntil,undefined);assert.equal(mech.status.stunUntil,undefined);
});

test('hammer survives caster death, but dummy death immediately explodes at its current location',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1W1']);cast(g,e,'A1W1',t);e.mana=0;kill(g,e,t);assert.equal(jobs(g,'hammer').length,1);g._clearDead();const j=jobs(g,'hammer')[0];j.dummy.hp=0;g._sourceDeath(j.dummy,null);near(t.hp,100000-266);assert.equal(j.done,true);tick(g,1);near(t.hp,100000-266);
});

test('fury birth registration uses building A1VY, not body A1VZ, and first unrelated death destroys listener',()=>{
  const {g,e,b}=fixture(),baseArmor=e.armor;assert.equal(e.status.brightFuryActive,true);const body=g._entity(UNIT_TEMPLATES.h002,{team:0,side:'defender',status:{}});initializeBrightArthasDeployment(g,b,body);assert.equal(body.status.brightFuryActive,true);
  const unregistered=g._entity(UNIT_TEMPLATES.h0XA,{team:0,side:'defender',status:{}});assert.equal(unregistered.status.brightFuryActive,undefined);initializeBrightArthasDeployment(g,{sourceRawcode:'h002'},unregistered);assert.equal(unregistered.status.brightFuryActive,undefined);
  e.mana=0;const ally=other(g,e,{team:0});kill(g,ally,other(g,e));assert.equal(e.status.brightFuryActive,false);assert.equal(e.status.brightFuryEndedBy,ally.id);
  for(let i=0;i<20;i++)kill(g,other(g,e),e);assert.ok(!has(e,'A10C')&&!has(e,'A1W3'));near(sourceAuraEffects(g,e,[e]).haste,0);near(e.armor,baseArmor);
});

test('allability reentry suppresses body after mana payment; native immediate autocasts preserve victim priority',()=>{
  const {g,e}=fixture();g._sourceAbilityEffectDepth=1;cast(g,e,'A1VX');near(e.mana,184);assert.equal(jobs(g,'light').length,0);g._sourceAbilityEffectDepth=0;
  const f=fixture(),t=other(f.g,f.e,{code:'h0XA'});t.skillSpecs=compileSkills(UNIT_TEMPLATES.h0XA);t.mana=40;f.e.mana=40;f.g._hurt(t,100,f.e,{spell:true,universal:true});assert.equal(t.skillStates.A1VX.casts,1);assert.equal(t.skillStates.A1VY.casts,1);near(t.mana,10);near(f.e.mana,40);near(t.hp,99920);
});

test('JSON resume keeps light armor, refreshed shield, judgment speed and source death cleanup without duplication',()=>{
  const {g,e}=fixture(),t=other(g,e);for(const id of ['A1VX','A1VY','A1W0','A1W1'])cast(g,e,id,t);e.mana=0;tick(g,.08);
  const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot())));assert.ok(restored);
  assert.equal(restored.state.brightArthasHandles[t.id],restored.state.entities.find(u=>u.id===t.id));
  for(const game of [g,restored]){const caster=game.state.entities.find(u=>u.id===e.id),target=game.state.entities.find(u=>u.id===t.id);tick(game,.16);game._hurt(caster,100,target,{spell:true,universal:true});tick(game,3);kill(game,caster,target);game._clearDead();tick(game,7);}
  assert.deepEqual(restored.snapshot(),g.snapshot());assert.equal(jobs(g,'orphan').length,3);
});
