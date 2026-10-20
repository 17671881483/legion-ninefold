// v14.1A5 document audit: recipeSources in the corrected workbook.
// Raw source predicates remain explicit; appearance records are never consumed materials.
export const EGG_REQUIREMENTS = Object.freeze({
  "R00M": {
    "text": "曾完成骑士和满级圣骑士；或曾完成满级圣骑士的对应外观记录。另有老兵历练替代触发，完整条件待确认",
    "status": "unconfirmed",
    "sourceLines": [
      28879,
      28885,
      22195,
      22197,
      22205,
      22207
    ]
  },
  "R00S": {
    "text": "曾完成过时光之树；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28855
    ],
    "groups": [
      [
        "h01J"
      ]
    ]
  },
  "R0DU": {
    "text": "曾完成过电枪兵和自动机炮；完成记录保留，不要求两者持续在场",
    "status": "confirmed",
    "sourceLines": [
      28604,
      28609
    ],
    "groups": [
      [
        "h00X",
        "h0AA"
      ]
    ]
  },
  "R08G": {
    "text": "曾完成过以下任一组：巨魔头领＋巨熊；或巨熊（外观形态记录）＋豺狼人；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28932
    ],
    "groups": [
      [
        "h017",
        "h019"
      ],
      [
        "h0RZ",
        "h100"
      ]
    ]
  },
  "R09D": {
    "text": "曾完成过以下任一组：丛林守护者 - 血神枯萎者（满级）；或丛林守护者（满级）＋生命树＋火龙；或灾炎之龙（外观形态记录）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28634
    ],
    "groups": [
      [
        "n03J"
      ],
      [
        "h0F6",
        "h01N",
        "h01B"
      ],
      [
        "h11B"
      ],
      [
        "h0R8"
      ]
    ]
  },
  "R00V": {
    "text": "曾完成过以下任一组：黑暗游侠-X女战警（满级）；或黑暗游侠（满级）＋战车；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28808
    ],
    "groups": [
      [
        "n014"
      ],
      [
        "h0E8",
        "h0CP"
      ]
    ]
  },
  "R00W": {
    "text": "曾完成过以下任一组：黑暗游侠-X女战警（满级）；或黑暗游侠（满级）＋神射手（外观形态记录）；或精英弓箭手；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28823
    ],
    "groups": [
      [
        "n014"
      ],
      [
        "h0E8",
        "h19M"
      ],
      [
        "h09M"
      ]
    ]
  },
  "R00U": {
    "text": "曾完成过以下任一组：黑暗游侠-X女战警（满级）；或黑暗游侠（满级）＋女巫；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28829
    ],
    "groups": [
      [
        "n014"
      ],
      [
        "h0E8",
        "h08Y"
      ]
    ]
  },
  "R0GL": {
    "text": "曾完成过以下任一组：暗夜魔王 - 恐惧魔王（1级）；或暗夜魔王（11级）＋先行者；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28598
    ],
    "groups": [
      [
        "h0ME"
      ],
      [
        "h0GO",
        "h01W"
      ]
    ]
  },
  "R00O": {
    "text": "曾完成过以下任一组：末日法师；或末日守护者（外观形态记录）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28878
    ],
    "groups": [
      [
        "h060"
      ],
      [
        "h160"
      ]
    ]
  },
  "R03D": {
    "text": "完成沸血狼骑士时具有超级赞助资格；或曾完成沸血狼骑士和沸血兽人战士后具有军团战争荣誉资格",
    "status": "confirmed",
    "sourceLines": [
      28812,
      28823
    ]
  },
  "R02Q": {
    "text": "曾完成过以下任一组：剑圣·斩；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28803
    ],
    "groups": [
      [
        "n047"
      ],
      [
        "n03W"
      ],
      [
        "n06D"
      ]
    ]
  },
  "R00R": {
    "text": "曾完成过火龙、青龙、冰霜骨龙三类中的任意两类；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28857,
      28866
    ]
  },
  "R00X": {
    "text": "曾完成过以下任一组：蛇发女妖（11级）；或蛇发女妖 -银鳞魔女（11级）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28909
    ],
    "groups": [
      [
        "h0H4"
      ],
      [
        "n01F"
      ]
    ]
  },
  "R00N": {
    "text": "第一波结束判定前累计完成至少5只角鹰；达到后保留解锁记录",
    "status": "confirmed",
    "sourceLines": [
      28867,
      28868,
      19404,
      19408,
      19432,
      19438
    ]
  },
  "R07M": {
    "text": "曾完成过电锯王（含对应外观）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28625,
      28627
    ],
    "groups": [
      [
        "h00W"
      ],
      [
        "h0OH"
      ]
    ]
  },
  "R07N": {
    "text": "曾完成过满级英雄牛头人酋长（含对应外观）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28628,
      28630
    ],
    "groups": [
      [
        "hA0B"
      ],
      [
        "n03S"
      ],
      [
        "n08X"
      ]
    ]
  },
  "R0FM": {
    "text": "曾完成过以下任一组：骑士＋牛头人酋长（满级，对应外观记录）；或牛头人酋长（满级）；或传承护甲-牛头人酋长（满级，外观记录）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28586
    ],
    "groups": [
      [
        "h09U",
        "n03S"
      ],
      [
        "hA0B"
      ],
      [
        "n08X"
      ]
    ]
  },
  "R010": {
    "text": "曾完成过以下任一组：生命树＋丛林守护者（满级）；或丛林守护者 - 血神枯萎者（满级）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28842
    ],
    "groups": [
      [
        "h01N",
        "h0F6"
      ],
      [
        "n03J"
      ]
    ]
  },
  "R2YA": {
    "text": "曾完成过以下任一组：智慧树＋丛林守护者（满级）；或丛林守护者 - 血神枯萎者（满级）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28640
    ],
    "groups": [
      [
        "h01O",
        "h0F6"
      ],
      [
        "n03J"
      ]
    ]
  },
  "R0GG": {
    "text": "曾完成过以下任一组：月之女祭司（满级）；或月之女祭司 -麒麟使者（满级）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28776
    ],
    "groups": [
      [
        "h0FL"
      ],
      [
        "n01Q"
      ]
    ]
  },
  "R01X": {
    "text": "曾完成过以下任一组：骑士＋圣骑士（满级）；或圣骑士 -全能骑士（满级）＋近卫兵；或永生近卫军（外观形态记录）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28848
    ],
    "groups": [
      [
        "h09U",
        "h0J3"
      ],
      [
        "n02I",
        "h09O"
      ],
      [
        "h19O"
      ]
    ]
  },
  "R0CW": {
    "text": "曾完成过上将；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28575
    ],
    "groups": [
      [
        "h00Z"
      ]
    ]
  },
  "R0EA": {
    "text": "曾完成过以下任一组：中子＋圣龙；或圣龙（外观形态记录）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28553
    ],
    "groups": [
      [
        "h041",
        "h201"
      ],
      [
        "h204"
      ]
    ]
  },
  "R0AJ": {
    "text": "曾完成过以下任一组：地狱咆哮（满级）；或地狱咆哮 -嗜血战魂（满级）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28578
    ],
    "groups": [
      [
        "hh02"
      ],
      [
        "n02F"
      ]
    ]
  },
  "R0AK": {
    "text": "曾完成过兽王萨尔（霜狼杜隆坦）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28581
    ],
    "groups": [
      [
        "h1CC"
      ]
    ]
  },
  "R00L": {
    "text": "兽王萨尔（霜狼杜隆坦）击杀解锁：原说明要求166次；脚本累计到101即授予，且触发分支有差异，精确路径待确认",
    "status": "unconfirmed",
    "sourceLines": [
      19203,
      19210,
      28852,
      28853
    ]
  },
  "R0BQ": {
    "text": "曾完成过阎王＋死神信使；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28914
    ],
    "groups": [
      [
        "h022",
        "h0CV"
      ]
    ]
  },
  "R0AL": {
    "text": "曾完成过以下任一组：冰之女神；或水晶室女（外观形态记录）；或邪恶女巫（外观形态记录）；或邪霜女巫（外观形态记录）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28611
    ],
    "groups": [
      [
        "h202"
      ],
      [
        "h0LW"
      ],
      [
        "h0Q6"
      ],
      [
        "h0P8"
      ]
    ]
  },
  "R0AM": {
    "text": "曾完成过安东尼达斯；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28614
    ],
    "groups": [
      [
        "n04A"
      ]
    ]
  },
  "R0BS": {
    "text": "曾完成过以下任一组：虚空魔王（外观形态记录）；或虚空魔王＋魔灵；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28592
    ],
    "groups": [
      [
        "h0PA"
      ],
      [
        "h0S2",
        "h0S6"
      ]
    ]
  },
  "R08F": {
    "text": "曾完成过青铜龙守卫＋圣龙；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28920
    ],
    "groups": [
      [
        "h0QP",
        "h201"
      ]
    ]
  },
  "R00P": {
    "text": "完成记录满足：沙丘之虫完成数－翼族猎手完成数≥10，且翼族猎手完成数≥10；达到后保留解锁记录",
    "status": "confirmed",
    "sourceLines": [
      28899,
      28907
    ]
  },
  "R06U": {
    "text": "曾完成过以下任一组：青龙；或青龙（外观形态记录）＋冰霜骨龙＋火龙；或灾炎之龙（外观形态记录）；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28646
    ],
    "groups": [
      [
        "h0BP"
      ],
      [
        "n05M",
        "h0D2",
        "h01B"
      ],
      [
        "h11B"
      ],
      [
        "h0R8"
      ]
    ]
  },
  "R0BR": {
    "text": "首次解锁时场上至少有5个木乃伊；达到后保留解锁记录",
    "status": "confirmed",
    "sourceLines": [
      28556,
      28562
    ]
  },
  "R2Z0": {
    "text": "曾完成过发条地精和地精伐木机；完成记录保留",
    "status": "confirmed",
    "sourceLines": [
      28796,
      28800
    ],
    "groups": [
      [
        "h0AF",
        "h0AO"
      ]
    ]
  }
});
export const DOCUMENT_EGG_TARGETS = Object.freeze([
  {
    "rawcode": "h203",
    "status": "unconfirmed"
  },
  {
    "rawcode": "h1S2",
    "status": "confirmed"
  },
  {
    "rawcode": "h1S4",
    "status": "confirmed"
  },
  {
    "rawcode": "n07R",
    "status": "confirmed"
  },
  {
    "rawcode": "h0QV",
    "status": "confirmed"
  },
  {
    "rawcode": "n066",
    "status": "confirmed"
  },
  {
    "rawcode": "h0JK",
    "status": "confirmed"
  },
  {
    "rawcode": "h0JO",
    "status": "confirmed"
  },
  {
    "rawcode": "h0JQ",
    "status": "confirmed"
  },
  {
    "rawcode": "n08H",
    "status": "confirmed"
  },
  {
    "rawcode": "h102",
    "status": "confirmed"
  },
  {
    "rawcode": "h0NP",
    "status": "confirmed"
  },
  {
    "rawcode": "n03Z",
    "status": "confirmed"
  },
  {
    "rawcode": "h201",
    "status": "confirmed"
  },
  {
    "rawcode": "h107",
    "status": "confirmed"
  },
  {
    "rawcode": "h18I",
    "status": "confirmed"
  },
  {
    "rawcode": "h0Q0",
    "status": "confirmed"
  },
  {
    "rawcode": "n087",
    "status": "confirmed"
  },
  {
    "rawcode": "h0JV",
    "status": "confirmed"
  },
  {
    "rawcode": "h0YM",
    "status": "confirmed"
  },
  {
    "rawcode": "n08G",
    "status": "confirmed"
  },
  {
    "rawcode": "h0M2",
    "status": "confirmed"
  },
  {
    "rawcode": "n07A",
    "status": "confirmed"
  },
  {
    "rawcode": "n07T",
    "status": "confirmed"
  },
  {
    "rawcode": "n06K",
    "status": "confirmed"
  },
  {
    "rawcode": "h2C2",
    "status": "unconfirmed"
  },
  {
    "rawcode": "n07V",
    "status": "confirmed"
  },
  {
    "rawcode": "h0PJ",
    "status": "confirmed"
  },
  {
    "rawcode": "n06I",
    "status": "confirmed"
  },
  {
    "rawcode": "n06U",
    "status": "confirmed"
  },
  {
    "rawcode": "n064",
    "status": "confirmed"
  },
  {
    "rawcode": "h105",
    "status": "confirmed"
  },
  {
    "rawcode": "h0PD",
    "status": "confirmed"
  },
  {
    "rawcode": "n062",
    "status": "confirmed"
  }
]);

