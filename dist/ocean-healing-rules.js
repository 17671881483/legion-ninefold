// war3map.j LF: the independent A313 SPELL_EFFECT action is registered at
// 26470–26472; its A0HB branch is 26392–26414 and filter A0HBs is 26310–26312.
// The only SaveInteger(K,A0HB,handle,...) is in h0xk (23055–23076), which has
// no caller. The real round entry ok calls CountUnitsInGroupEnum_I101 instead
// (23077–23100). Do not invent deployment grants from guards, U2 or training.
export const OCEAN_HEALING_NATIVE_REFERENCE=Object.freeze({
 base:'Ahea',cooldown:1,cast:0,order:'heal',orderOn:'healon',orderOff:'healoff',
 sources:Object.freeze([
  'https://raw.githubusercontent.com/sumneko/w3x2lni/master/data/zhCN-1.24.4/prebuilt/Custom/ability.ini',
  'https://raw.githubusercontent.com/sumneko/w3x2lni/master/data/enUS-1.27.1/prebuilt/Custom/ability.ini',
 ]),
 boundary:'两个版本的原生Ahea均为1秒冷却、0施法时间；本图A0HB缺失Cool字段，采用原生默认参考不等于已验证本图零售运行结果。',
});
export const OCEAN_HEALING_RULES=Object.freeze({
 A0HB:Object.freeze({status:'partial',nativeKind:true,preserveNativeKind:true,
  description:'治疗：原生Ahea已提取治疗500、耗魔10、距离600。成功施法触发独立A313监听；仅当施法者句柄已有显式保存的正整数Ca时，先自身直接加2Ca生命，再给2000码内拥有A07S且userdata相同的每个单位直接加Ca，不额外限制阵营或战区。',
  partial:'唯一保存Ca的h0xk函数没有调用入口，正常新出战不自动获得加成，也不按近卫军数量或训练补造。缺失Cool使用1.24.4/1.27.1原生Ahea的1秒参考；原生治疗与SPELL_EFFECT时序、尸体SetUnitState及原生隐藏/移除句柄枚举仍为宿主适配。',
  sourceLines:[23055,23076,23077,23100,26310,26312,26392,26414,26470,26472],
 }),
});
const pos=e=>({x:e.worldX??e.x??0,y:e.worldY??e.y??0});
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const hasMarker=e=>(Array.isArray(e?.skillSpecs)?e.skillSpecs.some(s=>s.id==='A07S'):(e?.abilityIds??[]).includes('A07S'))&&(e.abilityLevels?.A07S??1)>0;
const userData=e=>Number.isInteger(e?.userData)?e.userData:0;
const savedBonus=e=>Number.isInteger(e?.sourceOceanHealingBonus)&&e.sourceOceanHealingBonus>=-2147483648&&e.sourceOceanHealingBonus<=2147483647?e.sourceOceanHealingBonus:0;
const units=g=>[...new Set([...(g.state.entities??[]),...(g.state.kings??[])])];
function directLife(g,e,amount,phase){
 const before=e.hp,dead=!(before>.405)||e.status?.deathCounted||e.status?.sourceDeathHandled;
 // SetUnitState is neither a spell heal nor a resurrection. Keep dead units
 // in the source enumeration and record the attempted write without reviving.
 if(!removed(e)&&!dead&&Number.isFinite(e.maxHp))e.hp=Math.min(e.maxHp,before+amount);
 const after=e.hp,request={targetId:e.id,phase,amount,before,after,applied:after-before};
 if(removed(e))request.nativeBoundary='removed-handle-life-write-unverified';
 else if(dead)request.nativeBoundary='dead-unit-life-write-without-resurrection';
 if(request.applied>0)g._event?.('heal',e,'治疗加成',{skillId:'A0HB',amount:request.applied,sourceDirectLife:true});
 return request;
}
/** Only dispatch after a successful native SPELL_EFFECT. This independent
 * listener does not share the main all-ability trigger's reentry guard. It
 * spends no resources and does not repeat the native 500-point target heal.
 * sourceOceanHealingBonus represents K[A0HB, this exact runtime handle].
 */
export function oceanHealingSpellEffect(g,e,id,target,api={}){
 if(id!=='A0HB'||!e)return false;
 const bonus=savedBonus(e);if(bonus<=0)return false;
 const report={abilityId:id,at:g.state.time,bonus,nativeTargetId:target?.id??null,requests:[]};
 (e.status??={}).oceanHealingLastEffect=report;
 report.requests.push(directLife(g,e,bonus*2,'self'));
 if(removed(e)){report.nativeBoundary='removed-caster-enumeration-unverified';return true;}
 const center=pos(e),radius=2000*(e.distanceScale??1/3)/100,ownerData=userData(e);
 // No alive, friend, owner, battleTeam, immunity, invulnerability or hidden
 // predicate exists in A0HBs. A native group contains each handle only once.
 const chosen=units(g).filter(t=>!removed(t)&&hasMarker(t)&&userData(t)===ownerData&&Math.hypot(pos(t).x-center.x,pos(t).y-center.y)<=radius+1e-8);
 for(const t of chosen)report.requests.push(directLife(g,t,bonus,'A07S'));
 return true;
}
/** No reachable source path initializes Ca. Preserve an explicit value on the
 * SAME combat handle; never copy a building's handle-keyed value to a new body.
 */
export function initializeOceanHealingDeployment(g,building,body){return savedBonus(body);}
/** JSON already preserves the numeric handle-local field. Restoring is purely
 * observational: no U2 derivation, healing replay, timer or deployment grant.
 */
export function restoreOceanHealing(g){return units(g).filter(e=>Object.hasOwn(e,'sourceOceanHealingBonus')).length;}
