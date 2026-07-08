import test from 'node:test';
import assert from 'node:assert/strict';
import { applyToolUpgrade, getUpgradeCost, getUpgradeResource } from './gameLogic.js';

test('mining critChance upgrade uses Iron Ore and increases the stat', () => {
  const state = {
    inventory: { 'Iron Ore': 100 },
    tools: {
      mining: {
        critChance: 1
      }
    }
  };

  const ok = applyToolUpgrade(state as any, 'mining', 'critChance');

  assert.equal(ok, true);
  assert.equal(state.inventory['Iron Ore'], 100 - getUpgradeCost(1));
  assert.equal(state.tools.mining.critChance, 2);
});

test('mining critChance uses the expected resource mapping', () => {
  assert.equal(getUpgradeResource('mining', 'critChance'), 'Iron Ore');
});
