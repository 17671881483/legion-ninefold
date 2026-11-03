import {lanes,laneToWorld} from './layout.js';
import {V14_ABILITIES,V14_UNIT_TEMPLATES} from './v14-reference.js';

const boundary='ANcl原生前摇、同帧命令仲裁、原生枚举及生命设置时序仍为宿主适配；原图模型和特效缺失。';
export const NOZDORMU_RULES={
 A154:{status:'partial',description:'时间跳跃：正数敌对受伤事件中，受伤者请求parasite成功后抵消本次伤害、再扣5魔法并把冷却改为8秒。原生能力自身另需5魔法、6秒冷却；宿主按先支付原生费用、再额外扣除并钳到0适配。位于本人建筑区域时，反复抽0—600码距离与方向，直到落点仍在区域内才瞬移；区域外仍抵消伤害并清除已核定正面增益。不是清除负面状态。',partial:boundary+'仅主受伤分支产生跳跃，不添加手动点击瞬移。建筑矩形映射到Web防区，非原坐标比例；异常随机流最多尝试256次并记录未取到落点。未知buff保留。'},
 A155:{status:'marker',description:'青铜龙军团的祝福是说明图标；实际由A156的20%攻击力光环及精灵形态A157的20%移速光环提供，不按文案增加20%攻速或施法速度。'},
 A156:{status:'implemented',nativeKind:true,description:'青铜龙军团的祝福：Aakb明确600码、20%攻击力，包含近战、远程、自身及友军。'},
 A157:{status:'implemented',nativeKind:true,description:'青铜龙军团的祝福：AOae明确600码、20%移动速度；缺失攻速字段不补值。龙形态h0QT不携带A157。'},
 A158:{status:'partial',description:'巨龙之力：单位死亡主触发器中创建h0QT，复制原所有者、userData、位置与朝向，加入军团；基础7500生命、570—600混乱攻击、0.6秒间隔、30魔法。原死亡句柄对400码内活着且无Avul的敌人造成1000普通攻击/普通武器伤害，受攻防类型与护甲影响。嵌套死亡不重入此主触发器。',partial:boundary+'新体不复制精灵属性与光环，无A158再次变龙；没有凭空登记A15A历史。movetp为fly但目标字段为ground，仍保留宿主飞行通行边界。'},
 A159:{status:'partial',active:true,targetKind:'point',description:'时之吐息：10魔法、11秒冷却、1000码选点；立即沿施法方向前移400码为中心，对400码范围内活着且无Avul的敌人造成400混乱/通用武器伤害。主受伤入口仅受伤者自动请求，对攻击者施放。',partial:boundary+'同一原生能力允许点/单位目标；Web手动使用选点，自动以目标位置适配。不是持续引导伤害。'},
 A15A:{status:'partial',active:true,targetKind:'none',description:'时间之力：5魔法、15秒冷却，读取已登记历史的第3格生命百分比，0或没有历史时改为100%，写到当前最大生命。每秒历史依次右移六格，最新样本在第1格。仅建筑携带A15A且无A14Y/A14Z时登记；默认n064及死亡新龙均没有登记，因此默认满血回退。主受伤入口仅攻击者自动请求。',partial:boundary+'不能把第3格直接当任意时刻精确3秒前；历史百分比随当前最大生命换算，可以降低生命。死亡后下一次采样清空历史并注销。'},
 A206:{status:'marker',description:'龙族荣耀是说明图标；由A201/A202/A203/A204或同字段A0YR/A0YS/A0YT/A0YU原生光环提供600码内sapper分类友军11%攻击、13%移速、每秒14恢复、12%攻速与1护甲。不是按名称含龙判断，也不另行叠加说明中的数值。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const gone=e=>!e||e.hp<=.405||e.status?.deathCounted||e.status?.sourceRemoved||e.status?.yseraRemoved;
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side&&a.battleTeam===b.battleTeam;
const st=e=>(e.status??={}).nozdormu??={};
const jobs=g=>g.state.sourceSkillJobs??=[];
const group=(g,e,p,r)=>[...g.state.entities,...(g.state.kings??[])].filter(t=>!gone(t)&&!ally(e,t)&&!has(t,'Avul')&&!has(t,'Aloc')&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
const blocked=(g,e)=>gone(e)||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.sourceHidden||e.status?.yseraHidden||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
export const canNozdormuCast=(e,id)=>!!NOZDORMU_RULES[id]?.active&&has(e,id);
function pay(g,e,id,api){
 if(!has(e,id))return {ok:false,message:'当前单位没有此技能'};
 if(blocked(g,e))return {ok:false,message:'单位当前无法施法'};
 const s=api.compileAbility(g,e,id),state=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 if(state.readyAt>g.state.time+1e-8)return {ok:false,message:'技能冷却中'};
 if(e.mana<s.manaCost)return {ok:false,message:'魔法不足'};
 e.mana-=s.manaCost;state.readyAt=g.state.time+s.cooldown;state.casts++;e.pendingAttack=null;return {ok:true,s,state};
}
export function castNozdormu(g,e,id,params,api){
 if(!canNozdormuCast(e,id))return {ok:false,message:'当前单位没有此技能'};
 const p=params.point??(params.target?pos(params.target):undefined),s=api.compileAbility(g,e,id);
 if(id==='A159'&&(!Number.isFinite(p?.x)||!Number.isFinite(p?.y)||Math.hypot(pos(e).x-p.x,pos(e).y-p.y)>s.range+1e-8))return {ok:false,message:'请选择施法范围内的位置'};
 const result=pay(g,e,id,api);if(!result.ok)return result;
 const applied=!g._sourceAbilityEffectDepth;st(e).lastCast={id,at:g.state.time,scriptApplied:applied};
 if(applied){g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;try{
  if(id==='A15A'){
   const history=jobs(g).find(j=>j.type==='nozdormu_history'&&!j.done&&j.sourceId===e.id),percent=history?.values[2]||100,before=e.hp;
   e.hp=Math.min(e.maxHp,e.maxHp*Math.max(0,percent)/100);st(e).rewind={at:g.state.time,before,percent,after:e.hp,hasHistory:!!history};
  }else{const origin=pos(e),angle=Math.atan2(p.y-origin.y,p.x-origin.x),center={x:origin.x+Math.cos(angle)*400*scale(e),y:origin.y+Math.sin(angle)*400*scale(e)};
   st(e).breath={at:g.state.time,center,angle};for(const t of group(g,e,center,400))api.nativeDamage(g,t,400,e,{attackType:'chaos',damageType:'universal',weapon:true});
  }
 }finally{g._sourceAbilityEffectDepth--;}}
 g._event?.('cast',e,s.name,{skillId:id});return {ok:true,skillId:id,message:'已施放'+s.name};
}
function removePositive(e){
 const positive=new Set(['Ablo','Aroa','Ainf','Afzy','AUfa','Absk']),negative=new Set(['Aslo','Acri','ANdh','AEer','Aens','AUfn','Afra','Afrb','Aspo','Aven']);
 st(e).unclassifiedBuffs=[];e.buffs=(e.buffs??[]).filter(b=>{const base=V14_ABILITIES[b.skillId]?.base_code;if(positive.has(base))return false;if(!negative.has(base))st(e).unclassifiedBuffs.push(b.key??b.skillId??'unknown');return true;});
}
function jump(g,e,api){
 const result=pay(g,e,'A154',api);st(e).jumpOrder={at:g.state.time,ok:result.ok,reason:result.message};if(!result.ok)return false;
 e.mana=Math.max(0,e.mana-5);result.state.readyAt=g.state.time+8;
 const origin=pos(e),rect=lanes[(e.userData??0)-1],contains=p=>rect&&p.x>=rect.minX&&p.x<=rect.maxX&&p.y>=rect.minY&&p.y<=rect.maxY,report={at:g.state.time,from:origin,moved:false,inOwnRegion:!!contains(origin),attempts:0};st(e).jump=report;
 if(contains(origin))for(let n=0;n<256;n++){
  const distance=Math.fround(g._random()*600)*scale(e),angle=Math.fround(g._random()*360)*Math.PI/180,p={x:origin.x+Math.cos(angle)*distance,y:origin.y+Math.sin(angle)*distance};report.attempts++;
  if(contains(p)){e.worldX=p.x;e.worldY=p.y;g._syncLocal?.(e);e.chase=null;e.movePath=null;report.to=p;report.moved=true;break;}
 }
 if(report.inOwnRegion&&!report.moved)report.boundary='random-region-rejection-limit';removePositive(e);g._event?.('warp',e,'时间跳跃',{skillId:'A154'});return true;
}
export function nozdormuMainDamage(g,t,e,amount,api,eventDamage=amount){
 if(!(amount>0)||!e||e===t||ally(e,t)||has(e,'A2Y7'))return eventDamage;
 if(has(t,'A154')&&jump(g,t,api))eventDamage=0;
 if(has(e,'A15A'))castNozdormu(g,e,'A15A',{},api);
 // The source issues a UNIT target order here; a manual ground cast can
 // still use the same location after that unit has died or disappeared.
 if(has(t,'A159')&&!gone(e)&&!has(e,'Aloc')&&!has(e,'Avul')&&!e.status?.sourceHidden&&!e.status?.yseraHidden)castNozdormu(g,t,'A159',{point:pos(e)},api);
 return eventDamage;
}
export function initializeNozdormuDeployment(g,b,e){
 if(!b||e.status?.nozdormu?.historyRegistered)return;
 const code=b.unitId?.replace(/^v14_/,'')??b.sourceRawcode,ids=[...(V14_UNIT_TEMPLATES[code]?.abilityIds??b.abilityIds??[]),...(b.permanentAbilityIds??[]),...(b.skillSpecs??[]).map(s=>s.id)],enabled=id=>ids.includes(id)&&(b.abilityLevels?.[id]??1)>0;
 if(enabled('A14Y')||enabled('A14Z')||!enabled('A15A'))return;
 st(e).historyRegistered=true;jobs(g).push({type:'nozdormu_history',sourceId:e.id,source:e,values:[],nextAt:g.state.time+1});
}
export function tickNozdormuJob(g,j){
 while(!j.done&&j.nextAt<=g.state.time+1e-8){j.values=[Math.max(0,j.source.hp)/j.source.maxHp*100,...j.values].slice(0,6);j.nextAt+=1;if(gone(j.source)){j.values=[];j.done=true;}}
 return !j.done;
}
export function nozdormuMainDeath(g,e,api){
 if(!has(e,'A158'))return;
 const p=pos(e),dragon=api.spawnUnit(g,e,'h0QT',{worldX:p.x,worldY:p.y,facing:e.facing,userData:e.userData,isSummon:true,isHero:false,isNativeHero:false,buildingId:undefined});
 if(dragon){st(dragon).dragon={from:e.id};g._event?.('revive',dragon,'巨龙之力',{skillId:'A158'});}
 for(const t of group(g,e,p,400))api.nativeDamage(g,t,1000,e,{attackType:'normal',damageType:'normal',weapon:true});
}
export function restoreNozdormu(g){
 for(const j of jobs(g))if(j.type==='nozdormu_history')j.source=g.state.entities.find(e=>e.id===j.sourceId)??j.source;
}
