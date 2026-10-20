/** Presentation-only categories. Source IDs, prices, requirements and actions stay intact. */
export const isAppearanceVariant = unit => typeof unit?.skinBaseRawcode === 'string' && unit.skinBaseRawcode.length > 0;
export function appearanceBase(unit, units = []) {
  if (!isAppearanceVariant(unit)) return null;
  return units.find(candidate => !candidate.legacy && candidate.sourceRawcode === unit.skinBaseRawcode) ?? null;
}
export function appearanceBaseLabel(unit, units = []) {
  const base = appearanceBase(unit, units);
  return base?.name ?? unit?.skinBaseRawcode ?? '';
}
export function splitUnitCategories(units = []) {
  return { upgrades: units.filter(unit => !isAppearanceVariant(unit)), appearances: units.filter(isAppearanceVariant) };
}
