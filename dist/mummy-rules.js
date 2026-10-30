import {V14_ABILITIES,V14_UNIT_TEMPLATES} from './v14-reference.js';

const revivalBoundary='ACrn原生复活尚未实现：数据包缺Cost1及原生死亡/复活事件模型，不能把空耗魔当0，也不能拿英雄AOre默认值替代。当前只执行已登记的死亡后移除能力脚本，不凭说明令尸体回满血。';
export const MUMMY_RULES={
 A14E:{status:'partial',description:'复生的已知原生参数为2秒延迟、240秒冷却。建筑有A14E时登记死亡移除；有A14F时另登记一次。收到widget死亡后2.01秒移除A14E，移除的是原句柄当时的能力。普通木乃伊建筑只有A1BL，不额外套一次性移除规则。',partial:revivalBoundary},
 A14F:{status:'partial',description:'建筑有复生秘咒时，每5秒在600范围的友军中逐个蓄水池抽样；排除已有A14E、召唤物及四个指定战斗体。命令接受才立即授予永久A14E并登记死亡移除，累计4次成功后停止；自身widget死亡也停止。',partial:'ANcl按显式28耗魔、5秒冷却和目标字段作即时命令适配；施法点、FollowThrough及原生命令仲裁未闭合。随机候选不会预先去掉尸体或自身；无效命令不重抽。'+revivalBoundary},
};
const level=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)?e.abilityLevels?.[id]??1:0;
const raw=e=>e?.combatRawcode??e?.sourceRawcode;
const pos=e=>({x:e.worldX??e.x??0,y:e.worldY??e.y??0});
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const jobs=g=>g.state.sourceSkillJobs??=[];
const source=(g,j)=>[...g.state.entities,...(g.state.kings??[])].find(e=>e.id===j.sourceId)??j.source;
const registerRemoval=(g,e,id)=>jobs(g).push({type:'mummy_remove',sourceId:e.id,source:e,abilityId:id,removeAt:null});

export function initializeMummyDeployment(g,building,e){
 if(!building||e.status?.mummyDeploymentRegistered)return;
 const code=building.unitId?.replace(/^v14_/,'')??building.sourceRawcode;
 const ids=[...(V14_UNIT_TEMPLATES[code]?.abilityIds??building.abilityIds??[]),...(building.permanentAbilityIds??[]),...(building.skillSpecs??[]).map(s=>s.id)];
 const has=id=>ids.includes(id)&&(building.abilityLevels?.[id]??1)>0;
 if(!has('A14E')&&!has('A14F'))return;
 (e.status??={}).mummyDeploymentRegistered={at:g.state.time,buildingRawcode:code};
 if(has('A14E'))registerRemoval(g,e,'A14E');
 if(has('A14F')){registerRemoval(g,e,'A14E');jobs(g).push({type:'mummy_super',sourceId:e.id,source:e,abilityId:'A14E',nextAt:g.state.time+5,successes:0});}
}

// SelectRangeNotMummy tests Pf (the caster), NOT D6, for n061/n062.
// No alive/notself/magic-immunity predicate is in this script filter.
export function mummyCandidates(g,e,id='A14E'){
 if(['n061','n062'].includes(raw(e)))return [];
 const p=pos(e),radius=600*(e.distanceScale??1/3)/100;
 return [...g.state.entities,...(g.state.kings??[])].filter(t=>!removed(t)&&!level(t,'Aloc')&&t.team===e.team&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=radius+1e-8&&!level(t,id)&&!t.isSummon&&!(t.traits??[]).includes('summoned')&&!['h0PI','h18J','h0JS','h38J'].includes(raw(t)));
}
function select(g,e,j,at,event){
 const group=mummyCandidates(g,e,j.abilityId);let chosen=null,count=0;
 for(const candidate of group){count++;if(1+Math.floor(g._random()*count)===1)chosen=candidate;}
 (e.status??={}).mummySelection={at,event,candidateIds:group.map(t=>t.id),targetId:chosen?.id??null,draws:count};
 return chosen;
}

