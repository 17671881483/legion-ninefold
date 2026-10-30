// war3map.j:20207–20227 / 21390–21409 register bodies; 44723–44759 applies RR.
export const UNDEAD_LEGION_RULES={
 A0J1:{status:'partial',description:'亡灵军团在开战结算：按原玩家登记的骷髅王/战士各加200/50最大生命，骷髅术士/法师各加20/5攻击；弓手与冰霜射手分别授予对应数量等级的A0J2/A0J3。只作用于最后登记的h0JR；援军阵亡不回收加成。',partial:'n00S获取入口未找到；原生枚举顺序、AIml当前生命副作用、移除句柄及超70级请求待核定。竞技登记不清计数，普通波登记前清计数；连续波加入不重新登记。'},
};
export const UNDEAD_LEGION_COUNTERS={h0JJ:'HP200',h03B:'HP50',h0OC:'HP50',h03C:'Speed1',h0JN:'Speed3',h0OZ:'Speed3',h0JP:'Attack20',h03D:'Attack5'};
const fresh=()=>({HP200:0,HP50:0,Speed1:0,Speed3:0,Attack20:0,Attack5:0});
const registry=g=>g.state.undeadLegion??={counts:{},recipients:{}};
const raw=e=>e.combatRawcode??e.sourceRawcode;

// This is a building-to-combat creation hook, not a general CreateUnit hook.
// Summons and death respawns must not call it just because their rawcode matches.
export function registerUndeadLegion(g,e){
 if(e.skillVersion!=='v14.1A5'||!Number.isInteger(e.ownerId)||e.ownerId<0||e.ownerId>10)return;
 const r=registry(g),p=e.ownerId,c=r.counts[p]??=fresh(),key=UNDEAD_LEGION_COUNTERS[raw(e)];
 if(raw(e)==='h0JR')r.recipients[p]=e;
 if(key)c[key]++;
}
export function resetUndeadLegionCounters(g){
 const r=registry(g);for(let p=0;p<=10;p++)r.counts[p]=fresh();
 // OC5F_cg does not clear the player-owned h0JR handle.
}
export function applyUndeadLegion(g,api){
 const r=registry(g);
 for(let p=0;p<=9;p++){
  const e=r.recipients[p],c=r.counts[p]??fresh();if(!e)continue;
  const st=e.status??={},report={at:g.state.time,counts:{...c},hpAdded:0,damageAdded:0,abilityRequests:[]};st.undeadLegion=report;
  if(st.sourceRemoved||st.yseraRemoved){report.boundary='removed-recipient-handle-unresolved';continue;}
  for(const [key,multiplier] of [['HP200',200],['HP50',50]])if(c[key]>0){
   const next=e.maxHp+c[key]*multiplier;
   // The helper rejects each requested maximum independently, before R2I.
   if(next>65535||next<=0){(report.rejectedHp??=[]).push(key);continue;}
   const delta=Math.trunc(next)-Math.trunc(e.maxHp);e.maxHp+=delta;
   // Existing host item-HP adapter; native current-life side effect is partial.
   if(e.hp>.405)e.hp=Math.min(e.maxHp,e.hp+delta);report.hpAdded+=delta;
  }
  for(const [key,id]of [['Speed1','A0J2'],['Speed3','A0J3']])if(c[key]>0){
   const old=e.abilityLevels?.[id]??1,level=c[key]<=70?c[key]:old;
   (e.abilityLevels??={})[id]=level;
   const compiled=api.compileSkills({abilityIds:[id],skillVersion:'v14.1A5',distanceScale:e.distanceScale,abilityLevels:e.abilityLevels})[0];
   e.skillSpecs=(e.skillSpecs??[]).filter(s=>s.id!==id);e.skillSpecs.push(compiled);
   (e.skillStates??={})[id]??={readyAt:0,casts:0};
   report.abilityRequests.push({id,requestedLevel:c[key],level,...(c[key]>70?{boundary:'native-level-overflow-unresolved'}:{})});
  }
  for(const [key,multiplier]of [['Attack20',20],['Attack5',5]])if(c[key]>0){const delta=c[key]*multiplier;e.damage+=delta;report.damageAdded+=delta;}
 }
}
export function prepareUndeadLegion(g,units,{reset=true}={},api){
 if(reset)resetUndeadLegionCounters(g);
 for(const e of units)registerUndeadLegion(g,e);
 applyUndeadLegion(g,api);
}
export function restoreUndeadLegionHandles(g){
 const r=registry(g);for(const [p,e] of Object.entries(r.recipients))r.recipients[p]=g.state.entities.find(x=>x.id===e.id)??e;
}
