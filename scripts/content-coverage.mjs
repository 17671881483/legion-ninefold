import { writeFile } from 'node:fs/promises';
import { UNITS, MERCENARIES, WAVES, ITEMS, TECHNOLOGIES, SPECIAL_MONSTERS, UNIT_TEMPLATES } from '../dist/data.js';
import {SOURCE_CLASS_RULES} from '../dist/source-class-rules.js';
import { compileSkills, SKILL_IMPLEMENTATION_REVISION } from '../dist/skills.js';

// Coverage records describe implementation, not just object-table presence.
const current=UNITS.filter(u=>!u.legacy);
// This form is created by YseraAwakening at runtime, so it is not a separate
// build-menu record. Its skills still belong to the player's combat coverage.
const playerRuntimeForms=['h0YO','h0UD','h0UE','h2AE','n06V','n06W','h0CZ','h0CL','n07J'].map(code=>UNIT_TEMPLATES[code]);
// Source callbacks inject these exact auxiliary abilities. Keep them visible
// in coverage even though they are absent from the build-menu ability lists.
const playerRuntimeAbilities=[
  // Blood fusion can select all other registered classes; include their
  // dynamically granted child abilities and source-trigger dummy requests.
  {sourceRawcode:'h06J',abilityIds:Object.keys(SOURCE_CLASS_RULES)},
  {sourceRawcode:'h0XA',abilityIds:['A1W2']},
  {sourceRawcode:'h0OV',abilityIds:['A0W0','A0W2','A0W3']},
  {sourceRawcode:'h0JL',abilityIds:['A0IF']},
  {sourceRawcode:'h0SR',abilityIds:['A0IF']},
  {sourceRawcode:'h0UQ',abilityIds:['A1CK','A1OE']},
  {sourceRawcode:'h0UD',abilityIds:['A1CP']},
  {sourceRawcode:'h2AE',abilityIds:['A1CP']},
  {sourceRawcode:'e008',abilityIds:['A1CV','A1CW']},
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
  playerSkills:collect([...current,...playerRuntimeForms,...playerRuntimeAbilities]),
  battleSkills:collect([...current,...playerRuntimeForms,...playerRuntimeAbilities,...MERCENARIES,...WAVES,...specialCodes.map(c=>UNIT_TEMPLATES[c])]),
  remainingSourceGaps:[
    '未核定技能逐项保留在abilities中；已实现状态也不代表整套兵种联动已还原。',
    '包内未提供完整原生商店/菜单字段，部分商品与单位入口仍待补证。',
    'A1U4/A1U5/A1U6献祭奖励可核定，但没有可证实的携带单位或授予路径。',
    '原始地图模型、贴图、音频和v14地形通行格不在解析包内。',
    '神灵武士不屈5秒、狂战1—10级与独立攻击回血已接入；A0IF缺失原生字段、狂战0级请求及决斗/位移完整逻辑仍待核定，见huskar-evidence.json。',
    'BoxGift五个隐藏训练叶子及225条训练路径已接入；新增单位的未核定技能仍按实际状态计数。随机礼物已接入35个候选；原生CreateUnit路径/碰撞失败、可操纵建造者技能及平台专用Frame科技返费宿主仍待核定。',
    '17类种族特性与103个精确单位注册已接入；地精修理、虚空体质、原生跳跃/slow命中及多种原生法术抗性叠加仍为部分实现。旧存档中没有出生抽样记录的血统融合战斗体不补抽，新出战体才执行来源随机。',
    '瓦斯琪已接入五项脚本主体与A1CK动态等级；A1O5/A1O7/A1O8的原生命令仲裁、落点碰撞及召唤事件身份仍为部分实现。',
    '巫妖王已接入亡者呼唤监听、4秒原型复制、辛达苟萨12次移动/逐目标去重及动态骨龙计数；原生Aslo继承/自动施法和每步单dummy连续眩晕后立即移除的仲裁仍未核定。训练其余缺口见training-hero-source-audit.json。',
    'A131农场礼物已按显式原型next链计算人口，旧档/付费农场原型未知及原生在研取消退款仍待核定，保留礼物不猜测。',
    '原图训练多分支对话框限时30秒；Web用持久表单重新校验提交，未模拟对话框超时。旧版无礼物历史的存档不会补抽已过波次奖励。',
  ],
};
if(process.argv.includes('--write'))await writeFile(new URL('../reference/content-coverage.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({units:result.units,specialMonsterTypes:result.specialMonsterTypes,sourceOnly:result.sourceOnly,playerSkills:result.playerSkills.counts,battleSkills:result.battleSkills.counts},null,2));
