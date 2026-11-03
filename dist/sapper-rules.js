const boundary='原生范围枚举、隐藏单位、移除句柄后的计时器行为及跨触发器顺序仍有宿主差异。';
export const SAPPER_RULES={
 A1TT:{status:'partial',description:'九倍模式在创建携带本能力的单位时登记独立计时器：每1秒对自身200码内敌人造成5点混乱攻击／通用伤害；首次死亡时对300码内敌人造成56点伤害并停止计时器，复生前的死亡也会触发。登记后移除能力仍会执行。',partial:'说明中的15%生命与88伤害不是当前已注册流程；另一个低生命函数没有调用入口。'+boundary},
 A1TU:{status:'partial',description:'不稳定躯体的持续伤害与死亡爆炸由创建时检查殉爆本能的同一计时器执行，不能重复计算。本图标没有独立脚本入口，单独获得它不会新建计时器。死亡范围实际为300码且只伤敌人，与100码不分敌我的文案不同。',partial:boundary},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const removed=e=>e.status?.sourceRemoved||e.status?.yseraRemoved;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
function victims(g,e,radius){const p=pos(e);return all(g).filter(t=>t.battleTeam===e.battleTeam&&t.side!==e.side&&t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=radius+1e-8);}
const scale=e=>(e.distanceScale??1/3)/100;

// Called only by a real creation path. Gaining A1TT later is not world entry.
export function initializeSapperCreation(g,e){
 if(e.skillVersion!=='v14.1A5'||e.status?.sapperCreationChecked||e.status?.sapperTimer||!e.skillSpecs?.some(s=>s.id==='A1TT'))return;
 (e.status??={}).sapperCreationChecked=true;if(!has(e,'A1TT'))return;
 const at=e.createdAt??g.state.time;(e.status??={}).sapperTimer={registeredAt:at,nextAt:at+1,active:true,pulses:0};
}
export function restoreSapperCreation(g,e,def){
 if(e.status?.sapperCreationChecked||e.status?.sapperTimer||e.skillVersion!=='v14.1A5'||!def?.abilityIds?.includes('A1TT'))return;
 // A known original template proves registration on an old save. Retain its
 // old timer phase; do not retroactively explode a dead/reincarnating unit.
 const inactive=e.hp<=0||e.status?.sourceDeathHandled||e.status?.deathCounted||e.status?.reincarnation?.phase==='waiting';
 const at=e.createdAt??g.state.time,old=e.skillStates?.A1TT?.nextPulseAt;
 (e.status??={}).sapperCreationChecked=true;e.status.sapperTimer={registeredAt:at,nextAt:Number.isFinite(old)?old:at+Math.max(1,Math.floor(g.state.time-at)+1),active:!inactive,pulses:0,legacyRestored:true,...(inactive?{legacyDeathOutcomeUnknown:true}:{})};
}
export function tickSapperTimers(g,api){
 const now=g.state.time;
 for(const e of all(g)){
  const st=e.status?.sapperTimer;if(!st?.active)continue;
  if(removed(e)){st.active=false;st.removedOutcomeUnknown=true;continue;}
  while(st.active&&st.nextAt<=now+1e-8){
   const at=st.nextAt;st.nextAt+=1;st.pulses++;st.lastPulseAt=at;
   const frameTime=g.state.time;g.state.time=at;
   try{for(const t of victims(g,e,200*scale(e)))api.nativeDamage(g,t,5,e,{attackType:'chaos',damageType:'universal',weapon:true});}finally{g.state.time=frameTime;}
  }
 }
}
export function sapperWidgetDeath(g,e,api){
 const st=e.status?.sapperTimer;if(!st?.active)return;
 st.active=false;st.deathAt=g.state.time;st.deathExploded=true;
 const group=victims(g,e,300*scale(e));st.deathTargets=group.map(t=>t.id);
 for(const t of group)api.nativeDamage(g,t,56,e,{attackType:'chaos',damageType:'universal',weapon:true});
 g._event?.('splash',e,'不稳定躯体 · 死亡爆炸',{skillId:'A1TU',radius:300*scale(e)});
}
