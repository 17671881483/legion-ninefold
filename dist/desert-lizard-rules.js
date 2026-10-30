// New_UnitAttack 42505–42544: i is the damage source, not the victim.
const bloodlustBoundary='动态A12B的Cost1、Rng1、Cast1及DataB/C1等默认字段缺失；保留bloodlust命令请求，未猜测零耗魔施法或直接添加300%攻速。原生命令排队/自动施法仍待核定。';
export const DESERT_LIZARD_RULES={
 A129:{status:'partial',description:'狂热：每次独立武器伤害事件先将已有计数减1；旧计数为1时移除Bblo。之后抽实数0—100≤7，命中将计数重置为5，添加A12B并向自身请求bloodlust；计数不按秒减少。',partial:bloodlustBoundary},
 A12A:{status:'partial',description:'嗜热：每次独立武器伤害事件先减计数，旧计数1时移除Bblo；之后抽实数0—100≤8，命中重置为6、添加A12B，依次向自身发bloodlustoff、bloodlust。与狂热分别判断，但共用Bblo。',partial:bloodlustBoundary},
 A12C:{status:'partial',description:'战斗渴望：每次独立武器伤害事件累加1，达到8立即清零、回复200生命并添加A12I；其余事件移除A12I。此事件发生时本次武器伤害已经计算，因此十倍暴击作用于随后可触发暴击的攻击；中间其他武器伤害事件也会消耗窗口。',partial:'生命直写在存活单位上适配上限；死亡句柄直写不当复活，保留未核定记录。弹道/攻击判定时序、暴击叠加和原生随机流仍有宿主差异。'},
 A12B:{status:'unresolved',description:'动态狂热对象Ablo已知攻速增加300%、Bblo持续6秒、冷却1秒；来源添加后未移除能力本身。',partial:bloodlustBoundary},
 A12I:{status:'partial',nativeKind:true,description:'动态战斗渴望暴击AOcr：100%概率、10倍武器伤害；由A12C在第8次伤害事件后添加，在下一次非第8次事件移除。',partial:'沿用宿主普通攻击暴击适配；原生叠加、伤害骰、弹道飞行及多目标攻击次序待核定。'},
 A12K:{status:'partial',description:'厚皮AIdd物编DataA1/E1均为0.65，按穿刺承伤、魔法攻击与法术承伤倍率适配为65%；不是说明中的减伤45%。DataB1=1不降低自身输出。',partial:'原生版本、与其他防御/魔法抗性叠加、反弹及特殊伤害类型仍待核定。通用伤害不套入普通魔抗适配；缺失字段不猜反弹几率。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
function removeBloodlust(e){
 // Bblo is the shared buff rawcode, not the dynamically granted ability.
 e.buffs=(e.buffs??[]).filter(b=>b.key!=='Bblo'&&b.buffId!=='Bblo');
}
function frenzy(g,e,id,chance,count,api){
 const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 const old=st.remainingHits??0;
 if(old>0){st.remainingHits=old-1;if(old===1)removeBloodlust(e);}
 const report={at:g.state.time,previous:old,removedBuff:old===1,roll:Math.fround(g._random()*100),orders:[]};st.lastEvent=report;
 if(report.roll>chance)return;
 st.remainingHits=count;api.addAbility(g,e,'A12B');
 report.orders=(id==='A12A'?['bloodlustoff','bloodlust']:['bloodlust']).map(order=>({order,targetId:e.id,abilityId:'A12B',outcome:'native-unresolved'}));
}
export function desertLizardAttackDamage(g,e,api){
 if(has(e,'A129'))frenzy(g,e,'A129',7,5,api);
 if(has(e,'A12A'))frenzy(g,e,'A12A',8,6,api);
 if(!has(e,'A12C'))return;
 const st=(e.skillStates??={}).A12C??={readyAt:0,casts:0},count=(st.hits??0)+1;
 if(count>=8){
  st.hits=0;const before=e.hp,requested=before+200;
  // SetUnitState does not authorize a resurrection. Keep dead-body semantics
  // explicit until the host has a life value separate from the death flag.
  if(before>.405)e.hp=Math.min(e.maxHp,requested);
  st.lastHeal={at:g.state.time,before,requested,after:e.hp,deadHandleUnresolved:before<=.405};
  api.addAbility(g,e,'A12I');
 }else{st.hits=count;api.removeAbility(g,e,'A12I');}
}
export function desertLizardIncoming(target,amount,source,options){
 if(!has(target,'A12K')||options.universal)return amount;
 const spec=target.skillSpecs.find(s=>s.id==='A12K');
 const attackType=options.attackType??(options.spell?'spells':source?.attackType);
 // Explicit native attack types outrank the generic spell transport flag.
 const field=attackType==='pierce'?'DataA1':['magic','spells'].includes(attackType)?'DataE1':null;
 if(!field)return amount;
 const factor=Number(spec.fields?.[field]);return Number.isFinite(factor)?amount*factor:amount;
}
