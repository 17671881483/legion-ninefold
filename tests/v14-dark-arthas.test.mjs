import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {tickSourceScriptJobs,manualSourceSkills,refreshSourceSkills,compileSkills,sourceClassAttackDamageEvent} from '../dist/skills.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(){
  const g=new Game({mode:'sandbox',seed:419});g.state.phase='combat';g.state.time=0;g.state.entities=[];g.state.sourceSkillJobs=[];for(const p of g.state.players)p.buildings=[];
  const p=g.state.players[0],def=UNITS.find(u=>u.sourceRawcode==='n08Y'),b={id:'dark-arthas-building',unitId:def.id,col:2,row:1};p.buildings.push(b);p.heroAltarCount=1;
  g._recordLimitOrigins(b,def);g._recordSourceCompletion(p,def);g._recordEggCompletion(p,def,b);g._spawnDefender(def,p,3,6,b.id);
  const e=g.state.entities[0];e.mana=e.maxMana=200;e.hp=e.maxHp=1000;e.attackCd=e.abilityCd=1e9;return {g,e,p,b,def};
}
function other(g,e,{code='h002',x=.5,y=0,team=1,hp=100000,...extra}={}){
  const t=g._entity(UNIT_TEMPLATES[code],{worldX:e.worldX+x,worldY:e.worldY+y,team,side:team===0?'defender':'monster',battleTeam:0,laneId:0,ownerId:team===0?0:null,...extra});
  t.skillSpecs=[];t.hp=t.maxHp=hp;t.mana=0;t.attackCd=t.abilityCd=1e9;g.state.entities.push(t);return t;
}
const cast=(g,e,id,t)=>g.command('cast',{entityId:e.id,skillId:id,...(t?{targetId:t.id}:{})});
const tick=(g,at)=>{g.state.time=at;tickSourceScriptJobs(g);};
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===`dark_arthas_${type}`&&!j.done);
const retain=(e,ids)=>{e.skillSpecs=e.skillSpecs.filter(s=>ids.includes(s.id));};
const kill=(g,t,e)=>g._hurt(t,t.hp,e,{spell:true,universal:true});
const army=g=>g.state.entities.filter(e=>e.combatRawcode==='h0CL'&&e.hp>0);

test('five manual commands expose exact native costs, ranges and shared cooldowns',()=>{
  const {g,e}=fixture(),ui=manualSourceSkills(g,e);assert.deepEqual(ui.map(s=>[s.id,s.manaCost,s.cooldown,s.targetKind]),[
    ['A1VS',18,11,'enemy'],['A1VT',9,7,'enemy'],['A1VU',16,14,'enemy'],['A1VV',14,12,'none'],['A1VW',15,22,'enemy']]);
  assert.ok(ui.every(s=>s.status==='partial'&&s.cooldownMode==='shared_native'));assert.equal(e.skillSpecs.find(s=>s.id==='A1VR').status,'implemented');
  const outside=other(g,e,{x:1.667});assert.equal(cast(g,e,'A1VT',outside).ok,false);near(e.mana,200);
  outside.worldX=e.worldX+500/300;assert.equal(cast(g,e,'A1VT',outside).ok,true);near(e.mana,191);assert.equal(cast(g,e,'A1VT',outside).ok,false);
});

test('hunger accumulates both damage entries, consumes ready before the second entry, and discards overflow',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1VR']);e.hp=400;
  g._hurt(t,250,e);near(e.hp,400);near(e.status.arthasHungerDamage,0);assert.equal(e.status.arthasHungerReady,true);
  g._hurt(t,100,e);near(e.hp,550);near(e.status.arthasHungerDamage,200);assert.equal(e.status.arthasHungerReady,false);
  g._hurt(t,250,e);near(e.hp,700);near(e.status.arthasHungerDamage,250);assert.equal(e.status.arthasHungerReady,false);near(t.hp,99400);
});

