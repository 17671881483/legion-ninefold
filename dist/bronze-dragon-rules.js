import {V14_UNIT_TEMPLATES} from './v14-reference.js';

const timerBoundary='按建筑体注册，战斗体的A14Y/A14Z标签交叉不改写；死亡后下一次回调才注销。死亡生命写入、原生计时器同帧先后与旧档缺失历史仍有边界。';
export const BRONZE_DRAGON_RULES={
 A14Y:{status:'partial',description:'出战建筑有时空裂隙时，每1秒记录生命百分比，每5秒回写本轮第2秒的比例并授予A150；实际回到3秒前，不是文案2秒。生命可能下降。',partial:timerBoundary},
 A14Z:{status:'partial',description:'出战建筑没有A14Y且有虫洞时，每1秒记录生命百分比，每4秒回写本轮第2秒的比例并授予A150。恢复比例应用于当时最大生命，不是恢复固定生命值。',partial:timerBoundary},
 A150:{status:'partial',nativeKind:true,description:'动态青铜龙分裂沿用原生Aroc适配，500范围至多4个额外目标。攻击启动仅在AttackTrigegr登记与前置分支允许时计数，第二次才移除；再次授予不重置计数。h0QR的独立伤害分支将事件改写为局部P8加主武器随机攻击的一半，普通配置P8初值0，非文案150%。',partial:'Aroc目标数量、弹道和叠加沿用既有部分适配；原生攻击上下限的动态修正及随机流待核定。混入瓦里安/红龙技能改变P8的前置链未实现时保留未核定记录，不猜当前事件伤害为P8。'},
 A151:{status:'partial',description:'每个独立武器伤害事件抽百分数≤20，调用PauseUnitEx(1.5)：动画冻结1.5秒，控制请求为A0I7等级R2I(1.5)=1，显式普通/英雄眩晕1/0.5秒。分裂箭各自触发。',partial:'复用PauseUnitEx原生控制适配；马甲命令/目标许可、重叠动画恢复、原生随机精度仍待核定，不能把动画冻结当作1.5秒万能眩晕。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const raw=e=>e?.combatRawcode??e?.sourceRawcode;
export const BRONZE_ATTACK_REGISTRY=new Set('h0QX,h0QB,h0Q9,h0Q8,h0Q7,h0Q4,n05x,h0Q5,n05y,h0Q2,h0Q3,h0PW,h0PY,n00K,h08B,h02U,h04M,h04N,h0P9,n205,h06G,h16G,n1S2,n1S4,h0CD,h03B,h081,h08A,h082,n007,h032,h132,h030,n0SB,h06Z,h074,h075,h09P,h19P,h0A7,h0AV,h0AW,h06C,h069,h06A,h08T,h092,h02D,h2AA,h02H,n00D,h0OC,h03W,h00K,h06H,h0CR,h0CT,h03G,h03H,h03M,h03N,h087,h0BY,h0BZ,u005,h0M1,h0NG,h02Y,h0O9,h07Y,h0OE,h0O7,h0JN,h0O5,h0P4,h0OZ'.split(','));

export function initializeBronzeDeployment(g,building,e){
 if(!building||e.status?.bronzeFissureRegistered)return;
 const code=building.unitId?.replace(/^v14_/,'')??building.sourceRawcode,ids=[...(V14_UNIT_TEMPLATES[code]?.abilityIds??building.abilityIds??[]),...(building.permanentAbilityIds??[]),...(building.skillSpecs??[]).map(s=>s.id)];
 // building.abilityIds is a source-class birth journal and can still contain
 // the pre-upgrade object's abilities. Read the current object's native list.
 const id=['A14Y','A14Z'].find(id=>ids.includes(id)&&(building.abilityLevels?.[id]??1)>0);if(!id)return;
 (e.status??={}).bronzeFissureRegistered={abilityId:id,buildingRawcode:code,at:g.state.time};
 (g.state.sourceSkillJobs??=[]).push({type:'bronze_fissure',sourceId:e.id,source:e,abilityId:id,period:id==='A14Y'?5:4,phase:0,history:{},nextAt:g.state.time+1});
}
export function tickBronzeJob(g,j,api){
 if(j.nextAt>g.state.time+1e-8)return true;
 const e=g.state.entities.find(e=>e.id===j.sourceId)??j.source;if(!e)return false;j.source=e;
 while(j.nextAt<=g.state.time+1e-8){
  const at=j.nextAt;j.nextAt+=1;j.phase++;
  if(j.phase===j.period){
   const before=e.hp,percent=j.history[2]??0,requested=e.maxHp*Math.max(0,Math.min(100,percent))/100;
   if(before>.405&&!e.status?.sourceRemoved){if(requested<=.405)api.killUnit(g,e);else e.hp=requested;}
   (e.status??={}).bronzeRewind={at,before,percent,requested,after:e.hp,deadHandleUnresolved:before<=.405||!!e.status.sourceRemoved};
   j.phase=0;api.addAbility(g,e,'A150');
   if(e.hp>.405)g._event?.('cast',e,'时空回溯',{skillId:j.abilityId});
  }else j.history[j.phase]=e.maxHp>0?Math.max(0,e.hp)/e.maxHp*100:0;
  // The source checks death AFTER the write / grant, not at callback entry.
  if(e.hp<=.405||e.status?.sourceRemoved){j.history={};return false;}
 }
 return true;
}

const buff=(e,id)=>e?.buffs?.some(b=>b.key===id||b.buffId===id);
function precedingAttackBranch(g,e,t){
 const a=raw(e),b=raw(t),full=e.mana===e.maxMana;
 if(b==='n00K'&&e.mana>=20||b==='h02Y'||a==='h0OS')return true;
 if(has(e,'S006')&&e.mana>=17&&!e.status?.sourceS006Timer||has(e,'A0TB'))return true;
 if(['h088','h0SI','h04M','h0P9','h04N','n205','h06G','h16G','n1S2','n1S4','h03B','h0OC','n007','n0SB','h06Z','h09P','h19P','h0A7','h0AV','h0AW','h06C','h069','h06A','h0O9','h0OE','h08T','h02D','h0P4','h2AA','h02H','n00D','h00K','h06H'].includes(a))return true;
 if(a==='h08B'&&!buff(e,'B02Y')||a==='h02U'&&full||a==='h0CD'&&e.mana>=3||has(e,'A06O')||b==='h082'||b==='h0M1'||a==='h030'&&!has(e,'A05U'))return true;
 if(['h074','h075','h092'].includes(a)&&full)return true;
 if(a==='h03W'&&t?.maxHp<=150&&!g.state.sourcePlayerTwoAttackFlag)return true;
 return a==='h0CR'&&full||['h0CT','h03G','h03H','h03M','h03N','h087','h0BY','h0BZ','u005'].includes(a);
}
export function bronzeAttackIssued(g,e,t,api){
 if(!has(e,'A150')||!t)return;
 // Native event registration belongs to the attacked unit's current owner.
 const owner=t.sourceNativeOwnerId,registeredOwner=owner===undefined?!t.isBuilding&&Number.isInteger(t.battleTeam):owner>=8&&owner<=12;
 if(!registeredOwner||!(BRONZE_ATTACK_REGISTRY.has(raw(e))||BRONZE_ATTACK_REGISTRY.has(raw(t)))||precedingAttackBranch(g,e,t))return;
 const st=e.status??={},old=st.bronzeAttackCount??0;
 st.bronzeAttackCount=old>=1?0:1;
 if(old>=1)api.removeAbility(g,e,'A150');
}
export function bronzeAttackDamage(g,e,t,amount,api){
 if(has(e,'A151')){
  const roll=Math.fround(g._random()*100);(e.status??={}).bronzeStasis={at:g.state.time,targetId:t.id,roll};
  if(roll<=20)api.pauseUnitEx(g,e,t,1.5);
 }
 if(!has(e,'A150')||raw(e)!=='h0QR')return amount;
 const report={at:g.state.time,before:amount};(e.status??={}).bronzeDamage=report;
 if(has(e,'A16Z')||has(e,'A11Y')&&has(e,'A11S')){report.boundary='unimplemented-prior-P8-branch';return amount;}
 const f=e.sourceRawFields??{},lo=Number(f.damage_min_1),hi=Number(f.damage_max_1),mean=Number(f.damage_avg_1);
 if(![lo,hi,mean,e.damage].every(Number.isFinite)||[f.damage_min_1,f.damage_max_1,f.damage_avg_1].some(v=>v==null||v==='')){report.boundary='missing-native-attack-bounds';return amount;}
 const delta=e.damage-mean,roll=g._random(),sample=Math.fround(lo+delta+roll*(hi-lo));
 Object.assign(report,{localP8:0,roll,min:lo+delta,max:hi+delta,sample,after:sample*.5});return report.after;
}