function requestOrder(g,e,t,at,api){
 const st=e.status??={},fields=V14_ABILITIES.A14F.resolved_fields;
 const request=st.mummyOrder={at,order:'unflamingattack',targetId:t.id,abilityId:'A14F',outcome:'requested',nativeBoundary:true,missingFields:['Cast1','DataA1','DataD1']};
 const state=(e.skillStates??={}).A14F??={readyAt:0,casts:0};
 if(!level(e,'A14F')){request.outcome='missing-ability';return false;}
 if(removed(e)||e.hp<=.405||st.sourceHidden||st.yseraHidden||st.sourcePaused||st.yseraPaused||st.illidanPaused||st.stunUntil>at||st.cycloneUntil>at||st.silenceUntil>at){request.outcome='blocked';return false;}
 if(t===e||t.hp<=.405||removed(t)||api.magicImmune(t)||api.scriptInvulnerable(t)){request.outcome='target-rejected';return false;}
 if(state.readyAt>at+1e-8){request.outcome='cooldown';return false;}
 const mana=Number(fields.Cost1),cooldown=Number(fields.Cool1);
 if(!Number.isFinite(mana)||!Number.isFinite(cooldown)||fields.Cost1==null||fields.Cost1===''||fields.Cool1==null||fields.Cool1===''){request.outcome='missing-native-fields';return false;}
 if(e.mana<mana){request.outcome='mana';return false;}
 e.mana-=mana;state.casts++;state.readyAt=at+cooldown;e.pendingAttack=null;
 request.outcome='adapted-accepted';request.manaSpent=mana;return true;
}
function grant(g,e,t,j,at,api){
 api.addAbility(g,t,j.abilityId);
 t.permanentAbilityIds=[...new Set([...(t.permanentAbilityIds??[]),j.abilityId])];
 registerRemoval(g,t,j.abilityId);
 const st=t.status??={};st.mummyBlessing={at,sourceId:e.id,abilityId:j.abilityId,effectActive:true,nativeRevivalUnresolved:true};
 j.successes++;(e.status??={}).mummySuccesses=j.successes;
 g._event?.('cast',t,'复生秘咒 · 授予能力',{skillId:'A14F',sourceId:e.id});
 if(j.successes>=4)j.done=true;
}

// This entry is deliberately separate from UNIT_DEATH: native reincarnation
// can emit widget death without the normal unit-death chain. The current host
// calls it for terminal deaths; native reincarnation delivery remains pending.
export function mummyWidgetDeath(g,e,api){
 const at=g.state.time;
 if(level(e,'A14E'))(e.status??={}).mummyReincarnationBoundary={at,delay:2,cooldown:240,missingManaCost:true,nativeRevivalUnresolved:true};
 for(const j of [...jobs(g)]){
  if(j.sourceId!==e.id||j.done||!j.type?.startsWith('mummy_'))continue;j.source=e;
  if(j.type==='mummy_remove'){
   // Repeated widget deaths register more one-shot timers. The earliest
   // callback destroys the trigger, so only that deadline remains useful.
   j.removeAt=j.removeAt==null?at+2.01:Math.min(j.removeAt,at+2.01);
   if(raw(e)==='h0QD')(e.status??={}).mummyAnimation={at,name:'spell alternate'};
   if(e.status?.mummyBlessing)e.status.mummyBlessing.effectActive=false;
   g._event?.('cast',e,'复生死亡特效',{skillId:'A14E',duration:2,nativeBoundary:true});
  }else{
   // The original locals enumerate and draw BEFORE the death-event branch.
   select(g,e,j,at,'widget-death');j.done=true;
  }
 }
}
export function tickMummyJob(g,j,api){
 if(j.done)return false;
 const e=source(g,j);if(!e)return false;j.source=e;
 if(j.type==='mummy_remove'){
  if(j.removeAt==null||j.removeAt>g.state.time+1e-8)return true;
  api.removeAbility(g,e,j.abilityId);e.permanentAbilityIds=(e.permanentAbilityIds??[]).filter(id=>id!==j.abilityId);
  (e.status??={}).mummyRemoval={at:j.removeAt,abilityId:j.abilityId,removedHandle:!!e.status.sourceRemoved};return false;
 }
 const now=g.state.time;
 while(j.nextAt<=now+1e-8&&!j.done){
  const at=j.nextAt;j.nextAt+=5;
  const frameTime=g.state.time;g.state.time=at;
  try{const t=select(g,e,j,at,'timer');if(t&&requestOrder(g,e,t,at,api))grant(g,e,t,j,at,api);}finally{g.state.time=frameTime;}
 }
 return !j.done;
}
