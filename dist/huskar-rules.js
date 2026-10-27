// v14.1A5 war3map.j 40356–40364, 41337–41352, 42270–42271,
// 42576–42594, 42794. Source text and object fields are kept in
// reference/huskar-evidence.json; tooltip values are not executable rules.
export const HUSKAR_RULES=Object.freeze({
  A0IC:{status:'implemented',description:'独立普攻伤害监听先执行神灵沸血：自身生命严格高于10%时扣除当前生命6%，再对受害者造成自身最大生命4%的混乱攻击/神圣伤害。该监听先于本次普攻扣血，独立于主伤害监听；每个分裂箭分别触发。'},
  A0IE:{status:'partial',description:'主伤害事件的伤害严格大于当时生命时，移除A0IE、添加A0IF并开启5秒不屈。先将生命加上本次伤害（受最大生命限制），再照常结算伤害；期间重复致命事件同样预先加血，不刷新计时。到期只移除不屈标志与A0IF，不恢复A0IE。',partial:'A0IF缺少DataB原生继承字段，多重箭目标数尚未核定；A0HX前置随机分支对局部P8的改写尚未接入，组合事件保留待核定。'},
  A0II:{status:'partial',preserveNativeKind:true,description:'狂战在主受伤监听中按扣血前的损失生命比例×10取整，更新技能等级；不屈触发分支优先。独立普攻伤害监听在沸血之后，按本次事件伤害×当前等级×10%回复生命，再重新计算等级。已接入1—10级对象攻速值，非文案每级5%吸血。',partial:'脚本会请求0级；同版原生SetUnitAbilityLevel(0)行为未验证，保留最后有效等级并记录未核定请求，不虚构移除或重置1级。AOae缺失移动加成、部分高等级继承字段和原生光环更新时间仍待核定。'},
});
const skill=(e,id)=>e?.skillSpecs?.find(s=>s.id===id);
const level=(e,id)=>skill(e,id)?e.abilityLevels?.[id]??1:0;
const now=g=>g.state.time;
const eligible=(e,a,amount)=>amount>0&&a&&a.id!==e.id&&a.side!==e.side&&!skill(a,'A2Y7');
// Setting a corpse's life is not a resurrection operation. In particular,
// arrows released before the caster died may still deliver attack events.
const addLife=(e,amount)=>{if(e.hp>0&&!e.status?.sourceDeathHandled&&!e.status?.deathCounted)e.hp=Math.min(e.maxHp,e.hp+amount);};

function updateBerserkLevel(g,e){
  const s=skill(e,'A0II');if(!s||!(e.maxHp>0))return;
  const requested=Math.max(0,Math.min(10,Math.trunc((e.maxHp-e.hp)/e.maxHp*10)));
  e.status??={};e.status.huskarBerserkRequestedLevel=requested;
  if(requested===0){
    e.status.huskarNativeLevelRequest={abilityId:'A0II',level:0,retainedLevel:level(e,'A0II'),at:now(g),status:'native-unverified'};
    return;
  }
  delete e.status.huskarNativeLevelRequest;
  (e.abilityLevels??={}).A0II=requested;
  // Every DataB1–10 value is explicit, including the W3A overrides for 5–10.
  s.haste=Number(s.fields['DataB'+requested]);
}

// Returns the selected branch in the 41337 elseif chain. Later cleanup must
// not re-evaluate its condition after this function has healed/removed A0IE.
export function huskarMainDamage(g,e,attacker,amount,api){
  if(!eligible(e,attacker,amount))return null;
  e.status??={};
  if(skill(attacker,'A0HX')&&(skill(e,'A0IE')||e.status.huskarUnyielding))e.status.huskarDamageLocalUnresolved='A0HX may rewrite P8 before 41337';
  if(skill(e,'A0IE')&&amount>e.hp){
    api.removeAbility(g,e,'A0IE');api.addAbility(g,e,'A0IF');
    e.status.huskarUnyielding=true;e.status.huskarUnyieldingUntil=now(g)+5;
    addLife(e,amount);
    (g.state.sourceSkillJobs??=[]).push({type:'huskar_unyielding',sourceId:e.id,source:e,at:now(g)+5});
    g._event?.('cast',e,'不屈意志 · 5秒',{skillId:'A0IE'});
    return 'A0IE';
  }
  if(e.status.huskarUnyielding&&amount>e.hp){addLife(e,amount);return 'A0IE-active';}
  if(level(e,'A0II')>0){updateBerserkLevel(g,e);return 'A0II';}
  return null;
}

// Caller owns the per-attacker Attack flag (not the main damage guard).
// The original listener does not reject allied, self or zero attack events.
export function huskarAttackDamage(g,e,target,amount,api){
  if(level(e,'A0IC')>0&&e.hp>e.maxHp*.1){
    e.hp-=e.hp*.06;
    api.nativeDamage(g,target,e.maxHp*.04,e,{attackType:'chaos',damageType:'divine'});
  }
  // This independent block lies between blood boil and berserk in the source.
  if(level(e,'A0YD')>0&&g._random()<29/99){
    api.universalDamage(g,target,(target.isNativeHero??target.isHero)?target.maxHp*.3:99999,e);
  }
  const current=level(e,'A0II');
  if(current>0){addLife(e,amount*current*.1);updateBerserkLevel(g,e);}
}

export function tickHuskarJob(g,j,api){
  if(j.done)return false;
  if(j.at>now(g)+1e-8)return true;
  const e=[...g.state.entities,...(g.state.kings??[])].find(e=>e.id===j.sourceId)??j.source;
  if(e){delete e.status.huskarUnyielding;delete e.status.huskarUnyieldingUntil;api.removeAbility(g,e,'A0IF');}
  j.done=true;return false;
}
