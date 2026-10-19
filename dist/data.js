/* 5.0dJF workbook configuration. Historical Web definitions are save-compatibility only.
 * Legacy Web units remain for existing saves. See REFERENCE and reference/map-source.json.
 */
import { MAP_REFERENCE, MAP_UNITS, MAP_WAVES, MAP_MERCENARIES, MAP_ECONOMY } from './map-reference.js';
import {WORKBOOK_REFERENCE,WORKBOOK_UNITS,WORKBOOK_BUILDERS,WORKBOOK_POOLS,WORKBOOK_ARCHIVE,WORKBOOK_HERO_ENTRIES,WORKBOOK_MERCENARIES,WORKBOOK_WAVES} from './workbook-reference.js';
import {DOCUMENT_RULES,DOCUMENT_ECONOMY} from './document-rules.js';
export const HISTORICAL_REFERENCE=MAP_REFERENCE;
export const REFERENCE={...WORKBOOK_REFERENCE,economyPolicy:DOCUMENT_ECONOMY.sourcePolicy,targetMode:'5.0dJF x3文档配置',bountyPolicy:'GG默认开启，普通漏怪按开波军力与累计漏数的固定系数折扣；木怪和首领不套用，31波后无击杀赏金。'};
export const ECONOMY=DOCUMENT_ECONOMY;
export const BUILDERS=WORKBOOK_BUILDERS,PROPHET_POOLS=WORKBOOK_POOLS,HERO_ENTRIES=WORKBOOK_HERO_ENTRIES,ARCHIVE_UNITS=WORKBOOK_ARCHIVE;

const A = (type, value, name, description, extra = {}) => ({ type, value, name, description, ...extra });
const unit = (id, name, race, tier, cost, hp, damage, interval, range, armor, attackType, armorType, role, ability, color, shape, upgrades, description, population = 1, randomPool = false) => ({
  id, name, race, tier, cost, hp, damage, interval, range, speed: range > 100 ? 34 : 52,
  armor, attackType, armorType, role, ability, color, shape, upgrades, description,
  population, randomPool, isBase: randomPool,
});

