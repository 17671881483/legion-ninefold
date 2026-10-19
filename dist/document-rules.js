/* Gameplay values transcribed from the 5.0dJF workbook and its cited map files.
 * Static object fields and Web interpretations are kept separate below.
 * Do not replace missing source fields with an invented verified value.
 */
const basicRequirements = [600, 1200, 1200, 1200, 1600, 1600, 1600, 2000];
const lumberLevels = Array.from({ length: 15 }, (_, index) => {
  const level = index + 1, advanced = level > 8, sourceLevel = advanced ? level - 8 : level;
  return {
    level, gold: advanced ? 200 + 10 * (sourceLevel - 1) : 60 + 20 * (sourceLevel - 1),
    wood: advanced ? 200 + 10 * (sourceLevel - 1) : 60 + 20 * (sourceLevel - 1),
    duration: advanced ? 35 : 18 + 2 * (sourceLevel - 1),
    sourceUpgrade: advanced ? 'R00H' : 'R003', sourceLevel, extended: false,
    militaryRequirement: advanced ? (sourceLevel <= 2 ? 2000 : null) : basicRequirements[index],
  };
});

export const DOCUMENT_ECONOMY = {
  sourceWorkerRawcode: 'e003', sourceTownHallRawcode: 'h023',
  sourceMaxWorkers: 7, targetMaxWorkers: 7,
  sourceMaxLumberLevel: 15, targetMaxLumberLevel: 15,
  worker: { gold: 50, wood: 0, duration: 20, queueLimit: 3, militaryRequirement: 350 },
  lumberLevels,
  gathering: {
    sourceAbility: 'A09C', nativeCode: 'Awha', cycleSeconds: 10, basePayload: 2,
    basicUpgrade: { rawcode: 'R003', maxLevel: 8, payloadPerLevel: 1 },
    advancedUpgrade: { rawcode: 'R00H', maxLevel: 7, payloadPerLevel: 2 },
    policy: '物编数值的Web采集映射：每10秒每工人采集量2+基础科技等级+2×高级科技等级折算连续平均产出；未在魔兽引擎实测。反作弊Ku并非采集定时器。',
  },
  militaryRequirements: {
    worker: 350, basic: basicRequirements,
    advancedRaw: { Requirescount: 2, Requires: 'u00S', Requires1: 'u00S', Requires3: 'u00Y' },
    advancedPolicy: '前两级明确u00S（2000）；第3—7级Requirements继承未验证，保持null；孤立Requires3=u00Y（4800）保留为配置异常，不据此阻塞升级。',
    source: 'neutralupgradestrings.txt:R003/R00H; campaignunitfunc.txt:e003; war3map.j:13824-13912',
  },
  queuePolicy: '三格训练队列为Web交互容量；原图h023使用Trains=e003，e003的stockMax=3不能直接证明训练队列容量。',
  sourcePolicy: '本版以工作簿5.0dJF为准，取消之前10工人/30科技和16—30级延伸。',
};

