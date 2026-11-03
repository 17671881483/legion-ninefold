const abilityId = 'A17H';
const familyRawcodes = new Set(['n067', 'n068', 'n069']);
const rawcode = def => def?.sourceRawcode ?? def?.rawcode ?? def?.id?.replace(/^v14_/, '');
const sourceDefinition = def => def?.id?.startsWith('v14_');
const levelForCount = count => Math.max(1, Math.min(3, count));

function carriesAbility(building, def) {
  if (!building || !sourceDefinition(def) || (building.abilityLevels?.[abilityId] ?? 1) <= 0) return false;
  return [...(def.buildingAbilityIds ?? def.abilityIds ?? []), ...(building.permanentAbilityIds ?? [])].includes(abilityId);
}

// EggWhiteEx, war3map.j:28528-28540. The integer and boolean use the same
// hashtable key but are separate values. In particular n067 -> n069 clears
// the boolean WITHOUT incrementing the integer or setting the ability level.
function advance(state, raw) {
  if (raw === 'n067') {
    state.firstStagePending = true;
  } else if (state.firstStagePending && raw !== 'n068') {
    state.firstStagePending = false;
    return false;
  } else {
    state.firstStagePending = false;
  }
  state.count = (state.count ?? 0) + 1;
  return true;
}

export function earthLordBuildingCompleted(building, def) {
  if (building?.construction || !carriesAbility(building, def)) return;
  const state = building.earthLordLevelState ??= {count: 0, firstStagePending: false};
  if (advance(state, rawcode(def))) {
    (building.abilityLevels ??= {})[abilityId] = levelForCount(state.count);
  }
  // Unlike the adjacent Ner'zhul branches, the source does not call
  // UnitMakeAbilityPermanent for A17H. Do not invent a persistent grant.
}

function historicalState(player, building, def) {
  const result = {count: 0, firstStagePending: false};
  const prefix = `${building.id}:`, events = [];
  // Object insertion order is the order of the saved completion journal.
  // A set of stage names cannot reproduce this conditional state machine.
  for (const [key, completed] of Object.entries(player?.eggHistory?.events ?? {})) {
    if (!completed || !key.startsWith(prefix)) continue;
    const raw = key.slice(prefix.length);
    if (familyRawcodes.has(raw)) events.push(raw);
  }
  const raw = rawcode(def);
  const currentCompleted = !building.construction || building.construction.targetId !== building.unitId;
  // The current completed stage itself is provable even in a pre-journal
  // save. This matches restoreEggHistory's backfill without writing history
  // or assuming any earlier stages from heroLevel/heroStage/name.
  if (currentCompleted && familyRawcodes.has(raw) && !events.includes(raw)) events.push(raw);
  for (const event of events) advance(result, event);
  return result;
}

export function restoreEarthLordBuilding(player, building, def) {
  if (!carriesAbility(building, def)) return;
  const prior = building.earthLordLevelState;
  if (prior?.count === undefined || prior?.firstStagePending === undefined) {
    const history = historicalState(player, building, def);
    const state = building.earthLordLevelState ??= {};
    // Explicit saved ability levels are better evidence than an incomplete
    // legacy journal. Existing counters and boolean state remain authoritative.
    state.count ??= building.abilityLevels?.[abilityId] ?? history.count;
    state.firstStagePending ??= history.firstStagePending;
    building.earthLordLegacyHistory = true;
  }
  (building.abilityLevels ??= {})[abilityId] ??= levelForCount(building.earthLordLevelState.count);
  // Restore assigns recovered state; it never invokes the completion hook.
  // Legacy journals deduplicate repeated raw stages, so missing repeated
  // completions or original Warcraft handle continuity cannot be inferred.
}

export function initializeEarthLordLevels(game, building, entity, {restoring = false} = {}) {
  // PassiveSkill, war3map.j:43752-43754, sets an existing ability's level;
  // it neither adds a missing A17H nor applies an arena-specific removal.
  if (!entity?.skillSpecs?.some(skill => skill.id === abilityId) || (entity.abilityLevels?.[abilityId] ?? 1) <= 0) return;
  const sourceLevel = building?.abilityLevels?.[abilityId];
  if (!(sourceLevel > 0)) return;
  const levels = entity.abilityLevels ??= {};
  if (!restoring || levels[abilityId] === undefined) levels[abilityId] = sourceLevel;
}
