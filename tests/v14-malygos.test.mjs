import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,castManualSourceSkill,manualSourceSkills,tickSourceScriptJobs,beforeSourceDamage,initializeSourceClassCombat,sourceClassAttackDamageEvent,modifyIncoming} from '../dist/skills.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message);
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type),has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A1PZ','A1Q1','A1Q2','A1Q3']){
 const g=new Game({mode:'sandbox',seed:58});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};g._sourceDamageTriggerDepth=1;for(const p of g.state.players)p.eggHistory.firstWaveClosed=true;for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const p={x:5,y:8},make=(dx=.5,side='monster',code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{side,ownerId:side==='defender'?0:4,sourceNativeOwnerId:side==='defender'?8:9,userData:side==='defender'?1:5,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=10000;e.mana=e.maxMana=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0VP'),t=make();skills(a,ids);
 return {g,a,t,p,make,cast:(id,target=t)=>castManualSourceSkill(g,a,id,id==='A1PZ'||id==='A1Q2'?{point:{x:target.worldX,y:target.worldY}}:{target}),at:n=>{g.state.time=n;tickSourceScriptJobs(g);},kill:e=>g._killUnit(e)};
}

test('source evidence fixes exact callback damage durations ownership and native fields',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/malygos-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.abilities.A1Q5.DataB1,'0.18');assert.equal(p.abilities.A1Q1.Cost1,'20');assert.equal(p.units.e008.HP,'60');assert.equal(p.units.e008.weapsOn,undefined);
});
test('manual skills expose the four correct targets costs ranges and cooldowns',()=>{
 const f=fixture();assert.deepEqual(manualSourceSkills(f.g,f.a).map(s=>[s.id,s.targetKind,s.manaCost,s.cooldown]),[['A1PZ','point',10,8],['A1Q1','enemy',20,12],['A1Q2','point',10,16],['A1Q3','unit',13,8]]);for(const s of manualSourceSkills(f.g,f.a)){near(s.range,500/300);assert.equal(s.status,'partial');}ok(f.cast('A1Q1'));near(f.a.mana,980);near(f.a.skillStates.A1Q1.readyAt,22);assert.equal(f.cast('A1Q1').ok,false);
});
test('invalid net target controls range and mana fail before spending or creating dummies',()=>{
 for(const mode of ['range','mana','zero','silence','pause','dead','ally','invulnerable','immune']){const f=fixture(['A1Q1']);if(mode==='range')f.t.worldX+=5;if(mode==='mana')f.a.mana=19;if(mode==='zero')f.a.abilityLevels={A1Q1:0};if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='pause')f.a.status.sourcePaused=true;if(mode==='dead')f.a.hp=0;if(mode==='ally'){f.t.side=f.a.side;f.t.team=f.a.team;}if(mode==='invulnerable')skills(f.t,['Avul']);if(mode==='immune')skills(f.t,['Amim']);const mana=f.a.mana;assert.equal(f.cast('A1Q1').ok,false,mode);near(f.a.mana,mana);assert.equal(f.g.state.sourceSkillJobs.length,0);}
});
test('point spells reject nonfinite positions and shields reject enemies without payment',()=>{
 const f=fixture();assert.equal(castManualSourceSkill(f.g,f.a,'A1PZ',{point:{x:NaN,y:0}}).ok,false);assert.equal(f.cast('A1Q3').ok,false);near(f.a.mana,1000);ok(f.cast('A1Q3',f.a));near(f.a.mana,987);
});
test('missiles use exactly ten script random draws in angle then radius order',()=>{
 const f=fixture(['A1PZ']),values=[0,1,.25,.5,.5,1,.75,.5,0,0];let count=0;f.g._random=()=>values[count++];ok(f.cast('A1PZ'));assert.equal(count,10);const list=jobs(f.g,'malygos_missile');assert.equal(list.length,5);near(list[0].dummy.worldX,f.t.worldX+350/300);near(list[1].dummy.worldY,f.t.worldY+175/300);near(list[2].dummy.worldX,f.t.worldX-350/300);near(list[3].dummy.worldY,f.t.worldY-175/300);near(list[4].dummy.worldX,f.t.worldX);assert.equal(f.g.state.entities.length,2);for(const j of list){assert.equal(j.dummy.combatRawcode,'e008');assert.equal(j.dummy.userData,0);assert.equal(j.dummy.isSummon,false);near(j.dummy.hp,60);assert.equal(j.dummy.nav,undefined);}
});
test('five missiles explode at half second with exactly137each and250radius',()=>{
 const f=fixture(['A1PZ']);f.g._random=()=>0;const edge=f.make(.5+250/300),outside=f.make(.5+250/300+.001),ally=f.make(.5,'defender'),inv=f.make(.5),immune=f.make(.5);skills(inv,['Avul']);skills(immune,['Amim']);ok(f.cast('A1PZ'));f.at(10.499);near(f.t.hp,10000);f.at(10.5);for(const e of [f.t,edge,immune])near(e.hp,9315);for(const e of [outside,ally,inv])near(e.hp,10000);assert.equal(jobs(f.g,'malygos_missile').length,0);
});
test('missile timers retain their caster after death and do not become army fighters',()=>{
 const f=fixture(['A1PZ']);f.g._random=()=>0;ok(f.cast('A1PZ'));const d=jobs(f.g,'malygos_missile')[0].dummy;f.kill(f.a);f.at(10.5);near(f.t.hp,9315);assert.equal(d.status.sourceRemoved,true);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='e008'),false);
});
test('net starts at zero then moves nine initial-distance tenths before ending',()=>{
 const f=fixture(['A1Q1']);f.t.worldX=f.p.x+1;ok(f.cast('A1Q1'));const j=jobs(f.g,'malygos_net')[0];f.at(10);near(j.dummy.worldX,f.p.x+.1);assert.equal(j.steps,1);f.at(10.32);assert.equal(j.steps,9);near(f.t.hp,10000);f.at(10.36);near(f.t.hp,9224);assert.equal(j.done,true);assert.equal(j.dummy.status.sourceRemoved,true);near(f.a.status.malygosNetImpact.at,10.36);
});
test('net tracks the current target and impact uses its current location',()=>{
 const f=fixture(['A1Q1']);ok(f.cast('A1Q1'));f.at(10);f.t.worldY+=1;const far=f.make(.5);far.worldY+=1.3;f.at(10.36);near(f.t.hp,9224);near(far.hp,9224);near(f.a.status.malygosNetImpact.point.y,f.t.worldY);
});
test('zero distance net impacts immediately rather than leaving a perpetual timer',()=>{
 const f=fixture(['A1Q1']);f.t.worldX=f.a.worldX;ok(f.cast('A1Q1'));f.at(10);near(f.t.hp,9224);assert.equal(jobs(f.g,'malygos_net').length,0);
});
test('net sets speed zero before damage and restores raw default speed exactly six seconds later',()=>{
 const f=fixture(['A1Q1']);f.t.moveSpeed=7;const hurt=f.g._hurt.bind(f.g);let observed;f.g._hurt=(t,...args)=>{if(t===f.t)observed=t.moveSpeed;return hurt(t,...args);};ok(f.cast('A1Q1'));f.at(10.36);near(observed,0);near(f.t.moveSpeed,0);f.at(16.359);near(f.t.moveSpeed,0);f.at(16.36);near(f.t.moveSpeed,Number(f.t.sourceRawFields.spd)/300);
});
test('two nets have independent restores rather than extending the first root',()=>{
 const f=fixture(['A1Q1']);ok(f.cast('A1Q1'));f.at(10.36);f.a.skillStates.A1Q1.readyAt=0;f.at(11);ok(f.cast('A1Q1'));f.at(11.36);assert.equal(jobs(f.g,'malygos_net_restore').length,2);f.at(16.36);assert.ok(f.t.moveSpeed>0);assert.equal(jobs(f.g,'malygos_net_restore').length,1);f.at(17.36);assert.equal(jobs(f.g,'malygos_net_restore').length,0);
});
test('target widget death immediately impacts nearby living enemies even during reincarnation',()=>{
 const f=fixture(['A1Q1']),nearby=f.make(.6);skills(f.t,['A14E']);ok(f.cast('A1Q1'));f.g._hurt(f.t,1e9,f.a,{spell:true,universal:true});assert.equal(f.t.status.reincarnation.phase,'waiting');near(nearby.hp,9224);assert.equal(jobs(f.g,'malygos_net')[0].done,true);
});
test('dummy widget death resolves net but caster death does not cancel its flight',()=>{
 const f=fixture(['A1Q1']);ok(f.cast('A1Q1'));const j=jobs(f.g,'malygos_net')[0];f.kill(j.dummy);near(f.t.hp,9224);assert.equal(j.done,true);
 const z=fixture(['A1Q1']);ok(z.cast('A1Q1'));z.kill(z.a);assert.equal(jobs(z.g,'malygos_net')[0].done,undefined);z.at(10.36);near(z.t.hp,9224);
});
test('net restoration still runs on a dead retained target handle',()=>{
 const f=fixture(['A1Q1']);f.t.hp=700;ok(f.cast('A1Q1'));f.at(10.36);assert.ok(f.t.hp<=0);near(f.t.moveSpeed,0);f.at(16.36);near(f.t.moveSpeed,Number(f.t.sourceRawFields.spd)/300);
});
test('bombs preserve asymmetric source angles and create27zones across nine steps',()=>{
 const f=fixture(['A1Q2']);ok(f.cast('A1Q2'));const bs=jobs(f.g,'malygos_bomb');assert.equal(bs.length,3);for(let i=0;i<3;i++)near(bs[i].angle*180/Math.PI,[-44.75,.5,45.75][i]);f.at(10);assert.equal(jobs(f.g,'malygos_burn').length,3);near(bs[1].dummy.worldX,f.p.x+Math.cos(.5*Math.PI/180)*.2);f.at(10.32);assert.equal(jobs(f.g,'malygos_burn').length,27);assert.ok(bs.every(j=>j.steps===9&&j.moved===540));f.at(10.36);assert.equal(jobs(f.g,'malygos_bomb').length,0);assert.ok(bs.every(j=>j.dummy.status.sourceRemoved));
});
test('each fixed bomb zone ticks63at1second intervals exactly3times without knockback',()=>{
 const f=fixture(['A1Q2']);ok(f.cast('A1Q2'));f.at(10);const zone=jobs(f.g,'malygos_burn')[0];f.g.state.sourceSkillJobs=[zone];f.t.worldX=zone.x;f.t.worldY=zone.y;const p={x:f.t.worldX,y:f.t.worldY};f.at(10.999);near(f.t.hp,10000);f.at(11);near(f.t.hp,9937);f.at(13);near(f.t.hp,9811);assert.equal(jobs(f.g,'malygos_burn').length,0);near(f.t.worldX,p.x);near(f.t.worldY,p.y);
});
test('separate bomb zones overlap and remain fixed after target or caster movement',()=>{
 const f=fixture(['A1Q2']);ok(f.cast('A1Q2'));f.at(10);const zones=jobs(f.g,'malygos_burn');f.g.state.sourceSkillJobs=zones;f.t.worldX=f.p.x;f.a.worldY+=5;f.at(11);near(f.t.hp,10000-3*63);f.t.worldX+=5;f.at(12);near(f.t.hp,10000-3*63);
});
test('bomb dummy death stops only that trajectory and keeps its existing burn zone',()=>{
 const f=fixture(['A1Q2']);ok(f.cast('A1Q2'));f.at(10);const j=jobs(f.g,'malygos_bomb')[0];f.kill(j.dummy);f.at(10.36);assert.equal(jobs(f.g,'malygos_burn').length,19);assert.equal(j.steps,1);
});
test('shield grants18percent spell resistance to caster and only visual target is ally',()=>{
 const f=fixture(['A1Q3']),ally=f.make(.4,'defender');ok(f.cast('A1Q3',ally));assert.equal(has(f.a,'A1Q5'),true);assert.equal(has(ally,'A1Q5'),false);assert.equal(jobs(f.g,'malygos_shield')[0].target,ally);near(modifyIncoming(f.g,f.a,100,f.t,{spell:true,magic:true}),82);near(modifyIncoming(f.g,ally,100,f.t,{spell:true,magic:true}),100);f.at(16);assert.equal(has(f.a,'A1Q5'),false);
});
test('shield does not reduce weapon magic or universal damage and flags mixed resistances',()=>{
 const f=fixture(['A1Q3']);ok(f.cast('A1Q3',f.a));for(const opts of [{attackType:'magic',weapon:true},{spell:true,universal:true},{spell:true,nativeDamageType:'universal'}])near(modifyIncoming(f.g,f.a,100,f.t,opts),100);skills(f.a,['A1Q5','A19A']);near(modifyIncoming(f.g,f.a,100,f.t,{spell:true,magic:true}),60);assert.equal(f.a.status.malygosResistanceOverlapUnresolved,true);
});
test('independent shield timers remove the ability at the earliest expiry',()=>{
 const f=fixture(['A1Q3']);ok(f.cast('A1Q3',f.a));f.at(11);f.a.skillStates.A1Q3.readyAt=0;ok(f.cast('A1Q3',f.a));f.at(16);assert.equal(has(f.a,'A1Q5'),false);assert.equal(jobs(f.g,'malygos_shield').length,1);f.at(17);assert.equal(jobs(f.g,'malygos_shield').length,0);
});
test('official cast command accepts a friendly king and still applies shield to caster',()=>{
 const f=fixture(['A1Q3']),k=f.g.state.kings[0];k.worldX=f.a.worldX+.5;k.worldY=f.a.worldY;ok(f.g.command('cast',{playerId:0,entityId:f.a.id,skillId:'A1Q3',targetId:k.id}));assert.equal(jobs(f.g,'malygos_shield')[0].target,k);assert.equal(has(f.a,'A1Q5'),true);assert.equal(k.skillSpecs?.some(s=>s.id==='A1Q5')??false,false);
});
test('mana drain removes marker before spending and reaches enemies across battlefields',()=>{
 const f=fixture(['A1Q4']),other=f.make(),friend=f.make(.4,'defender'),low=f.make(),inv=f.make();other.battleTeam=1;other.worldX=48;low.mana=4;skills(inv,['Avul']);f.a.mana=10;f.t.mana=5;other.mana=8;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);assert.equal(has(f.a,'A1Q4'),false);near(f.a.mana,20);near(f.t.mana,0);near(other.mana,3);near(friend.mana,1000);near(low.mana,4);near(inv.mana,1000);beforeSourceDamage(f.g,other,1,f.a);near(other.mana,3);
});
test('full caster still drains each enemy and clamps its own mana to maximum',()=>{
 const f=fixture(['A1Q4']);f.a.mana=999;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);near(f.a.mana,1000);near(f.t.mana,995);assert.equal(f.a.status.malygosManaDrain.drained,5);
});
test('zero self friendly suppressed and A2Y7 damage never consumes mana-drain marker',()=>{
 for(const mode of ['zero','self','friend','suppressed','A2Y7']){const f=fixture(['A1Q4',...(mode==='A2Y7'?['A2Y7']:[])]);f.g._sourceDamageTriggerDepth=mode==='suppressed'?1:0;if(mode==='friend'){f.t.side=f.a.side;f.t.team=f.a.team;}beforeSourceDamage(f.g,mode==='self'?f.a:f.t,mode==='zero'?0:1,f.a);assert.equal(has(f.a,'A1Q4'),true,mode);near(f.t.mana,1000);}
});
test('arena deployment removes mana drain while ordinary deployment preserves it',()=>{
 const f=fixture(['A1Q4']);initializeSourceClassCombat(f.g,{id:'b'},f.a);assert.equal(has(f.a,'A1Q4'),true);f.a.isArena=true;initializeSourceClassCombat(f.g,{id:'b'},f.a);assert.equal(has(f.a,'A1Q4'),false);assert.equal(f.a.status.malygosArenaManaRemoved,true);
});
test('automatic orders prefer damaged caster and do not fall back after failed preference',()=>{
 const f=fixture(['A1Q1']);skills(f.t,['A1Q1']);f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);assert.equal(f.t.skillStates.A1Q1.casts,1);assert.equal(f.a.skillStates.A1Q1.casts,0);
 const z=fixture(['A1Q1']);skills(z.t,['A1Q1']);z.t.mana=0;z.g._sourceDamageTriggerDepth=0;beforeSourceDamage(z.g,z.t,1,z.a);assert.equal(z.a.skillStates.A1Q1.casts,0);assert.equal(z.t.status.malygosOrderA1Q1.outcome,'failed');
});
test('automatic attacker fallback observes source order costs and drains mana first',()=>{
 const f=fixture(['A1Q4','A1PZ','A1Q1','A1Q2','A1Q3']);f.a.mana=38;f.t.mana=5;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);near(f.a.mana,3);for(const id of ['A1PZ','A1Q1','A1Q2'])assert.equal(f.a.skillStates[id].casts,1);assert.equal(f.a.skillStates.A1Q3.casts,0);near(f.t.mana,0);
});
test('automatic shield search is centered on damaged unit even for attacker fallback',()=>{
 const f=fixture(['A1Q3']),ally=f.make(1.5,'defender');f.t.worldX=f.p.x+3;f.g._random=()=>.5;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);assert.equal(jobs(f.g,'malygos_shield')[0].target,ally);near(f.a.mana,987);
});
test('automatic shield draws random target before discovering cooldown failure',()=>{
 const f=fixture(['A1Q3']);f.a.skillStates.A1Q3.readyAt=100;let draws=0;f.g._random=()=>{draws++;return 0;};f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);assert.equal(draws,1);assert.equal(f.a.skillStates.A1Q3.casts,0);
});
test('azure fire follows independent weapon events including zero and BJ spell attacks without recursion',()=>{
 const f=fixture(['A1Q0']);sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true},0);near(f.t.hp,9980);sourceClassAttackDamageEvent(f.g,f.t,f.a,{weapon:true,spell:true},1);near(f.t.hp,9960);sourceClassAttackDamageEvent(f.g,f.t,f.a,{spell:true},1);near(f.t.hp,9960);assert.equal(f.a.status.sourceNativeAttackBusy,false);
});
test('missile BJ damage receives one20azure-fire rider per hit',()=>{
 const f=fixture(['A1PZ','A1Q0']);f.g._random=()=>0;ok(f.cast('A1PZ'));f.at(10.5);near(f.t.hp,10000-5*(137+20));
});
test('global pause freezes cast cooldowns and all queued family callbacks',()=>{
 const f=fixture();ok(f.cast('A1Q2'));f.g.state.paused=true;const before=clone(f.g.snapshot());f.g.tick(5);assert.deepEqual(clone(f.g.snapshot()),before);
});
test('save restore rebinds shared source target and dummy handles across all active jobs',()=>{
 const f=fixture();f.g._random=()=>0;ok(f.cast('A1PZ'));ok(f.cast('A1Q1'));ok(f.cast('A1Q2'));ok(f.cast('A1Q3',f.a));f.at(10.2);const g=Game.fromSnapshot(clone(f.g.snapshot()));g._sourceDamageTriggerDepth=1;g.state.time=10.5;tickSourceScriptJobs(g);f.at(10.5);assert.deepEqual(clone(g.snapshot()),clone(f.g.snapshot()));const shield=jobs(g,'malygos_shield')[0];assert.equal(shield.source,g.state.entities.find(e=>e.id===f.a.id));assert.equal(shield.target,shield.source);
});
test('mana drain removed in a saved arena unit is not resurrected on restore',()=>{
 const f=fixture(['A1Q4']);f.a.isArena=true;initializeSourceClassCombat(f.g,{id:'b'},f.a);const g=Game.fromSnapshot(clone(f.g.snapshot()));assert.equal(has(g.state.entities.find(e=>e.id===f.a.id),'A1Q4'),false);
});
test('continuous round retains family jobs while sandbox reset discards every job',()=>{
 const f=fixture();ok(f.cast('A1PZ'));const j=jobs(f.g,'malygos_missile')[0];f.g.state.mode='standard';f.g._advanceContinuous();assert.ok(f.g.state.sourceSkillJobs.includes(j));
 const z=fixture();ok(z.cast('A1Q2'));ok(z.g.command('sandboxReset'));assert.equal(z.g.state.sourceSkillJobs.length,0);
});
test('real qualification history enables paid Malygos upgrade and deploys all four active spells',()=>{
 const g=new Game({mode:'sandbox'}),p=g.state.players[0];p.roster=['v14_h0BP','v14_h041','v14_h201'];p.technologies.R00R=1;p.entitlements.h220=1;ok(g.command('build',{unitId:'v14_h0BP',col:2,row:4}));ok(g.command('sandboxComplete'));const b=p.buildings[0];assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_n07T'}).ok,false);for(const [col,unitId]of [[1,'v14_h041'],[3,'v14_h201']])ok(g.command('build',{unitId,col,row:4}));ok(g.command('sandboxComplete'));const gold=p.gold;ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_n07T'}));near(gold-p.gold,650);ok(g.command('sandboxComplete'));ok(g.command('ready'));const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0VP');assert.deepEqual(manualSourceSkills(g,e).map(s=>s.id),['A1PZ','A1Q1','A1Q2','A1Q3']);
});
test('natural arena ticks resolve full bomb trajectories with finite state and no auxiliary fighters',()=>{
 const f=fixture(['A1Q2']);f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;ok(f.cast('A1Q2'));f.g.tick(4);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='e008'),false);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.ok(f.t.hp<10000);assert.ok(Number.isFinite(f.t.hp));
});