export const DOCUMENT_RULES = {
  frostAttackSpeedDecrease: .1, frostMoveSpeedDecrease: .1,
  frostDecreaseSource: 'war3mapMisc.txt:30-31 FrostAttackSpeedDecrease/FrostMoveSpeedDecrease',
  title: '军团战争 · 5.0dJF 三倍', version: 'web-3.0-workbook',
  sourceVersion: 'Legion TD 5.0dJF（默认x3）', defaultModes: ['AP', 'HG', 'GG', 'MM', 'LI', 'CB', 'X3'],
  defaultMode: 3, monsterMultiplier: 3,
  maxWorkers: 7, maxLumberLevel: 15, maxLumberEfficiency: 15,
  initialGold: 300, initialWood: 97, initialWorkers: 1, initialIncome: 0,
  workerCostBase: 50, workerCostStep: 0, workerWoodCost: 0, workerTrainingSeconds: 20,
  workerQueueLimit: 3, workerMilitaryRequirement: 350, workerPopulation: 1,
  lumberLevels, workerBaseWoodPerSecond: .2,
  gatheringCycleSeconds: 10, lumberBasePayload: 2,
  lumberBasicPayloadPerLevel: 1, lumberAdvancedPayloadPerLevel: 2,
  lumberBasicLevelCap: 8,
  woodFormula: '物编映射：每秒连续平均木材=工人数×(2+min(科技等级,8)+2×max(科技等级-8,0))/10；未在魔兽引擎实测。',
  workerCostFormula: '每名小精灵50金、0木、20秒；军力350解锁，上限7。',
  lumberUpgradeCostFormula: '目标1—8级金木60+20×(等级-1)，耗时18+2×(等级-1)秒；9—15级金木200+10×(等级-9)，耗时35秒。',
  sellRatio: .5, sellNewBuildRatio: 1, sellSpecialRatios: { h06K: .75, h06L: .75, h07Q: .9, h07R: .9 },
  sellSourcePolicy: 'A008按建筑points向下取整返金；本轮新建Me组100%、奴仆/苦工75%、螯虾两阶段90%、其余50%，无木材返还。',
  rerollCost: 0, rerollCount: 5, rerollCosts: [0, 100, 200, 300, 400],
  builderChangeGoldCosts: [0, 50, 100, 150, 200], builderChangeWoodCosts: [100, 200, 300, 400, 500],
  rerollSourcePolicy: 'R00G/R00D未配置基础金价等字段按Web明确缺省0映射；原字段缺失不视为已实测免费。预言5次；换族5次，换后随机两个可选种族。',
  heroLimit: 1, heroMilitaryRequirement: 350, heroAltarBuildSeconds: 1,
  initialPopulation: 15, maxPopulation: 300,
  initialPopulationSource: '预置h023主城7人口＋h024农场8人口；war3map.j:3410-3450及单位fmade。',
  farmCost: 24, farmWoodCost: 80, farmTrainingSeconds: 5, farmPopulation: 8,
  spawnInterval: .1, firstBuildSeconds: 80, buildSeconds: 40, waveCount: 35,
  countFormula: '每有效玩家位直接采用工作簿35波主配置Fv[L]，首波36只，10/20/30波各3只；不再额外乘3或9。',
  buildTimeFormula: '首波80秒；常规准备40+floor(即将开始波次/2)秒；10/20后30秒竞技准备；31前60秒；31—34后50秒；35停止下一波。',
  arenaAfterWaves: [10, 20], arenaPreparationSeconds: 30,
  arenaBattleLimitSeconds: 120, arenaWinnerGoldPerWave: 10, arenaDrawGoldPerWave: 5,
  arenaAfterBattleSeconds: 20, arenaNextPreparationSeconds: 30,
  overtimeStartWave: 31, overtimePreparationSeconds: 60, overtimeWaveInterval: 50,
  webMonsterHpScale: 1, webMonsterDamageScale: 1,
  webBalanceNotes: '取消此前Web普通怪25%生命/20%伤害缩放；属性采用工作簿物编值。坐标、射程及移动速度统一保留Web距离换算。',
  kingInitialHp: 5000, kingDamage: 60, kingInterval: .9, kingRange: 715 / 3,
  kingArmor: 5, kingRegen: 3, kingMoveSpeed: 250 / 3, kingMoveUnlockWave: 31,
  kingMoveSource: 'war3map.j:6645→16718-16719→11865-11868发unroot；A051包含A052(Aroo)，h00K spd=250；控制归属选择与5秒锁见11641-11678/16678-16705。',
  kingUpgradeCost: 80, kingDamagePerUpgrade: 10, kingRegenPerUpgrade: 5,
  kingHpPerUpgrade: 450, kingHpUpgradeIncrements: Array.from({ length: 20 }, (_, index) => 450 + 25 * index),
  kingHpUpgradeMappingPolicy: '依据A05P Add/Set/Remove永久生命技巧，在Web显式映射为逐级450—925生命增量；这是静态配置映射，非魔兽引擎实测。',
  kingUpgradeCaps: { hp: 20, attack: 30, regen: 20 },
  leakBountyEnabled: true, leakBountyThreshold: .1, leakBountyPenaltyDivisor: 150,
  leakBountySourcePolicy: '开波固定Rr=max阈值处理(Bo/rr-co/150)：>=1取1、>=0.1取原值、<0.1取0。co全局累计，仅1—29普通系统怪进入中路加1并获A07D；木怪/BOSS不折扣，31起无击杀赏金。GG关闭分支原脚本索引有误，Web按预期为0。',
  kingIncome: 3, kingHealCharges: 4, kingHealAmount: 10000, kingHealLockSeconds: 2,
  kingAttackSpeedPerFourWaves: .1, kingArmorPerFourWaves: 2,
  kingInitialSource: 'h00K裸HP2600、伤害30+1d11均值36；4v4平衡eq给每王6×I002(+400HP)和6×I003(+4攻)，得到5000HP/均伤60。',
  kingHpUpgradeSourceValues: [null, -450, -475, -500, -525, -550, -575, -600, -625, -650, -675, -700, -725, -750, -775, -800, -825, -850, -875, -900, -925],
  kingHpUpgradeSourcePolicy: 'A05P级1字段缺失；脚本Add→SetLevel(R000+1)→Remove。此表保留原始负值，永久生命结果不是静态引擎实测。',
  provenance: '以《军团战争5.0dJF_兵种怪物技能数据.xlsx》及其SLK/TXT/W3A/JASS证据为准；默认三倍、7工人、15科技，非15A2九倍验证。原始字段、脚本冲突和Web运行映射分别保留。',
};
