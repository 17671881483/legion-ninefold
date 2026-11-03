export const SIEGE_TEAM_RULE={status:'partial',description:'碎片攻击：武器伤害事件触发，以被攻击者为中心，对400码内存活且无无敌能力的敌人各造成105点混乱攻击／通用伤害。有25%概率随机选中其中一人，再追加420点伤害；主目标也可能受到这两次伤害。',partial:'原生范围枚举顺序、隐藏单位与武器事件分类仍有宿主差异。暴击不是将普通攻击乘5，也不转移已死亡目标的追加伤害。'};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const removed=e=>e.status?.sourceRemoved||e.status?.yseraRemoved;

// Trig_New_UnitAttackActions, 42291–42311. The caller owns the shared,
// per-attacker Attack flag. Enumerate once, then choose one integer index
// BEFORE dealing damage. Do not use reservoir sampling or reroll per victim.
export function siegeTeamAttackDamage(g,source,target,api){
 if(!has(source,'A20C')||!target)return;
 const point=pos(target),radius=400*(source.distanceScale??1/3)/100;
 const group=[...g.state.entities,...(g.state.kings??[])].filter(e=>e.battleTeam===source.battleTeam&&e.side!==source.side&&e.hp>.405&&!removed(e)&&!e.status?.sourceHidden&&!e.status?.yseraHidden&&!has(e,'Aloc')&&!has(e,'Avul')&&Math.hypot(pos(e).x-point.x,pos(e).y-point.y)<=radius+1e-8);
 const report={at:g.state.time,targetId:target.id,point,targets:group.map(e=>e.id),criticalId:null,requests:[]};
 (source.status??={}).siegeFragments=report;
 if(group.length){report.roll=g._random()*100;if(report.roll<=25){report.criticalIndex=1+Math.floor(g._random()*group.length);report.criticalId=group[report.criticalIndex-1].id;}}
 for(const e of group){
  report.requests.push({targetId:e.id,amount:105});api.nativeDamage(g,e,105,source,{attackType:'chaos',damageType:'universal',weapon:true});
  if(e.id===report.criticalId){report.requests.push({targetId:e.id,amount:420});api.nativeDamage(g,e,420,source,{attackType:'chaos',damageType:'universal',weapon:true});g._event?.('cast',e,'碎片暴击',{skillId:'A20C',sourceId:source.id});}
 }
 if(group.length)g._event?.('splash',target,'碎片攻击',{skillId:'A20C',sourceId:source.id,radius});
}
