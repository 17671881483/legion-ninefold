// Trig_UnitDeathActions (41911–42186) is one disabled-during-action trigger.
// Independent death registrations must still receive deaths caused inside it.
export const DEATH_TRIGGER_RULES=Object.freeze({
  A0HW:{status:'partial',description:'击杀者携带火噬时，以死者死亡位置为中心，对200码内的敌人追加4＋死者最大生命2%的普通攻击/魔法伤害。不要求普通攻击击杀。该死亡触发器执行期间的嵌套击杀不会再次触发火噬；同条elseif链后续分支也被跳过。',partial:'原生范围枚举/注册顺序和尚未接入的同一死亡触发器其他分支仍待核定；Web保留实体登记顺序。'},
  A20D:{status:'partial',description:'携带死亡爆发的单位死亡时，对死亡位置400码内非死亡、无Avul的敌人造成200点混乱攻击/通用伤害；先于火噬与种族死亡效果。由这次爆炸造成的死亡不重入同一个死亡触发器，但独立死亡监听仍然执行。',partial:'原生范围枚举顺序和其他未接入死亡分支仍待核定；没有替换为普通武器溅射。'},
});
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const scale=e=>(e.distanceScale??1/3)/100;
const isV14=e=>e?.skillVersion==='v14.1A5';
function enumerate(g,source,center,radius,selectRange){
  // A native group is a snapshot; units spawned by nested death listeners do
  // not join the already-enumerated group. Damage still checks live HP/status.
  return [...g.state.entities,...(g.state.kings??[])].filter(t=>
    t.battleTeam===source.battleTeam&&t.side!==source.side&&!has(t,'Aloc')&&
    !t.status?.sourceHidden&&!t.status?.yseraHidden&&!t.status?.yseraRemoved&&
    Math.hypot(pos(t).x-center.x,pos(t).y-center.y)<=radius+1e-8&&
    (!selectRange||(t.hp>0&&!has(t,'Avul'))));
}
export function runMainUnitDeath(g,dead,killer,api){
  if(g._sourceUnitDeathTriggerDepth>0||dead.status?.sourceJuMember)return false;
  g._sourceUnitDeathTriggerDepth=(g._sourceUnitDeathTriggerDepth??0)+1;
  const center=pos(dead);
  try{
    // SingedAlchemyGold draws once even for a non-alchemist. Suppressed death
    // events must not consume that draw or award this trigger's extra gold.
    api.alchemyGold(g,dead,killer);
    if(isV14(dead)&&has(dead,'A20D')){
      for(const t of enumerate(g,dead,center,400*scale(dead),true))api.universalDamage(g,t,200,dead);
      g._event?.('splash',dead,'死亡爆发',{skillId:'A20D',radius:400*scale(dead)});
    }
    if(isV14(killer))api.blademasterKill?.(g,killer);
    if(isV14(dead))api.classDeath(g,dead,killer,true);
    // Independent if at 42006 precedes the fire/bone-dragon elseif chain.
    if(isV14(killer))api.nightmareKill?.(g,killer);
    if(isV14(dead))api.banditDeath?.(g,dead);
    if(isV14(dead))api.yseraAwakening(g,dead);
    if(isV14(killer)&&has(killer,'A0HW')){
      const amount=4+dead.maxHp*.02;
      for(const t of enumerate(g,killer,center,200*scale(dead),false))api.nativeDamage(g,t,amount,killer,{attackType:'normal',damageType:'magic'});
      g._event?.('splash',dead,'火噬',{skillId:'A0HW',sourceId:killer.id,radius:200*scale(dead)});
    }else if(isV14(dead)&&api.skeletonKingDeath(g,dead,killer)){
      // This is the same final elseif chain, including random-failure cases.
    }else if(isV14(dead))api.boneDragonDeath(g,dead);
    return true;
  }finally{g._sourceUnitDeathTriggerDepth--;}
}