const HISTORY_VERSION = 1;
const beastKingCodes = new Set(['h0CC', 'h1CC', 'h0CB', 'h1CB']);
const rawcode = def => def?.sourceRawcode ?? def?.rawcode ?? def?.combatRawcode;
const isV14 = def => def?.provenance === 'v14.1A5-dataset' || String(def?.sourceVersion ?? '').includes('v14.1A5');
const canonical = code => beastKingCodes.has(code) ? 'h0CC' : code;
const hasQualification = (player, key) => Number(player.entitlements?.[key] ?? 0) > 0;

/** A skin completion also proves its base completion. The reverse is not true. */
function completionCodes(def) {
  const codes = new Set([rawcode(def)]);
  for (const key of ['skinBaseRawcode', 'appearanceBaseRawcode', 'gameplayBaseRawcode']) if (def?.[key]) codes.add(def[key]);
  if ([...codes].some(code => beastKingCodes.has(code))) for (const code of beastKingCodes) codes.add(code);
  return [...codes].filter(Boolean);
}

function historyFor(player) {
  const history = player.eggHistory ??= { version: HISTORY_VERSION };
  history.version = HISTORY_VERSION;
  history.completed ??= {};
  history.counts ??= {};
  history.events ??= {};
  history.countedStages ??= {};
  history.firstWaveHippogryphs ??= 0;
  history.firstWaveClosed ??= false;
  history.beastKingKills ??= 0;
  player.completedSourceUnits ??= {};
  Object.assign(history.completed, player.completedSourceUnits);
  return history;
}

