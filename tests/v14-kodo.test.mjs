import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,manualSourceSkills,castManualSourceSkill,sourceClassAttackDamageEvent,tickSourceScriptJobs} from '../dist/skills.js';
import {kodoRange,kodoSpellEffect,kodoAttackOrders} from '../dist/kodo-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message),has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(id='A14T'){
 const g=new Game({mode:'sandbox',seed:43});g.state.entities=[];g.state.sourceSkillJobs=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;const p=laneToWorld(0,3,6);
 const make=(dx=.5,hp=350,side='monster')=>{const e=g._entity(UNIT_TEMPLATES.h03E,{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=hp;e.mana=e.maxMana=50;e.damage=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.buffs=[];e.traits=[];e.targetType='ground';e.isNativeHero=e.isHero=false;skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,1000,'defender'),t=make();skills(a,[id]);a.combatRawcode=id==='A14X'?'h0QN':'h0QK';return{g,a,t,make,cast:target=>castManualSourceSkill(g,a,id,{target:target??t}),attack:(source=a,target=t,options={})=>sourceClassAttackDamageEvent(g,target,source,options,1)};
}
test('kodo evidence pins executable returns, raw fields and all four form mappings',()=>{
 const e=JSON.parse(readFileSync(new URL('../reference/kodo-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),e.source.sha256);for(const r of e.sourceEvidence)assert.equal(lines[r.line-1].replace(/\r$/,''),r.text);assert.equal(lines[38473-1].trim(),'return');assert.equal(lines[38523-1].trim(),'return');assert.equal(e.abilities.A14T.Cost1,'');assert.equal(e.abilities.A14X.Cool1,'3.0');assert.equal(e.abilities.A14T.targs1,'enemies');assert.equal(e.units.h0QN.abilList,'A14X');const n=JSON.parse(readFileSync(new URL('../reference/kodo-native-research.json',import.meta.url)));assert.equal(n.sources.length,2);assert.ok(n.sources.every(s=>s.entries.ANcl.fields.cost==='{0,0,0,0}'));
});
test('both exposed abilities remain partial and do not pretend unknown cost is verified zero',()=>{
 for(const id of ['A14T','A14X']){const f=fixture(id),s=manualSourceSkills(f.g,f.a).find(s=>s.id===id);assert.equal(s.status,'partial');assert.equal(s.targetKind,'enemy');assert.equal(s.manaCostKnown,false);assert.equal(s.cooldown,id==='A14T'?10:3);assert.match(f.a.skillSpecs[0].effectText,/消化/);}
});
test('manual devour applies99999 chaos/universal, lifts a killed corpse and creates no digestion',()=>{
 const f=fixture();const mana=f.a.mana;ok(f.cast());assert.ok(f.t.hp<0);assert.equal(f.t.status.kodoCorpseLift.height,100000);assert.equal(f.t.status.kodoCorpseLift.rate,1000000);near(f.a.mana,mana);near(f.a.skillStates.A14T.readyAt,20);assert.equal(f.a.skillStates.A14T.casts,1);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(has(f.a,'A14T'),true);assert.equal(has(f.a,'A14W'),false);assert.equal(f.t.status.sourceHidden,undefined);assert.equal(f.a.status.kodoEffect.hits[0].damageType,'universal');
});
test('manual primary has no health cap; damage is finite rather than unconditional kill',()=>{
 for(const id of ['A14T','A14X']){const f=fixture(id);f.t.hp=f.t.maxHp=200000;ok(f.cast());near(f.t.hp,100001);assert.equal(f.t.status.kodoCorpseLift,undefined);assert.equal(f.g.state.sourceSkillJobs.length,0);}
});
test('normal glutton damage receives armor/type multipliers while basic devour ignores armor',()=>{
 for(const id of ['A14T','A14X']){const f=fixture(id);f.t.hp=f.t.maxHp=300000;f.t.armor=20;f.t.sourceArmorTypeRaw='small';f.t.armorType='light';const factor=f.g._typeMultiplier(id==='A14T'?'chaos':'normal','light','small')*(id==='A14T'?1:f.g._armorFactor(20));ok(f.cast());near(f.t.hp,300000-99999*factor);}
});
test('manual basic can target air but glutton cannot; auto always requires ground',()=>{
 for(const id of ['A14T','A14X']){const f=fixture(id);f.t.targetType='air';f.attack();assert.equal(f.a.skillStates[id].casts,0);assert.equal(f.cast().ok,id==='A14T');}
});
test('universal channel options permit magic immunity; invulnerability still rejects orders',()=>{
 for(const id of ['A14T','A14X']){const f=fixture(id);skills(f.t,['Amim']);ok(f.cast());assert.ok(f.t.hp<0);const z=fixture(id);skills(z.t,['Avul']);assert.equal(z.cast().ok,false);assert.equal(z.a.skillStates[id].casts,0);}
});
test('native manual gate rejects hidden,removed,dead,allied,other battle and out of range',()=>{
 for(const change of [t=>t.status.sourceHidden=true,t=>t.status.sourceRemoved=true,t=>t.hp=0,t=>t.side='defender',t=>t.battleTeam=1,t=>t.worldX+=2]){const f=fixture();change(f.t);assert.equal(f.cast().ok,false);assert.equal(f.a.skillStates.A14T.casts,0);}
});
test('paused/stunned/silenced/dead caster and removed ability cannot issue a cast',()=>{
 for(const change of [a=>a.status.sourcePaused=true,a=>a.status.stunUntil=11,a=>a.status.silenceUntil=11,a=>a.hp=0,a=>skills(a,[])]){const f=fixture();change(f.a);assert.equal(f.cast().ok,false);assert.equal(f.t.hp,350);}
});
test('explicit10/3 cooldown is retained rather than unreachable5s reset',()=>{
 for(const id of ['A14T','A14X']){const f=fixture(id);ok(f.cast());const next=f.make();f.g.state.time=id==='A14T'?19.999:12.999;assert.equal(f.cast(next).ok,false);f.g.state.time=id==='A14T'?20:13;ok(f.cast(next));assert.equal(f.a.skillStates[id].casts,2);}
});
test('auto basic uses inclusive400 boundary in group order rather than nearest or random',()=>{
 const f=fixture();f.t.hp=401;const first=f.make(.9,400),second=f.make(.1,100);first.status.shield=200000;f.g._random=()=>{throw Error('devour selection must not draw randomness');};f.attack();assert.equal(f.a.status.kodoCast.targetId,first.id);assert.equal(second.hp,100);assert.equal(f.t.hp,401);
});
test('auto glutton selects inclusive3000, skips3001 and hits at most two distinct targets',()=>{
 const f=fixture('A14X');f.t.hp=3001;const one=f.make(.8,3000),two=f.make(.9,2000),three=f.make(.2,300);f.attack();assert.deepEqual(f.a.status.kodoEffect.hits.map(h=>h.targetId),[one.id,two.id]);assert.ok(one.hp<0&&two.hp<0);assert.equal(three.hp,300);assert.equal(f.t.hp,3001);
});
test('range filter preserves hidden,heroes,mechanical and magic-immune candidates but excludes Avul/dead/allied',()=>{
 const f=fixture();f.t.status.sourceHidden=true;f.t.isNativeHero=true;f.t.traits=['mechanical'];skills(f.t,['Amim']);const dead=f.make(.5,0),ally=f.make(.4,100,'defender'),inv=f.make(.3);skills(inv,['Avul']);const edge=f.make(1),far=f.make(1.00001);assert.deepEqual(kodoRange(f.g,f.a).map(t=>t.id),[f.t.id,edge.id]);assert.equal(kodoRange(f.g,f.a).includes(far),false);assert.equal(kodoRange(f.g,f.a).includes(dead),false);assert.equal(kodoRange(f.g,f.a).includes(ally),false);
});
test('attacker priority is not transferred to damaged caster when cooldown makes all orders fail',()=>{
 const f=fixture();f.a.hp=350;skills(f.t,['A14T']);f.a.skillStates.A14T.readyAt=20;f.attack();assert.equal(f.t.status.kodoOrders,undefined);assert.equal(f.t.skillStates.A14T.casts,0);assert.equal(f.a.status.kodoOrders.A14T.attempts[0].ok,false);
});
test('damaged-side devour activates when damage source lacks its ability',()=>{
 const f=fixture();f.attack(f.t,f.a);assert.equal(f.a.status.kodoOrders.A14T.branch,'damaged');assert.equal(f.a.skillStates.A14T.casts,1);assert.ok(f.t.hp<0);
});
test('hidden asymmetry is preserved before command rejection in all four auto branches',()=>{
 for(const id of ['A14T','A14X'])for(const attackerBranch of [true,false]){const f=fixture(id);f.t.status.sourceHidden=true;const next=f.make();if(attackerBranch)f.attack();else f.attack(f.t,f.a);const attempts=f.a.status.kodoOrders[id].attempts,triesHidden=id==='A14T'?attackerBranch:!attackerBranch;assert.equal(attempts.some(a=>a.targetId===f.t.id),triesHidden);if(triesHidden)assert.equal(attempts[0].ok,false);assert.equal(attempts.at(-1).targetId,next.id);assert.equal(attempts.at(-1).ok,true);}
});
test('an unsuccessful target order continues enumeration without choosing randomly',()=>{
 const f=fixture();f.t.invulnerable=true;const second=f.make(.7);f.attack();assert.deepEqual(f.a.status.kodoOrders.A14T.attempts.map(x=>x.ok),[false,true]);assert.equal(f.a.status.kodoCast.targetId,second.id);
});
test('independent devour and glutton clauses each run with per-clause attacker priority',()=>{
 const f=fixture();skills(f.t,['A14X']);const requests=[];const api={compileAbility:(g,e,id)=>({range:1,cooldown:id==='A14T'?10:3}),scriptInvulnerable:()=>false,nativeDamage:(g,t,n,s,opts)=>{requests.push({id:s.id,target:t.id,...opts});return 0;}};kodoAttackOrders(f.g,f.a,f.t,api);assert.equal(f.a.status.kodoOrders.A14T.branch,'attacker');assert.equal(f.t.status.kodoOrders.A14X.branch,'damaged');assert.equal(f.a.skillStates.A14T.casts,1);assert.equal(f.t.skillStates.A14X.casts,1);
});
test('weapon-only listener accepts attack-marked script damage but excludes ordinary spells and recursion',()=>{
 const f=fixture();f.attack(f.a,f.t,{spell:true});assert.equal(f.a.skillStates.A14T.casts,0);f.a.status.sourceNativeAttackBusy=true;f.attack();assert.equal(f.a.skillStates.A14T.casts,0);f.a.status.sourceNativeAttackBusy=false;f.attack(f.a,f.t,{spell:true,weapon:true});assert.equal(f.a.skillStates.A14T.casts,1);
});
test('glutton pre-damage snapshot excludes new spawned units and reevaluates current health/hidden',()=>{
 const f=fixture('A14X');const above=f.make(.6,4000),hide=f.make(.7,2000),eligible=f.make(.8,100);const calls=[];const api={nativeDamage:(g,t,n,s,opts)=>{calls.push({id:t.id,n,...opts});if(t===f.t){above.hp=3000;hide.status.sourceHidden=true;f.make(.1,100);}return 0;}};assert.equal(kodoSpellEffect(f.g,f.a,'A14X',f.t,api),true);assert.deepEqual(calls.map(x=>x.id),[f.t.id,above.id]);assert.ok(!f.a.status.kodoEffect.groupBeforeDamage.includes(f.g.state.entities.at(-1).id));assert.equal(eligible.hp,100);
});
test('glutton second target is a retained group member even when primary side effects killed it',()=>{
 const f=fixture('A14X'),second=f.make(.7,100),third=f.make(.8,100),calls=[];kodoSpellEffect(f.g,f.a,'A14X',f.t,{nativeDamage:(g,t)=>{calls.push(t.id);if(t===f.t)second.hp=0;return 0;}});assert.deepEqual(calls,[f.t.id,second.id]);assert.equal(second.status.kodoCorpseLift.height,100000);assert.equal(third.hp,100);
});
test('spell-effect handler never applies auto gates and suppressed handler does not invent damage',()=>{
 const f=fixture();f.t.hp=200000;const calls=[];const api={nativeDamage:(g,t,n,s,opts)=>{calls.push(opts);return 0;}};assert.equal(kodoSpellEffect(f.g,f.a,'A14T',f.t,api),true);assert.equal(calls[0].weapon,true);f.g._sourceAbilityEffectDepth=1;assert.equal(kodoSpellEffect(f.g,f.a,'A14X',f.t,api),false);assert.equal(calls.length,1);
});
test('same-base-order ambiguity is surfaced rather than silently choosing one ability',()=>{
 const f=fixture();skills(f.a,['A14T','A14F']);assert.match(f.cast().message,/命令冲突/);assert.equal(f.a.skillStates.A14T.casts,0);
});
test('native damage retains death prevention and does not force kill through a shield',()=>{
 const f=fixture();f.t.hp=f.t.maxHp=1000;f.t.status.shield=200000;ok(f.cast());near(f.t.hp,1000);near(f.t.status.shield,100001);assert.equal(f.t.status.kodoCorpseLift,undefined);
});
test('saving restores cooldown and reporting; no delayed digestion/recovery appears',()=>{
 const f=fixture();f.t.hp=f.t.maxHp=200000;f.a.hp=500;ok(f.cast());const restored=new Game({mode:'sandbox'});assert.equal(restored.restore(JSON.parse(JSON.stringify(f.g.snapshot()))),restored);const a=restored.state.entities.find(e=>e.id===f.a.id),t=restored.state.entities.find(e=>e.id===f.t.id);assert.equal(a.status.kodoCast.targetId,t.id);near(a.skillStates.A14T.readyAt,20);restored.state.time=40;tickSourceScriptJobs(restored);near(a.hp,500);near(t.hp,100001);assert.equal(restored.state.sourceSkillJobs.length,0);
});
test('actual basic/attack/defense/glutton construction and arena preserve combat skill mapping',()=>{
 for(const [build,combat,id]of [['h0QG','h0QK','A14T'],['h0QH','h0QL','A14T'],['h0QI','h0QM','A14T'],['h0QJ','h0QN','A14X']]){const g=new Game({mode:'sandbox',builderId:'v14_builder_u01X',seed:43}),p=g.state.players[0];ok(g.command('build',{unitId:'v14_h0QG',col:2,row:2}));ok(g.command('sandboxComplete'));const b=p.buildings[0];if(build!=='h0QG'){ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_'+build}));ok(g.command('sandboxComplete'));}ok(g.command('ready'));let a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(a.combatRawcode,combat);assert.equal(manualSourceSkills(g,a).find(s=>s.id===id).status,'partial');g._startArena();a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(a.combatRawcode,combat);assert.ok(has(a,id));}
});
