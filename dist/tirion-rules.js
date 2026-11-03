import {V14_UNIT_TEMPLATES} from './v14-reference.js';
import {earlierTaurenAttackBranch} from './tauren-rules.js';

export const TIRION_RULES={
 A0LG:{status:'partial',nativeKind:true,description:'基础灼烧按ANpi显式1秒周期产生15点伤害，范围350。攻击h0M1提里奥时，到达原始攻击分支便将攻击者共享键1置真。h0M1造成的事件伤害恰为15且目标键1为真时追加105通用伤害；否则被伤害者为h0M1且自身键1为真时，先回复事件伤害50%。保留前置elseif；h0VT外观不满足精确原型条件。',partial:'ANpi首次跳时刻、原生伤害类别与控制状态下周期仍需实测；其他共享键写入、未实现前置分支效果和原生事件改伤顺序仍有边界。'},
 A0LH:{status:'partial',description:'独立武器伤害监听到达灰烬使者分支时，追加150＋目标最大生命15%的混乱攻击/通用伤害。独立死亡监听到达击杀分支时回复自身最大生命18%，法术击杀也可触发；前置死亡分支优先，复生等待不结算。',partial:'原生监听先后、共享布尔键2及其他未实现分支效果仍有边界。神圣愤怒h0M1标记/附伤已接入，原生周期与事件仍待实测，不把本项视为提里奥全技能完成。'},
 A0LP:{status:'partial',description:'同一玩家曾实际完成h0M2提里奥与h203泰兰后授予R01Y，记录永久保留。新出战时要求建筑有羁绊且科技恰为1：战斗体仍有羁绊则加A0LO/A0LQ，否则加A0LR；普通战与竞技相同。',partial:'A0LO/A0LR的原生AIas攻速字段缺失，不按名称猜30%。缺失原生能力依赖/默认继承和创建顺序保留边界。'},
 A0LQ:{status:'implemented',description:'羁绊动态授予的AIde，物编DataA1=15，增加自身15点护甲。',nativeKind:true},
 A0LO:{status:'unresolved',description:'羁绊授予的AIas攻速能力已保留，但对象DataA1缺失。',partial:'技能名写30%，不能代替原生数值，不产生虚构攻速。'},
 A0LR:{status:'partial',description:'独立伤害监听要求受害者或伤害来源有A0LR。受害者持有时抽整数1—10≤3，先回复事件伤害，再检查回复后生命≤1000且共享键1未占用，安排3秒后存活则回复1000。来源有Af01时按15%/持A0LR时35%再伤害200并回复1000；该附伤是武器标记的法术攻击/普通伤害。',partial:'AIas攻速字段缺失。受击回血不是伤害归零，满血受击仍可能掉血；源码防御成功后提前重新启用监听，保留嵌套事件。原生监听排序、共享键1其他写入及死人写生命仍待验证。'},
 Af01:{status:'partial',description:'已接入A_TirionFordring中的伤害来源分支：只有双方至少一方有A0LR才进入监听，Af01来源抽百分数≤15（自身有A0LR则≤35），附加200法术攻击/普通武器伤害并回复1000。不限定原事件是普攻。',partial:'其余圣光旗帜/全队治疗与未获得羁绊时的其他独立规则仍待核定；不以文案补出未注册的常驻触发。'},
};
const level=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)?e.abilityLevels?.[id]??1:0;
const raw=e=>e?.combatRawcode??e?.sourceRawcode;
const v14=e=>e?.skillVersion==='v14.1A5';
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const heal=(e,n)=>{const before=e?.hp??0;if(before>0&&!removed(e))e.hp=Math.min(e.maxHp,before+n);return (e?.hp??0)-before;};