function grant(player, id, granted) {
  player.technologies ??= {};
  if (!(Number(player.technologies[id] ?? 0) > 0)) { player.technologies[id] = 1; granted.push(id); }
}

function applyConfirmedHistory(player, history) {
  const granted = [], completed = history.completed;
  for (const [id, rule] of Object.entries(EGG_REQUIREMENTS)) {
    if (rule.status === 'confirmed' && rule.groups?.some(group => group.every(code => completed[code]))) grant(player, id, granted);
  }
  const dragonKinds = [
    ['h01B', 'h11B', 'h0R8'], ['h0BP', 'n05M'], ['h0D2'],
  ].filter(group => group.some(code => completed[code])).length;
  if (dragonKinds >= 2) grant(player, 'R00R', granted);
  if ((history.counts.h0SC ?? 0) - (history.counts.h0SD ?? 0) >= 10 && (history.counts.h0SD ?? 0) >= 10) grant(player, 'R00P', granted);
  return granted;
}

/** Called once for a paid military completion, never when an order starts. */
export function recordEggCompletion(player, def, { buildingId, wave, buildings = player.buildings ?? [], unitsById = {}, restoring = false } = {}) {
  if (!isV14(def) || def?.morphProxy || !rawcode(def)) return [];
  const history = historyFor(player), codes = completionCodes(def), code = rawcode(def);
  const eventKey = `${buildingId ?? 'unknown'}:${code}`;
  for (const id of codes) { history.completed[id] = true; player.completedSourceUnits[id] = true; }
  // Separate raw-stage and base-stage journals: changing a skin cannot add a
  // second worm/hippogryph completion, and restoring cannot replay an event.
  const isNewEvent = !history.events[eventKey];
  if (isNewEvent) {
    history.events[eventKey] = true;
    const base = canonical(def.appearanceBaseRawcode || def.skinBaseRawcode || def.gameplayBaseRawcode || code);
    const countKey = `${buildingId ?? 'unknown'}:${base}`;
    if (!history.countedStages[countKey]) {
      history.countedStages[countKey] = true;
      history.counts[base] = (history.counts[base] ?? 0) + 1;
      if (base === 'h08F' && wave === 1 && !history.firstWaveClosed) history.firstWaveHippogryphs++;
    }
  }
  const granted = applyConfirmedHistory(player, history);
  // These qualifications are independent of history and must be present at
  // the source completion event. Restoring an old save is not a new event.
  if (!restoring && isNewEvent && ((codes.includes('h0C0') && hasQualification(player, 'h220')) ||
      (codes.some(id => ['h0C0', 'h0BS'].includes(id)) && history.completed.h0C0 && history.completed.h0BS && hasQualification(player, 'h230')))) grant(player, 'R03D', granted);
  if (codes.includes('n061')) {
    const mummies = buildings.filter(building => !building.construction && completionCodes(unitsById[building.unitId]).includes('n061')).length;
    if (mummies >= 5) grant(player, 'R0BR', granted);
  }
  return granted;
}

