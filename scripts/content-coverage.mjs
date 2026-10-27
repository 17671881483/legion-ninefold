import { writeFile } from 'node:fs/promises';
import { UNITS, MERCENARIES, WAVES, ITEMS, TECHNOLOGIES, SPECIAL_MONSTERS, UNIT_TEMPLATES } from '../dist/data.js';
import {SOURCE_CLASS_RULES} from '../dist/source-class-rules.js';
import { compileSkills, SKILL_IMPLEMENTATION_REVISION } from '../dist/skills.js';

// Coverage records describe implementation, not just object-table presence.
const current=UNITS.filter(u=>!u.legacy);
// Building commands are absent from many combat-form ability lists.
const playerBuildingCommands=current.filter(u=>u.buildingAbilityIds?.includes('A118')).map(u=>({...u,abilityIds:u.buildingAbilityIds.filter(id=>['A118','A0IH'].includes(id))}));
// This form is created by YseraAwakening at runtime, so it is not a separate
// build-menu record. Its skills still belong to the player's combat coverage.
const playerRuntimeForms=['h0YO','h0UD','h0UE','h2AE','n06V','n06W','h0CZ','h0CL','n07J','h03E','h0V2','h03K','h0SU'].map(code=>UNIT_TEMPLATES[code]);
// Source callbacks inject these exact auxiliary abilities. Keep them visible
// in coverage even though they are absent from the build-menu ability lists.
const playerRuntimeAbilities=[
  // Blood fusion can select all other registered classes; include their
  // dynamically granted child abilities and source-trigger dummy requests.
  {sourceRawcode:'h06J',abilityIds:Object.keys(SOURCE_CLASS_RULES)},
  {sourceRawcode:'h0XA',abilityIds:['A1W2']},
  {sourceRawcode:'h0OV',abilityIds:['A0W0','A0W2','A0W3']},
  {sourceRawcode:'h0JL',abilityIds:['A0IF']},
  {sourceRawcode:'h0JO',abilityIds:['A0IJ','A0IL']},
  ...['h0JI','h0OK','h03E','h03F','h0V2'].map(sourceRawcode=>({sourceRawcode,abilityIds:['A0I2','A0I4','A0I6']})),
  {sourceRawcode:'h03L',abilityIds:['A0XN']},
  {sourceRawcode:'h0SX',abilityIds:['A0XN']},
  {sourceRawcode:'h0SR',abilityIds:['A0IF']},
  {sourceRawcode:'h0UQ',abilityIds:['A1CK','A1OE']},
  {sourceRawcode:'h0UD',abilityIds:['A1CP']},
  {sourceRawcode:'h2AE',abilityIds:['A1CP']},
  {sourceRawcode:'e008',abilityIds:['A1CV','A1CW','A0IB','A0I5','A0I7']},
  {sourceRawcode:'h0UG',abilityIds:['A1CG']},
  {sourceRawcode:'h0SY',abilityIds:['A1BD','A1BE','A1BF','A1BH']},
  {sourceRawcode:'h0SN',abilityIds:['A19Z']},
  {sourceRawcode:'h0QU',abilityIds:['A15D','A15F','A15I']},
  {sourceRawcode:'h0PI',abilityIds:['A0ZS','A0ZU','A0ZY']},
  {sourceRawcode:'h0M0',abilityIds:['A0ZV','A0ZW','A0KR']},
  {sourceRawcode:'h011',abilityIds:['A138','A13A','A139','A13B','A13T','A13U','A13V','A13W','A13X','A13Y','A2ZG']},
].map(def=>({...def,skillVersion:'v14.1A5',distanceScale:1/3}));
const specialCodes=[SPECIAL_MONSTERS.waveFive.rawcode,...SPECIAL_MONSTERS.treasure.byWave.map(e=>e.rawcode)];
const collect=definitions=>{
  const abilities=new Map();
  for(const unit of definitions)for(const skill of compileSkills(unit)){
    const prior=abilities.get(skill.id)??{rawcode:skill.id,name:skill.name,status:skill.status,kind:skill.kind,unitRawcodes:[]};
    const code=unit.sourceRawcode??unit.combatRawcode;
    if(!prior.unitRawcodes.includes(code))prior.unitRawcodes.push(code);
    abilities.set(skill.id,prior);
  }
  const entries=[...abilities.values()].sort((a,b)=>a.rawcode.localeCompare(b.rawcode,'en'));
  for(const entry of entries)entry.unitRawcodes.sort();
  return {counts:Object.fromEntries(['implemented','partial','marker','unresolved'].map(status=>[status,entries.filter(e=>e.status===status).length])),abilities:entries};
};
const result={
  sourceVersion:'v14.1A5',skillImplementationRevision:SKILL_IMPLEMENTATION_REVISION,
  units:current.length,mercenaryRecords:MERCENARIES.length,mainWaves:WAVES.length,specialMonsterTypes:specialCodes.length,
  sourceOnly:{items:Object.keys(ITEMS).length,technologies:Object.keys(TECHNOLOGIES).length},
  playerRuntimeForms:playerRuntimeForms.map(u=>u.sourceRawcode??u.combatRawcode),
  playerRuntimeAbilities:playerRuntimeAbilities.map(({sourceRawcode,abilityIds})=>({sourceRawcode,abilityIds})),
  playerBuildingCommandCarriers:playerBuildingCommands.length,
  playerSkills:collect([...current,...playerBuildingCommands,...playerRuntimeForms,...playerRuntimeAbilities]),
  battleSkills:collect([...current,...playerBuildingCommands,...playerRuntimeForms,...playerRuntimeAbilities,...MERCENARIES,...WAVES,...specialCodes.map(c=>UNIT_TEMPLATES[c])]),
  remainingSourceGaps:[
    'A0IA骷髅王已接入精确原型死亡分支、1秒复活、新旧句柄和LI波末统计生命周期；A0IB动态马甲命令纳入覆盖，缺失原生默认字段、碰撞、重击命中和移除句柄边界仍为partial，见skeleton-king-evidence.json。',
    'A0I1孕母蛛群的伤害前生成、精确变体、召唤身份及动态属性已接入；FightStart全图原型枚举与尸体引用保留，原生命令、光环驻留、碰撞与调度仍部分核定，见broodmother-evidence.json。',
    'A0XM黑暗之魂已接入5秒积累、主死亡链的实数抽样、10魂单次召唤、6魂致命伤害清零与属性增减；A0XN动态等级纳入覆盖。缺失原生魔法上限、AOae默认字段、AIml生命副作用和CreateUnit碰撞/句柄仍为partial，见nightmare-evidence.json。',
    '未核定技能逐项保留在abilities中；已实现状态也不代表整套兵种联动已还原。',
    '包内未提供完整原生商店/菜单字段，部分商品与单位入口仍待补证。',
    'A1U4/A1U5/A1U6献祭奖励可核定，但没有可证实的携带单位或授予路径。',
    '原始地图模型、贴图、音频和v14地形通行格不在解析包内。',
    '神灵武士不屈5秒、狂战1—10级与独立攻击回血已接入；A0IF缺失原生字段、狂战0级请求仍待核定，见huskar-evidence.json。',
    'A0HW火噬与A20D死亡爆发已接入；主死亡触发器禁用/排除组与独立监听分离，原生枚举顺序及同回调其他未接入分支仍部分核定。异蛇ATTACK_TYPE_NORMAL已纠正为Spells，见death-trigger-evidence.json。',
    'A0HX原罪欲火与A0IK冰爆共享前置链、局部P8、不屈/决斗优先级、冰爆分裂箭获得/发起消耗已接入；A0IJ缺失伤害/弹道和A0IL原生仲裁仍部分核定，见elemental-proc-evidence.json。',
    'A0ID决斗已接入受伤选敌、一次攻击命令和死者自身tag驱动的死亡联动；原生枚举顺序、尸体寿命、命令仲裁、前置混合技能分支与AIml仍未完整核定，见huskar-duel-evidence.json。',
    'A0I5已接入受伤cripple请求、非e008范围施毒、逐目标每秒检查及90伤害/A0I7结束请求；Acri原生冷却/默认字段、主目标buff与spell-effect先后、命令仲裁及RemoveUnit句柄仍部分核定，见soul-toxin-evidence.json。',
    '建筑移位已接入411个A118携带建筑：全局3次、单体移除、神灵武士豁免及耗尽门槛；选点映射现有6×8格，原生代理/占位残留、路径纹理与升级能力重建未核定，见relocation-evidence.json。',
    '五个英雄彩蛋直接升级与225条可选四折训练路径已接入；新增单位的未核定技能仍按实际状态计数。随机礼物已接入35个候选；原生CreateUnit路径/碰撞失败、可操纵建造者技能及平台专用Frame科技返费宿主仍待核定。',
    '17类种族特性与103个精确单位注册已接入；地精修理、虚空体质、原生跳跃/slow命中及多种原生法术抗性叠加仍为部分实现。旧存档中没有出生抽样记录的血统融合战斗体不补抽，新出战体才执行来源随机。',
    '瓦斯琪已接入五项脚本主体与A1CK动态等级；A1O5/A1O7/A1O8的原生命令仲裁、落点碰撞及召唤事件身份仍为部分实现。',
    '巫妖王已接入亡者呼唤监听、4秒原型复制、辛达苟萨12次移动/逐目标去重及动态骨龙计数；原生Aslo继承/自动施法和每步单dummy连续眩晕后立即移除的仲裁仍未核定。训练其余缺口见training-hero-source-audit.json。',
    'A131农场礼物已按显式原型next链计算人口，旧档/付费农场原型未知及原生在研取消退款仍待核定，保留礼物不猜测。',
    '原图训练多分支对话框限时30秒；Web用持久表单重新校验提交，未模拟对话框超时。旧版无礼物历史的存档不会补抽已过波次奖励。',
  ],
};
if(process.argv.includes('--write'))await writeFile(new URL('../reference/content-coverage.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({units:result.units,specialMonsterTypes:result.specialMonsterTypes,sourceOnly:result.sourceOnly,playerSkills:result.playerSkills.counts,battleSkills:result.battleSkills.counts},null,2));