// EVENT_PLAYER_UNIT_ATTACKED: i is the victim, Pf the attacker. h0M1 is
// explicitly in Q (48453), so this exact victim satisfies the registry gate.
export function tirionAttackIssued(g,e,t){
 if(!v14(t)||raw(t)!=='h0M1'||!e||g._sourceAttackIssuedTriggerDisabled)return;
 const owner=t.sourceNativeOwnerId;
 if(owner===undefined?(t.isBuilding||!Number.isInteger(t.battleTeam)):(owner<8||owner>12))return;
 const a=raw(e),full=e.mana===e.maxMana,has=id=>level(e,id)>0;
 const buff=id=>e.buffs?.some(b=>(b.key===id||b.buffId===id)&&(b.expiresAt===undefined||b.expiresAt>g.state.time));
 // All branches before47735; nested failed rolls still consume their elseif.
 const prior=a==='h0OS'||has('S006')&&e.mana>=17&&!e.status?.sourceS006Timer||has('A0TB')||
 ['h088','h0SI','h04M','h0P9','h04N','n205','h06G','h16G','n1S2','n1S4','h03B','h0OC','n007','n0SB','h06Z','h09P','h19P','h0A7','h0AV','h0AW','h06C','h069','h06A','h0O9','h0OE','h08T','h02D','h0P4','h2AA'].includes(a)||
 a==='h08B'&&!buff('B02Y')||a==='h02U'&&full||a==='h0CD'&&e.mana>=3||has('A06O')||a==='h030'&&!has('A05U')||['h074','h075','h092'].includes(a)&&full;
 if(prior)return;
 (e.status??={}).sourceHashtableBoolean1=true;
 e.status.tirionAttackMark={at:g.state.time,targetId:t.id};
}

// Continuation of the separate41337 elseif chain; earlier P8 branches do
// not consume this chain. GetEventDamage here is NOT the mutated local P8.
export function tirionHolyDamage(g,t,e,eventDamage,api,prior){
 if(prior)return prior;
 if(!(v14(t)||v14(e))||!e||!(eventDamage>0)||t.id===e.id||t.side===e.side||level(e,'A2Y7')>0)return null;
 if(raw(e)!=='h0M1'&&raw(t)!=='h0M1')return null;
 let selected=null;
 if(raw(e)==='h02F'&&eventDamage>450&&eventDamage<750)selected='h02F';
 else if(raw(e)==='h055'&&1+Math.floor(g._random()*5)===3)selected='h055';
 else if(raw(t)==='h0O7'&&1+99*g._random()<21)selected='h0O7';
 else if(level(e,'A0LN')===1)selected='A0LN';
 if(selected){(t.status??={}).tirionHolySkipped=selected;return selected;}
 if(raw(e)==='h0M1'&&eventDamage===15&&t.status?.sourceHashtableBoolean1){
  (e.status??={}).sourceHashtableBoolean2=true;
  try{api.universalDamage(g,t,105,e);}finally{e.status.sourceHashtableBoolean2=false;}
  e.status.tirionHolyBonus={at:g.state.time,targetId:t.id,damage:105};
  g._event?.('cast',t,'神圣愤怒',{skillId:'A0LG',sourceId:e.id,damage:105});
  return 'h0M1-holy-bonus';
 }
 if(raw(t)==='h0M1'&&t.status?.sourceHashtableBoolean1){
  const restored=heal(t,eventDamage*.5);
  (t.status??={}).tirionHolyHeal={at:g.state.time,requested:eventDamage*.5,restored};
  return 'h0M1-holy-heal';
 }
 return null;
}

export function initializeTirionDeployment(g,building,e,api){
 if(!building||e.status?.tirionBondDeployment)return;
 const code=building.unitId?.replace(/^v14_/, '')??building.sourceRawcode;
 const ids=[...(V14_UNIT_TEMPLATES[code]?.abilityIds??building.abilityIds??[]),...(building.permanentAbilityIds??[]),...(building.skillSpecs??[]).map(s=>s.id)];
 const owner=g.state.players[e.ownerId];
 if(!ids.includes('A0LP')||(building.abilityLevels?.A0LP??1)<=0||owner?.technologies?.R01Y!==1)return;
 const grants=level(e,'A0LP')>0?['A0LO','A0LQ']:['A0LR'];
 for(const id of grants)api.addAbility(g,e,id);
 (e.status??={}).tirionBondDeployment={at:g.state.time,buildingRawcode:code,grants};
}