/** Original R00N decision is at the end of the first wave, not on wave two. */
export function finishEggWave(player, wave) {
  if (wave !== 1) return [];
  const history = historyFor(player), granted = [];
  if (!history.firstWaveClosed && history.firstWaveHippogryphs >= 5) grant(player, 'R00N', granted);
  history.firstWaveClosed = true;
  return granted;
}

/** Only currently provable completions can be backfilled in pre-history saves. */
export function restoreEggHistory(player, { wave, buildings = player.buildings ?? [], unitsById = {} } = {}) {
  const history = historyFor(player);
  if (wave > 1) history.firstWaveClosed = true;
  for (const building of buildings) {
    // An upgrade's current stage has completed; a fresh build with the same
    // current/target stage is still unfinished. Morph proxies are not troops.
    if (!building.construction || building.construction.targetId !== building.unitId) {
      recordEggCompletion(player, unitsById[building.unitId], { buildingId: building.id, wave, buildings, unitsById, restoring: true });
    }
  }
  return applyConfirmedHistory(player, history);
}

/** Preserve a count for evidence, without choosing the unresolved 101/166 rule. */
export function recordBeastKingKill(player, attacker, def) {
  if (!player || ![rawcode(def), def?.combatRawcode, attacker?.sourceRawcode, attacker?.combatRawcode].some(code => beastKingCodes.has(code))) return;
  historyFor(player).beastKingKills++;
}

