/*
 * Legion Ninefold — standalone Web tuning data, 2026-10-19.
 * Names and strategic roles evoke classic Legion TD. All numerical values,
 * upgrade paths, abilities and wave arrangements below are authored for this
 * Web prototype. They are NOT extracted or verified values from 11 平台 15A2.
 * In particular baseCount is OUR Web wave baseline; it is not an HP/X6 baseline.
 */

const A = (type, value, name, description, extra = {}) => ({ type, value, name, description, ...extra });
const unit = (id, name, race, tier, cost, hp, damage, interval, range, armor, attackType, armorType, role, ability, color, shape, upgrades, description, population = 1, randomPool = false) => ({
  id, name, race, tier, cost, hp, damage, interval, range, speed: range > 100 ? 34 : 52,
  armor, attackType, armorType, role, ability, color, shape, upgrades, description,
  population, randomPool, isBase: randomPool,
});

export const UNITS = [
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

const merc = (id, name, wood, income, unlock, hp, damage, interval, range, armor, attackType, armorType, role, ability, color, shape, description) => ({
  ...unit(id, name, '佣兵', 1, 0, hp, damage, interval, range, armor, attackType, armorType, role, ability, color, shape, [], description),
  wood, income, unlock,
});

export const MERCENARIES = [
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

// baseline counts are per lane and belong only to this Web implementation.
// Boss waves use bossCount directly and do not multiply bosses by nine.
// Historical wave names: HighestIncome's Legion TD Mega 3.41 community guide,
// 2013-07-16 (edited 2013-08-16), "Thirteenth Sector, Creeps/Levels":
// https://legiontd.forumotion.com/t429-legion-td-mega-book-overall-strategical-guide-3-41
// Chinese names 1/4/7/10/14/17/20 also appear in the 2018 Chinese X6 guide:
// https://jingyan.baidu.com/article/c35dbcb0a2b2758916fcbcc8.html
// The actual 15A2 wave list remains unverified. Combat stats below stay Web tuning.
// Waves 32-35 extend the classic wave-31 Legion Lord theme for this Web prototype.
const waveSpecs = [
  ['螃蟹', 4, 105, 12, 0, 48, 30, 'normal', 'medium', 2, '#b4a27c', 'circle'],
  ['鱼人', 4, 145, 15, 0, 51, 35, 'normal', 'light', 2, '#bba583', 'triangle'],
  ['蝎子', 5, 165, 19, 1, 54, 165, 'pierce', 'light', 2, '#99ad85', 'diamond'],
  ['豪猪', 4, 260, 25, 2, 42, 38, 'normal', 'heavy', 3, '#b3a08a', 'square'],
  ['鹰', 5, 235, 27, 1, 61, 180, 'magic', 'unarmored', 3, '#ac9ac0', 'triangle'],
  ['岩石傀儡', 5, 310, 33, 2, 47, 205, 'pierce', 'medium', 3, '#9bbbc9', 'diamond'],
  ['赛特斯', 6, 320, 38, 2, 73, 32, 'normal', 'light', 3, '#bcc4c5', 'triangle'],
  ['侍僧', 4, 540, 47, 5, 36, 40, 'normal', 'fortified', 4, '#abaea8', 'square'],
  ['僵尸', 6, 425, 43, 3, 55, 185, 'pierce', 'medium', 4, '#8db8bd', 'diamond'],
  ['达拉内尔酋长', 0, 4200, 94, 7, 35, 65, 'chaos', 'heavy', 70, '#d1b788', 'hex'],
  ['发条地精', 5, 620, 56, 3, 49, 230, 'magic', 'unarmored', 4, '#c7a58e', 'diamond'],
  ['海妖', 6, 700, 62, 4, 61, 40, 'normal', 'heavy', 4, '#b5a38c', 'square'],
  ['羽蛇', 5, 740, 67, 3, 54, 210, 'magic', 'light', 5, '#afa6c7', 'circle'],
  ['图斯卡尔战士', 6, 790, 74, 4, 58, 240, 'pierce', 'medium', 5, '#9fb58b', 'triangle'],
  ['半人马', 5, 1120, 88, 7, 37, 45, 'normal', 'heavy', 5, '#a6a18f', 'hex'],
  ['火蜥蜴', 6, 1020, 86, 5, 51, 40, 'normal', 'medium', 5, '#a2b187', 'circle'],
  ['血肉傀儡', 6, 1060, 91, 5, 57, 220, 'magic', 'light', 5, '#a8ccd7', 'diamond'],
  ['淤泥投掷者', 7, 1100, 97, 5, 53, 250, 'pierce', 'light', 6, '#aa9fbc', 'triangle'],
  ['巨型蜘蛛', 5, 1540, 111, 10, 39, 48, 'normal', 'fortified', 6, '#b4b5ad', 'square'],
  ['玄武龙龟', 0, 10300, 185, 12, 35, 68, 'chaos', 'heavy', 130, '#b49dba', 'hex'],
  ['角鹰兽', 7, 1360, 111, 6, 71, 180, 'pierce', 'light', 6, '#c1c3cd', 'triangle'],
  ['猛犸', 6, 1710, 124, 9, 45, 45, 'normal', 'heavy', 6, '#cfab8f', 'square'],
  ['枭兽', 6, 1630, 128, 6, 51, 245, 'magic', 'unarmored', 6, '#b9acc9', 'diamond'],
  ['亡魂', 7, 1690, 134, 7, 59, 170, 'pierce', 'medium', 7, '#bdb58c', 'circle'],
  ['魅魔', 6, 2090, 149, 9, 54, 45, 'normal', 'heavy', 7, '#c2d4d8', 'hex'],
  ['娜迦战士', 7, 1980, 146, 7, 65, 40, 'chaos', 'medium', 7, '#aa9dbf', 'diamond'],
  ['末日守卫', 7, 2110, 153, 8, 48, 220, 'magic', 'unarmored', 7, '#b2ba8d', 'circle'],
  ['主宰', 6, 2590, 174, 13, 35, 55, 'normal', 'fortified', 8, '#b9c1c0', 'square'],
  ['冰霜巨龙', 8, 2160, 166, 8, 61, 265, 'pierce', 'light', 8, '#a8a3bb', 'triangle'],
  ['玛格纳托', 0, 18900, 280, 17, 34, 75, 'chaos', 'heavy', 210, '#c6aba1', 'star'],
  ['军团领主', 7, 2810, 187, 11, 49, 220, 'magic', 'heavy', 8, '#abcbd9', 'diamond'],
  ['军团领主', 8, 2690, 185, 10, 60, 195, 'pierce', 'medium', 8, '#96bcc1', 'hex'],
  ['军团领主', 8, 3060, 205, 11, 58, 48, 'chaos', 'medium', 9, '#b7a5c4', 'square'],
  ['军团领主', 8, 3360, 218, 12, 56, 240, 'magic', 'heavy', 9, '#c8c0ab', 'diamond'],
  ['军团领主', 0, 28500, 375, 21, 32, 85, 'chaos', 'fortified', 320, '#e0c69d', 'star'],
];

export const WAVES = waveSpecs.map((s, i) => {
  const [name, countClass, hp, damage, armor, speed, range, attackType, armorType, bounty, color, shape] = s;
  // Web first-wave baseline is deliberately 12 (108 in ninefold), an unverified
  // reconstruction assumption. This is not a derived or verified 15A2/X6 rule.
  const baseCount = countClass === 0 ? 0 : Math.max(12, countClass * 2);
  const id = i + 1;
  const boss = baseCount === 0;
  let ability = null;
  if ([3, 16, 27].includes(id)) ability = A('poison', 3 + Math.floor(id / 4), '毒素', '命中造成持续伤害。', { duration: 3 });
  if ([5, 11, 23, 34].includes(id)) ability = A('splash', .22, '范围冲击', '攻击附带小范围伤害。', { radius: 48 });
  if ([7, 12, 25].includes(id)) ability = A('crit', 1.6, '狂暴', '攻击有概率造成额外伤害。', { chance: .15 });
  if ([17, 31].includes(id)) ability = A('slow', .18, '寒霜', '命中后减速。', { duration: 2 });
  if (boss) ability = A('stomp', 40 + id * 3, '王者震击', '周期震击周围守军。', { radius: 90, cooldown: 6, duration: .5 });
  return { id, name, baseCount, hp, damage, armor, speed, range, attackType, armorType, bounty, boss, bossCount: boss ? (id === 35 ? 3 : 2) : 0, color, shape, ability, interval: boss ? 1.45 : 1.25, count: boss ? (id === 35 ? 3 : 2) : baseCount * 9 };
});

export const HEROES = [
  { id: 'hero_paladin', name: '圣骑士', faction: '人类', race: '人类', cost: 280, population: 3, hp: 1500, damage: 88, interval: 1.1, range: 50, speed: 50, armor: 6, attackType: 'normal', armorType: 'heavy', role: 'support', color: '#e0c99a', shape: 'star', aura: { type: 'armor', value: 3, radius: 200 }, ability: A('aura_armor', 3, '虔诚光环', '提高附近友军护甲。', { radius: 200 }), description: '用护甲光环增强前排生存。', upgrades: [] },
  { id: 'hero_archmage', name: '大法师', faction: '奥术', race: '人类', cost: 280, population: 3, hp: 950, damage: 110, interval: 1.25, range: 270, speed: 38, armor: 3, attackType: 'magic', armorType: 'unarmored', role: 'support', color: '#b4c9e8', shape: 'star', aura: { type: 'damage', value: .16, radius: 220 }, ability: A('aura_damage', .16, '辉煌光环', '提高附近友军伤害。', { radius: 220 }), description: '为阵地提供稳定的伤害增益。', upgrades: [] },
  { id: 'hero_treelord', name: '永恒树灵', faction: '森林', race: '森林', cost: 280, population: 3, hp: 1800, damage: 70, interval: 1.4, range: 70, speed: 38, armor: 7, attackType: 'normal', armorType: 'heavy', role: 'support', color: '#a6c796', shape: 'star', aura: { type: 'heal', value: 9, radius: 200 }, ability: A('aura_heal', 9, '自然之息', '持续治疗附近友军。', { radius: 200 }), description: '适合与高生命前排组成持久防线。', upgrades: [] },
  { id: 'hero_warchief', name: '战争酋长', faction: '兽族', race: '兽族', cost: 280, population: 3, hp: 1650, damage: 105, interval: 1.15, range: 50, speed: 50, armor: 5, attackType: 'normal', armorType: 'heavy', role: 'support', color: '#c8ab89', shape: 'star', aura: { type: 'speed', value: .15, radius: 200 }, ability: A('aura_speed', .15, '战歌光环', '提高附近友军攻击速度。', { radius: 200 }), description: '为集中布置的输出部队提供攻速。', upgrades: [] },
];

export const RULES = {
  title: '军团战争 · 九倍怪潮',
  version: 'web-1.0',
  provenance: '独立 Web 玩法复刻调校配置。兵种名称与战略角色参考经典军团玩法；全部价格、属性、升级关系、技能、经济、波次及九倍基数为本项目设计值，未经11平台15A2地图数据验证，不声称等同原版。首波Web基数12、九倍108只属于复刻假设，不能据此认定原版X9等于X6的1.5倍。历史攻略飞龙160/180木互有冲突，本Web版本选择180。波名参考2013年Legion TD Mega 3.41社区攻略，部分中文名参考2016/2018年中文攻略；攻击护甲仍为Web调校类型，历史版本资料相互有差异。31—35波沿用历史军团领主形象并进行Web延长。历史来源见交付研究文档。',
  sourceVersion: '15A2（用户记忆版本，未核验）',
  waveNameSources: [
    { url: 'https://legiontd.forumotion.com/t429-legion-td-mega-book-overall-strategical-guide-3-41', date: '2013-07-16', version: 'Legion TD Mega 3.41', scope: '1—31波英文名；中文名称部分为本项目译名，不作为15A2原文名称' },
    { url: 'https://jingyan.baidu.com/article/c35dbcb0a2b2758916fcbcc8.html', date: '2018-03-19', version: '军团战争5 X6', scope: '1、4、7、10、14、17、20波中文名' },
    { url: 'https://jingyan.baidu.com/article/22a299b5cd8fa59e19376aa2.html', date: '2016-06-28', version: '草木皆兵4.2等历史版本', scope: '提及11平台；前几波护甲及20波龙龟重甲，仅历史参考' },
  ],
  initialGold: 350,
  initialWood: 0,
  initialWorkers: 1,
  initialIncome: 0,
  buildSeconds: 30,
  maxWorkers: 7,
  maxLumberLevel: 30,
  maxLumberEfficiency: 30,
  monsterMultiplier: 9,
  // Measured Web balance pass: ordinary system creeps only. Bosses and sent
  // mercenaries keep their configured HP/damage; counts remain unchanged.
  webMonsterHpScale: .25,
  webMonsterDamageScale: .20,
  webCongestionEnabled: false,
  webBalanceNotes: '仅普通系统怪实际生命=波表hp×0.25、伤害=波表damage×0.20；Boss与木怪不缩放，怪物数量不变。默认不模拟人造130拥挤增益。',
  waveCount: 35,
  bossMultiplier: 1,
  countFormula: '普通波每路怪数 = 本项目 Web baseCount × 9；Boss 波怪数 = bossCount，Boss 不乘9。',
  workerCostBase: 50,
  workerCostStep: 25,
  workerCostFormula: '购买下一名工人费用 = workerCostBase + (当前工人数 - 1) × workerCostStep。',
  workerBaseWoodPerSecond: 1.5,
  lumberRateStep: .12,
  lumberUpgradeCostBase: 70,
  lumberUpgradeCostStep: 20,
  lumberUpgradeCostFormula: '伐木升级费用 = lumberUpgradeCostBase + 当前伐木等级 × lumberUpgradeCostStep。',
  woodFormula: '每秒木材 = 工人数 × 1.5 × (1 + 伐木等级 × 0.12)；按模拟时间累计，倍速同时加速战斗、准备与伐木。',
  incomeBase: 22,
  incomePerWave: 8,
  incomeFormula: '每轮结束金币 = 22 + 当前波次 × 8 + 玩家永久收入；另加实际击杀赏金。雇佣佣兵立即消耗wood并增加该佣兵income；每次强化国王再永久增加kingIncome=3。',
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
  rerollPool: 'UNITS中randomPool=true的基础单位；从tier 1至6各随机抽取1种，升级单位不可直接抽取。',
  buildGrid: { columns: 6, rows: 8, cellSize: 40 },
  laneCount: 4,
  teamSize: 4,
  heroLimit: 1,
  kingInitialHp: 12000,
  kingDamage: 135,
  kingInterval: .85,
  kingRange: 250,
  kingArmor: 8,
  kingUpgradeCost: 180,
  kingHpPerUpgrade: 1200,
  kingDamagePerUpgrade: 18,
  kingRegenPerUpgrade: 3,
  kingUpgradeMax: 15,
  kingHealCharges: 4,
  kingIncome: 3,
  interfereCooldown: 5,
  kingHealFraction: .3,
  kingLeakDamageFormula: '漏怪进入王区继续战斗，由国王与幸存守军阻击；国王生命归零判负。',
  armorReductionConstant: .06,
  armorFormula: '正护甲伤害倍率 = 1 / (1 + 0.06 × 护甲)；类型克制倍率另乘。',
  attackMultipliers: {
    normal: { light: 1, medium: 1.25, heavy: .85, fortified: .7, unarmored: 1 },
    pierce: { light: 1.35, medium: .9, heavy: .8, fortified: .65, unarmored: 1.1 },
    magic: { light: 1, medium: .85, heavy: 1.35, fortified: .75, unarmored: 1.1 },
    chaos: { light: 1, medium: 1, heavy: 1, fortified: 1, unarmored: 1 },
  },
  abilityStacking: '同名同类型光环取最高值；不同类型光环并存。持续伤害同源刷新持续时间。',
  victory: '对方国王生命归零获胜；第35波后双方国王存活则比较国王剩余生命比例，相同则比较总兵力，再相同判平局。',
};