const LEGACY_UNITS = [
  // Four base candidates per tier; roll exactly one base unit from each tier.
  unit('ghoul', '食尸鬼', '亡灵', 1, 45, 310, 27, .92, 35, 1, 'normal', 'light', 'frontline', A('lifesteal', .12, '吞噬', '攻击恢复造成伤害的一部分。'), '#94ba6b', 'triangle', ['zombie'], '便宜的近战前排，以数量分担伤害。', 1, true),
  unit('archer', '弓箭手', '人类', 1, 50, 165, 37, 1.05, 240, 0, 'pierce', 'light', 'ranged', null, '#d6b86c', 'triangle', ['divine_archer'], '廉价穿刺输出，需要前排保护。', 1, true),
  unit('treant', '小树人', '森林', 1, 55, 470, 22, 1.35, 40, 3, 'normal', 'medium', 'tank', A('regen', 4, '树皮再生', '持续恢复生命。'), '#75a377', 'square', ['treant_warrior'], '输出较低的厚实肉盾。', 1, true),
  unit('murloc', '鱼人奴隶', '深海', 1, 40, 240, 23, .82, 32, 0, 'normal', 'unarmored', 'frontline', A('swarm', .08, '协同围攻', '周围同族友军提高伤害。', { radius: 100 }), '#63b6bd', 'circle', ['murloc_brute'], '低造价群体近战，升级后强化生存。', 1, true),

  unit('priest', '牧师', '人类', 2, 100, 285, 32, 1.3, 210, 0, 'magic', 'unarmored', 'support', A('heal', 25, '治疗', '周期治疗附近受伤的友军。', { radius: 155, cooldown: 2.5 }), '#dce8bd', 'diamond', ['archbishop'], '补充持续作战能力，治疗优先照顾受伤前排。', 1, true),
  unit('ogre', '食人魔', '兽族', 2, 110, 730, 59, 1.5, 42, 3, 'normal', 'heavy', 'tank', A('stun', .5, '重击', '攻击有概率短暂击晕。', { chance: .15 }), '#cba476', 'square', ['barbarian'], '高生命近战单位，适合承接火力。', 2, true),
  unit('machinegun', '机枪手', '机械', 2, 115, 340, 27, .43, 265, 1, 'pierce', 'medium', 'ranged', null, '#aab8bd', 'square', ['tank'], '高频单体穿刺输出，对轻甲目标表现突出。', 1, true),
  unit('acolyte', '侍僧', '亡灵', 2, 95, 360, 44, 1.18, 190, 1, 'magic', 'medium', 'support', A('aura_armor', 1, '骨甲光环', '附近友军获得护甲。', { radius: 140 }), '#b2a3d7', 'diamond', ['necromancer'], '法术辅助，可升级为死灵法师。', 1, true),

  unit('wolf', '灰狼', '兽族', 3, 155, 650, 70, .78, 34, 1, 'normal', 'medium', 'frontline', A('crit', 1.8, '撕咬', '攻击有概率造成额外伤害。', { chance: .2 }), '#bdc7d0', 'triangle', ['worg'], '快速近战输出，适合侧翼布置。', 2, true),
  unit('tauren', '牛头人', '兽族', 3, 175, 1220, 73, 1.5, 42, 5, 'normal', 'heavy', 'tank', A('stomp', 38, '战争践踏', '周期震击周围敌人。', { radius: 75, cooldown: 5, duration: .5 }), '#b88a62', 'hex', ['tauren_chieftain'], '可靠重甲前排，牵制成群近战怪。', 2, true),
  unit('dryad', '树精射手', '森林', 3, 155, 470, 65, .98, 245, 1, 'pierce', 'light', 'ranged', A('poison', 8, '毒矛', '命中后持续造成伤害。', { duration: 3 }), '#9acb8a', 'diamond', ['forest_lancer'], '穿刺与持续伤害相结合的远程兵。', 1, true),
  unit('frost_archer', '寒霜射手', '冰原', 3, 165, 430, 64, 1.12, 275, 1, 'pierce', 'light', 'control', A('slow', .22, '寒冰箭', '降低命中目标的移动速度。', { duration: 2 }), '#9fdaed', 'triangle', ['ice_bow'], '通过减速为后排争取输出时间。', 1, true),

  unit('blue_dragon', '青龙', '龙族', 4, 230, 1500, 86, 1.35, 170, 6, 'magic', 'heavy', 'tank', A('aura_slow', .16, '寒霜吐息', '减缓附近敌人的移动。', { radius: 100 }), '#68c3cf', 'diamond', ['fire_dragon', 'ice_dragon'], '兼顾前排与魔法伤害，可选择火焰或冰霜路线。', 3, true),
  unit('spirit_mage', '灵魂法师', '亡灵', 4, 220, 640, 102, 1.32, 250, 2, 'magic', 'unarmored', 'caster', A('splash', .45, '灵魂爆裂', '对目标附近敌人造成溅射伤害。', { radius: 65 }), '#aaa1e0', 'diamond', ['kelthuzad'], '范围魔法输出，对密集敌群有效。', 2, true),
  unit('serpent', '沙虫', '荒漠', 4, 210, 1420, 91, 1.2, 52, 4, 'normal', 'medium', 'frontline', A('regen', 10, '蜕皮', '持续恢复生命。'), '#bcaa72', 'circle', ['hydra'], '生命与回复兼备的持久型前排。', 2, true),
  unit('alchemist', '炼金术士', '机械', 4, 225, 750, 72, 1.05, 215, 3, 'magic', 'medium', 'support', A('armor_break', 3, '酸性炸弹', '降低目标护甲。', { duration: 4 }), '#c9c880', 'hex', ['mech_alchemist'], '用减甲帮助队伍集中击破高护甲敌人。', 2, true),

  unit('naga', '娜迦海妖', '深海', 5, 285, 850, 115, 1.18, 265, 3, 'pierce', 'medium', 'control', A('chain', .45, '叉状闪电', '攻击弹射至额外目标。', { targets: 3, radius: 110 }), '#71b4b6', 'diamond', ['vashj'], '远程多目标输出，依靠前排提供空间。', 2, true),
  unit('shaman', '萨满', '兽族', 5, 275, 920, 94, 1.2, 220, 3, 'magic', 'medium', 'support', A('aura_speed', .14, '嗜血光环', '提高附近友军的攻击速度。', { radius: 165 }), '#c8a1c5', 'hex', ['guldan'], '为聚集的输出部队提供攻速增益。', 2, true),
  unit('gryphon', '狮鹫', '天空', 5, 290, 1250, 117, 1.28, 220, 4, 'pierce', 'light', 'ranged', A('splash', .3, '风暴之锤', '攻击附带小范围伤害。', { radius: 58 }), '#c2c4e0', 'triangle', ['thunderbird'], '坚韧的远程输出单位。', 3, true),
  unit('soul_guard', '灵魂守卫', '恶魔', 5, 300, 1730, 130, 1.2, 48, 5, 'chaos', 'heavy', 'frontline', A('lifesteal', .15, '灵魂汲取', '攻击恢复造成伤害的一部分。'), '#b799b2', 'square', ['void_lord'], '混乱攻击近战，对多种护甲保持稳定输出。', 3, true),

  unit('azshara', '艾萨拉', '深海', 6, 360, 1100, 155, 1.32, 290, 4, 'magic', 'medium', 'caster', A('splash', .55, '潮汐风暴', '对敌群造成范围魔法伤害。', { radius: 90 }), '#78c8d7', 'star', ['tide_queen'], '高阶范围法师，适合密集怪物模式。', 3, true),
  unit('ancient', '远古守护者', '森林', 6, 350, 2650, 115, 1.65, 65, 8, 'normal', 'fortified', 'tank', A('thorns', .15, '荆棘护甲', '反弹部分受到的近战伤害。'), '#7eab74', 'hex', ['war_ancient'], '高护甲巨型前排，为后排承受压力。', 4, true),
  unit('phoenix', '凤凰', '天空', 6, 365, 1450, 137, 1.05, 230, 4, 'magic', 'light', 'caster', A('burn', 18, '烈焰', '攻击灼烧目标附近敌人。', { radius: 70, duration: 3 }), '#e4ae70', 'star', ['immortal_phoenix'], '持续范围输出，升级后获得复生能力。', 3, true),
  unit('golem', '岩石傀儡', '元素', 6, 345, 2450, 148, 1.65, 50, 9, 'normal', 'heavy', 'tank', A('stun', .7, '岩石重拳', '攻击有概率击晕目标。', { chance: .2 }), '#a5a6a0', 'square', ['infernal'], '重甲控制前排，限制精英怪行动。', 4, true),

  // Upgrade cost is the additional price paid from the preceding unit.
  unit('zombie', '僵尸', '亡灵', 1, 110, 950, 63, 1.08, 38, 4, 'normal', 'medium', 'tank', A('regen', 9, '腐肉再生', '持续恢复生命。'), '#819b6a', 'square', ['abomination'], '食尸鬼升级，强化生命与持续作战。', 2),
  unit('abomination', '憎恶', '亡灵', 1, 240, 2250, 121, 1.28, 48, 6, 'normal', 'heavy', 'tank', A('poison_aura', 15, '瘟疫', '对附近敌人持续造成伤害。', { radius: 85 }), '#80916f', 'hex', [], '厚重的瘟疫前排，适合承受密集近战压力。', 3),
  unit('divine_archer', '神弓', '人类', 1, 155, 460, 106, .8, 290, 2, 'pierce', 'light', 'ranged', A('crit', 2, '神射', '攻击有概率造成双倍伤害。', { chance: .2 }), '#e6d7a4', 'triangle', ['ranger_general'], '弓箭手升级，专注快速单体击杀。', 2),
  unit('ranger_general', '游侠将军', '人类', 1, 270, 790, 188, .7, 310, 3, 'pierce', 'medium', 'ranged', A('multishot', .55, '分裂箭', '同时攻击额外目标。', { targets: 3 }), '#eadcba', 'star', [], '远程多目标穿刺核心。', 3),
  unit('treant_warrior', '树人战士', '森林', 1, 130, 1370, 64, 1.35, 45, 6, 'normal', 'heavy', 'tank', A('thorns', .12, '荆棘', '反弹部分受到的近战伤害。'), '#699762', 'hex', [], '小树人升级，护甲与生命明显提高。', 2),
  unit('murloc_brute', '鱼人暴徒', '深海', 1, 130, 900, 75, .8, 38, 3, 'normal', 'medium', 'frontline', A('swarm', .12, '鱼人战阵', '周围同族友军提高伤害。', { radius: 120 }), '#56aeb0', 'circle', [], '鱼人奴隶升级，兼顾输出和生命。', 2),

  unit('archbishop', '大主教', '人类', 2, 210, 790, 70, 1.3, 235, 3, 'magic', 'medium', 'support', A('heal', 75, '神圣治疗', '周期治疗附近受伤友军。', { radius: 180, cooldown: 2.2 }), '#eee5b8', 'diamond', ['holy_oracle'], '牧师升级，提供更强的单体治疗。', 2),
  unit('holy_oracle', '圣言先知', '人类', 2, 310, 1240, 116, 1.25, 260, 5, 'magic', 'medium', 'support', A('aura_heal', 20, '圣言领域', '持续治疗范围内友军。', { radius: 185 }), '#f2e7cc', 'star', [], '群体回复核心，保护阵型中的多名前排。', 3),
  unit('barbarian', '野蛮人', '兽族', 2, 240, 1860, 140, 1.25, 46, 6, 'normal', 'heavy', 'frontline', A('stun', .75, '蛮力重击', '攻击有概率击晕目标。', { chance: .2 }), '#bb8865', 'hex', [], '食人魔升级，强化控制和正面输出。', 3),
  unit('tank', '突击坦克', '机械', 2, 245, 1820, 125, 1.2, 230, 8, 'pierce', 'fortified', 'tank', A('splash', .3, '爆破弹', '炮击附带范围伤害。', { radius: 62 }), '#9faca9', 'square', ['siege_tank'], '机枪手升级，为队伍提供坚固的远程火力。', 3),
  unit('siege_tank', '末日坦克', '机械', 2, 350, 2850, 225, 1.42, 310, 11, 'pierce', 'fortified', 'ranged', A('splash', .6, '攻城炮', '对目标周围造成较大范围伤害。', { radius: 90 }), '#c0c9c5', 'square', [], '远程范围输出，需要注意阵型衔接。', 4),
  unit('necromancer', '死灵法师', '亡灵', 2, 220, 850, 100, 1.18, 250, 4, 'magic', 'medium', 'caster', A('aura_damage', .12, '死亡光环', '提高附近友军伤害。', { radius: 155 }), '#b6a4cf', 'diamond', [], '侍僧升级，强化团队法术与输出。', 2),

  unit('worg', '巨狼', '兽族', 3, 250, 1650, 150, .72, 40, 5, 'normal', 'medium', 'frontline', A('crit', 2, '狂暴撕咬', '攻击有概率造成双倍伤害。', { chance: .25 }), '#bdc3c8', 'triangle', [], '灰狼升级，快速击杀关键目标。', 3),
  unit('tauren_chieftain', '牛头人酋长', '兽族', 3, 290, 2850, 165, 1.42, 50, 9, 'normal', 'heavy', 'tank', A('stomp', 95, '雷霆践踏', '周期震击并短暂控制周围敌人。', { radius: 100, cooldown: 4.5, duration: .75 }), '#b98261', 'hex', [], '牛头人升级，坚实的范围控制前排。', 4),
  unit('forest_lancer', '树精矛手', '森林', 3, 245, 1060, 143, .88, 290, 4, 'pierce', 'light', 'ranged', A('poison', 22, '剧毒长矛', '命中后持续造成伤害。', { duration: 4 }), '#8fc58b', 'diamond', [], '树精射手升级，持续削弱高生命敌人。', 2),
  unit('ice_bow', '冰弓', '冰原', 3, 275, 980, 139, .96, 310, 4, 'pierce', 'light', 'control', A('slow', .4, '极寒箭雨', '显著降低目标移动速度。', { duration: 3, radius: 60 }), '#b4e9ee', 'triangle', [], '寒霜射手升级，提供稳定减速与穿刺火力。', 2),

  unit('fire_dragon', '火龙', '龙族', 4, 335, 2300, 181, 1.3, 245, 7, 'magic', 'heavy', 'caster', A('splash', .65, '烈焰龙息', '龙息灼烧密集敌群。', { radius: 95 }), '#d9a078', 'diamond', [], '青龙的火焰分支，强化范围清怪。', 4),
  unit('ice_dragon', '冰龙', '龙族', 4, 335, 2700, 151, 1.35, 230, 9, 'magic', 'heavy', 'control', A('slow', .42, '冰霜龙息', '减缓目标及附近敌人。', { duration: 3, radius: 85 }), '#8ccedc', 'diamond', [], '青龙的冰霜分支，兼顾控制与生命。', 4),
  unit('kelthuzad', '克尔苏加德', '亡灵', 4, 360, 1340, 210, 1.32, 290, 5, 'magic', 'medium', 'caster', A('splash', .7, '死亡凋零', '对成群敌人造成范围魔法伤害。', { radius: 100 }), '#bdafe5', 'star', ['lich_king'], '灵魂法师升级，密集怪物波的法系核心。', 3),
  unit('lich_king', '冰封巫妖', '亡灵', 4, 440, 1900, 305, 1.22, 310, 7, 'magic', 'medium', 'caster', A('chain', .65, '寒冰连锁', '法术弹射至多个敌人。', { targets: 5, radius: 140 }), '#b7d7eb', 'star', [], '进一步强化多目标法术输出。', 4),
  unit('hydra', '九头蛇', '荒漠', 4, 340, 3280, 165, 1.18, 65, 8, 'normal', 'heavy', 'tank', A('regen', 28, '多首再生', '持续恢复大量生命。'), '#9ab487', 'hex', [], '沙虫升级，耐久型前排，适合持续承伤。', 4),
  unit('mech_alchemist', '炼金机甲', '机械', 4, 335, 2350, 165, 1.1, 220, 8, 'magic', 'fortified', 'support', A('armor_break', 6, '腐蚀炮弹', '降低目标护甲。', { duration: 5 }), '#c1bd88', 'square', [], '炼金术士升级，兼顾减甲与生存。', 3),

  unit('vashj', '瓦斯琪', '深海', 5, 390, 1730, 220, 1.02, 310, 7, 'pierce', 'medium', 'ranged', A('multishot', .65, '海妖齐射', '同时攻击额外目标。', { targets: 4 }), '#81c5c8', 'star', [], '娜迦海妖升级，强化多目标穿刺输出。', 3),
  unit('guldan', '古尔丹', '兽族', 5, 380, 1810, 193, 1.15, 265, 6, 'magic', 'medium', 'support', A('aura_speed', .25, '邪能狂热', '显著提高附近友军攻击速度。', { radius: 185 }), '#b9c890', 'star', [], '萨满升级，输出型光环辅助。', 3),
  unit('thunderbird', '雷鸟', '天空', 5, 380, 2290, 205, 1.15, 265, 7, 'magic', 'light', 'caster', A('chain', .6, '雷电连锁', '攻击弹射多个目标。', { targets: 4, radius: 125 }), '#b9c6e3', 'triangle', [], '狮鹫升级，利用连锁闪电处理密集目标。', 4),
  unit('void_lord', '虚空魔王', '恶魔', 5, 410, 3500, 265, 1.08, 60, 10, 'chaos', 'heavy', 'frontline', A('lifesteal', .23, '虚空汲取', '攻击恢复造成伤害的一部分。'), '#ae91c4', 'hex', [], '灵魂守卫升级，强力混乱近战核心。', 4),

  unit('tide_queen', '潮汐女王', '深海', 6, 470, 2350, 320, 1.24, 320, 8, 'magic', 'medium', 'caster', A('splash', .8, '深海漩涡', '对大范围敌群造成魔法伤害。', { radius: 115 }), '#a4dce4', 'star', [], '艾萨拉升级，以大范围法术清理怪群。', 4),
  unit('war_ancient', '战争古树', '森林', 6, 450, 5200, 225, 1.6, 75, 14, 'normal', 'fortified', 'tank', A('thorns', .24, '远古荆棘', '反弹部分受到的近战伤害。'), '#90bc83', 'hex', [], '远古守护者升级，团队的坚固屏障。', 5),
  unit('immortal_phoenix', '不灭焰凰', '天空', 6, 480, 2800, 280, 1.0, 270, 8, 'magic', 'light', 'caster', A('revive', .5, '涅槃', '每轮首次阵亡后以部分生命复生。', { charges: 1 }), '#ebbd87', 'star', [], '凤凰升级，依靠复生维持战场输出。', 4),
  unit('infernal', '地狱火', '元素', 6, 460, 4650, 290, 1.55, 60, 13, 'chaos', 'heavy', 'tank', A('stomp', 145, '毁灭践踏', '周期造成范围伤害并击晕。', { radius: 110, cooldown: 4.8, duration: .9 }), '#a5b58b', 'square', [], '岩石傀儡升级，坚固的范围控制单位。', 5),
];