test('spell damage accumulates only the main entry; a zeroed or allied attack still consumes ready',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1VR']);e.hp=400;
  g._hurt(t,410,e,{spell:true,universal:true});near(e.hp,400);assert.equal(e.status.arthasHungerReady,true);
  t.skillSpecs=[{id:'Avul',kind:'invulnerability',status:'implemented'}];g._hurt(t,100,e);near(e.hp,550);near(e.status.arthasHungerDamage,0);
  const ally=other(g,e,{team:0});e.status.arthasHungerReady=true;g._hurt(ally,50,e);near(e.hp,700);near(e.status.arthasHungerDamage,50);
  e.status.sourceNativeAttackBusy=true;sourceClassAttackDamageEvent(g,t,e,{},900);near(e.status.arthasHungerDamage,50);
});

test('A2Y7 and nested main dispatch suppress its accumulation but never the independent attack entry',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1VR']);e.skillSpecs.push({id:'A2Y7',status:'marker'});g._hurt(t,100,e);near(e.status.arthasHungerDamage,100);
  e.skillSpecs.pop();g._sourceDamageTriggerDepth=1;g._hurt(t,100,e);near(e.status.arthasHungerDamage,200);g._sourceDamageTriggerDepth=0;
  g._hurt(e,100,t,{spell:true,universal:true});near(e.status.arthasHungerDamage,200,'receiving damage is not hunger accumulation');
});

test('autocast uses victim priority in literal order and spends one shared mana pool',()=>{
  const {g,e}=fixture(),t=other(g,e);e.mana=40;g._hurt(t,1,e,{spell:true,universal:true});
  assert.equal(e.skillStates.A1VS.casts,1);assert.equal(e.skillStates.A1VT.casts,1);assert.equal(e.skillStates.A1VU?.casts??0,0);assert.equal(e.skillStates.A1VV?.casts??0,0);assert.equal(e.skillStates.A1VW?.casts??0,0);near(e.mana,13);
  const f=fixture(),victim=other(f.g,f.e,{code:'h0X9'});victim.skillSpecs=compileSkills(UNIT_TEMPLATES.h0X9);victim.mana=100;retain(f.e,['A1VU']);retain(victim,['A1VU']);f.g._hurt(victim,1,f.e,{spell:true,universal:true});assert.equal(victim.skillStates.A1VU.casts,1);assert.equal(f.e.skillStates.A1VU.casts,0);
});

test('allability depth spends native costs but suppresses script, while ANCIENT has no invented global guard',()=>{
  const {g,e}=fixture(),t=other(g,e);g._sourceAbilityEffectDepth=1;assert.equal(cast(g,e,'A1VW',t).ok,true);assert.equal(jobs(g,'dragon').length,0);near(e.mana,185);
  g._sourceAbilityEffectDepth=0;e.traits.push('ancient');assert.equal(cast(g,e,'A1VU',t).ok,true);near(t.hp,100000-235);
});

test('wind samples angle then radius at a fixed original target position, runs 30 timer pulses',()=>{
  const {g,e}=fixture(),t=other(g,e,{x:1});retain(e,['A1VS']);let draws=0;g._random=()=>{draws++;return 0;};
  cast(g,e,'A1VS',t);e.mana=0;tick(g,0);near(t.hp,100000-78);const j=jobs(g,'wind')[0],originalX=j.x;
  t.worldX+=10;const fixed=other(g,e,{x:1});draws=0;tick(g,5.799);near(fixed.hp,100000-28*78);tick(g,5.8);near(fixed.hp,100000-29*78);near(j.x,originalX);assert.equal(draws,58);assert.equal(jobs(g,'wind').length,0);tick(g,6);near(fixed.hp,100000-29*78);
});

test('wind death callback deals one final pulse before cleanup, including death before the zero timer',()=>{
  for(const firstTick of [false,true]){const {g,e}=fixture(),t=other(g,e,{x:0});retain(e,['A1VS']);g._random=()=>0;cast(g,e,'A1VS',t);e.mana=0;if(firstTick)tick(g,0);
    kill(g,e,t);near(t.hp,100000-78*(firstTick?2:1));assert.equal(jobs(g,'wind').length,0);tick(g,10);near(t.hp,100000-78*(firstTick?2:1));}
});

