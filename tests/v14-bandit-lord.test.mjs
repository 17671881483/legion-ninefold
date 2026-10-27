import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {MERCENARIES,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,tickSourceScriptJobs,manualSourceSkills,castManualSourceSkill,canWeaponTarget} from '../dist/skills.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const skills=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type);
function fixture(){
 const g=new Game({mode:'sandbox',seed:31});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;for(const k of g.state.kings){k.worldX=10000;k.worldY=10000;}
 const p=laneToWorld(0,3,6);
 const make=(side='monster',ids=[],dx=0,dy=0,code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,userData:side==='defender'?1:5,worldX:p.x+dx,worldY:p.y+dy});skills(e,ids);e.hp=e.maxHp=3200;e.mana=e.maxMana=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;g.state.entities.push(e);return e;};
 const a=make('defender',[],0,0,'h0SF'),t=make('monster',[],.2);
 const hit=(target=t,amount=50,source=a,options={spell:true,universal:true})=>g._hurt(target,amount,source,options);
 const at=n=>{g.state.time=n;tickSourceScriptJobs(g);};
 const cast=(id,point)=>castManualSourceSkill(g,a,id,{point});
 return {g,a,t,make,hit,at,cast,p};
}
test('source evidence pins SHA, exact lines and missing cost independently of tooltips',()=>{
 const proof=JSON.parse(readFileSync(new URL('../reference/bandit-lord-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');assert.equal(createHash('sha256').update(raw).digest('hex'),proof.source.sha256);for(const e of proof.sourceEvidence)assert.equal(lines[e.line-1].replace(/\r$/,''),e.text);assert.equal(proof.abilities.A18E.fields.Cost1,undefined);assert.equal(proof.abilities.A18G.fields.Cool1,'20.0');
});
test('shield consumes ability on valid first hit but does not retroactively dispatch new listener',()=>{
 const f=fixture();skills(f.a,['A18D']);near(f.hit(f.a,50,f.t),50);near(f.a.hp,3150);assert.equal(f.a.skillSpecs.some(s=>s.id==='A18D'),false);assert.equal(jobs(f.g,'bandit_shield')[0].count,0);near(f.hit(f.a,50,f.t),0);near(f.a.hp,3150);
});
test('shield zeros 81 captured events and allows the 82nd without creating invulnerability',()=>{
 const f=fixture();skills(f.a,['A18D']);f.hit(f.a,1,f.t);for(let i=0;i<81;i++)near(f.hit(f.a,10,f.t),0);near(f.a.hp,3199);near(f.hit(f.a,10,f.t),10);assert.equal(jobs(f.g,'bandit_shield')[0].done,true);near(f.hit(f.a,10,f.t),10);assert.equal(canWeaponTarget(f.t,f.a,10),true);
});
test('shield expires at two seconds without restoring the ability or cancelling ordinary control',()=>{
 const f=fixture();skills(f.a,['A18D']);f.hit(f.a,1,f.t);f.at(11.999);near(f.hit(f.a,5,f.t),0);f.a.status.stunUntil=15;f.at(12);near(f.hit(f.a,5,f.t),5);near(f.a.status.stunUntil,15);assert.equal(jobs(f.g,'bandit_shield').length,0);assert.equal(f.a.skillSpecs.length,0);
});
test('shield activation rejects self, allied, A2Y7 source and suppressed main listener',()=>{
 for(const mode of ['self','ally','excluded','suppressed']){const f=fixture();skills(f.a,['A18D']);let src=f.t;if(mode==='self')src=f.a;if(mode==='ally')src=f.make('defender');if(mode==='excluded')skills(src,['A2Y7']);if(mode==='suppressed')f.g._sourceDamageTriggerDepth=1;f.hit(f.a,1,src);assert.equal(jobs(f.g,'bandit_shield').length,0,mode);assert.equal(f.a.skillSpecs[0].id,'A18D');}
});
test('captured shield listener runs for allied hits and while main listener is disabled',()=>{
 const f=fixture();skills(f.a,['A18D']);f.hit(f.a,1,f.t);f.g._sourceDamageTriggerDepth=1;near(f.hit(f.a,10,f.a),0);near(f.hit(f.a,10,f.t),0);assert.equal(jobs(f.g,'bandit_shield')[0].count,2);
});
test('shield death cleanup is independent of suppressed main death handler',()=>{
 const f=fixture();skills(f.a,['A18D']);f.hit(f.a,1,f.t);f.g._sourceUnitDeathTriggerDepth=1;f.g._killUnit(f.a);assert.equal(jobs(f.g,'bandit_shield')[0].done,true);f.at(10);assert.equal(jobs(f.g,'bandit_shield').length,0);
});
test('shield listener counts damage events already reduced to zero by magic immunity',()=>{
 const f=fixture();skills(f.a,['A18D','Amim']);f.hit(f.a,1,f.t);f.hit(f.a,50,f.t,{spell:true,magic:true});assert.equal(jobs(f.g,'bandit_shield')[0].count,1);
});
test('earth shock deals 115 within inclusive 300 range and requests organic control',()=>{
 const f=fixture();skills(f.a,['A18E']);const edge=f.make('monster',[],1),out=f.make('monster',[],1.001),ally=f.make('defender',[],.1);assert.equal(f.cast('A18E').ok,true);near(f.t.hp,3085);near(edge.hp,3085);near(out.hp,3200);near(ally.hp,3200);near(f.t.status.stunUntil,12);
});
test('earth shock retains damage versus magic-immune and mechanical targets but skips stun',()=>{
 const f=fixture();skills(f.a,['A18E']);skills(f.t,['Amim']);f.t.armor=100;const mech=f.make('monster',[],.3);mech.traits=['mechanical'];f.cast('A18E');near(f.t.hp,3085);near(mech.hp,3085);assert.equal(f.t.status.stunUntil,undefined);assert.equal(mech.status.stunUntil,undefined);
});
test('earth shock uses one-second native hero stun and skips Avul and other battle',()=>{
 const f=fixture();skills(f.a,['A18E']);f.t.isNativeHero=true;const inv=f.make('monster',['Avul'],.4),other=f.make('monster',[],.3);other.battleTeam=1;f.cast('A18E');near(f.t.status.stunUntil,11);near(inv.hp,3200);near(other.hp,3200);
});
test('ANcl adapter advertises unknown mana instead of declaring a native free cast',()=>{
 const f=fixture();skills(f.a,['A18E','A18G']);f.a.mana=0;const m=manualSourceSkills(f.g,f.a);assert.equal(m.length,2);assert.equal(m[0].manaCostKnown,false);assert.equal(f.cast('A18E').ok,true);near(f.a.mana,0);assert.equal(f.a.status.banditCastAdapter.missingNativeManaCost,true);near(f.a.skillStates.A18E.readyAt,25);assert.equal(f.cast('A18E').ok,false);
});
test('manual point cast enforces finite range and independent twenty-second cooldown',()=>{
 const f=fixture();skills(f.a,['A18E','A18G']);assert.equal(f.cast('A18G',{x:NaN,y:0}).ok,false);assert.equal(f.cast('A18G',{x:f.p.x+501/300,y:f.p.y}).ok,false);assert.equal(f.cast('A18G',{x:f.p.x+500/300,y:f.p.y}).ok,true);near(f.a.skillStates.A18G.readyAt,30);assert.equal(f.cast('A18E').ok,true);assert.equal(f.cast('A18G',f.p).ok,false);
});
test('stun and dead caster reject native adapter before cooldown',()=>{
 for(const mode of ['stun','dead','removed']){const f=fixture();skills(f.a,['A18E']);if(mode==='stun')f.a.status.stunUntil=11;if(mode==='dead')f.a.hp=0;if(mode==='removed')f.a.status.sourceRemoved=true;assert.equal(f.cast('A18E').ok,false);assert.equal(f.a.skillStates.A18E?.casts??0,0);}
});
test('suppressed SPELL_EFFECT consumes native cooldown without executing script',()=>{
 const f=fixture();skills(f.a,['A18E','A18G']);f.g._sourceAbilityEffectDepth=1;f.cast('A18E');f.cast('A18G',f.p);near(f.t.hp,3200);assert.equal(jobs(f.g,'bandit_projectile').length,0);near(f.a.skillStates.A18G.readyAt,30);assert.equal(f.g._sourceAbilityEffectDepth,1);
});
test('weapon event requests attacker first for each ability; failed request never falls back',()=>{
 const f=fixture();skills(f.a,['A18E','A18G']);skills(f.t,['A18E','A18G']);f.a.skillStates.A18E={readyAt:99,casts:0};f.a.skillStates.A18G={readyAt:99,casts:0};f.hit(f.t,10,f.a,{spell:false});assert.equal(f.a.status.banditOrderRequests.A18E.ok,false);assert.equal(f.a.status.banditOrderRequests.A18G.ok,false);assert.equal(f.t.status.banditOrderRequests,undefined);near(f.a.hp,3200);
});
test('victim countercast can spend resentment cooldown inside suppressed nested SPELL_EFFECT',()=>{
 const f=fixture();skills(f.t,['A18E','A18G']);f.hit(f.t,10,f.a,{spell:false});near(f.a.hp,3085);assert.equal(jobs(f.g,'bandit_projectile').length,0);near(f.t.skillStates.A18G.readyAt,30);assert.equal(f.t.status.banditOrderRequests.A18G.ok,false);assert.deepEqual(f.t.status.banditOrderRequests.A18G.point,f.p);
});
test('spell-only damage does not issue bandit attack orders',()=>{
 const f=fixture();skills(f.a,['A18E','A18G']);f.hit();assert.equal(f.a.status.banditOrderRequests,undefined);assert.equal(jobs(f.g,'bandit_projectile').length,0);
});
test('earth-shock scripted damage is a weapon event and respects per-attacker recursion lock',()=>{
 const f=fixture();skills(f.a,['A18E','A18G']);let seen;const hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,a,o)=>{if(n===115)seen=o;return hurt(t,n,a,o);};f.hit(f.t,10,f.a,{spell:false});assert.equal(seen.weapon,true);assert.equal(seen.attackType,'chaos');assert.equal(seen.nativeDamageType,'universal');assert.equal(f.a.skillStates.A18E.casts,1);assert.equal(f.a.skillStates.A18G.casts,1);
});
test('resentment starts at target point, three projectiles each hit the same enemy only once',()=>{
 const f=fixture();skills(f.a,['A18G']);const point={x:f.p.x+1,y:f.p.y};f.t.worldX=point.x+.4;f.cast('A18G',point);near(f.t.hp,3200);f.at(10);near(f.t.hp,2825);assert.equal(jobs(f.g,'bandit_projectile').length,3);f.at(10.12);near(f.t.hp,2825);assert.ok(f.t.buffs.every(b=>!b.move&&!b.haste&&!b.damage));
});
test('resentment checks four steps then cleans before endpoint, including zero-time first step',()=>{
 const f=fixture();skills(f.a,['A18G']);f.t.worldX=f.p.x+2.5;f.cast('A18G',f.p);f.at(10);assert.equal(jobs(f.g,'bandit_projectile')[0].steps,1);near(jobs(f.g,'bandit_projectile')[0].point.x,f.p.x+.4);f.at(10.12);assert.equal(jobs(f.g,'bandit_projectile')[0].steps,4);near(f.t.hp,3200);f.at(10.16);assert.equal(jobs(f.g,'bandit_projectile').length,0);near(f.t.hp,3200);
});
test('resentment re-enumerates at each point and hit groups are independent',()=>{
 const f=fixture();skills(f.a,['A18G']);f.t.worldX=f.p.x+10;f.cast('A18G',f.p);f.at(10);f.t.worldX=f.p.x+.8;f.at(10.04);near(f.t.hp,2825);f.at(10.16);near(f.t.hp,2825);
});
test('caster movement or death does not redirect or cancel retained projectiles',()=>{
 const f=fixture();skills(f.a,['A18G']);f.t.worldX=f.p.x+1;f.cast('A18G',f.p);f.a.worldX+=100;f.g._killUnit(f.a);f.g._clearDead();f.at(10.16);assert.ok(f.t.hp<3200);assert.equal(jobs(f.g,'bandit_projectile').length,0);
});
test('explicit source removal does not invent native retained-handle behavior',()=>{
 const f=fixture();skills(f.a,['A18G']);f.cast('A18G',f.p);f.a.status.sourceRemoved=true;f.at(10.16);near(f.t.hp,3200);assert.equal(jobs(f.g,'bandit_projectile').length,0);
});
test('death wail deals seventy-five within six hundred, no nested main-death cascade',()=>{
 const f=fixture();skills(f.a,['A18H']);skills(f.t,['A18H']);f.t.hp=50;const ally=f.make('defender',[],.1),edge=f.make('monster',[],2),out=f.make('monster',[],2.001);f.g._killUnit(f.a);assert.ok(f.t.hp<=0);near(ally.hp,3200);near(edge.hp,3125);near(out.hp,3200);assert.equal(f.g.state.events.filter(e=>e.skillId==='A18H').length,1);
});
test('death wail is suppressed by main death exclusion/guard and preserves other listeners',()=>{
 for(const mode of ['guard','Ju']){const f=fixture();skills(f.a,['A18D','A18H']);f.hit(f.a,1,f.t);if(mode==='guard')f.g._sourceUnitDeathTriggerDepth=1;else f.a.status.sourceJuMember=true;f.g._killUnit(f.a);near(f.t.hp,3200);assert.equal(jobs(f.g,'bandit_shield')[0].done,true);}
});
test('JSON continues shield counter, removed ability, projectile groups and cooldowns',()=>{
 const f=fixture();skills(f.a,['A18D','A18G']);f.hit(f.a,1,f.t);f.hit(f.a,1,f.t);f.cast('A18G',f.p);f.at(10);const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),a=r.state.entities.find(e=>e.id===f.a.id);assert.equal(a.skillSpecs.some(s=>s.id==='A18D'),false);assert.equal(jobs(r,'bandit_shield')[0].count,1);near(a.skillStates.A18G.readyAt,30);r.state.time=10.16;tickSourceScriptJobs(r);f.at(10.16);assert.deepEqual(r.state.entities.map(e=>e.hp),f.g.state.entities.map(e=>e.hp));r.command('sandboxReset');assert.equal(jobs(r,'bandit_shield').length,0);
});
test('pause freezes pending projectiles and a late callback equals stepwise execution',()=>{
 const a=fixture(),b=fixture();for(const f of [a,b]){skills(f.a,['A18G']);f.cast('A18G',f.p);}a.g.state.paused=true;a.g.tick(1);near(a.g.state.time,10);assert.equal(jobs(a.g,'bandit_projectile')[0].steps,0);a.g.state.paused=false;a.at(10.16);for(const t of [10,10.04,10.08,10.12,10.16])b.at(t);near(a.t.hp,b.t.hp);
});
test('both mercenary prototypes retain their own types and four partial abilities, stealth stays unresolved',()=>{
 for(const code of ['h0SF','h0SG']){const m=MERCENARIES.find(u=>u.combatRawcode===code);assert.ok(m);const s=compileSkills(m);for(const id of ['A18D','A18E','A18G','A18H'])assert.equal(s.find(a=>a.id===id).status,'partial');assert.equal(s.find(a=>a.id==='A18F').status,'unresolved');}assert.match(UNIT_TEMPLATES.h0SF.unitType,/sapper/);assert.match(UNIT_TEMPLATES.h0SG.unitType,/mechanical/);
});
test('generated battle coverage includes all five IDs without claiming whole-family completion',()=>{
 const c=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url)));for(const id of ['A18D','A18E','A18G','A18H'])assert.equal(c.battleSkills.abilities.find(a=>a.rawcode===id).status,'partial');assert.equal(c.battleSkills.abilities.find(a=>a.rawcode==='A18F').status,'unresolved');
});
test('real wave-sixteen purchase deploys h0SF with scripts; h0SG remains a preview',()=>{
 const g=new Game({mode:'sandbox',seed:31});g.command('sandboxWave',{wave:16});g.state.players[0].wood=10000;
 const normal=MERCENARIES.find(m=>m.combatRawcode==='h0SF'),mechanical=MERCENARIES.find(m=>m.combatRawcode==='h0SG');
 assert.equal(g.command('merc',{mercId:normal.id}).ok,true);assert.equal(g.command('merc',{mercId:mechanical.id}).ok,false);assert.equal(g.command('ready').ok,true);g.tick(.2);
 const e=g.state.entities.find(e=>e.combatRawcode==='h0SF');assert.ok(e);assert.equal(e.skillSpecs.filter(s=>['A18D','A18E','A18G','A18H'].includes(s.id)&&s.status==='partial').length,4);assert.ok(!g.state.entities.some(e=>e.combatRawcode==='h0SG'));
});