// This is the tail of the SAME 42618–42782 elseif chain. Use the decision
// already made by Destroyer/Tauren so mana mutation and random draws occur once.
export function tirionAttackDamage(g,e,t,amount,api,selectedBranch=null){
 if(level(e,'A0LH')<=0)return;
 let prior=selectedBranch??earlierTaurenAttackBranch(g,e);
 if(!prior&&level(e,'A0N5')===1)prior='A0N5';
 if(!prior&&level(e,'A0TA')===1)prior='A0TA';
 if(!prior&&level(e,'A05R')===1){
  const base=e.sourceNativeState21;
  if(base===undefined||base==='')prior='A05R-native-base-unresolved';
  else if(amount>=Number(base))prior='A05R';
 }
 if(!prior&&level(e,'A0SU')===1)prior='A0SU';
 if(!prior&&raw(e)==='n04S'&&g._random()*100<10&&!e.status?.sourceN04STimer)prior='n04S';
 if(!prior&&['h088','h0SI'].includes(raw(e)))prior=raw(e);
 if(prior){(e.status??={}).tirionAttackSkipped=prior;return;}
 if(e.status?.sourceHashtableBoolean2)return;
 const damage=150+t.maxHp*.15;
 (e.status??={}).tirionAshbringer={at:g.state.time,targetId:t.id,damage};
 api.universalDamage(g,t,damage,e);
 g._event?.('cast',t,'灰烬使者',{skillId:'A0LH',sourceId:e.id,damage});
}

// Trig_DeathTrigger is independent of Trig_UnitDeath. It is NOT disabled by
// the latter's nested death guard. Its 47929–48077 elseif order still applies.
export function tirionKillBranch(g,dead,killer){
 if(!v14(killer)||level(killer,'A0LH')<=0)return false;
 const owner=dead.sourceNativeOwnerId,registered=owner===undefined?!dead.isBuilding&&Number.isInteger(dead.battleTeam):owner>=8&&owner<=12;
 if(!registered||g._sourceLegacyDeathTriggerDisabled||level(dead,'A0SF')>0||['H08U','h0AX','h0AS','h0AP','h039','h038'].includes(raw(dead)))return false;
 const requested=killer.maxHp*.18,restored=heal(killer,requested);
 (killer.status??={}).tirionKillHeal={at:g.state.time,deadId:dead.id,requested,restored};
 if(restored>0)g._event?.('heal',killer,`+${Math.round(restored)}`,{skillId:'A0LH'});
 return true;
}

export function tirionBondDamage(g,t,e,amount,api){
 const targetHas=v14(t)&&level(t,'A0LR')>0,sourceHas=v14(e)&&level(e,'A0LR')>0;
 if(g._tirionBondTriggerDisabled||!targetHas&&!sourceHas)return;
 g._tirionBondTriggerDisabled=true;
 try{
  if(targetHas){
   const roll=Math.min(10,1+Math.floor(g._random()*10));
   (t.status??={}).tirionBondDefense={at:g.state.time,roll,amount};
   if(roll<=3){
    t.status.tirionBondDefense.restored=heal(t,amount);
    // Literal early EnableTrigger at14280 permits nested damage to re-enter.
    g._tirionBondTriggerDisabled=false;
    if(t.hp<=1000&&!t.status.sourceHashtableBoolean1){
     t.status.sourceHashtableBoolean1=true;
     (g.state.sourceSkillJobs??=[]).push({type:'tirion_bond_heal',sourceId:t.id,source:t,at:g.state.time+3});
    }
   }
  }
  if(v14(e)&&level(e,'Af01')>0){
   const threshold=sourceHas?35:15,roll=Math.fround(g._random()*100);
   (e.status??={}).tirionBondAttack={at:g.state.time,roll,threshold,targetId:t.id};
   if(roll<=threshold){
    api.nativeDamage(g,t,200,e,{attackType:'spells',damageType:'normal',weapon:true});
    e.status.tirionBondAttack.restored=heal(e,1000);
   }
  }
 }finally{g._tirionBondTriggerDisabled=false;}
}

export function tickTirionJob(g,j){
 if(j.at>g.state.time+1e-8)return true;
 const e=g.state.entities.find(e=>e.id===j.sourceId)??j.source;if(!e)return false;j.source=e;
 const restored=heal(e,1000);(e.status??={}).sourceHashtableBoolean1=false;
 e.status.tirionDelayedHeal={at:j.at,restored};
 if(restored>0)g._event?.('heal',e,`+${Math.round(restored)}`,{skillId:'A0LR'});
 return false;
}
