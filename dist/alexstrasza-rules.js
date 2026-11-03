import {laneToWorld} from './layout.js';
import {V14_UNIT_TEMPLATES} from './v14-reference.js';

const timing='原生ANcl前摇、引导与同帧命令仲裁，范围/生命事件、对象枚举及浮点计时仍为宿主适配；未实例化建筑、碰撞及原始模型特效未完整还原。';
export const ALEXSTRASZA_RULES={
 A16S:{status:'partial',description:'生命赐福：从建筑登记600码友军生命监听，阈值固定为登记时最大生命的65%。跨入低血阈值且15秒冷却已结束时，牺牲自身当前生命一半并暂停；在0/1/2/3秒对自身当前600码友军各恢复牺牲量15%，最后解除暂停。成功后的该对象监听销毁，重新入圈才可再次登记。',partial:timing+'直接生命设置不擅自复活死亡句柄；在阈值以下保持不动不会因冷却结束自动重触发。'},
 A16T:{status:'partial',active:true,targetKind:'point',description:'生机绽放：10魔法、15秒冷却、600码选点。在固定中心600码范围内立即开始，每秒为友军恢复60生命，共8次；不是说明中的延迟2秒或每次20。施法者死亡不取消计时。',partial:timing},
 A16U:{status:'partial',description:'生命誓言：从建筑登记后0.1秒分别查找同原生所有者、相同userData的h0MY和h0F1，各取第一个，无距离限制。双方最大生命变为当时最大生命之和并回满；任一方受伤事件先均分双方当前生命，当前伤害继续扣除。阿莱克斯塔萨死亡则同伴恢复原最大生命并回满，同伴死亡则杀死阿莱克斯塔萨。',partial:timing+'两个原型独立链接，不是外观回退；死亡对象查找与直接生命写入保留边界，0.03秒定时器只清理失效链接、不持续均血。'},
 A170:{status:'partial',description:'自然祝福：建筑登记独立全局受伤监听。600码友军受伤时先尝试transmute（15魔法、18秒冷却），命令成功且目标生命≤50%、自身>15%才消耗自身最大生命15%并把目标回满。普通/神圣战斗体原始技能表均没有A170，默认命令失败，不伪造授予。',partial:timing+'只有明确持有A170的战斗句柄才可接受命令；缺失授予入口未补造。'},
 A172:{status:'partial',description:'巨龙之力：从建筑登记单位死亡监听，死亡时在原位置新建h0R0龙形态，保留原所有者和userData并加入战斗军团。新体5000基础生命、495—519穿刺攻击、0.5秒间隔，护甲继承该userData累计自然怒火层数；20秒后授予净化烈焰。龙体无再次变龙登记。',partial:timing+'widget死亡仅延迟0.5秒注销监听，单位死亡才创建；不复制精灵形态的生命链接、强化或旧魔法值。'},
 A16V:{status:'partial',active:true,targetKind:'enemy',description:'烈焰打击：10魔法、13秒冷却、800码目标距离，固定朝向并暂停。在0/1.2/2.4秒各发射一枚火球；每0.04秒前进50码并对150码敌军造成160普通攻击/火焰非武器伤害，可连续命中。通常29步1450码后停止，1.2秒移除火球；第三次发射解除暂停。',partial:timing+'ChargeDistance先检查下一步是否到终点；未调用说明中的持续燃烧和减速。'},
 A16W:{status:'partial',active:true,targetKind:'enemy',description:'净化烈焰：20魔法、800码目标距离，施放后移除自身此技能并暂停；1秒后以当时施法者位置向固定朝向900码为中心，对900码敌军造成一次780普通攻击/火焰非武器伤害并解除暂停。源码未调用三条白焰线或友军治疗。',partial:timing+'保留死亡施法者的延迟回调；动态授予仅发生在变龙20秒后一次。'},
 A16Z:{status:'partial',description:'自然的怒火：每个独立武器伤害事件抽取主武器攻击范围，额外造成25%混乱/通用武器伤害。额外伤害后目标生命≤该攻击抽样值，就回复自身100生命，并抽百分数≥45时增加1护甲；按userData共享累计，最多40层，新龙继承。不是必须击杀，也不是说明中的35%附伤、45%概率。',partial:'原生上下限动态属性与随机精度、混合伤害监听时序仍部分适配。P8传递给后续青铜龙改伤分支，不直接替换本次普通伤害。'},
 A16X:{status:'implemented',nativeKind:true,description:'不屈龙族护甲：AHad显式99999码范围，为符合目标许可的友军与自身增加1护甲。'},
 A16Y:{status:'partial',nativeKind:true,description:'不屈龙族攻速：AOae显式600码范围、30%攻击速度，作用于友军与自身；与A16X护甲光环范围不同。',partial:'DataA移动速度缺失，不据原生默认说明添加10%移动；目标枚举、光环驻留与叠加仍待原生验证。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const raw=e=>e?.combatRawcode??e?.sourceRawcode;
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const dead=e=>removed(e)||e.hp<=.405||e.status?.deathCounted;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const jobs=g=>g.state.sourceSkillJobs??=[];
const owner=e=>e.sourceNativeOwnerId??e.ownerId;
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side&&a.battleTeam===b.battleTeam;
const st=e=>(e.status??={}).alexstrasza??={};
const queue=(g,e,type,data={})=>{const j={type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
const range=(e,t,p,r)=>Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8;
function group(g,e,p,r,friendly){return all(g).filter(t=>!removed(t)&&!has(t,'Aloc')&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&ally(e,t)===friendly&&range(e,t,p,r)&&(!friendly||!dead(t)&&!has(t,'Avul')));}
function life(g,e,value,api){
 if(dead(e)){st(e).deadLifeWriteUnverified=true;return;}
 if(value<=.405){api.killUnit(g,e);return;}
 e.hp=Math.min(e.maxHp,value);alexstraszaLifeChanged(g,e,api);
}
function watch(g,e,t){
 if(jobs(g).some(j=>j.type==='alex_watch'&&!j.done&&j.sourceId===e.id&&j.targetId===t.id))return;
 queue(g,e,'alex_watch',{targetId:t.id,target:t,threshold:t.maxHp*.65,above:t.hp>t.maxHp*.65});
}
function grant(g,e,api){
 if((st(e).grantReadyAt??0)>g.state.time+1e-8)return false;
 const sacrificed=e.hp*.5;st(e).grantReadyAt=g.state.time+15;api.pauseUnit(g,e,true);
 queue(g,e,'alex_grant',{nextAt:g.state.time,count:0,sacrificed});
 life(g,e,sacrificed,api);g._event?.('cast',e,'生命赐福',{skillId:'A16S'});return true;
}
export function alexstraszaLifeChanged(g,e,api,before){
 for(const j of [...jobs(g)])if(j.type==='alex_watch'&&!j.done&&j.targetId===e.id){
  j.target=e;if(dead(j.source)||dead(e)){j.done=true;continue;}
  const crossed=(before===undefined?j.above:before>j.threshold)&&e.hp<=j.threshold;j.above=e.hp>j.threshold;
  if(crossed&&grant(g,j.source,api))j.done=true;
 }
}
function scan(g,j,api){
 const e=j.source;if(dead(e)){j.done=true;return;}
 const nearby=all(g).filter(t=>!removed(t)&&!has(t,'Aloc')&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&ally(e,t)&&range(e,t,pos(e),600));
 for(const t of nearby)if(!j.insideIds.includes(t.id))watch(g,e,t);
 j.insideIds=nearby.map(t=>t.id);
 for(const t of all(g))alexstraszaLifeChanged(g,t,api);
}
export function initializeAlexstraszaDeployment(g,b,e){
 if(!b||e.status?.alexstrasza?.registered)return;
 const code=b.unitId?.replace(/^v14_/, '')??b.sourceRawcode,ids=[...(V14_UNIT_TEMPLATES[code]?.abilityIds??b.abilityIds??[]),...(b.permanentAbilityIds??[]),...(b.skillSpecs??[]).map(s=>s.id)],enabled=id=>ids.includes(id)&&(b.abilityLevels?.[id]??1)>0;
 if(!['A16S','A16U','A170','A172'].some(enabled))return;st(e).registered=true;
 if(enabled('A16S')){const nearby=group(g,e,pos(e),600,true);if(!nearby.some(t=>t.id===e.id)&&!has(e,'Avul')&&!dead(e))nearby.push(e);for(const t of nearby)watch(g,e,t);queue(g,e,'alex_scan',{insideIds:nearby.map(t=>t.id)});}
 if(enabled('A16U'))for(const code of ['h0MY','h0F1'])queue(g,e,'alex_find',{code,nextAt:g.state.time+.1,retained:all(g).filter(t=>raw(t)===code&&dead(t)&&!removed(t))});
 if(enabled('A170'))queue(g,e,'alex_blessing');
 if(enabled('A172'))queue(g,e,'alex_revive');
}
const blocked=(g,e)=>dead(e)||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.sourceHidden||e.status?.yseraHidden||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
export const canAlexstraszaCast=(e,id)=>!!ALEXSTRASZA_RULES[id]?.active&&has(e,id);
export function castAlexstrasza(g,e,id,params,api){
 const fail=message=>({ok:false,message});if(!has(e,id)||!ALEXSTRASZA_RULES[id]||!ALEXSTRASZA_RULES[id].active&&id!=='A170')return fail('当前单位没有此技能');if(blocked(g,e))return fail('单位当前无法施法');
 const s=api.compileAbility(g,e,id),t=params.target,p=id==='A16T'?params.point:pos(t);
 if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return fail('请选择施法位置');
 if(id!=='A16T'&&(!t||dead(t)||ally(e,t)!==(id==='A170')||t.battleTeam!==e.battleTeam||has(t,'Aloc')||has(t,'Avul')||t.status?.sourceHidden||t.status?.yseraHidden||!api.matchesTargets(s,e,t)))return fail('请选择有效目标');
 if(!range(e,{worldX:p.x,worldY:p.y},pos(e),Number(s.fields.Rng1)))return fail('超出施法范围');
 const state=(e.skillStates??={})[id]??={readyAt:0,casts:0};if(state.readyAt>g.state.time+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;state.readyAt=g.state.time+s.cooldown;state.casts++;e.pendingAttack=null;
 const scriptApplied=id!=='A170'&&!g._sourceAbilityEffectDepth;
 if(scriptApplied){
  g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
  try{if(id==='A16T')queue(g,e,'alex_blossom',{...p,count:0,nextAt:g.state.time});
   else{const origin=pos(e),angle=Math.atan2(p.y-origin.y,p.x-origin.x);e.facing=angle*180/Math.PI;api.pauseUnit(g,e,true);
    if(id==='A16V')queue(g,e,'alex_shoot',{angle,count:0,nextAt:g.state.time});
    else{api.removeAbility(g,e,id);queue(g,e,'alex_purify',{angle,nextAt:g.state.time+1});}
   }
  }finally{g._sourceAbilityEffectDepth--;}
 }
 st(e).lastCast={id,at:g.state.time,targetId:t?.id,point:p,scriptApplied};g._event?.('cast',e,s.name,{skillId:id});return {ok:true,skillId:id,message:'已施放'+s.name};
}
export function alexstraszaMainDamage(g,t,e,amount,api){
 if(!(amount>0)||!e||e===t||ally(e,t)||has(e,'A2Y7'))return;
 for(const [id,order]of [['A16T','tranquility'],['A16V','unload'],['A16W','unholyfrenzy']]){
  const caster=has(t,id)?t:has(e,id)?e:null;if(!caster)continue;const other=caster===t?e:t,result=castAlexstrasza(g,caster,id,id==='A16T'?{point:pos(other)}:{target:other},api);
  st(caster)['order'+id]={at:g.state.time,order,targetId:other.id,ok:result.ok,reason:result.message};
 }
}
export function alexstraszaDamageListener(g,t,j,api){
 if(j.done)return;
 const e=j.source;
 if(j.type==='alex_link'){
  if(dead(e)||dead(j.target)){j.done=true;return;}
  const average=(e.hp+j.target.hp)/2;life(g,e,average,api);life(g,j.target,average,api);
 }else if(j.type==='alex_blessing'&&!dead(e)&&ally(e,t)&&range(e,t,pos(e),600)){
  const result=castAlexstrasza(g,e,'A170',{target:t},api);st(e).blessingOrder={at:g.state.time,targetId:t.id,ok:result.ok,reason:result.message};
  if(result.ok&&t.hp/t.maxHp<=.5&&e.hp/e.maxHp>.15){life(g,e,e.hp-e.maxHp*.15,api);life(g,t,t.maxHp,api);}
 }
}
export function alexstraszaAttackDamage(g,e,t,api,localP8=0){
 if(!has(e,'A16Z'))return localP8;
 const f=e.sourceRawFields??{},lo=Number(f.damage_min_1),hi=Number(f.damage_max_1),mean=Number(f.damage_avg_1);
 if(![lo,hi,mean,e.damage].every(Number.isFinite)||[f.damage_min_1,f.damage_max_1,f.damage_avg_1].some(n=>n==null||n==='')){st(e).attackBoundary='missing-native-attack-bounds';return null;}
 const sample=Math.fround(lo+e.damage-mean+g._random()*(hi-lo)),report={at:g.state.time,sample,targetId:t.id};st(e).wrath=report;
 api.nativeDamage(g,t,sample*.25,e,{attackType:'chaos',damageType:'universal',weapon:true});
 if(t.hp<=sample){
  life(g,e,e.hp+100,api);const roll=Math.fround(g._random()*100),tag=e.userData??0,stacks=g.state.alexstraszaArmorStacks?.[tag]??0;report.roll=roll;
  if(roll>=45&&stacks<40){(g.state.alexstraszaArmorStacks??={})[tag]=stacks+1;e.armor+=1;report.gainedArmor=true;}
 }return sample;
}
export function alexstraszaWidgetDeath(g,e,api){
 for(const j of [...jobs(g)])if(!j.done&&j.type?.startsWith('alex_')){
  if(j.type==='alex_find'&&raw(e)===j.code){j.retained??=[];if(!j.retained.some(t=>t.id===e.id))j.retained.push(e);}
  if(j.type==='alex_watch'&&(j.sourceId===e.id||j.targetId===e.id)||['alex_scan','alex_blessing'].includes(j.type)&&j.sourceId===e.id)j.done=true;
  if(j.type==='alex_revive'&&j.sourceId===e.id)j.nextAt=g.state.time+.5;
  if(j.type==='alex_fireball'&&j.dummy?.id===e.id)j.chargeDone=true;
 }
}
export function alexstraszaUnitDeath(g,e,api){
 // Revive listeners were registered before the delayed life links.
 for(const j of [...jobs(g)])if(!j.done&&j.type==='alex_revive'&&j.sourceId===e.id){
  j.done=true;const p=pos(e),dragon=api.spawnUnit(g,e,'h0R0',{worldX:p.x,worldY:p.y,facing:e.facing,userData:e.userData,isSummon:false,isHero:false,isNativeHero:false,buildingId:undefined});
  if(dragon){dragon.armor+=g.state.alexstraszaArmorStacks?.[e.userData??0]??0;st(dragon).dragon={from:e.id,appearance:raw(e)==='h0WG'?'LJQ_alexstrasza02.mdx':'alexstrasza.mdl',...(raw(e)==='h0WG'?{}:{scale:.25})};queue(g,dragon,'alex_unlock',{nextAt:g.state.time+20});g._event?.('revive',dragon,'巨龙之力',{skillId:'A172'});}
 }
 for(const j of [...jobs(g)])if(!j.done&&j.type==='alex_link'&&(j.sourceId===e.id||j.targetId===e.id)){
  if(j.sourceId===e.id){j.done=true;j.target.maxHp=j.originalMax;life(g,j.target,j.originalMax,api);}
  else{api.killUnit(g,j.source);j.done=true;}
 }
}
function findLink(g,j,api){
 const e=j.source,t=[...new Map([...(j.retained??[]),...all(g)].map(t=>[t.id,t])).values()].find(t=>!removed(t)&&owner(t)===owner(e)&&raw(t)===j.code&&t.userData===e.userData);j.done=true;
 if(!t)return;const originalMax=t.maxHp,sum=e.maxHp+t.maxHp;e.maxHp=sum;life(g,e,sum,api);t.maxHp=sum;life(g,t,sum,api);
 queue(g,e,'alex_link',{targetId:t.id,target:t,originalMax,nextAt:g.state.time+.03});st(e).links??=[];st(e).links.push(t.id);
}
function fireball(g,j,api){
 const e=j.source,p=pos(e),d=api.spawnUnit(g,e,'e008',{worldX:p.x,worldY:p.y,facing:j.angle*180/Math.PI,scriptAuxiliary:true,isSummon:false,isHero:false,isNativeHero:false,userData:0,nav:undefined,buildingId:undefined});
 if(d){g.state.entities=g.state.entities.filter(t=>t.id!==d.id);queue(g,e,'alex_fireball',{dummy:d,angle:j.angle,steps:0,nextAt:g.state.time,removeAt:g.state.time+1.2});}
 j.count++;j.nextAt+=1.2;if(j.count>=3){j.done=true;api.pauseUnit(g,e,false);}
}
export function tickAlexstraszaJobs(g,api){
 // Native range events are observed once per host frame, not replayed against
 // a future position at every missed timer deadline. Life damage events also
 // enter directly through the post-damage hook.
 for(const j of [...jobs(g)])if(j.type==='alex_scan'&&!j.done)scan(g,j,api);
 const frame=g.state.time;try{while(true){
  const j=jobs(g).filter(j=>j.type?.startsWith('alex_')&&!j.done&&j.nextAt<=frame+1e-8).sort((a,b)=>a.nextAt-b.nextAt)[0];if(!j)break;g.state.time=j.nextAt;const e=j.source;
  if(j.type==='alex_find')findLink(g,j,api);
  else if(j.type==='alex_link'){if(dead(e)||dead(j.target))j.done=true;j.nextAt+=.03;}
  else if(j.type==='alex_revive')j.done=true;
  else if(j.type==='alex_unlock'){api.addAbility(g,e,'A16W');j.done=true;}
  else if(j.type==='alex_grant'||j.type==='alex_blossom'){
   const grant=j.type==='alex_grant';for(const t of group(g,e,grant?pos(e):j,600,true))life(g,t,t.hp+(grant?j.sacrificed*.15:60),api);
   j.count++;j.nextAt+=1;if(j.count>=(grant?4:8)){j.done=true;if(grant)api.pauseUnit(g,e,false);}
  }else if(j.type==='alex_shoot')fireball(g,j,api);
  else if(j.type==='alex_fireball'){
   if(g.state.time>=j.removeAt-1e-8){api.removeUnit(g,j.dummy);j.done=true;continue;}
   if(j.chargeDone||j.steps+1>=30){j.chargeDone=true;j.nextAt=j.removeAt;continue;}
   const p=pos(j.dummy);api.moveUnit(g,j.dummy,{x:p.x+Math.cos(j.angle)*50*scale(e),y:p.y+Math.sin(j.angle)*50*scale(e)});j.steps++;
   for(const t of group(g,e,pos(j.dummy),150,false))api.nativeDamage(g,t,160,e,{attackType:'normal',damageType:'fire'});j.nextAt+=.04;
  }else if(j.type==='alex_purify'){
   const p=pos(e),center={x:p.x+Math.cos(j.angle)*900*scale(e),y:p.y+Math.sin(j.angle)*900*scale(e)};
   for(const t of group(g,e,center,900,false))api.nativeDamage(g,t,780,e,{attackType:'normal',damageType:'fire'});
   api.pauseUnit(g,e,false);j.done=true;g._event?.('cast',e,'净化烈焰',{skillId:'A16W'});
  }
 }}finally{g.state.time=frame;}
}
export function restoreAlexstrasza(g){
 const handles=new Map(all(g).map(e=>[e.id,e])),bind=e=>{if(!e)return e;if(!handles.has(e.id))handles.set(e.id,e);return handles.get(e.id);};
 for(const j of jobs(g))if(j.type?.startsWith('alex_')){for(const key of ['source','target','dummy'])if(j[key])j[key]=bind(j[key]);if(j.retained)j.retained=j.retained.map(bind);}
}
