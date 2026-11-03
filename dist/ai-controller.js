// Browser opponent strategy, not a claim about the original map's AI.
// Every purchase goes through Game.command and pays the player's real resources.
import {UNITS, MERCENARIES, WAVES, RULES} from './data.js';
import {compileSkills, sourceWeapon} from './skills.js';
import {BOX_REWARD_RULES, BOX_RANDOM_FIGHTER_RULES} from './box-training-rules.js';
import {laneToWorld} from './layout.js';

const units=Object.fromEntries(UNITS.map(u=>[u.id,u]));
const profiles=new WeakMap();
const upgradePaths=new WeakMap(),matchupScores=new WeakMap();
const n=(x,f=0)=>Number.isFinite(Number(x))?Number(x):f;
const gold=(u,upgrade=false)=>n(upgrade?u.upgradeCost??u.upgradeGold??u.cost:u.cost);
const wood=u=>n(u.woodCost);
const paid=u=>Math.max(20,gold(u)+wood(u)*.75);
const planWood=p=>(p.aiUpgradePlan?.targets??[]).reduce((sum,id)=>sum+wood(units[id]??{}),0);
const planGold=p=>(p.aiUpgradePlan?.targets??[]).reduce((sum,id)=>sum+gold(units[id]??{},true),0);
const waveOf=g=>WAVES[Math.min(WAVES.length-1,Math.max(0,g.state.wave-1))];
const effective=b=>units[b.construction?.targetId??b.unitId];
function upgrades(g,u){if(!upgradePaths.has(u))upgradePaths.set(u,g._upgradeIds(u));return upgradePaths.get(u);}
function matchup(g,u,wave=waveOf(g)){
 let cache=matchupScores.get(g);if(!cache||cache.wave!==g.state.wave){cache={wave:g.state.wave,scores:new Map()};matchupScores.set(g,cache);}
 const key=`${u.id}:${wave.wave??wave.id??wave.number}`;
 if(!cache.scores.has(key))cache.scores.set(key,aiUnitScore(g,u,wave));return cache.scores.get(key);
}
function profile(u){
 if(!u)return {area:false,support:[]};
 if(!profiles.has(u)){
  const skills=compileSkills(u).filter(s=>!['unresolved','marker'].includes(s.status));
  profiles.set(u,{skills,area:['msplash','mbounce','artillery','aline','mline'].includes(u.weapon1?.weapTp1)||skills.some(s=>['stomp','wave','knives','nova','breath','cluster','immolation','barrage','pulverize','phoenix_fire'].includes(s.kind)),support:skills.filter(s=>s.kind.startsWith('aura_')||['heal','healing_spray','buff'].includes(s.kind)).map(s=>s.kind)});
 }
 return profiles.get(u);
}

/** Estimate the upcoming matchup using weapon masks and actual attack tables. */
export function aiUnitScore(g,u,wave=waveOf(g)){
 if(!u||!u.combatRawcode||g._isWeaponlessObstacle(u))return 0;
 const weapon=sourceWeapon({...u,side:'defender',skillSource:'v14.1A5',attackInterval:u.interval},{...wave,side:'monster',hp:1,status:{},traits:wave.traits??[]});
 const p=profile(u),attack=weapon?n(weapon.damage)/Math.max(.2,n(weapon.interval,u.interval))*g._typeMultiplier(weapon.attackType,wave.armorType,wave.sourceArmorTypeRaw):0;
 const armorMatch=g._typeMultiplier(wave.attackType,u.armorType,u.sourceArmorTypeRaw),life=n(u.hp)/Math.max(.2,g._armorFactor(n(u.armor))*armorMatch);
 // Crowds favor area attacks; bosses favor focused damage and survivability.
 const area=p.area&&weapon?((wave.count??wave.baseCount??108)>20?6:1.15):1;
 const spells=p.skills?.reduce((sum,s)=>sum+(s.kind==='immolation'?n(s.dps)*3:['stomp','wave','knives','nova','breath','cluster'].includes(s.kind)?n(s.damage)*2/Math.max(5,n(s.cooldown,10)):s.kind==='heal'?n(s.amount??s.heal)*.015:0),0)??0;
 return attack*area+spells+life*.025*(weapon?1:.2);
}
function army(g,p){
 const defs=p.buildings.map(effective).filter(Boolean),fronts=defs.filter(u=>g._isFront(u));
 return {defs,fronts,frontHp:fronts.reduce((s,u)=>s+n(u.hp),0),hp:defs.reduce((s,u)=>s+n(u.hp),0),support:new Set(defs.flatMap(u=>profile(u).support))};
}
function utility(g,u,a){
 const front=g._isFront(u),needFront=!a.fronts.length||a.frontHp<Math.max(1,a.hp)*.3;
 const next=WAVES[Math.min(WAVES.length-1,g.state.wave)];
 const outlook=g.state.wave>1?.2:0;
 let score=(matchup(g,u)*(1-outlook)+matchup(g,u,next)*outlook)*(needFront?(front?1.6:.8):(front?.9:1.25));
 const support=profile(u).support;
 if(support.length)score*=support.some(k=>!a.support.has(k))?1+Math.min(.7,a.defs.length*.08):.72;
 // More copies of the same troop are useful, but a balanced army is harder to counter.
 score/=1+a.defs.filter(d=>d.id===u.id).length*(g.state.wave>1?.16:.08);
 return score;
}
const population=u=>n(u?.population,1);
function planPopulation(p){
 const b=p.buildings.find(b=>b.id===p.aiUpgradePlan?.buildingId);if(!b)return 0;
 const occupied=Math.max(population(units[b.unitId]),population(effective(b)));
 return Math.max(0,...(p.aiUpgradePlan.targets??[]).map(id=>population(units[id])-occupied));
}
function payable(g,p,u,upgrade=false,old=null,reserve=0,reservedWood=0,reservedPopulation=0){
 return gold(u,upgrade)<=p.gold-reserve+1e-8&&wood(u)<=p.wood-reservedWood+1e-8&&g._population(p)-population(old)*(old?1:0)+population(u)+reservedPopulation<=p.populationCap&&!g._requirement(p,u);
}

