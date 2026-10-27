import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,describeSkills} from '../dist/skills.js';
import {demonStatueDamageBranch,demonStatueBounce} from '../dist/demon-statue-rules.js';
import {applySandboxQualification} from '../dist/sandbox-qualifications.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const skills=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
function fixture(code='n050'){
 const g=new Game({mode:'sandbox',seed:29});g.state.entities=[];for(const k of g.state.kings){k.worldX=10000;k.worldY=10000;}g.state.phase='combat';g.state.time=10;g._random=()=>.99;
 const p=laneToWorld(0,3,6);
 const make=(code='h03E',side='monster',ids=[],dx=0)=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});skills(e,ids);e.hp=e.maxHp=2000;e.mana=e.maxMana=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;e.traits=[];e.buffs=[];e.isNativeHero=e.isHero=false;g.state.entities.push(e);return e;};
 const a=make(code,'defender'),t=make(),b=make('h03E','monster',[],.5);
 const hit=(amount=50,options={spell:true,universal:true})=>g._hurt(t,amount,a,options);
 return {g,a,t,b,make,hit,p};
}
test('source proof pins exact branch precedence, shared dummy and command sequence',()=>{
 const proof=JSON.parse(readFileSync(new URL('../reference/demon-statue-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');
 assert.equal(createHash('sha256').update(raw).digest('hex'),proof.source.sha256);for(const e of proof.sourceEvidence)assert.equal(lines[e.line-1].replace(/\r$/,''),e.text);
 assert.equal(proof.objectEvidence.A0OZ.level2.duration,1.5);assert.equal(proof.objectEvidence.A0OZ.level2.damage,null);
});
test('ordinary exact n050 requires neither A0RF nor an attack event or probability roll',()=>{
 for(const weapon of [false,true]){const f=fixture();let draws=0;f.g._random=()=>{draws++;return .99;};f.hit(50,{spell:!weapon,weapon,universal:true});near(f.b.hp,1950);assert.equal(draws,1);assert.equal(f.a.skillSpecs.some(s=>s.id==='A0RF'),false);}
});
test('n06R uses strict less-than-30 and short circuits random for nonweapon or busy',()=>{
 for(const [weapon,busy,roll,bounce,draws] of [[true,false,.29999,true,2],[true,false,.3,false,1],[true,false,.99,false,1],[false,false,0,false,0],[true,true,0,false,0]]){const f=fixture('n06R');let count=0;f.g._random=()=>{count++;return roll;};f.a.status.demonStatueBounceBusy=busy;f.hit(50,{spell:true,weapon,universal:true});near(f.b.hp,bounce?1950:2000);assert.equal(count,draws);}
});
test('other rawcodes with A0RF do not acquire the rawcode-bound script',()=>{
 const f=fixture('h03E');skills(f.a,['A0RF']);f.hit();near(f.b.hp,2000);assert.equal(f.g.state.demonStatueHammerRequest,undefined);
});
test('550 range is centered on victim, including the boundary and excluding the original victim',()=>{
 for(const offset of [550/300,550/300+.001]){const f=fixture();f.a.worldX-=15;f.b.worldX=f.t.worldX+offset;f.hit();near(f.t.hp,1950);near(f.b.hp,offset===550/300?1950:2000);}
});
test('reservoir selection consumes a draw per eligible target and can retain the first',()=>{
 const f=fixture(),last=f.make('h03E','monster',[],1);let draws=0;f.g._random=()=>{draws++;return .99;};f.hit();near(f.b.hp,1950);near(last.hp,2000);assert.equal(draws,2);
 const x=fixture(),chosen=x.make('h03E','monster',[],1);x.g._random=()=>0;x.hit();near(x.b.hp,2000);near(chosen.hp,1950);
});
test('selector excludes enemy corpses Avul locust hidden removed other battle and allies',()=>{
 for(const reason of ['dead','Avul','Aloc','hidden','removed','other-battle','ally']){const f=fixture();if(reason==='dead')f.b.hp=.405;if(['Avul','Aloc'].includes(reason))skills(f.b,[reason]);if(reason==='hidden')f.b.status.sourceHidden=true;if(reason==='removed')f.b.status.sourceRemoved=true;if(reason==='other-battle')f.b.battleTeam=1;if(reason==='ally')f.b.side=f.a.side;const hp=f.b.hp;let draws=0;f.g._random=()=>{draws++;return 0;};f.hit();near(f.b.hp,hp);assert.equal(draws,0,reason);assert.equal(f.g.state.demonStatueHammerRequest,undefined);}
});
test('bounce admits mechanical air heroes and buildings, but hammer control keeps native restrictions',()=>{
 for(const mode of ['mechanical','air','hero','building','immune']){const f=fixture();if(mode==='mechanical')f.b.traits=['mechanical'];if(mode==='air')f.b.targetType='air';if(mode==='hero')f.b.isNativeHero=true;if(mode==='building')f.b.isBuilding=true;if(mode==='immune')skills(f.b,['Amim']);f.hit();near(f.b.hp,1950);assert.equal(f.b.status.demonStatueHammerRequest.controlAdapted,['air','hero'].includes(mode),mode);if(['air','hero'].includes(mode))near(f.b.status.stunUntil,11.5);}
});
test('chaos universal bounce uses event amount, not attack stat, armor or copied hammer tooltip',()=>{
 const f=fixture();f.a.damage=9999;f.b.armor=999;skills(f.b,['Amim']);f.hit(37);near(f.b.hp,1963);assert.equal(f.b.status.demonStatueHammerRequest.missingNativeDamage,true);
});
test('incoming shield modifies local event amount before bounce',()=>{
 const f=fixture();f.t.status.shield=20;f.hit(50);near(f.t.hp,1970);near(f.b.hp,1970);
});
test('bounce is a nonweapon scripted damage event and the disabled main chain cannot recurse',()=>{
 const f=fixture();skills(f.b,['A0IE','A0ID']);f.b.hp=10;let nested;const hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,a,o)=>{if(t===f.b)nested={...o,depth:f.g._sourceDamageTriggerDepth};return hurt(t,n,a,o);};f.hit(50);
 assert.ok(f.b.hp<=0);assert.equal(f.b.status.huskarUnyielding,undefined);assert.equal(f.b.status.huskarDuelTag,undefined);assert.equal(nested.spell,true);assert.equal(nested.attackType,'chaos');assert.equal(nested.universal,true);assert.equal(nested.weapon,undefined);assert.equal(nested.depth,1);assert.equal(f.g._sourceDamageTriggerDepth,0);
});
test('death listener remains enabled during bounce and can queue skeleton revival',()=>{
 const f=fixture();f.b.combatRawcode='h0JJ';skills(f.b,['A0IA']);f.b.hp=10;f.g.state.skeletonKingGate.li=true;f.hit(50);assert.ok(f.g.state.sourceSkillJobs.some(j=>j.type==='skeleton_king_revive'));assert.equal(f.b.status.demonStatueHammerRequest.controlAdapted,false);assert.equal(f.b.status.demonStatueHammerRequest.order,'thunderbolt');
});
test('empty ordinary branch still prevents broodmother and duel; missing variant proc falls through',()=>{
 for(const code of ['n050','n06R']){const f=fixture(code);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.b);skills(f.a,['A0I1']);skills(f.t,['A0ID','A0IE']);f.t.buffs=[{key:'B04U',expiresAt:20}];f.t.hp=100;f.hit(101);assert.equal(f.g.state.entities.some(e=>e.status.broodmotherSpawn),code==='n06R');assert.equal(f.t.status.huskarDuelTag,undefined);assert.equal(f.t.status.huskarUnyielding,true);}
});
test('variant failed/busy proc permits duel, ordinary busy branch remains selected without bounce',()=>{
 for(const code of ['n050','n06R']){const f=fixture(code);skills(f.t,['A0ID']);f.a.status.demonStatueBounceBusy=true;f.hit();near(f.b.hp,2000);assert.equal(f.t.status.huskarDuelTag,code==='n06R'?f.a.id:undefined);assert.equal(f.t.status.huskarDuelDeferred,undefined);assert.equal(f.a.status.demonStatueBounceBusy,true);}
});
test('elemental, six-soul and toxin branches precede bounce even if native toxin command fails',()=>{
 for(const mode of ['elemental','souls','toxin']){const f=fixture();if(mode==='elemental'){skills(f.a,['A0HX']);f.g._random=()=>0;}if(mode==='souls'){skills(f.t,['A0XM']);f.t.status.sourceKillnum=6;f.t.hp=10;}if(mode==='toxin'){skills(f.t,['A0I5']);f.a.worldX-=20;}f.hit(50);assert.equal(f.g.state.demonStatueHammerRequest,undefined,mode);if(mode==='toxin')assert.equal(f.t.status.soulToxinOrderRequest.outcome,'failed');}
});
test('main guards reject zero, self, allies, null, A2Y7 and nested events',()=>{
 for(const mode of ['zero','self','allied','null','A2Y7','nested']){const f=fixture();if(mode==='allied')f.a.side=f.t.side;if(mode==='A2Y7')skills(f.a,['A2Y7']);if(mode==='nested')f.g._sourceDamageTriggerDepth=1;f.g._hurt(f.t,mode==='zero'?0:50,mode==='null'?null:mode==='self'?f.t:f.a,{spell:true,universal:true});near(f.b.hp,2000,mode);}
});
test('busy scope surrounds damage and request, blocks same-source reentry and clears after failure',()=>{
 const f=fixture();const api={nativeDamage:()=>{assert.equal(f.a.status.demonStatueBounceBusy,true);assert.equal(demonStatueBounce(f.g,f.a,f.t,10,api),false);throw Error('native adapter failed');}};
 assert.throws(()=>demonStatueDamageBranch(f.g,f.t,f.a,10,true,api),/native adapter failed/);assert.equal(f.a.status.demonStatueBounceBusy,undefined);
});
test('shared k request remains bounded and records the actual level and immediate ability removal',()=>{
 const f=fixture(),count=f.g.state.entities.length;f.hit();const r=f.g.state.demonStatueHammerRequest;assert.equal(r.casterHandle,'k');assert.equal(r.casterRawcode,'e00O');assert.equal(r.casterOwner,'neutral-passive');assert.equal(r.level,2);near(r.duration,1.5);assert.equal(r.abilityRemovedAfterOrder,true);assert.equal(f.g.state.entities.length,count);assert.equal(r.nativeOutcome,'unverified');
});
test('JSON restore preserves stun and seeded selection continuation',()=>{
 const f=fixture('n06R');delete f.g._random;const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),ra=r.state.entities.find(e=>e.id===f.a.id),rt=r.state.entities.find(e=>e.id===f.t.id);for(let i=0;i<8;i++){f.hit(10,{weapon:true,universal:true});r._hurt(rt,10,ra,{weapon:true,universal:true});}assert.deepEqual(r.state.entities.map(e=>[e.hp,e.status.stunUntil]),f.g.state.entities.map(e=>[e.hp,e.status.stunUntil]));assert.deepEqual(r.state.demonStatueHammerRequest,f.g.state.demonStatueHammerRequest);assert.equal(ra.status.demonStatueBounceBusy,undefined);
});
test('real deployment exposes rawcode script without forging A0RF on combat body',()=>{
 for(const code of ['n050','n06R']){const g=new Game({mode:'sandbox',seed:29}),p=g.state.players[0],u=UNITS.find(u=>u.combatRawcode===code);assert.ok(u.buildingAbilityIds.includes('A0RF'));p.roster=[u.id];if(code==='n06R')assert.equal(applySandboxQualification(g,{key:'R0BF',enabled:true}).ok,true);assert.equal(g.command('build',{unitId:u.id,col:2,row:2}).ok,true);assert.equal(g.command('ready').ok,true);const a=g.state.entities.find(e=>e.combatRawcode===code);assert.ok(a);assert.equal(a.skillSpecs.some(s=>s.id==='A0RF'),false);assert.ok(describeSkills(a).some(s=>s.id==='trigger:'+code&&s.status==='partial'));}
});
test('coverage includes display ability, shared dummy ability and separate rawcode bindings honestly',()=>{
 const c=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url)));assert.ok(c.unitScriptBindings.every(b=>!b.abilityRequired));for(const id of ['A0RF','A0OZ'])assert.equal(c.playerSkills.abilities.find(a=>a.rawcode===id).status,'partial');assert.ok(c.playerRuntimeAbilities.find(a=>a.sourceRawcode==='e00O').abilityIds.includes('A0OZ'));const hammer=compileSkills({abilityIds:['A0OZ'],skillVersion:'v14.1A5'})[0];assert.equal(hammer.cooldown,null);assert.equal(hammer.manaCost,null);assert.match(hammer.effectText,/缺少原生伤害/);
});
