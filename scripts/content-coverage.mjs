import { writeFile } from 'node:fs/promises';
import { UNITS, MERCENARIES, WAVES, ITEMS, TECHNOLOGIES, SPECIAL_MONSTERS, UNIT_TEMPLATES } from '../dist/data.js';
import { compileSkills, SKILL_IMPLEMENTATION_REVISION } from '../dist/skills.js';

// Coverage records describe implementation, not just object-table presence.
const current=UNITS.filter(u=>!u.legacy);
// This form is created by YseraAwakening at runtime, so it is not a separate
// build-menu record. Its skills still belong to the player's combat coverage.
const playerRuntimeForms=['h0YO','h0UD','h0UE','h2AE','n06V','n06W','h0CZ','h0CL'].map(code=>UNIT_TEMPLATES[code]);
// Source callbacks inject these exact auxiliary abilities. Keep them visible
// in coverage even though they are absent from the build-menu ability lists.
const playerRuntimeAbilities=[
  {sourceRawcode:'h0UD',abilityIds:['A1CP']},
  {sourceRawcode:'h2AE',abilityIds:['A1CP']},
  {sourceRawcode:'e008',abilityIds:['A1CV','A1CW']},
  {sourceRawcode:'h0UG',abilityIds:['A1CG']},
  {sourceRawcode:'h0SY',abilityIds:['A1BD','A1BE','A1BF','A1BH']},
  {sourceRawcode:'h0SN',abilityIds:['A19Z']},
  {sourceRawcode:'h0QU',abilityIds:['A15D','A15F','A15I']},
  {sourceRawcode:'h0PI',abilityIds:['A0ZS','A0ZU','A0ZY']},
  {sourceRawcode:'h0M0',abilityIds:['A0ZV','A0ZW']},
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
    'BoxGift五个隐藏训练叶子及225条训练路径已接入；新增单位的未核定技能仍按实际状态计数。神秘礼物的随机兵种创建、可操纵建造者技能及平台专用Frame科技返费宿主仍待补齐。',
    '原图训练多分支对话框限时30秒；Web用持久表单重新校验提交，未模拟对话框超时。旧版无礼物历史的存档不会补抽已过波次奖励。',
  ],
};
if(process.argv.includes('--write'))await writeFile(new URL('../reference/content-coverage.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({units:result.units,specialMonsterTypes:result.specialMonsterTypes,sourceOnly:result.sourceOnly,playerSkills:result.playerSkills.counts,battleSkills:result.battleSkills.counts},null,2));