function openingPlan(g,p){
 if(p.buildings.length)return;
 const plans=[],a=army(g,p);
 for(const id of p.roster){const base=units[id];if(!base||base.morphProxy)continue;
  const visit=(u,path,cost,lumber,seen)=>{
   if(cost>p.gold||lumber>p.wood||population(u)+p.workers>p.populationCap||g._requirement(p,u))return;
   if(aiUnitScore(g,u)>0)plans.push({base,u,path,cost,lumber,score:utility(g,u,a)/Math.max(20,cost+lumber*.75)});
   if(path.length>=2)return;
   for(const nextId of upgrades(g,u)){if(seen.has(nextId))continue;const next=units[nextId];if(next)visit(next,[...path,nextId],cost+gold(next,true),lumber+wood(next),new Set([...seen,nextId]));}
  };visit(base,[],gold(base),wood(base),new Set([id]));
 }
 plans.sort((a,b)=>b.score-a.score);
 for(const plan of plans){const cell=g._emptyCell(p,plan.u);if(!cell)break;
  if(g.command('build',{playerId:p.id,unitId:plan.base.id,...cell}).ok){if(plan.path.length)p.aiUpgradePlan={buildingId:p.buildings.at(-1).id,targets:plan.path};return;}
 }
}
function plannedUpgrade(g,p){
 const plan=p.aiUpgradePlan;if(!plan)return 0;
 const b=p.buildings.find(b=>b.id===plan.buildingId),target=units[plan.targets?.[0]];
 if(!b||!target||!upgrades(g,effective(b)).includes(target.id)){delete p.aiUpgradePlan;return 0;}
 if(!b.construction){
  if(g._requirement(p,target)){delete p.aiUpgradePlan;return 0;}
  if(payable(g,p,target,true,units[b.unitId])&&g.command('upgrade',{playerId:p.id,buildingId:b.id,unitId:target.id}).ok){plan.targets.shift();if(!plan.targets.length){delete p.aiUpgradePlan;return 0;}}
 }
 return (plan.targets??[]).reduce((sum,id)=>sum+gold(units[id],true),0);
}

// Evaluate the final troop of a paid chain, including intermediate stages
// with little standalone value. Reserve all remaining costs while it builds.
function upgradeChoices(g,p,b,a,reserve){
 const old=units[b.unitId],choices=[];
 const visit=(u,path,cost,lumber,seen)=>{
  if(path.length>=3)return;
  for(const id of upgrades(g,u)){
   const next=units[id];if(!next||seen.has(id)||g._requirement(p,next))continue;
   const total=cost+gold(next,true),woodTotal=lumber+wood(next);
   if(total>p.gold-reserve+1e-8||woodTotal>p.wood-planWood(p)+1e-8||g._population(p)-population(old)+population(next)+planPopulation(p)>p.populationCap)continue;
   const targets=[...path,id],gain=utility(g,next,a)-utility(g,old,a);
   if(gain>0)choices.push({type:'upgrade',u:units[targets[0]],b,targets,score:gain/Math.max(20,total+woodTotal*.75)*(a.defs.length>8?1.7:1.25)});
   visit(next,targets,total,woodTotal,new Set([...seen,id]));
  }
 };
 visit(old,[],0,0,new Set([old.id]));return choices;
}