test('ice storm uses current center, exact radius and universal damage without fabricated control',()=>{
  const {g,e}=fixture(),t=other(g,e),edge=other(g,e,{x:1.5}),out=other(g,e,{x:1.501}),ally=other(g,e,{team:0}),inv=other(g,e),immune=other(g,e);
  retain(e,['A1VU']);inv.skillSpecs=[{id:'Avul',kind:'invulnerability',status:'implemented'}];immune.skillSpecs=[{id:'Amim',kind:'immunity',status:'implemented'}];immune.armor=100;
  cast(g,e,'A1VU',t);for(const v of [t,edge,immune]){near(v.hp,100000-235);assert.equal(v.status.stunUntil,undefined);assert.equal(v.status.slowUntil,undefined);}for(const v of [out,ally,inv])near(v.hp,100000);
});

test('death coil always includes its target plus at most five eligible neighbors, with no random draw',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1VT']);const candidates=Array.from({length:7},()=>other(g,e)),inv=other(g,e);inv.skillSpecs=[{id:'Avul',kind:'invulnerability',status:'implemented'}];
  let draws=0;g._random=()=>{draws++;return .5;};cast(g,e,'A1VT',t);assert.equal(draws,0);assert.deepEqual(jobs(g,'coil').map(j=>j.targetId),[t.id,...candidates.slice(0,5).map(t=>t.id)]);
  e.mana=0;tick(g,.919);near(t.hp,100000);const j=jobs(g,'coil')[0];near(j.traveled,.5*.92);tick(g,.92);near(j.traveled,.5*.96);tick(g,.96);near(t.hp,100000-201);assert.equal(jobs(g,'coil').length,0);near(candidates[5].hp,100000);
});

test('coil updates heading but caps travel by initial distance, and survives caster removal',()=>{
  const {g,e}=fixture(),t=other(g,e,{x:1});retain(e,['A1VT']);cast(g,e,'A1VT',t);e.mana=0;tick(g,0);const j=jobs(g,'coil')[0];near(j.x,e.worldX+.04);
  t.worldX+=5;t.worldY+=2;kill(g,e,t);g._clearDead();tick(g,.04);assert.ok(j.y>e.worldY);tick(g,.96);near(t.hp,100000-201);assert.equal(j.done,true);assert.ok(Math.hypot(t.worldX-j.x,t.worldY-j.y)>1);
});

test('coil finishes immediately on target or dummy death; caster death alone does not finish',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1VT']);cast(g,e,'A1VT',t);e.mana=0;const j=jobs(g,'coil')[0];
  g._sourceDeath({id:j.dummyId,hp:0,status:{},skillSpecs:[]},null);near(t.hp,100000-201);assert.equal(j.done,true);tick(g,2);near(t.hp,100000-201);
  const f=fixture(),u=other(f.g,f.e);retain(f.e,['A1VT']);cast(f.g,f.e,'A1VT',u);f.e.mana=0;kill(f.g,u,f.e);assert.equal(jobs(f.g,'coil').length,0);assert.ok(u.hp<=0);
});

test('zero-distance coil finishes at its zero timer without NaN or a fake 99999 distance',()=>{
  const {g,e}=fixture(),t=other(g,e,{x:0});retain(e,['A1VT']);cast(g,e,'A1VT',t);e.mana=0;tick(g,0);near(t.hp,100000-201);assert.equal(jobs(g,'coil').length,0);
});

test('army creates eight permanent native templates without SUMMONED, and removes A1VV after one cast',()=>{
  const {g,e,def}=fixture();e.userData=7;cast(g,e,'A1VV');assert.equal(army(g).length,8);assert.equal(jobs(g,'army').length,8);assert.equal(e.status.arthasArmyCount,5);near(e.mana,186);
  for(const t of army(g)){assert.equal(t.maxHp,610);assert.equal(t.isSummon,false);assert.ok(!t.traits.includes('summoned'));assert.equal(t.expiresAt,undefined);assert.equal(t.userData,7);assert.equal(t.ownerId,e.ownerId);assert.ok(t.skillSpecs.some(s=>s.id==='A0R2'));}
  assert.equal(cast(g,e,'A1VV').ok,false);refreshSourceSkills(e,def);assert.ok(!manualSourceSkills(g,e).some(s=>s.id==='A1VV'));
});

