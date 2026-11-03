const abilityId = 'A1CF';
const familyRawcodes = ['h0U3', 'h0U4', 'h0U1', 'h0UB', 'h0UA', 'h0U9', 'h0U8', 'h0U7', 'h0U6', 'h0U5', 'h0U2'];
const levelForCount = count => Math.max(1, Math.min(11, count));

function carriesAbility(building, def) {
  if (!building || !def?.id?.startsWith('v14_') || (building.abilityLevels?.[abilityId] ?? 1) <= 0) return false;
  if (building.sourceRemovedBuildingAbilities?.includes(abilityId)) return false;
  return [...(def.buildingAbilityIds ?? def.abilityIds ?? []), ...(building.permanentAbilityIds ?? [])].includes(abilityId);
}

export function axisaBuildingCompleted(building, def) {
  if (building?.construction || !carriesAbility(building, def)) return;
  // EggWhiteEx, war3map.j:28541-28543: increment the saved integer on every
  // completed carrier, then set A1CF. There is no first-stage boolean, rawcode
  // branch, or UnitMakeAbilityPermanent here. The counter itself is uncapped.
  const state = building.axisaLevelState ??= {count: 0};
  state.count = (state.count ?? 0) + 1;
  (building.abilityLevels ??= {})[abilityId] = levelForCount(state.count);
}

export function restoreAxisaBuilding(player, building, def) {
  if (!carriesAbility(building, def)) return;
  const state = building.axisaLevelState ??= {};
  if (state.count === undefined) {
    const events = player?.eggHistory?.events ?? {};
    // restoreEggHistory runs first and journals only provable completed
    // current stages. Never infer earlier stages from heroLevel/name, another
    // building's history, or aggregate family counts. Repeated identical raw
    // completions cannot be recovered from this deduplicated legacy journal.
    const count = familyRawcodes.filter(raw => events[`${building.id}:${raw}`]).length;
    state.count = building.abilityLevels?.[abilityId] ?? count;
    building.axisaLegacyHistory = true;
  }
  // Existing actual ability levels and counters are independent saved facts;
  // restoration fills missing values without replaying any completion event.
  (building.abilityLevels ??= {})[abilityId] ??= levelForCount(state.count);
}

export function initializeAxisaLevels(game, building, entity, {restoring = false} = {}) {
  // PassiveSkill, war3map.j:43862-43864: copy the building's actual level onto
  // an existing combat ability, including arena deployment. Do not add A1CF
  // to a body (notably the n07I hero egg) that does not already carry it.
  if (!entity?.skillSpecs?.some(skill => skill.id === abilityId) || (entity.abilityLevels?.[abilityId] ?? 1) <= 0) return;
  const sourceLevel = building?.abilityLevels?.[abilityId];
  if (!(sourceLevel > 0)) return;
  const levels = entity.abilityLevels ??= {};
  if (!restoring || levels[abilityId] === undefined) levels[abilityId] = sourceLevel;
}