export function buildAIArmy(g,p,opening=false){
 if(g.state.phase!=='build')return;
 if(opening)openingPlan(g,p);
 let reserve=plannedUpgrade(g,p);
 const tasks=g._economyTasks(p);
 if(p.populationCap-g._population(p)-planPopulation(p)<4&&!tasks.farmTask&&p.gold-reserve>=n(RULES.farmCost,24)&&p.wood-planWood(p)>=n(RULES.farmWoodCost,80))g.command('farm',{playerId:p.id});
 if(!opening&&p.buildings.some(b=>!b.construction&&!units[b.unitId]?.hero)&&!p.buildings.some(b=>units[b.unitId]?.heroEntry)){
  const status=g.heroStatus(p.id),def=units[status.entries[0]],cell=def&&g._emptyCell(p,def);
  if(status.canStart&&cell&&payable(g,p,def,false,null,reserve,planWood(p),planPopulation(p)))g.command('build',{playerId:p.id,unitId:def.id,...cell});
 }
 for(let attempt=0;attempt<(opening?8:4);attempt++){
  const a=army(g,p),choices=[];
  for(const id of p.roster){const u=units[id];if(!u||u.heroEntry||!payable(g,p,u,false,null,reserve,planWood(p),planPopulation(p)))continue;
   const cell=g._emptyCell(p,u);if(!cell)continue;
   // A morph proxy has no combat form; value its known pool instead of ignoring the race.
   const options=u.morphProxy?(u.morphTargets??[]).map(v=>units[typeof v==='string'?v:v.id]).filter(Boolean):[u];
   const power=options.length?options.reduce((sum,d)=>sum+utility(g,d,a),0)/options.length:0;
   if(power>0)choices.push({type:'build',u,cell,score:power/paid(u)});
  }
  for(const b of p.buildings){if(b.construction||p.aiUpgradePlan?.buildingId===b.id)continue;
   choices.push(...upgradeChoices(g,p,b,a,reserve).filter(c=>!p.aiUpgradePlan||c.targets.length===1));
  }
  choices.sort((a,b)=>b.score-a.score);
  let purchased=false;
  for(const choice of choices){const payload={playerId:p.id,unitId:choice.u.id,...(choice.b?{buildingId:choice.b.id}:choice.cell)};
   if(g.command(choice.type,payload).ok){
    if(choice.targets?.length>1){p.aiUpgradePlan={buildingId:choice.b.id,targets:choice.targets.slice(1)};reserve=planGold(p);}
    purchased=true;break;
   }
  }
  if(!purchased)break;
 }
}

function developEconomy(g,p){
 const wave=g.state.wave,economy=g.economyStatus(p.id),king=g.state.kings[p.team];
 const memory=p.aiMemory??={};
 if(g.state.phase==='combat')memory.combatMilitary=g._military(p);
 // After leaking, first rebuild the defense by at least 20% before new economy.
 const repairing=(p.roundLeaks??0)>0&&g._military(p)<n(memory.combatMilitary,g._military(p))*1.2;
 if(repairing||king.hp<king.maxHp*.4)return;
 const targetWorkers=Math.min(n(RULES.maxWorkers,10),6+wave);
 if(p.workers+economy.worker.queued<targetWorkers&&economy.worker.canStart&&g._population(p)+n(RULES.workerPopulation,1)+planPopulation(p)<=p.populationCap)g.command('worker',{playerId:p.id});
 const reserve=g.state.phase==='build'?Math.min(120,40+wave*8):60;
 if(p.lumberLevel<Math.min(n(RULES.maxLumberLevel,30),wave+1)&&economy.lumber.canStart&&king.hp>=king.maxHp*.75&&p.gold>=economy.lumber.cost.gold+reserve+planGold(p)&&p.wood>=economy.lumber.cost.wood+planWood(p))g.command('lumber',{playerId:p.id});
}