export const UNITS = [...WORKBOOK_UNITS, ...MAP_UNITS.map(u=>({...u,legacy:true,randomPool:false,isBase:false,provenance:'legacy-map-subset'})), ...LEGACY_UNITS.map(u => ({...u,legacy:true,randomPool:false,isBase:false,provenance:'legacy-web'}))];

const merc = (id, name, wood, income, unlock, hp, damage, interval, range, armor, attackType, armorType, role, ability, color, shape, description) => ({
  ...unit(id, name, '佣兵', 1, 0, hp, damage, interval, range, armor, attackType, armorType, role, ability, color, shape, [], description),
  wood, income, unlock,
});

export const LEGACY_MERCENARIES = [
  merc('merc_militia', '民兵', 20, 2, 1, 145, 13, 1.1, 30, 0, 'normal', 'medium', 'frontline', null, '#b7a27d', 'circle', '低价佣兵，用数量分散对手火力。'),
  merc('merc_archer', '雇佣弓手', 40, 4, 1, 125, 23, 1.15, 210, 0, 'pierce', 'light', 'ranged', null, '#cbb48b', 'triangle', '在系统怪后排输出。'),
  merc('merc_orc', '兽人战士', 60, 5, 1, 420, 31, 1.25, 35, 2, 'normal', 'heavy', 'tank', null, '#9fb27d', 'square', '增加敌方前线承伤压力。'),
  merc('merc_witchdoctor', '巫医', 100, 8, 1, 320, 32, 1.3, 200, 1, 'magic', 'unarmored', 'support', A('aura_heal', 5, '恢复图腾', '缓慢治疗附近同阵营怪物。', { radius: 125 }), '#b49ac0', 'diamond', '为进攻怪群提供回复。'),
  merc('merc_komodo', '科莫多', 120, 9, 3, 710, 41, 1.4, 40, 4, 'normal', 'heavy', 'support', A('aura_damage', .12, '战鼓', '提高附近怪物的伤害。', { radius: 155 }), '#b7ad8a', 'hex', '进攻伤害光环单位。'),
  // Historical 11-platform article conflicts between 160/180 wood; 180 is OUR chosen tuning value.
  merc('merc_wyvern', '飞龙', 180, 11, 4, 660, 73, 1.2, 225, 3, 'pierce', 'light', 'ranged', A('poison', 7, '毒刺', '命中后持续造成伤害。', { duration: 3 }), '#b1c39b', 'triangle', '远程穿刺佣兵，配合系统怪吸收火力。'),
  merc('merc_frostwolf', '霜狼', 240, 15, 7, 1260, 83, 1.15, 40, 5, 'normal', 'medium', 'control', A('aura_slow', .2, '霜寒光环', '降低附近敌方单位的移动与攻击速度。', { radius: 140 }), '#b3d7df', 'diamond', '削弱守军输出节奏的进攻光环。'),
  merc('merc_infernal', '深渊地狱火', 400, 22, 11, 2420, 135, 1.45, 52, 9, 'chaos', 'heavy', 'tank', A('stomp', 55, '陨火震击', '周期对周围守军造成范围伤害。', { radius: 80, cooldown: 5, duration: .5 }), '#b4ae90', 'square', '中后期高生命进攻佣兵。'),
];

