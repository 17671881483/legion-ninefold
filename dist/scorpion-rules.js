// war3map.j:29774–29806, 40480–40498, 41215–41232.
const nativeBoundary='AEsh原生弹道、初伤类型、周期伤害默认值及命令施法时序尚未核定；shadowstrike仅记录请求，不扣魔法或伪造命中。';
const dummyBoundary='e00W的targs1、dmgpt1、backSw1等原生默认字段缺失；仅保留创建/赋能力/攻击/5秒寿命请求，未生成攻击马甲或直接给目标附毒。';
export const SCORPION_RULES={
 A10G:{status:'partial',description:'毒素注入对象字段为每秒10伤害、移速降低30%、攻速降低20%，持续3秒，DataD1=9，目标为空地有机单位。',partial:'现有普通攻击附毒仍沿用连续时间伤害与同键刷新适配；原生叠加位、伤害事件类型、周期及施加者归属未核定。该适配产生的每帧伤害会触发A10I，不能作为原生新星触发频率验收。'},
 A10H:{status:'partial',description:'剧毒飞弹：主伤害监听优先向伤害来源、否则受击者发出shadowstrike命令。来源有A10H且事件类型为SLOW_POISON时，在主目标128范围内为其他存活、无Avul的敌人请求毒素攻击马甲。',partial:nativeBoundary+dummyBoundary},
 A10I:{status:'partial',description:'剧毒新星：原脚本and/or优先级使来源有A10I时的每次正值敌对伤害均触发扩散，不限毒伤或普通攻击。主目标250范围内其他存活、无Avul敌人先受到150普通攻击/普通伤害，再请求毒素攻击马甲。若同时有A10H，范围按128取值，但仍追加150伤害。',partial:nativeBoundary+dummyBoundary+'毒素注入的旧连续伤害适配未核定原生跳数，因此新星整段持续伤害频率仍有边界。'},
 A10J:{status:'partial',description:'剧毒外壳：主伤害监听检查受击者自身携带A10J且属于近战攻击者，抽取实数0—100≤30时向伤害来源请求毒素攻击马甲。不是检查攻击者近战；原表翡翠/寒冰巨蝎为远程武器，正常形态不满足此条件。',partial:dummyBoundary+'近战分类按启用武器的normal类型适配，特殊原生类型切换尚未核定。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const point=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const distance=(a,b)=>Math.hypot(point(a).x-point(b).x,point(a).y-point(b).y);
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const melee=e=>e.isMeleeAttacker??[e.weapon1,e.weapon2].some((w,i)=>w&&(Number(w.weapsOn??e.sourceRawFields?.weapsOn??1)&(1<<i))!==0&&w[`weapTp${i+1}`]==='normal');
function poisonAttackRequest(g,source,target){
 return {at:g.state.time,sourceId:source.id,ownerId:source.ownerId,userData:source.userData??null,group:'JH',position:point(target),facing:270,dummyRawcode:'e00W',summoned:true,abilityId:'A10G',order:'attack',targetId:target.id,timedLife:5,timedLifeBuff:'BHwe',materialized:false,outcome:'native-unresolved'};
}
function shadowstrike(g,source,target){
 (source.status??={}).scorpionShadowstrikeRequest={at:g.state.time,order:'shadowstrike',abilityIds:['A10H','A10I'].filter(id=>has(source,id)),targetId:target.id,outcome:'native-unresolved'};
}
export function scorpionSpread(g,source,primary,radius,api){
 const origin=point(primary),scaled=radius*(source.distanceScale??1/3)/100;
 // SelectRange constructs the group before the first damage callback. Do not
 // re-filter it after another target dies, moves, or gains Avul in that callback.
 const group=all(g).filter(t=>t!==primary&&t.battleTeam===source.battleTeam&&t.side!==source.side&&t.hp>.405&&!has(t,'Avul')&&!has(t,'Aloc')&&!t.status?.sourceRemoved&&!t.status?.yseraRemoved&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&distance(t,origin)<=scaled+1e-8);
 const report={at:g.state.time,primaryId:primary.id,origin,radius,targetIds:group.map(t=>t.id),requests:[]};(source.status??={}).scorpionSpread=report;
 for(const target of group){
  if(has(source,'A10I'))api.nativeDamage(g,target,150,source,{attackType:'normal',damageType:'normal',weapon:true});
  // The source still creates the dummy if its preceding150 damage killed Om.
  report.requests.push(poisonAttackRequest(g,source,target));
 }
 return report;
}
// Called inside the main damage listener's disabled-trigger scope; independent
// attack-damage listeners remain enabled for UnitDamageTarget(...,true,...).
export function scorpionMainDamage(g,target,source,amount,options,api){
 if(amount<=0||!source||source===target||source.id===target.id||source.side===target.side||has(source,'A2Y7'))return;
 if(has(source,'A10H')||has(source,'A10I'))shadowstrike(g,source,target);
 else if(has(target,'A10H')||has(target,'A10I'))shadowstrike(g,target,source);
 if(options.nativeDamageType==='slow_poison'&&has(source,'A10H')||has(source,'A10I'))scorpionSpread(g,source,target,has(source,'A10H')?128:250,api);
 if(has(target,'A10J')&&melee(target)){
  const roll=g._random()*100,report={at:g.state.time,roll,damageSourceId:source.id};(target.status??={}).scorpionShell=report;
  if(roll<=30){report.request=poisonAttackRequest(g,target,source);g._event?.('cast',source,'剧毒外壳',{skillId:'A10J'});}
 }
}