/** Real enemy armies are visible on the map; use their armor and air coverage. */
export function aiMercenaryScore(g,p,m,defenders=g.state.players.filter(q=>q.team!==p.team).flatMap(q=>q.buildings.map(effective)).filter(u=>u?.combatRawcode)){
 const price=Math.max(1,g._woodCost(m)),income=g.mercenaryStatus(m.id,p.id).income??m.income??0;
 let outgoing=0,incoming=0;
 for(const u of defenders){
  outgoing+=g._typeMultiplier(m.attackType,u.armorType,u.sourceArmorTypeRaw);
  const weapon=sourceWeapon({...u,side:'defender',skillSource:'v14.1A5',attackInterval:u.interval},{...m,side:'monster',hp:1,status:{},traits:m.traits??[]});
  incoming+=weapon?g._typeMultiplier(weapon.attackType,m.armorType,m.sourceArmorTypeRaw):.15;
 }
 const attack=defenders.length?outgoing/defenders.length:1,defense=defenders.length?Math.max(.25,incoming/defenders.length):1;
 return income/price*(g.state.wave<11?120:35)+(n(m.damage)/Math.max(.2,n(m.interval,1))*attack+n(m.hp)*.015/defense)/price;
}

// Only spend an already-earned offer. Planning never rolls or grants rewards.
function claimAIReward(g,p){
 if(g.state.phase!=='build')return;
 const offers=g.boxRewardStatus(p.id)?.offers;if(!offers?.length)return;
 const a=army(g,p),choices=[];
 const efficiency=Math.max(.1,...p.roster.map(id=>units[id]).filter(u=>u?.combatRawcode).map(u=>utility(g,u,a)/paid(u)));
 const add=(offer,value,payload={},type='boxReward')=>{if(value>0)choices.push({value,type,payload:{playerId:p.id,abilityId:offer.id,...payload}});};
 for(const offer of offers){
  if(!offer.canStart)continue;const rule=BOX_REWARD_RULES[offer.id];if(!rule)continue;
  if(rule.handler==='gold')add(offer,rule.gold);
  if(rule.handler==='wood')add(offer,rule.wood*.65);
  if(rule.handler==='lumber'){const cost=g.economyStatus(p.id).lumber.cost;add(offer,cost.gold+cost.wood*.65);}
  if(rule.handler==='farm'&&p.populationCap<n(RULES.maxPopulation,300))add(offer,(p.populationCap-g._population(p)<8?1.5:.4)*(n(RULES.farmCost,24)+n(RULES.farmWoodCost,80)*.65));
  if(rule.handler==='randomFighter'){
   const pool=BOX_RANDOM_FIGHTER_RULES.byAbility[offer.id]?.rawcodes.map(raw=>units[`v14_${raw}`]).filter(Boolean)??[],cell=g._emptyCell(p,{role:'frontline'});
   if(pool.length&&cell){const point=laneToWorld(p.id,cell.col+.5,cell.row+4.5);add(offer,pool.reduce((sum,u)=>sum+utility(g,u,a),0)/pool.length/efficiency,{worldX:point.x,worldY:point.y});}
  }
  for(const target of offer.targets??[]){
   const b=p.buildings.find(b=>b.id===target.buildingId),u=units[b?.unitId];if(!u?.combatRawcode||b.construction)continue;
   if(rule.handler==='training'){
    // ReplaceUnit discards these earned bonuses; keep the enhanced carrier.
    if(n(b.treasureArmor)>0||(b.permanentAbilityIds??[]).some(id=>!['A2ZG','A18P'].includes(id)&&!(b.sourceClassGrantedAbilityIds??[]).includes(id)))continue;
    for(const next of g.boxTrainingStatus(b.id,p.id).targets){
     const def=units[next.unitId],reserved=p.aiUpgradePlan?.buildingId!==b.id;
     if(!def||!next.canStart||p.gold-next.cost.gold<(reserved?planGold(p):0)||p.wood-next.cost.wood<(reserved?planWood(p):0))continue;
     add(offer,(utility(g,def,a)-utility(g,u,a))/efficiency-next.cost.gold-next.cost.wood*.65,{buildingId:b.id,unitId:def.id},'boxTrain');
    }
   }
   if(rule.handler==='unitAbilities'){
    const owned=new Set([...(u.abilityIds??[]),...(b.permanentAbilityIds??[])]),ids=rule.abilityIds.filter(id=>!owned.has(id));if(!ids.length)continue;
    // Estimate the actual permanent grant, favoring fast/area attackers and
    // durable frontliners. Grants already present have zero marginal value.
    let gain=0;const base=utility(g,u,a),rate=1/Math.max(.2,n(u.interval,1)),area=profile(u).area?3:1;
    if(ids.includes('A139'))gain+=30*rate*area;
    if(ids.includes('A13X'))gain+=80*rate*area;
    if(ids.includes('A13B'))gain+=n(u.damage)*rate*area*.1;
    if(ids.includes('A13W'))gain+=n(u.damage)*rate*area*.2;
    if(ids.includes('A13Y'))gain+=n(u.damage)*rate*area*.4;
    if(ids.includes('A138'))gain+=300*.025;
    if(ids.includes('A13T'))gain+=800*.025;
    if(ids.includes('A13V'))gain+=40*10*.025;
    if(ids.includes('A13A')||ids.includes('A13U'))gain+=base*.05;
    if(ids.includes('A2ZG'))gain+=base*.15;
    add(offer,gain/efficiency,{buildingId:b.id});
   }
  }
 }
 choices.sort((a,b)=>b.value-a.value);
 for(const choice of choices)if(g.command(choice.type,choice.payload).ok){
  if(choice.type==='boxTrain'&&p.aiUpgradePlan?.buildingId===choice.payload.buildingId)delete p.aiUpgradePlan;
  break;
 }
}
function kingAndSends(g,p){
 const king=g.state.kings[p.team],cost=n(RULES.kingUpgradeCost,100),hurt=king.hp<king.maxHp*.75,leaking=g.state.players.some(q=>q.team===p.team&&(q.roundLeaks??0)>0);
 // Preserve early income growth; after the first boss, establish a shared
 // hp/regen floor before the next leak. Urgent defense retains its priority.
 const defenseFloor=g.state.wave>=11?Math.floor(g.state.wave/4):0;
 const targets={attack:Math.min(g.kingUpgradeCap('attack'),Math.ceil(g.state.wave/2)),hp:Math.min(g.kingUpgradeCap('hp'),defenseFloor),regen:Math.min(g.kingUpgradeCap('regen'),defenseFloor)};
 if(p.wood>=cost+planWood(p)){
  const order=hurt?['hp','attack','regen']:leaking?['attack','hp','regen']:['attack','regen','hp'];
  for(const stat of order)if(king[stat+'Level']<(hurt||leaking?g.kingUpgradeCap(stat):targets[stat])){if(g.command('king',{playerId:p.id,stat}).ok)break;}
 }
 if(g.state.mode==='sandbox'&&g.state.phase==='combat')return;
 const economy=g.economyStatus(p.id),research=RULES.lumberLevels?.[p.lumberLevel];
 const savingResearch=!hurt&&!leaking&&!economy.lumber.task&&p.lumberLevel<Math.min(n(RULES.maxLumberLevel,30),g.state.wave+1)&&g._military(p)>=n(research?.militaryRequirement)&&p.gold>=economy.lumber.cost.gold+planGold(p);
 const reserve=planWood(p)+(hurt||leaking?cost:savingResearch?economy.lumber.cost.wood:0);
 const defenders=g.state.players.filter(q=>q.team!==p.team).flatMap(q=>q.buildings.map(effective)).filter(u=>u?.combatRawcode),scores=new Map();
 for(let sent=0;sent<3;sent++){
  const budget=p.wood-reserve;
  const available=MERCENARIES.filter(m=>{const status=g.mercenaryStatus(m.id,p.id);return !status.locked&&status.stock>0&&g._woodCost(m)<=budget;});
  for(const m of available)if(!scores.has(m.id))scores.set(m.id,aiMercenaryScore(g,p,m,defenders));
  available.sort((a,b)=>scores.get(b.id)-scores.get(a.id));
  const choice=available[0];if(!choice||!g.command('merc',{playerId:p.id,mercId:choice.id}).ok)break;
 }
}
export function actAI(g,p){
 if(!g._aiEnabled()||p.id===0||g.state.phase==='ended'||g.state.paused)return;
 const treasure=g.treasureStatus(p.id)[0];
 if(treasure)g.command('treasure',{playerId:p.id,treasureId:treasure.id,reward:treasure.lumberAvailable?'lumber':'gold'});
 claimAIReward(g,p);
 developEconomy(g,p);
 if(g.state.phase==='build')buildAIArmy(g,p);
 kingAndSends(g,p);
 if(RULES.interfereEnabled&&g.state.phase==='combat'&&g.state.roundMode!=='arena'&&(p.interfereUntil??0)<=g.state.time){
  const targets=g.state.entities.filter(e=>e.side==='monster'&&e.hp>0&&e.battleTeam===p.team&&e.pendingAttack);
  const king=g.state.kings[p.team];targets.sort((a,b)=>Math.hypot(a.worldX-king.worldX,a.worldY-king.worldY)-Math.hypot(b.worldX-king.worldX,b.worldY-king.worldY));
  // Reissuing lane orders can pull monsters past the army. Interrupt only
  // an endangered king's incoming attacks, never spam T on a stable lane.
  const target=king.hp<king.maxHp*.65?targets.find(e=>e.pendingAttack.targetIsKing):null;
  if(target)g.command('interfere',{playerId:p.id,worldX:target.worldX,worldY:target.worldY});
 }
}