export const MERCENARIES = WORKBOOK_MERCENARIES;
export const WAVES = WORKBOOK_WAVES;

export const HEROES = [
  { id: 'hero_paladin', name: '圣骑士', faction: '人类', race: '人类', cost: 280, population: 3, hp: 1500, damage: 88, interval: 1.1, range: 50, speed: 50, armor: 6, attackType: 'normal', armorType: 'heavy', role: 'support', color: '#e0c99a', shape: 'star', aura: { type: 'armor', value: 3, radius: 200 }, ability: A('aura_armor', 3, '虔诚光环', '提高附近友军护甲。', { radius: 200 }), description: '用护甲光环增强前排生存。', upgrades: [] },
  { id: 'hero_archmage', name: '大法师', faction: '奥术', race: '人类', cost: 280, population: 3, hp: 950, damage: 110, interval: 1.25, range: 270, speed: 38, armor: 3, attackType: 'magic', armorType: 'unarmored', role: 'support', color: '#b4c9e8', shape: 'star', aura: { type: 'damage', value: .16, radius: 220 }, ability: A('aura_damage', .16, '辉煌光环', '提高附近友军伤害。', { radius: 220 }), description: '为阵地提供稳定的伤害增益。', upgrades: [] },
  { id: 'hero_treelord', name: '永恒树灵', faction: '森林', race: '森林', cost: 280, population: 3, hp: 1800, damage: 70, interval: 1.4, range: 70, speed: 38, armor: 7, attackType: 'normal', armorType: 'heavy', role: 'support', color: '#a6c796', shape: 'star', aura: { type: 'heal', value: 9, radius: 200 }, ability: A('aura_heal', 9, '自然之息', '持续治疗附近友军。', { radius: 200 }), description: '适合与高生命前排组成持久防线。', upgrades: [] },
  { id: 'hero_warchief', name: '战争酋长', faction: '兽族', race: '兽族', cost: 280, population: 3, hp: 1650, damage: 105, interval: 1.15, range: 50, speed: 50, armor: 5, attackType: 'normal', armorType: 'heavy', role: 'support', color: '#c8ab89', shape: 'star', aura: { type: 'speed', value: .15, radius: 200 }, ability: A('aura_speed', .15, '战歌光环', '提高附近友军攻击速度。', { radius: 200 }), description: '为集中布置的输出部队提供攻速。', upgrades: [] },
].map(h=>({...h,legacy:true,provenance:'legacy-web-hero'}));

