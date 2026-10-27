// war3map.j 40499–40528 / 41293–41294. Bound to combat rawcodes, not A0RF.
export const DEMON_STATUE_BOUNDARY='原图的选敌顺序、随机序列及眩晕命中时序尚未完全复现。眩晕法术缺少原生伤害、耗魔、冷却和施法参数；当前仅即时适配已知控制，不加入推测数值。';
export const DEMON_STATUE_TEXT='普通恶魔雕像造成伤害时可触发弹射，包含法术伤害；雷神外观仅普通攻击有30%概率触发。在受击目标周围550范围随机选择另一名存活、无原生无敌能力的敌人，追加与本次伤害等量的混乱攻击/通用伤害，并尝试眩晕1.5秒。魔免或机械单位仍可受到弹射，但不能被此眩晕控制。';
export const DEMON_STATUE_RULES={
  A0RF:{status:'partial',description:DEMON_STATUE_TEXT,partial:DEMON_STATUE_BOUNDARY},
  A0OZ:{status:'partial',description:'共享中立马甲k的thunderbolt请求；恶魔雕像使用等级2，普通及英雄眩晕均为1.5秒。弹射伤害先结算，命令随后请求，即使目标已死亡仍记录命令。',partial:DEMON_STATUE_BOUNDARY},
};
const raw=e=>e?.combatRawcode??e?.sourceRawcode;
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const removed=e=>e.status?.sourceRemoved||e.status?.yseraRemoved;
const hidden=e=>e.status?.sourceHidden||e.status?.yseraHidden;
// Blizzard.j GroupPickRandomUnitEnum: reservoir sampling, including the first
// GetRandomInt(1, 1). Entity-array order substitutes for native group order.
function pick(g,candidates){let result=null,n=0;for(const e of candidates)if(Math.floor(g._random()*++n)===0)result=e;return result;}
function hammerRequest(g,source,target,api){
  const skill=api.compileAbility(g,source,'A0OZ'),duration=Number(skill.fields[(target.isNativeHero??target.isHero)?'HeroDur2':'Dur2']);
  // The native caster is one preplaced neutral-passive e00O, NOT a freshly
  // spawned source-owned dummy. Control uses the host battle/alliance adapter;
  // the neutral command's defaults and immediate removal stay explicit gaps.
  const applied=Number.isFinite(duration)&&duration>0&&!removed(target)&&!hidden(target)&&!has(target,'Aloc')&&api.applyNativeStun(g,source,target,'A0OZ',duration);
  const request={at:g.state.time,casterHandle:'k',casterRawcode:'e00O',casterOwner:'neutral-passive',originSourceId:source.id,targetId:target.id,abilityId:'A0OZ',level:2,order:'thunderbolt',duration,controlAdapted:!!applied,nativeOutcome:'unverified',abilityRemovedAfterOrder:true,missingNativeDamage:true};
  g.state.demonStatueHammerRequest=request;(target.status??={}).demonStatueHammerRequest=request;
}
export function demonStatueBounce(g,source,victim,amount,api){
  if(!source||!victim||!(amount>0)||source.status?.demonStatueBounceBusy)return false;
  const center=pos(victim),radius=550*(source.distanceScale??1/3)/100;
  const candidates=[...g.state.entities,...(g.state.kings??[])].filter(e=>e.id!==victim.id&&e.side!==source.side&&e.battleTeam===source.battleTeam&&e.hp>.405&&!has(e,'Avul')&&!has(e,'Aloc')&&!removed(e)&&!hidden(e)&&Math.hypot(pos(e).x-center.x,pos(e).y-center.y)<=radius+1e-8);
  const chosen=pick(g,candidates);if(!chosen)return false;
  (source.status??={}).demonStatueBounceBusy=true;
  try{
    api.nativeDamage(g,chosen,amount,source,{attackType:'chaos',damageType:'universal'});
    hammerRequest(g,source,chosen,api);
    g._event?.('cast',source,'恶魔重击',{skillId:'A0RF',targetId:chosen.id});
  }finally{delete source.status.demonStatueBounceBusy;}
  return true;
}
// Selection of the elseif branch is separate from successful bounce/command.
// JASS precedence makes n050 unconditional; n06R evaluates three AND gates.
export function demonStatueDamageBranch(g,victim,source,amount,weapon,api){
  if(!(amount>0)||!source||!victim||source.id===victim.id||source.side===victim.side||has(source,'A2Y7'))return false;
  if(raw(source)!=='n050'&&!(raw(source)==='n06R'&&weapon&&!source.status?.demonStatueBounceBusy&&g._random()*100<30))return false;
  demonStatueBounce(g,source,victim,amount,api);return true;
}