export function eggRequirementStatus(player, id) {
  const rule = EGG_REQUIREMENTS[id];
  if (!rule) return null;
  const unresolved = rule.status !== 'confirmed', current = unresolved ? 0 : Number(player.technologies?.[id] ?? 0);
  return { rawcode: id, name: rule.text, kind: unresolved ? 'unconfirmed_recipe' : 'egg_history', required: 1, current, met: !unresolved && current >= 1,
    status: rule.status, sourceLines: rule.sourceLines, ...(id === 'R00L' ? { recordedKills: Number(player.eggHistory?.beastKingKills ?? 0) } : {}) };
}

function gateResult(player, gate) {
  if (!gate) return { met: true, label: '' };
  if (gate.type === 'any') {
    const results = (gate.options ?? []).map(option => gateResult(player, option));
    return { met: results.some(result => result.met), label: results.map(result => result.label).join('，或') };
  }
  if (gate.type === 'vip') return { met: false, label: '会员外观档位待核定' };
  const kind = gate.type === 'shop' ? '商城外观权益' : '账号专属外观资格';
  const met = !!gate.key && (hasQualification(player, gate.key) || hasQualification(player, `${gate.type}:${gate.key}`));
  return { met, label: kind };
}

/** Dynamic account skins keep an explicit gate even when source requires=[] . */
export function appearanceQualificationStatus(player, def) {
  if (!def?.documentGate) return null;
  const result = gateResult(player, def.documentGate);
  return { rawcode: `appearance:${rawcode(def)}`, name: `${def.name}需要${result.label}`, kind: 'appearance_qualification',
    required: 1, current: result.met ? 1 : 0, met: result.met, sourceGate: def.documentGate };
}