export const RULES = {
  workerWoodCost: 0,
  lumberLevels: MAP_ECONOMY.lumberLevels,
  workerQueueLimit: 3,
  workerTrainingSeconds: 20,
  kingAttackSpeedPerFourWaves: .1,
  kingArmorPerFourWaves: 2,
  kingUpgradeCaps: {hp:20,attack:30,regen:20},
  kingHealLockSeconds: 2,
  kingHealAmount: 10000,
  waveRewards: [11,12,13,14,16,18,20,23,26,30,35,40,45,50,55,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200,0,0,0,0,0],
  buildTimeFormula: '首波80秒；后续准备40+floor(即将开始波次/2)秒。',
  spawnInterval: .1,
  firstBuildSeconds: 80,
  title: '军团战争 · 九倍怪潮',
  version: 'web-2.0-mapref',
  provenance: '以5.0dJF默认x3静态物编与JASS配置为参考，选取24基础+25升级兵、24木怪和35波；Web九倍数量、坐标及密集战斗缩放为明确适配，不声称15A2原版。旧54兵只兼容旧存档，4英雄保留Web配置。详见REFERENCE。',
  sourceVersion: 'Legion TD 5.0dJF（默认x3；15A2未核验）',
  waveNameSources: [{url:'https://wc3maps.com/map/175858',version:'Legion TD 5.0dJF',scope:'静态地图SLK与JASS；非15A2九倍验证'}],
  initialGold: 300,
  initialWood: 97,
  initialWorkers: 1,
  initialIncome: 0,
  buildSeconds: 40,
  maxWorkers: 10,
  maxLumberLevel: 30,
  maxLumberEfficiency: 30,
  monsterMultiplier: 9,
  // Measured Web balance pass: ordinary system creeps only. Bosses and sent
  // mercenaries keep their configured HP/damage; counts remain unchanged.
  webMonsterHpScale: .25,
  webMonsterDamageScale: .20,
  webCongestionEnabled: false,
  webBalanceNotes: '普通系统怪运行生命=sourceHP×0.25、伤害=sourceDamage×0.20；特殊波/Boss与木怪不缩放。原始射程与速度×1/3进入Web数据，再由Web引擎换算。',
  waveCount: 35,
  bossMultiplier: 1,
  countFormula: '普通波每路count=历史x3参考数量×3；10/20/30和31—35特殊波直接采用referenceCount，不再倍增。',
  workerCostBase: 50,
  workerCostStep: 0,
  workerCostFormula: '每名小精灵固定50金币、0木材，训练20秒；三格招募队列为Web交互适配。',
  workerBaseWoodPerSecond: 1.5,
  lumberRateStep: .12,
  lumberUpgradeCostBase: 60,
  lumberUpgradeCostStep: 20,
  lumberUpgradeCostFormula: '使用lumberLevels逐级表：1—8级金木60+20×(目标级-1)，9—30级金木200+10×(目标级-9)；16—30级为Web延伸。',
  woodFormula: '每秒木材 = 工人数 × 1.5 × (1 + 伐木等级 × 0.12)；按模拟时间累计，倍速同时加速战斗、准备与伐木。',
  incomeBase: 22,
  incomePerWave: 8,
  incomeFormula: '每波结束金币=waveRewards[当前波-1]+永久收入；10/20/30波基础奖励翻倍，另计击杀赏金。',
  mercenaryIncomeTiming: '雇佣时增加永久income；当轮结算开始发放。',
  income: { initial: 0, base: 22, perWave: 8, cumulativeMercenaryIncome: true, cumulativeKingIncome: true, payout: 'round_end', killBounty: true },
  economyTicksDuringCombat: true,
  simulationSpeeds: [1, 2, 4],
  initialPopulation: 40,
  maxPopulation: 160,
  farmCost: 75,
  farmPopulation: 20,
  workerPopulation: 1,
  sellRatio: .8,
  upgradeCostMode: 'additional',
  upgradeFormula: '升级价格是额外费用；累计投入 = 之前累计投入 + 目标单位cost；出售返还累计投入 × sellRatio。',
  rerollCost: 25,
  rerollCount: 6,
  rerollPool: '新49个物编子集中的24个基础单位；6档各抽1种，每档4选1。旧54Web兵不再进入随机池。',
  buildGrid: { columns: 6, rows: 8, cellSize: 40 },
  laneCount: 4,
  teamSize: 4,
  heroLimit: 1,
  kingInitialHp: 12000,
  kingDamage: 135,
  kingInterval: .85,
  kingRange: 250,
  kingArmor: 8,
  kingUpgradeCost: 80,
  kingHpPerUpgrade: 1200,
  kingDamagePerUpgrade: 10,
  kingRegenPerUpgrade: 5,
  kingUpgradeMax: 30,
  kingHealCharges: 4,
  kingIncome: 3,
  interfereCooldown: 5,
  kingLeakDamageFormula: '漏怪进入王区继续战斗，由国王与幸存守军阻击；国王生命归零判负。',
  armorReductionConstant: .06,
  armorFormula: '正护甲伤害倍率 = 1 / (1 + 0.06 × 护甲)；类型克制倍率另乘。',
  attackMultipliers: {
    normal: { light: .90, medium: 1.20, heavy: .90, fortified: .80, unarmored: 1, hero: .90 },
    pierce: { light: 1.30, medium: .90, heavy: .80, fortified: .70, unarmored: 1, hero: .90 },
    magic: { light: 1.10, medium: .80, heavy: 1.20, fortified: .70, unarmored: 1, hero: .90 },
    siege: { light: .90, medium: .90, heavy: .90, fortified: 1.25, unarmored: 1, hero: .90 },
    chaos: { light: 1, medium: 1, heavy: 1, fortified: 1, unarmored: 1, hero: 1 },
    hero: { light: 1, medium: 1, heavy: 1, fortified: 1, unarmored: 1, hero: 1 },
  },
  abilityStacking: '同名同类型光环取最高值；不同类型光环并存。持续伤害同源刷新持续时间。',
  victory: '对方国王生命归零获胜；第35波后双方国王存活则比较国王剩余生命比例，相同则比较总兵力，再相同判平局。',
  ...DOCUMENT_RULES,
  dataRevision: WORKBOOK_REFERENCE.dataRevision,
  ggEnabled: true,
  webFrenzyEnabled: false,
  interfereEnabled: false,
  webKingSplashEnabled: false,
  victory: '击倒敌方国王获胜；31—35连续进攻，35最终首领持续复活，不按生命比例提前判胜。',
  ggDefaultSource: 'war3map.j:12930-12936默认TriggerExecute(AR)，16799-16801注册Xs，12546-12550将Wo=true。',
  rerollPool: '先知六阶×15候选；其他建造者使用各自基础兵与完整升级链。',
  heroSourcePolicy: '原图10种英雄通过祭坛及各自11阶段升级链；旧4名Web英雄仅兼容历史存档。',
};
