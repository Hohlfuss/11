export interface ToolState {
  handle?: number;
  metal?: number;
  grip?: number;
  enchantment?: number;
  critChance?: number;
  critDamage?: number;
  bindings?: number;
}

export interface GameStateLike {
  inventory: Record<string, number>;
  tools: Record<string, ToolState>;
}

export function getUpgradeCost(level = 1) {
  return Math.floor(15 * Math.pow(1.8, (level || 1) - 1));
}

export function getUpgradeResource(skill: 'woodcutting' | 'mining' | 'foraging', part: string) {
  if (skill === 'mining') {
    if (part === 'grip') return 'Silver Ore';
    if (part === 'enchantment') return 'Gold Ore';
    if (part === 'critChance') return 'Iron Ore';
    if (part === 'critDamage') return 'Mithril Ore';
    return part === 'handle' ? 'Copper Ore' : 'Iron Ore';
  }

  if (skill === 'foraging') {
    if (part === 'grip') return 'Flax Fiber';
    if (part === 'enchantment') return 'Magic Vine';
    if (part === 'critChance') return 'Silk Thread';
    if (part === 'critDamage') return 'Magic Vine';
    if (part === 'bindings') return 'Cotton Fiber';
    return part === 'handle' ? 'Cotton Fiber' : 'Hemp Fiber'; // hemp for metal/blade
  }

  if (part === 'grip') return 'Maple Log';
  if (part === 'enchantment') return 'Mahogany Log';
  if (part === 'critChance') return 'Pine Log';
  if (part === 'critDamage') return 'Yew Log';
  return part === 'handle' ? 'Oak Log' : 'Copper Ore';
}

export function applyToolUpgrade(state: GameStateLike, skill: 'woodcutting' | 'mining' | 'foraging', part: string) {
  if (!state.tools?.[skill]) {
    state.tools[skill] = {} as ToolState;
  }

  const currentLevel = state.tools[skill][part as keyof ToolState] ?? 1;
  const costAmount = getUpgradeCost(currentLevel);
  const resource = getUpgradeResource(skill, part);

  if (!resource) return false;
  const currentResourceAmount = state.inventory[resource] ?? 0;
  if (currentResourceAmount < costAmount) return false;

  state.inventory[resource] = currentResourceAmount - costAmount;
  state.tools[skill][part as keyof ToolState] = (currentLevel as number) + 1;
  return true;
}
