import {laneToWorld} from './layout.js';
import {V14_UNIT_TEMPLATES} from './v14-reference.js';

const boundary='ANcl原生前摇、引导与同帧命令仲裁、原生范围枚举及浮点计时仍未核定；e008作为脚本辅助句柄，不参与军团计数，位移使用Web通行图。原始模型和特效缺失。';
export const ANDUIN_RULES={
 A1SP:{status:'partial',active:true,targetKind:'enemy',description:'绝望之雨：18魔法、30秒冷却、500码目标距离。以目标施法时位置为固定中心，300码内每秒20点魔法攻击／魔法武器伤害，共10次，首次1秒后；每次伤害后施法者直接恢复50生命，施法者移动不移动雨云。',partial:boundary+'死亡来源仍保留定时伤害，直接生命设置不擅自复活。'},
 A1SV:{status:'partial',active:true,targetKind:'point',description:'骇人之魂：18魔法、15秒冷却、500码选点距离。在施法者周围250码圆周六个等分位置生成六个辅助，均沿选点方向前进。每0.04秒80码，首跳0秒，通常9步720码后0.36秒移除；每条轨迹250码内每目标一次最大生命8%＋365魔法攻击／魔法武器伤害，六条轨迹分别去重。',partial:boundary},
 A1SS:{status:'partial',description:'狮王之心：从建筑能力登记后1秒只检查一次。枚举同原生所有者的h0PZ瓦里安；只有该原型完全没有对象时才改找h0XC外观。每个userData相同的对象和安度因各永久授予A1SU、A1ST，不要求存活或距离；没有匹配时不重试。',partial:'死亡但未移除对象保留，未实例化建筑及原生句柄枚举边界仍存在。永久只针对本次战斗句柄，不写回建筑。'},
 A1SQ:{status:'partial',nativeKind:true,description:'意志之力：保留400码友军8%攻击光环；主伤害监听到B080时把事件伤害写为局部伤害的70%，普通攻击、法术和通用伤害均可。正数敌对事件且主监听未禁用才执行；嵌套事件不会重复减伤。',partial:'B080按已存在buff或当前光环范围适配，原生光环首次应用与离圈驻留未核定；混合伤害监听改写的注册顺序仍有边界。'},
 A1ST:{status:'implemented',nativeKind:true,description:'狮王之心动态授予的AIde，DataA1=50，增加自身50点护甲。'},
 A1SU:{status:'partial',nativeKind:true,description:'狮王之心动态授予AUau，Area1=500、DataB1=0.01、DataC1=1，按最大生命1%恢复。保留现有原生光环目标适配及同buff不叠加。',partial:'目标字段含self但不含friend/ally，当前目标适配只作用于自身；原生目标许可、缺失移动字段、buff驻留与多光环叠加仍待核定，不据名称扩大目标。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const raw=e=>e?.combatRawcode??e?.sourceRawcode;
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const jobs=g=>g.state.sourceSkillJobs??=[];
const report=(e,key,value)=>((e.status??={})[key]=value);
const queue=(g,e,type,data)=>{const j={type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side&&a.battleTeam===b.battleTeam;
const owner=e=>e.sourceNativeOwnerId??e.ownerId;
const varian=e=>['h0PZ','h0XC'].includes(raw(e));
const group=(g,e,p,r)=>all(g).filter(t=>t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&!ally(e,t)&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
const ancient=e=>e.isAncient||e.traits?.includes('ancient')||String(e.unitType??e.sourceRawFields?.type??'').split(',').includes('ancient');
const unavailable=(g,e)=>removed(e)||e.hp<=.405||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.sourceHidden||e.status?.yseraHidden||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
export const canAnduinCast=(e,id)=>!!ANDUIN_RULES[id]?.active&&has(e,id);

export function anduinSpellEffect(g,e,id,params,api){
 if(g._sourceAbilityEffectDepth||ancient(e))return false;
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  if(id==='A1SP')queue(g,e,'anduin_rain',{...pos(params.target),ticks:0,nextAt:g.state.time+1});
  else if(id==='A1SV'){
   const p=pos(e),angle=Math.atan2(params.point.y-p.y,params.point.x-p.x);
   for(let n=0;n<6;n++){
    const around=n*Math.PI/3,d=api.spawnUnit(g,e,'e008',{worldX:p.x+Math.cos(around)*250*scale(e),worldY:p.y+Math.sin(around)*250*scale(e),facing:angle*180/Math.PI,scriptAuxiliary:true,isSummon:false,isHero:false,isNativeHero:false,userData:0,nav:undefined,buildingId:undefined});
    if(!d)continue;g.state.entities=g.state.entities.filter(t=>t.id!==d.id);report(d,'anduinAuxiliary',true);
    queue(g,e,'anduin_soul',{dummyId:d.id,dummy:d,angle,steps:0,hitIds:[],nextAt:g.state.time});
   }
  }else return false;
  return true;
 }finally{g._sourceAbilityEffectDepth--;}
}
export function castAnduin(g,e,id,params,api){
 const fail=message=>({ok:false,message}),now=g.state.time;
 if(!canAnduinCast(e,id))return fail('当前单位没有此技能');if(unavailable(g,e))return fail('单位当前无法施法');
 const s=api.compileAbility(g,e,id),t=params.target,p=id==='A1SP'?pos(t):params.point;
 if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return fail('请选择施法位置');
 if(id==='A1SP'&&(!t||t.hp<=.405||removed(t)||ally(e,t)||t.battleTeam!==e.battleTeam||has(t,'Aloc')||has(t,'Avul')||t.status?.sourceHidden||t.status?.yseraHidden||!api.matchesTargets(s,e,t)))return fail('请选择可施法的敌人');
 if(Math.hypot(pos(e).x-p.x,pos(e).y-p.y)>s.range+1e-8)return fail('超出施法范围');
 const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 if(st.readyAt>now+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;st.readyAt=now+s.cooldown;st.casts++;e.pendingAttack=null;
 const scriptApplied=anduinSpellEffect(g,e,id,params,api);report(e,'anduinCast',{at:now,id,point:p,targetId:t?.id,scriptApplied,nativeTimingUnverified:true});
 g._event?.('cast',e,s.name,{skillId:id});return {ok:true,skillId:id,message:'已施放'+s.name};
}
export function anduinMainDamage(g,target,attacker,amount,api){
 if(!(amount>0)||!attacker||target===attacker||ally(target,attacker)||has(attacker,'A2Y7'))return;
 for(const id of ['A1SV','A1SP']){
  const e=has(target,id)?target:has(attacker,id)?attacker:null;if(!e)continue;const other=e===target?attacker:target;
  const result=castAnduin(g,e,id,id==='A1SP'?{target:other}:{point:pos(other)},api);
  report(e,'anduinOrder'+id,{at:g.state.time,id,order:id==='A1SP'?'unloadall':'unloadallcorpses',targetId:other.id,outcome:result.ok?'adapted-success':'failed',reason:result.ok?null:result.message});
 }
}
export function anduinMainIncoming(g,t,e,amount,api,eventDamage=amount){
 if(!(amount>0)||!e||e===t||ally(e,t)||has(e,'A2Y7'))return eventDamage;
 const explicit=has(t,'B080')||(t.buffs??[]).some(b=>(b.key==='B080'||b.buffId==='B080')&&(b.expiresAt===undefined||b.expiresAt>g.state.time));
 const aura=all(g).find(a=>a.hp>.405&&!removed(a)&&!a.status?.sourceHidden&&!a.status?.yseraHidden&&has(a,'A1SQ')&&ally(a,t)&&Math.hypot(pos(a).x-pos(t).x,pos(a).y-pos(t).y)<=400*scale(a)+1e-8&&api.matchesTargets(api.compileAbility(g,a,'A1SQ'),a,t));
 if(!explicit&&!aura)return eventDamage;
 report(t,'anduinWillReduction',{at:g.state.time,amount,sourceId:aura?.id,explicitBuff:!!explicit,nativeAuraTimingUnverified:true});return amount*.7;
}
export function initializeAnduinDeployment(g,b,e){
 if(!b||e.status?.anduinBondRegistered)return;
 const code=b.unitId?.replace(/^v14_/,'')??b.sourceRawcode,ids=[...(V14_UNIT_TEMPLATES[code]?.abilityIds??b.abilityIds??[]),...(b.permanentAbilityIds??[]),...(b.skillSpecs??[]).map(s=>s.id)];
 if(!ids.includes('A1SS')||(b.abilityLevels?.A1SS??1)<=0)return;
 report(e,'anduinBondRegistered',true);queue(g,e,'anduin_bond',{nextAt:g.state.time+1,retainedVarians:all(g).filter(t=>varian(t)&&t.hp<=.405&&!removed(t))});
}
function checkBond(g,j,api){
 const handles=[...new Map([...(j.retainedVarians??[]),...all(g)].map(t=>[t.id,t])).values()];
 let found=handles.filter(t=>!removed(t)&&owner(t)===owner(j.source)&&raw(t)==='h0PZ');
 if(!found.length)found=handles.filter(t=>!removed(t)&&owner(t)===owner(j.source)&&raw(t)==='h0XC');
 const matched=found.filter(t=>t.userData===j.source.userData);
 for(const t of matched)for(const target of [t,j.source])for(const id of ['A1SU','A1ST'])api.addAbility(g,target,id);
 report(j.source,'anduinBond',{at:g.state.time,enumeratedIds:found.map(t=>t.id),matchedIds:matched.map(t=>t.id),grants:matched.length?['A1SU','A1ST']:[]});j.done=true;
}
export function anduinWidgetDeath(g,e,api){
 // Native player enumeration includes corpses. The host removes defeated
 // fighters from its army array, so pending one-shot checks retain the handle.
 if(varian(e))for(const j of jobs(g))if(j.type==='anduin_bond'&&!j.done){j.retainedVarians??=[];if(!j.retainedVarians.some(t=>t.id===e.id))j.retainedVarians.push(e);}
 for(const j of jobs(g))if(!j.done&&j.type==='anduin_soul'&&j.dummyId===e.id){j.done=true;api.removeUnit(g,j.dummy);}
}
function tickAnduin(g,j,api){
 if(j.done)return false;const frame=g.state.time;j.source=all(g).find(e=>e.id===j.sourceId)??j.source;
 try{while(j.nextAt<=frame+1e-8&&!j.done){
  g.state.time=j.nextAt;
  if(j.type==='anduin_rain'){
   for(const t of group(g,j.source,j,300))api.nativeDamage(g,t,20,j.source,{attackType:'magic',damageType:'magic',weapon:true});
   if(j.source.hp>.405&&!removed(j.source))j.source.hp=Math.min(j.source.maxHp,j.source.hp+50);
   j.ticks++;j.nextAt+=1;if(j.ticks===10)j.done=true;
  }else if(j.type==='anduin_soul'){
   if(j.steps+1>=10){api.removeUnit(g,j.dummy);j.done=true;continue;}
   const p=pos(j.dummy);api.moveUnit(g,j.dummy,{x:p.x+Math.cos(j.angle)*80*scale(j.source),y:p.y+Math.sin(j.angle)*80*scale(j.source)});j.steps++;
   for(const t of group(g,j.source,pos(j.dummy),250))if(!j.hitIds.includes(t.id)){j.hitIds.push(t.id);api.nativeDamage(g,t,t.maxHp*.08+365,j.source,{attackType:'magic',damageType:'magic',weapon:true});}
   j.nextAt+=.04;
  }else if(j.type==='anduin_bond')checkBond(g,j,api);
  else return false;
 }return !j.done;}finally{g.state.time=frame;}
}
export function tickAnduinJobs(g,api){
 const frame=g.state.time;
 try{while(true){
  // Six simultaneous charge triggers interleave by timer deadline. Running
  // one entire trajectory before the next changes damage-listener ordering.
  const due=jobs(g).filter(j=>j.type?.startsWith('anduin_')&&!j.done&&j.nextAt<=frame+1e-8).sort((a,b)=>a.nextAt-b.nextAt)[0];
  if(!due)break;g.state.time=due.nextAt;tickAnduin(g,due,api);
 }}finally{g.state.time=frame;}
}
export function restoreAnduin(g){
 const handles=new Map(all(g).map(e=>[e.id,e])),bind=e=>{if(!e)return e;if(!handles.has(e.id))handles.set(e.id,e);return handles.get(e.id);};
 for(const j of jobs(g))if(j.type?.startsWith('anduin_')){
  for(const key of ['source','dummy'])if(j[key])j[key]=bind(j[key]);
  if(j.retainedVarians)j.retainedVarians=j.retainedVarians.map(bind);
 }
}
