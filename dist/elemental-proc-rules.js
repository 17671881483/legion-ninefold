// New_UnitDamaged's single elseif chain, war3map.j 41260–41287.
// P8 is a local variable: changing it does not change GetEventDamage().
export const ELEMENTAL_PROC_RULES={
  A0HX:{status:'implemented',description:'敌对正伤害事件中以5%概率追加受害者最大生命70%的普通攻击/魔法伤害，上限3000；不限于普攻。命中该分支后跳过同链冰爆和决斗，并把后续不屈判断使用的局部伤害改为这次数值；原始伤害事件仍照常结算。'},
  A0IK:{status:'partial',description:'敌对正伤害事件以≤30%的实数抽样触发：请求A0IJ冰爆眩晕，并追加125点法术攻击/普通伤害。若这次追加已击杀目标，立即获得A0IL分裂箭，但这条分支不增加次数。未触发时，带B04X的受害者会留下标记；仅在后续同链检查时已死亡的标记目标才给本次伤害来源增加3次数。攻击发起时次数减1，恰好减到1才移除分裂箭，不按文案重写成3箭。',partial:'A0IJ原生伤害、施法弹道与默认字段缺失；当前采用已知1.75秒控制的即时命中适配。A0IL目标数沿用现有原生分裂箭部分实现，原生额外箭/法球仲裁仍待核定。'},
  A0IJ:{status:'partial',description:'冰爆分支请求的AHtb控制：第1级B04X持续1.75秒，Aphx/A1SD携带者不发出命令，机械/魔免/无敌等不满足原生目标条件者不施加控制。',partial:'缺少原生DataA伤害、弹道及默认施法参数，未从说明文案补入100伤害；其他调用等级尚未接入。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const hasBuff=(e,id,now)=>e.buffs?.some(b=>[b.id,b.key,b.buffKey].includes(id)&&(b.expiresAt===undefined||b.expiresAt>now));
export function elementalDamagePrefix(g,target,source,eventDamage,api){
  const result={selected:null,localDamage:eventDamage};
  if(!(eventDamage>0)||!source||source.id===target.id||source.side===target.side||has(source,'A2Y7'))return result;
  if(has(source,'A0HX')&&g._random()<.05){
    result.selected='A0HX';result.localDamage=Math.min(target.maxHp*.7,3000);
    api.nativeDamage(g,target,result.localDamage,source,{attackType:'normal',damageType:'magic'});
    g._event?.('cast',target,'原罪欲火',{skillId:'A0HX',sourceId:source.id});
  }else if(has(source,'A0IK')&&g._random()<=.3){
    result.selected='A0IK';
    if(!has(target,'Aphx')&&!has(target,'A1SD')){
      const applied=api.applyNativeStun(g,source,target,'A0IJ');
      (target.status??={}).iceExplosionBoltRequest={at:g.state.time,sourceId:source.id,abilityId:'A0IJ',level:1,dummyLifetime:1,applied,missingNativeDamage:true};
      if(applied){
        target.buffs??=[];target.buffs=target.buffs.filter(b=>![b.id,b.key,b.buffKey].includes('B04X'));
        target.buffs.push({id:'B04X',key:'B04X',buffKey:'B04X',sourceId:source.id,expiresAt:g.state.time+1.75});
      }
    }
    api.nativeDamage(g,target,125,source,{attackType:'spells',damageType:'normal'});
    if(target.hp<=0)api.addAbility(g,source,'A0IL');
    g._event?.('cast',target,'冰爆',{skillId:'A0IK',sourceId:source.id});
  }else if(hasBuff(target,'B04X',g.state.time)&&has(source,'A0IK')){
    (target.status??={}).iceExplosionMarked=true;result.selected='A0IK-mark';
  }else if(target.status?.iceExplosionMarked&&target.hp<=0){
    // No A0IK requirement on the damage source in this branch. The stored
    // marker is never cleared here, and the Frost1 function is not registered.
    source.status??={};source.status.iceExplosionCharges=(source.status.iceExplosionCharges??0)+3;
    api.addAbility(g,source,'A0IL');result.selected='A0IK-charges';
  }
  return result;
}

// EVENT_PLAYER_UNIT_ATTACKED, 47590–47596. This runs on initiation, including
// an attack whose windup is later cancelled, rather than on each arrow hit.
export function iceExplosionAttackIssued(g,source,api){
  const charges=source.status?.iceExplosionCharges??0;
  if(!has(source,'A0IK')||!(charges>0))return;
  const left=source.status.iceExplosionCharges=charges-1;
  if(left===1)api.removeAbility(g,source,'A0IL');
}
