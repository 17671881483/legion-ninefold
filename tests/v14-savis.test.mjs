import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {recordEggCompletion} from '../dist/egg-rules.js';
import {applySandboxQualification} from '../dist/sandbox-qualifications.js';
import {compileSkills,manualSourceSkills,castManualSourceSkill,tickSourceScriptJobs,beforeSourceDamage,sourceDeath,tickSourceSkills} from '../dist/skills.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message),clone=x=>JSON.parse(JSON.stringify(x)),jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>!j.done&&(!type||j.type===type));
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A1UD','A1UE','A1UF','A1UG']){
 const g=new Game({mode:'sandbox',seed:66});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};g._sourceDamageTriggerDepth=1;for(const p of g.state.players)p.eggHistory.firstWaveClosed=true;for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const make=(dx=.5,side='monster',raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{side,ownerId:side==='defender'?0:4,sourceNativeOwnerId:side==='defender'?8:9,userData:side==='defender'?1:5,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:5+dx,worldY:8});e.hp=e.maxHp=10000;e.mana=e.maxMana=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0WL'),t=make();skills(a,ids);
 return {g,a,t,make,cast:(id,target=t)=>castManualSourceSkill(g,a,id,{target}),at:n=>{g.state.time=n;tickSourceScriptJobs(g);},body:()=>g.state.entities.find(e=>e.combatRawcode==='u011')};
}
test('exact source evidence distinguishes all effects and no ancient caster filter',()=>{
 const e=JSON.parse(readFileSync(new URL('../reference/savis-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),e.source.sha256);for(const x of e.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(e.savisSummonOccurrences,1);assert.equal(e.abilities.A1UI.code,'AHwe');assert.equal(e.abilities.A1UI.Cost1,undefined);assert.equal(lines.slice(39217,39957).some(s=>s.includes('UNIT_TYPE_ANCIENT')),false);assert.ok(lines[39960].includes('TriggerAddAction'));assert.equal(e.units.h0WL.abilList,'A1UD,A1UE,A1UF,A1UG,A1UI');
 const c=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url)));for(const id of ['A1UD','A1UE','A1UF','A1UG','A1UI'])assert.equal(c.playerSkills.abilities.find(a=>a.rawcode===id).status,'partial');assert.equal(c.playerSkills.abilities.find(a=>a.rawcode==='A1UH').status,'marker');
});
test('four unit target skills use native costs cooldowns and common manual state',()=>{
 const f=fixture();assert.deepEqual(manualSourceSkills(f.g,f.a).map(s=>[s.id,s.targetKind,s.manaCost,s.cooldown]),[['A1UD','enemy',8,17],['A1UE','enemy',15,20],['A1UF','enemy',15,15],['A1UG','enemy',20,15]]);for(const s of manualSourceSkills(f.g,f.a)){near(s.range,500/300);assert.equal(s.cooldownMode,'shared_native');}ok(f.cast('A1UD'));near(f.a.mana,992);near(f.a.skillStates.A1UD.readyAt,27);assert.equal(f.cast('A1UD').ok,false);
});
test('invalid targets resources control ownership and pause do not spend mana',()=>{
 for(const mode of ['ally','dead','Avul','Aloc','range','mana','silence','stun','hidden','casterDead','level0']){const f=fixture(['A1UD']);if(mode==='ally'){f.t.team=f.a.team;f.t.side=f.a.side;}if(mode==='dead')f.t.hp=0;if(['Avul','Aloc'].includes(mode))skills(f.t,[mode]);if(mode==='range')f.t.worldX+=10;if(mode==='mana')f.a.mana=7;if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='stun')f.a.status.stunUntil=11;if(mode==='hidden')f.t.status.sourceHidden=true;if(mode==='casterDead')f.a.hp=0;if(mode==='level0')f.a.abilityLevels={A1UD:0};const mana=f.a.mana;assert.equal(f.cast('A1UD').ok,false,mode);near(f.a.mana,mana);assert.equal(jobs(f.g).length,0);}
 const f=fixture();assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1UD',targetId:f.t.id,playerId:1}).ok,false);f.g.state.paused=true;assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1UD',targetId:f.t.id}).ok,false);f.g.state.paused=false;ok(f.g.command('cast',{entityId:f.a.id,skillId:'A1UD',targetId:f.t.id}));
});
test('nested script effects pay fees without effects but ancient bodies are allowed',()=>{
 const f=fixture();f.g._sourceAbilityEffectDepth=1;for(const id of f.a.skillSpecs.map(s=>s.id))ok(f.cast(id));near(f.a.mana,942);near(f.t.hp,10000);assert.equal(jobs(f.g).length,0);
 const x=fixture(['A1UG']);x.a.isAncient=true;ok(x.cast('A1UG'));x.at(10.5);near(x.t.hp,9575);
});
test('dark soul uses selected target plus first two in600range rather than nearest or random',()=>{
 const f=fixture(['A1UD']),first=f.make(2),second=f.make(.6),third=f.make(.7),outside=f.make(2.501),ally=f.make(.8,'defender');let draws=0;f.g._random=()=>{draws++;return .5;};ok(f.cast('A1UD'));assert.deepEqual(jobs(f.g,'savis_soul').map(j=>j.targetId),[f.t.id,first.id,second.id]);f.at(11);for(const t of [f.t,first,second])near(t.hp,9695);for(const t of [third,outside,ally])near(t.hp,10000);assert.equal(draws,0);
});
test('soul selection includes600boundary and excludes dead Avul and Aloc',()=>{
 const f=fixture(['A1UD']),dead=f.make(.6),inv=f.make(.7),loc=f.make(.8),edge=f.make(2.5),outside=f.make(2.501);dead.hp=0;skills(inv,['Avul']);skills(loc,['Aloc']);ok(f.cast('A1UD'));assert.deepEqual(jobs(f.g,'savis_soul').map(j=>j.targetId),[f.t.id,edge.id]);f.at(11);near(edge.hp,9695);near(inv.hp,10000);near(outside.hp,10000);
});
test('soul has no initial hit and continues beyond tooltip duration or caster death',()=>{
 const f=fixture(['A1UD']);ok(f.cast('A1UD'));f.at(10.999);near(f.t.hp,10000);f.g._killUnit(f.a);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);f.at(30);near(f.t.hp,3900);assert.equal(jobs(f.g,'savis_soul')[0].ticks,20);
});
test('soul follows target without range leash and ignores later ability removal',()=>{
 const f=fixture(['A1UD']);ok(f.cast('A1UD'));f.t.worldX+=100;skills(f.a,[]);f.at(12);near(f.t.hp,9390);assert.equal(f.t.status.savis.soulTint,true);
});
test('two infections stack independently without refreshing earlier timer',()=>{
 const f=fixture(['A1UD']);ok(f.cast('A1UD'));f.a.skillStates.A1UD.readyAt=0;f.g.state.time=10.5;ok(f.cast('A1UD'));f.at(11);near(f.t.hp,9695);f.at(11.5);near(f.t.hp,9390);assert.equal(jobs(f.g,'savis_soul').length,2);
});
test('target widget death cancels all infections and restores tint immediately',()=>{
 const f=fixture(['A1UD']);ok(f.cast('A1UD'));f.a.skillStates.A1UD.readyAt=0;ok(f.cast('A1UD'));f.g._killUnit(f.t);assert.equal(jobs(f.g,'savis_soul').length,0);assert.equal(f.t.status.savis.soulTint,false);f.at(30);assert.equal(jobs(f.g).length,0);
});
test('soul widget death on reincarnation cancels dots without cancelling the revival',()=>{
 const f=fixture(['A1UD']);skills(f.t,['A14E']);ok(f.cast('A1UD'));f.g._killUnit(f.t);assert.equal(jobs(f.g,'savis_soul').length,0);assert.equal(f.t.status.savis.soulTint,false);assert.equal(f.t.status.reincarnation.phase,'waiting');
});
test('soul kills once and clears itself during its damage callback',()=>{
 const f=fixture(['A1UD']);f.t.hp=300;ok(f.cast('A1UD'));f.at(11);assert.ok(f.t.hp<=0);assert.equal(jobs(f.g).length,0);assert.equal(f.t.status.savis.soulTint,false);assert.equal(f.g.state.players[0].stats.kills,1);
});
test('blade checks at zero through6seconds and each target takes only200 once',()=>{
 const f=fixture(['A1UE']);ok(f.cast('A1UE'));near(f.t.hp,10000);f.at(10);near(f.t.hp,9800);const j=jobs(f.g,'savis_blade')[0];assert.equal(j.ticks,1);f.at(15.999);assert.equal(j.ticks,6);f.at(16);assert.equal(j.ticks,7);assert.equal(jobs(f.g).length,0);near(f.t.hp,9800);
});
test('blade stays at initial target point and catches late entries only once',()=>{
 const f=fixture(['A1UE']),late=f.make(5);ok(f.cast('A1UE'));f.t.worldX+=10;f.at(10);near(f.t.hp,10000);late.worldX=5.5;f.at(11);near(late.hp,9800);late.worldX=20;f.at(12);late.worldX=5.5;f.at(13);near(late.hp,9800);f.a.worldX+=20;f.at(16);near(late.hp,9800);
});
test('blade can hit exactly on final sixth second but not after cleanup',()=>{
 const f=fixture(['A1UE']),late=f.make(5),after=f.make(6);ok(f.cast('A1UE'));f.at(15);late.worldX=5.5;f.at(16);near(late.hp,9800);after.worldX=5.5;f.at(17);near(after.hp,10000);
});
test('blade covers400radius enemies and retains callback after caster death',()=>{
 const f=fixture(['A1UE']),edge=f.make(.5+400/300),outside=f.make(.501+400/300),friend=f.make(.5,'defender');ok(f.cast('A1UE'));f.g._killUnit(f.a);f.at(10);near(edge.hp,9800);near(outside.hp,10000);near(friend.hp,10000);
});
test('separate blade casts keep separate hit sets',()=>{
 const f=fixture(['A1UE']);ok(f.cast('A1UE'));f.a.skillStates.A1UE.readyAt=0;ok(f.cast('A1UE'));f.at(10);near(f.t.hp,9600);f.at(16);near(f.t.hp,9600);
});
test('eruption creates native body first then175hit then death registration',()=>{
 const f=fixture(['A1UF']),seen=[],hurt=f.g._hurt.bind(f.g);f.a.facing=45;f.g._hurt=(t,n,s,o)=>{if(n===175){const b=f.body();seen.push({body:!!b,watch:!!b?.status.savis?.eruption});}return hurt(t,n,s,o);};ok(f.cast('A1UF'));assert.deepEqual(seen,[{body:true,watch:false}]);near(f.t.hp,9825);const b=f.body();near(b.hp,1500);near(b.damage,149.5);near(b.armor,3);near(b.attackInterval,1);near(b.expiresAt,13);near(b.worldX,5.5);near(b.worldY,8);assert.equal(b.userData,1);assert.equal(b.sourceNativeOwnerId,8);assert.equal(b.ownerId,0);assert.equal(b.isSummon,true);assert.ok(b.traits.includes('summoned'));near(b.facing,f.a.facing);
});
test('eruption timed life explodes at3seconds then schedules10one-second ticks',()=>{
 const f=fixture(['A1UF']);ok(f.cast('A1UF'));f.at(12.999);near(f.t.hp,9825);f.at(13);near(f.t.hp,9700);assert.ok(f.body().hp<=0);const j=jobs(f.g,'savis_loop')[0];assert.equal(j.source,f.body());f.at(13.999);near(f.t.hp,9700);f.at(14);near(f.t.hp,9690);f.at(23);near(f.t.hp,9600);assert.equal(j.ticks,10);assert.equal(jobs(f.g).length,0);
});
test('early death uses moved body center and body owner damage attribution',()=>{
 const f=fixture(['A1UF']),far=f.make(6),friend=f.make(6,'defender');ok(f.cast('A1UF'));const b=f.body();b.worldX=11;const seen=[],hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,s,o)=>{seen.push({n,s,o});return hurt(t,n,s,o);};f.g._killUnit(b);near(far.hp,9875);near(f.t.hp,9825);near(friend.hp,10000);assert.ok(seen.every(r=>r.s===b&&r.o.weapon&&r.o.attackType==='chaos'&&r.o.nativeDamageType==='universal'));f.at(11);near(far.hp,9865);
});
test('eruption300range boundary excludes invulnerable dead and allies',()=>{
 const f=fixture(['A1UF']),edge=f.make(1.5),outside=f.make(1.501),inv=f.make(.6),dead=f.make(.7);skills(inv,['Avul']);dead.hp=0;ok(f.cast('A1UF'));f.g._killUnit(f.body());near(edge.hp,9875);near(outside.hp,10000);near(inv.hp,10000);near(dead.hp,0);
});
test('death listener remains after original caster dies or loses ability',()=>{
 const f=fixture(['A1UF']);ok(f.cast('A1UF'));skills(f.a,[]);f.g._killUnit(f.a);f.at(13);near(f.t.hp,9700);f.at(23);near(f.t.hp,9600);
});
test('main death suppression does not suppress the independent eruption callback',()=>{
 const f=fixture(['A1UF']);ok(f.cast('A1UF'));f.g._sourceUnitDeathTriggerDepth=1;f.g._killUnit(f.body());near(f.t.hp,9700);assert.equal(jobs(f.g,'savis_loop').length,1);sourceDeath(f.g,f.body(),null);near(f.t.hp,9700);
});
test('a death occurring during initial175before registration never replays a burst',()=>{
 const f=fixture(['A1UF']),hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,s,o)=>{if(n===175)f.g._killUnit(f.body());return hurt(t,n,s,o);};ok(f.cast('A1UF'));near(f.t.hp,9825);assert.equal(jobs(f.g,'savis_eruption')[0].registeredAfterDeath,true);f.at(13);near(f.t.hp,9825);assert.equal(jobs(f.g).length,0);
});
test('removed eruption body does not fabricate a widget death burst',()=>{
 const f=fixture(['A1UF']);ok(f.cast('A1UF'));const b=f.body();b.status.sourceRemoved=true;b.hp=0;f.g.state.entities=f.g.state.entities.filter(e=>e!==b);f.at(13);near(f.t.hp,9825);assert.equal(jobs(f.g).length,0);
});
test('loop damage stops on target death and continues from retained dead body',()=>{
 const f=fixture(['A1UF']);ok(f.cast('A1UF'));f.g._killUnit(f.body());f.g.state.entities=f.g.state.entities.filter(e=>e.combatRawcode!=='u011');f.at(11);near(f.t.hp,9690);f.g._killUnit(f.t);assert.equal(jobs(f.g,'savis_loop').length,0);f.at(20);assert.equal(jobs(f.g).length,0);
});
test('meteor waits exactlyhalfsecond and damages500radius once425withoutslow',()=>{
 const f=fixture(['A1UG']),edge=f.make(.5+500/300),outside=f.make(.501+500/300);ok(f.cast('A1UG'));f.at(10.499);near(f.t.hp,10000);f.at(10.5);near(f.t.hp,9575);near(edge.hp,9575);near(outside.hp,10000);f.at(20);near(f.t.hp,9575);assert.deepEqual(f.t.buffs,[]);assert.equal(f.t.status.slowUntil,undefined);assert.equal(jobs(f.g).length,0);
});
test('meteor uses frozen target location after target moves and caster dies',()=>{
 const f=fixture(['A1UG']),waiting=f.make(.6);ok(f.cast('A1UG'));f.t.worldX+=10;f.g._killUnit(f.a);f.at(10.5);near(f.t.hp,10000);near(waiting.hp,9575);
});
test('all script hits use chaos universal weapon even against heavy armor and magic immunity',()=>{
 for(const id of ['A1UD','A1UE','A1UF','A1UG']){const f=fixture([id]);f.t.armor=100;skills(f.t,['Amim']);const seen=[],hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,s,o)=>{seen.push(o);return hurt(t,n,s,o);};ok(f.cast(id));f.at(id==='A1UD'?11:id==='A1UG'?10.5:10);near(f.t.hp,10000-({A1UD:305,A1UE:200,A1UF:175,A1UG:425})[id]);assert.ok(seen.every(o=>o.weapon&&o.attackType==='chaos'&&o.nativeDamageType==='universal'));}
});
test('automatic order spends50mana inUD UE UG UFsequence and last request fails',()=>{
 const f=fixture();f.a.mana=50;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.a,100,f.t);assert.deepEqual(f.a.status.savis.orders.map(o=>[o.id,o.ok]),[['A1UD',true],['A1UE',true],['A1UG',true],['A1UF',false]]);near(f.a.mana,7);assert.equal(f.body(),undefined);
});
test('victim ability wins perbranch even when unable to cast and attacker does not fall back',()=>{
 const f=fixture(['A1UD']);skills(f.t,['A1UD']);f.a.mana=0;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.a,100,f.t);near(f.t.mana,1000);assert.equal(jobs(f.g).length,0);
 const x=fixture(['A1UD']);x.g._sourceDamageTriggerDepth=0;beforeSourceDamage(x.g,x.t,100,x.a);near(x.a.mana,992);assert.equal(jobs(x.g,'savis_soul').length,1);
});
test('zero friendly self A2Y7 and nested damage skip automatic orders',()=>{
 for(const mode of ['zero','friend','self','A2Y7','nested']){const f=fixture();f.g._sourceDamageTriggerDepth=mode==='nested'?1:0;if(mode==='friend'){f.t.side=f.a.side;f.t.team=f.a.team;}if(mode==='A2Y7')skills(f.t,['A2Y7']);beforeSourceDamage(f.g,f.a,mode==='zero'?0:100,mode==='self'?f.a:f.t);near(f.a.mana,1000);assert.equal(jobs(f.g).length,0);}
});
test('mismatched summon order never fabricates3free units or a manual spell',()=>{
 const f=fixture(['A1UH','A1UI']);f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.a,100,f.t);assert.equal(f.a.status.savis.summonOrder.outcome,'wrong-native-order');near(f.a.mana,1000);tickSourceSkills(f.g,f.a,[f.a,f.t],.1);assert.equal(f.g.state.entities.length,2);assert.deepEqual(manualSourceSkills(f.g,f.a),[]);assert.equal(f.cast('A1UI').ok,false);
});
test('pause freezes work and snapshot rebinds both source and targets',()=>{
 const f=fixture();for(const id of ['A1UD','A1UE','A1UG','A1UF'])ok(f.cast(id));f.g.state.paused=true;const snapshot=clone(f.g.snapshot());f.g.tick(10);assert.deepEqual(clone(f.g.snapshot()),snapshot);const g=Game.fromSnapshot(snapshot);for(const j of jobs(g)){assert.equal(j.source,g.state.entities.find(e=>e.id===j.sourceId));if(j.target)assert.equal(j.target,g.state.entities.find(e=>e.id===j.targetId));}f.at(11);g.state.time=11;tickSourceScriptJobs(g);near(g.state.entities.find(e=>e.id===f.t.id).hp,f.t.hp);
});
test('snapshot retains dead caster and eruption-source handles without duplicating callbacks',()=>{
 const f=fixture(['A1UD','A1UF']);ok(f.cast('A1UD'));ok(f.cast('A1UF'));f.g._killUnit(f.body());f.g._killUnit(f.a);f.g.state.entities=f.g.state.entities.filter(e=>e.hp>0);const g=Game.fromSnapshot(clone(f.g.snapshot()));f.at(12);g.state.time=12;tickSourceScriptJobs(g);near(g.state.entities.find(e=>e.id===f.t.id).hp,f.t.hp);assert.ok(jobs(g).every(j=>j.source.hp<=0));
});
test('sandbox reset clears every family job and normal arena ticks deliver timed explosion',()=>{
 const f=fixture(['A1UF']);ok(f.cast('A1UF'));const b=f.body();b.moveSpeed=b.hpRegen=0;b.attackCd=99999;f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;f.g.tick(3.2);near(f.t.hp,9700);assert.equal(jobs(f.g,'savis_eruption').length,0);ok(f.g.command('sandboxReset'));assert.equal(jobs(f.g).length,0);
});
test('real paid path respects source history and super sponsor then deploys correct skills',()=>{
 const g=new Game({mode:'sandbox'}),p=g.state.players[0];p.roster=['v14_h020'];ok(g.command('build',{unitId:'v14_h020',col:2,row:4}));ok(g.command('sandboxComplete'));const b=p.buildings[0];assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_n08H'}).ok,false);recordEggCompletion(p,UNIT_TEMPLATES.h0ME,{buildingId:'history',wave:1});assert.equal(p.technologies.R0GL,1);assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_n08H'}).ok,false);ok(applySandboxQualification(g,{key:'h220',enabled:true}));const gold=p.gold;ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_n08H'}));near(gold-p.gold,500);ok(g.command('sandboxComplete'));ok(g.command('ready'));const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0WL');near(e.maxHp,5000);near(e.maxMana,50);assert.deepEqual(manualSourceSkills(g,e).map(s=>s.id),['A1UD','A1UE','A1UF','A1UG']);
});