test('army GIANT gate applies to script after payment and does not fabricate summons for other types',()=>{
  const {g,e}=fixture();e.traits=e.traits.filter(t=>t!=='giant');e.unitType='';e.sourceRawFields={...e.sourceRawFields,type:''};
  assert.equal(cast(g,e,'A1VV').ok,true);near(e.mana,186);assert.equal(army(g).length,0);assert.ok(manualSourceSkills(g,e).some(s=>s.id==='A1VV'));
});

test('army checks summoner HP before subtracting hit, then heals sequentially using each minion percentage',()=>{
  const {g,e}=fixture(),t=other(g,e);cast(g,e,'A1VV');retain(e,[]);e.hp=210;g._hurt(e,20,t,{spell:true,universal:true});near(e.hp,190);assert.equal(army(g).length,8);
  const a=army(g);a[0].hp=a[0].maxHp*.01;a[1].hp=a[1].maxHp*.1;e.hp=100;
  g._hurt(e,10,t,{spell:true,universal:true});near(e.hp,300);assert.equal(army(g).length,6);assert.equal(jobs(g,'army').length,6);
  e.hp=200;g._hurt(e,100,t,{spell:true,universal:true});near(e.hp,900);assert.equal(army(g).length,5,'full minion adds 105 percentage points, capped to max');
});

test('army independent listener accepts friendly and zeroed events; normal minion death removes its listener',()=>{
  const {g,e}=fixture(),t=other(g,e,{team:0});cast(g,e,'A1VV');retain(e,[]);const first=army(g)[0];kill(g,first,t);assert.equal(jobs(g,'army').length,7);assert.ok(!g.state.entities.includes(first));
  e.hp=100;e.skillSpecs=[{id:'Avul',kind:'invulnerability',status:'implemented'}];g._hurt(e,10,t);near(e.hp,1000);assert.equal(jobs(g,'army').length,6);
});

test('new army listeners do not retroactively receive their registering damage event',()=>{
  const {g,e}=fixture(),t=other(g,e);retain(e,['A1VV']);e.hp=100;g._hurt(e,10,t,{spell:true,universal:true});near(e.hp,90);assert.equal(army(g).length,8);
  g._hurt(e,10,t,{spell:true,universal:true});near(e.hp,990);assert.equal(army(g).length,7);
});

test('dragon moves at zero timer, deals repeated hits every step and stops before 1500 at 4.96 seconds',()=>{
  const {g,e}=fixture(),t=other(g,e,{x:0});retain(e,['A1VW']);cast(g,e,'A1VW',t);e.mana=0;tick(g,0);const j=jobs(g,'dragon')[0];near(j.traveled,12/300);near(t.hp,100000-203);
  tick(g,.04);near(t.hp,100000-406);kill(g,e,t);g._clearDead();tick(g,4.92);near(j.traveled,1488/300);assert.equal(j.done,undefined);tick(g,4.96);assert.equal(j.done,true);assert.equal(jobs(g,'dragon').length,0);assert.equal(t.status.stunUntil,undefined);
});

test('JSON resume retains timer phase, minion listeners, shared dead caster state and removed ability',()=>{
  const {g,e}=fixture(),t=other(g,e);for(const id of ['A1VS','A1VT','A1VV','A1VW'])cast(g,e,id,t);e.mana=0;tick(g,.12);e.hp=100;
  const resumed=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot())));assert.ok(resumed);
  for(const game of [g,resumed]){const caster=game.state.entities.find(u=>u.id===e.id),target=game.state.entities.find(u=>u.id===t.id);game._hurt(caster,10,target,{spell:true,universal:true});tick(game,.32);kill(game,caster,target);game._clearDead();for(const at of [.96,2,4.96])tick(game,at);}
  assert.deepEqual(resumed.snapshot(),g.snapshot());assert.equal(jobs(g,'army').length,7);assert.equal(jobs(g,'wind').length,0);
});
