import {V14_ABILITIES,V14_UNIT_TEMPLATES} from './v14-reference.js';

// Original LF lines: Qs=A1CU / Qu=B07T / Qt=A1CG at 1151–1153;
// AxisaSwap at 33232–33262; building-gated registration at 43806–43808.
// RegisterAxisaHalo belongs to the separate Qs branch, not to A1CF.
export const AXISA_RULES=Object.freeze({
 A1CJ:{status:'partial',description:'女王的祝福与惩戒：建筑携带本技能时，普通或竞技出战后0秒仅扫描一次全图原型h0OV艾萨拉女王。每名友方女王都向阿茜萨本体添加并永久保留A1CK；首次获得默认第1级、自身攻击+10%，已有等级不重置。每名敌方女王都请求把本体已有A1CG等级减1；不改变A1CF回血等级，不给予A1OE攻速惩罚。',partial:'全图枚举使用宿主原型与阵营映射，不按距离、战区或存活筛选。A1CG不存在时不补技能；0或负等级设置的原生结果未核定，记录请求并保留原有效等级。RemoveUnit后句柄与零秒回调的原生同帧次序仍为宿主边界。'},
 A1CF:{status:'partial',nativeKind:true,description:'潮汐之力：AUau，600码友军及自身回血光环B07T；DataB第1至9级为1至9，第10与11级均为10。部署复制建筑当前能力等级，不能从单位名称的英雄阶段推断。',partial:'第5至11级范围、目标与Buff字段未完整提取，移速DataA与百分比模式DataC缺失；宿主按已提取DataB作为每秒固定回血适配。Qs实际为A1CU，不能因A1CF文案自行注册A1CG魔抗光环；11级文案15点回血与数据不符。'},
 A1CH:{status:'partial',nativeKind:true,description:'海浪赞歌攻击光环：原生Aakb，500码内友军及自身攻击+13%，Buff B07U；没有由本能力产生的20%减伤。',partial:'仅使用已提取DataA/B/C、范围与目标字段；缺失原生默认字段的继承及光环刷新/叠加时序仍为宿主适配。'},
 A1CI:{status:'partial',nativeKind:true,description:'海浪赞歌护甲光环：原生AHad，500码内友军及自身护甲+2，Buff B07V；没有由本能力产生的20%减伤。',partial:'DataB百分比模式等未提取默认字段的继承未核定，宿主按已知DataA固定2甲适配；光环刷新/叠加时序未由原生运行验证。'},
 A1CK:{status:'partial',nativeKind:true,description:'女王祝福原生AEar自身攻击光环B07W：第1至4级分别为+10%、+15%、−11%、+4%，DataB/C均启用近战与远程。阿茜萨友方联动只添加能力，不设置已有等级；其他等级由各自调用者决定。',partial:'第2至4级范围未完整提取；原生等级默认字段继承与光环刷新时序尚未核定，宿主按明确的自身目标和DataA等级运行。'},
});
const raw=e=>e?.combatRawcode??e?.sourceRawcode??e?.rawcode??e?.unitId?.replace(/^v14_(?:raw_)?/,'');
const has=(e,id)=>(Array.isArray(e?.skillSpecs)?e.skillSpecs.some(s=>s.id===id):(e?.abilityIds??[]).includes(id))&&(e?.abilityLevels?.[id]??1)>0;
const level=(e,id)=>has(e,id)?e.abilityLevels?.[id]??1:0;
const state=e=>(e.status??={}).axisa??={};
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const jobs=g=>g.state.sourceSkillJobs??=[];
const units=g=>[...(g.state.entities??[]),...(g.state.kings??[])];
function buildingHasSwap(building){
 if(!building||(building.abilityLevels?.A1CJ??1)<=0)return false;
 const code=building.sourceRawcode??building.rawcode??building.unitId?.replace(/^v14_(?:raw_)?/,'');
 return [...(V14_UNIT_TEMPLATES[code]?.abilityIds??[]),...(building.abilityIds??[]),...(building.permanentAbilityIds??[]),...(building.skillSpecs??[]).map(s=>s.id)].includes('A1CJ');
}
export function initializeAxisaDeployment(g,building,body){
 if(!body||!buildingHasSwap(building)||body.status?.axisa?.swapRegistered)return false;
 state(body).swapRegistered=true;
 jobs(g).push({type:'axisa_swap',sourceId:body.id,source:body,nextAt:g.state.time});
 return true;
}
function makePermanent(e,id){e.permanentAbilityIds??=[];if(!e.permanentAbilityIds.includes(id))e.permanentAbilityIds.push(id);}
function relation(source,target){
 if(source.team===undefined||target.team===undefined)return 'unmapped';
 return source.team===target.team?'ally':'enemy';
}
function scan(g,j,api){
 const e=j.source,s=state(e);j.done=true;
 if(removed(e)){s.swapResult={at:j.nextAt,reason:'removed-source-native-result-unverified',requests:[]};return;}
 const report=s.swapResult={at:j.nextAt,requests:[],reason:'completed'};
 // YDWEGetUnitsOfTypeIdAllNull enumerates every player (7074–7085).
 // No battleTeam, distance, alive, invulnerability, hidden or illusion test.
 for(const queen of units(g).filter(t=>!removed(t)&&raw(t)==='h0OV')){
  const side=relation(e,queen),r={queenId:queen.id,relation:side};report.requests.push(r);
  if(side==='ally'){
   r.abilityId='A1CK';r.beforeLevel=level(e,'A1CK');
   api.addAbility(g,e,'A1CK');makePermanent(e,'A1CK');r.afterLevel=level(e,'A1CK');r.permanent=true;
  }else if(side==='enemy'){
   const before=level(e,'A1CG'),requested=before-1,f=V14_ABILITIES.A1CG.resolved_fields;
   Object.assign(r,{abilityId:'A1CG',beforeLevel:before,requestedLevel:requested,afterLevel:before,applied:false});
   if(before>0&&requested>=1&&requested<=Number(f.levels)){
    (e.abilityLevels??={}).A1CG=requested;r.afterLevel=requested;r.applied=true;
    const value=Number(f['DataB'+requested]);if(Number.isFinite(value))e.status.nagaSpellResistance=value;
   }else r.nativeOutcome=before===0?'missing-ability-level-write-unverified':'nonpositive-or-out-of-range-level-unverified';
  }
 }
}
export function tickAxisaJob(g,j,api){
 if(!j||j.type!=='axisa_swap'||j.done)return false;
 if(!g.state.paused&&j.nextAt<=g.state.time+1e-8)scan(g,j,api);
 return !j.done;
}
export function tickAxisaJobs(g,api){
 for(const j of jobs(g))if(j.type==='axisa_swap')tickAxisaJob(g,j,api);
}
export function restoreAxisa(g){
 const handles=new Map(units(g).map(e=>[e.id,e]));
 for(const j of jobs(g))if(j.type==='axisa_swap'){
  if(!handles.has(j.sourceId)&&j.source)handles.set(j.sourceId,j.source);
  j.source=handles.get(j.sourceId)??j.source;
 }
}
