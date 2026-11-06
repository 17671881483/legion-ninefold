// Browser AI tactics. Cast through the same paid, validated command as a player.
// Source-triggered automatic spells remain separate and share their native CD.
import {matchesTargets,sourceSpellTargetState} from './skills.js';
import {laneToWorld} from './layout.js';

const supported=new Set(['A16T','A0JA','A1UN','A1TW','A1TZ','A0IP']);
const pos=e=>Number.isFinite(e.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e.laneId,e.x,e.y);
const distance=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const scale=e=>(e.distanceScale??1/3)/100;
const has=(e,id)=>e.skillSpecs?.some(s=>s.id===id&&(e.abilityLevels?.[id]??1)>0);
const visible=e=>e.hp>.405&&!e.scriptAuxiliary&&!e.status?.sourceRemoved&&!e.status?.yseraRemoved&&!e.status?.sourceHidden&&!e.status?.yseraHidden&&!has(e,'Aloc');
const friendly=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side;
const missing=e=>Math.max(0,e.maxHp-e.hp);
const pointPayload=e=>({worldX:pos(e).x,worldY:pos(e).y});

function choices(g,e,skill,all){
 const spec=e.skillSpecs.find(s=>s.id===skill.id),unit=scale(e),range=skill.range;
 const allies=all.filter(t=>t.battleTeam===e.battleTeam&&friendly(e,t)&&!sourceSpellTargetState(t,g.state.time).invulnerable);
 const enemies=all.filter(t=>t.battleTeam===e.battleTeam&&!friendly(e,t)&&!sourceSpellTargetState(t,g.state.time).invulnerable);
 const inRange=list=>list.filter(t=>distance(e,t)<=range+1e-8);
 const candidates=[];
 const add=(score,payload)=>{if(Number.isFinite(score)&&score>0)candidates.push({skillId:skill.id,score,payload});};
 if(skill.id==='A0IP'){
  // One normal seven-tick bomb per target. Reapplying shares a script counter;
  // do not waste mana refreshing its debuff or exploit overlapping timers.
  const occupied=new Set((g.state.sourceSkillJobs??[]).filter(j=>j.type==='living_bomb'&&!j.done).map(j=>j.targetId));
  for(const t of inRange(enemies)){
   if(occupied.has(t.id)||t.buffs?.some(b=>[b.id,b.key,b.buffKey].includes('B04Y')&&b.expiresAt>g.state.time)||sourceSpellTargetState(t,g.state.time).magicImmune||t.status?.cycloneUntil>g.state.time||!matchesTargets(spec,e,t,g.state.time))continue;
   const value=Math.min(t.hp,t.maxHp*.35);
   if(t.hp>=Math.max(100,t.maxHp*.15)&&value>=80)add(value/skill.manaCost,{targetId:t.id});
  }
 }else if(skill.id==='A16T'){
  // Heal where wounds are concentrated, not at the enemy's last position.
  for(const center of inRange(allies)){
   const value=allies.filter(t=>distance(center,t)<=600*unit+1e-8).reduce((sum,t)=>sum+Math.min(480,missing(t)),0);
   if(value>=120)add(value/skill.manaCost,pointPayload(center));
  }
 }else if(skill.id==='A0JA'){
  // Tranquility's aura is centered on the caster, regardless of its target.
  const wounds=allies.filter(t=>distance(e,t)<=500*unit+1e-8);
  const covered=t=>(g.state.sourceSkillJobs??[]).some(j=>j.type==='malfurion_aura'&&!j.done&&j.at>g.state.time&&j.dummy?.hp>0&&j.dummy.battleTeam===e.battleTeam&&friendly(e,j.dummy)&&distance(j.dummy,t)<=500*unit+1e-8);
  const value=wounds.filter(t=>!covered(t)).reduce((sum,t)=>sum+Math.min(t.maxHp*.24,missing(t)),0);
  if(value>=120)for(const t of inRange(allies).filter(t=>missing(t)>0&&!sourceSpellTargetState(t,g.state.time).magicImmune&&!(t.status?.cycloneUntil>g.state.time)&&matchesTargets(spec,e,t,g.state.time)))add(value/skill.manaCost,{targetId:t.id});
 }else if(skill.id==='A1TZ'){
  const near=enemies.filter(t=>distance(e,t)<=350*unit+1e-8);
  if(near.length>=2||near.some(t=>t.isBoss||t.hp>=e.damage*4))add(near.reduce((sum,t)=>sum+Math.min(804.6,t.hp),0)/skill.manaCost,{});
 }else if(enemies.some(t=>distance(e,t)<=900*unit+1e-8)){
  // Summon as the fight approaches, rather than spending timed summons at spawn.
  // Stay beside the caster instead of dropping the supporting army behind enemies.
  if(!e.isAncient&&!e.traits?.includes('ancient'))add(skill.id==='A1UN'?40:35,skill.id==='A1UN'?pointPayload(e):{});
 }
 return candidates;
}

export function castAICombat(g,p){
 if(p.id===0||!g._aiEnabled()||g.state.paused||!['combat','arena'].includes(g.state.phase))return;
 // Snapshot prevents newly summoned units from recursively acting this turn.
 const casters=g.state.entities.filter(e=>e.ownerId===p.id&&['defender','arena0','arena1'].includes(e.side)&&visible(e)&&e.skillSpecs?.some(s=>supported.has(s.id)));
 for(const e of casters){
  if(!visible(e)||e.status?.silenceUntil>g.state.time)continue;
  const skills=g.unitSkillStatus(e.id,p.id).filter(s=>supported.has(s.id)&&s.canStart&&s.manaCostKnown&&s.manaCost>0);
  if(!skills.length)continue;
  const all=[...g.state.entities,...g.state.kings].filter(visible);
  const ranked=skills.flatMap(s=>choices(g,e,s,all)).sort((a,b)=>b.score-a.score);
  // A failed native target must not prevent trying another legal target.
  // Bound attempts and interrupt at most one attack per caster/AI decision.
  for(const choice of ranked.slice(0,4))if(g.command('cast',{playerId:p.id,entityId:e.id,skillId:choice.skillId,...choice.payload}).ok)break;
 }
}
