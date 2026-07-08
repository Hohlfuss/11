<script setup lang="ts">
import { reactive, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';
import { 
  Trees, 
  Pickaxe, 
  Axe, 
  ArrowLeft, 
  User, 
  Box, 
  ChevronRight,
  Gem,
  LogIn,
  Wrench
} from 'lucide-vue-next';

// This will use your Render backend in production, or fallback to relative/local in dev
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://one1-x2mf.onrender.com';
const socket = io(backendUrl, {
  transports: ['websocket', 'polling'] // Good practice for Render websockets
});

// --- AUTHENTICATION STATE ---
const auth = reactive({
  isAuthenticated: false,
  usernameInput: '',
  error: ''
});

// --- GAME DATA CONFIGURATION ---
// unlockLevel defines the minimum player level required to use each node/material
const NODES = {
  woodcutting: [
    { id: 'oak',      name: 'Oak Tree',      time: 5000,  xpReward: 15,  yields: 'Oak Log',      unlockLevel: 1, icon: Trees, color: 'text-green-500',  bg: 'bg-green-500' },
    { id: 'pine',     name: 'Pine Tree',     time: 8750,  xpReward: 30,  yields: 'Pine Log',     unlockLevel: 2, icon: Trees, color: 'text-emerald-700', bg: 'bg-emerald-700' },
    { id: 'maple',    name: 'Maple Tree',    time: 13750, xpReward: 50,  yields: 'Maple Log',    unlockLevel: 4, icon: Trees, color: 'text-orange-600', bg: 'bg-orange-600' },
    { id: 'mahogany', name: 'Mahogany Tree', time: 20000, xpReward: 80,  yields: 'Mahogany Log', unlockLevel: 6, icon: Trees, color: 'text-amber-800',  bg: 'bg-amber-800' },
    { id: 'yew',      name: 'Yew Tree',      time: 30000, xpReward: 120, yields: 'Yew Log',      unlockLevel: 8, icon: Trees, color: 'text-green-900',  bg: 'bg-green-900' }
  ],
  mining: [
    { id: 'copper',  name: 'Copper Vein',  time: 7500,  xpReward: 20,  yields: 'Copper Ore',  unlockLevel: 1,  icon: Pickaxe, color: 'text-orange-500', bg: 'bg-orange-500' },
    { id: 'iron',    name: 'Iron Vein',    time: 12500, xpReward: 45,  yields: 'Iron Ore',    unlockLevel: 3,  icon: Pickaxe, color: 'text-gray-400',   bg: 'bg-gray-400' },
    { id: 'silver',  name: 'Silver Vein',  time: 18750, xpReward: 75,  yields: 'Silver Ore',  unlockLevel: 5,  icon: Pickaxe, color: 'text-slate-300',  bg: 'bg-slate-300' },
    { id: 'gold',    name: 'Gold Vein',    time: 27500, xpReward: 110, yields: 'Gold Ore',    unlockLevel: 7,  icon: Pickaxe, color: 'text-yellow-400', bg: 'bg-yellow-400' },
    { id: 'mithril', name: 'Mithril Vein', time: 40000, xpReward: 160, yields: 'Mithril Ore', unlockLevel: 10, icon: Pickaxe, color: 'text-blue-500',   bg: 'bg-blue-500' }
  ]
};

// All materials with their required unlock level for the storage panel
const ALL_MATERIALS = [
  { name: 'Oak Log',      unlockLevel: 1  },
  { name: 'Pine Log',     unlockLevel: 2  },
  { name: 'Maple Log',    unlockLevel: 4  },
  { name: 'Mahogany Log', unlockLevel: 6  },
  { name: 'Yew Log',      unlockLevel: 8  },
  { name: 'Copper Ore',   unlockLevel: 1  },
  { name: 'Iron Ore',     unlockLevel: 3  },
  { name: 'Silver Ore',   unlockLevel: 5  },
  { name: 'Gold Ore',     unlockLevel: 7  },
  { name: 'Mithril Ore',  unlockLevel: 10 },
];

// --- CENTRAL GAME STATE ---
const state = reactive({
  view: 'main' as 'main' | 'woodcutting' | 'mining' | "crafting",
  level: 1,
  xp: 0,
  xpNeeded: 100,
  workersTotal: 0,
  inventory: {} as Record<string, number>,
  manualAction: null as any,
  workerAction: null as any,
  tools: {
    woodcutting: { handle: 1, metal: 1, grip: 1, enchantment: 1 },
    mining: { handle: 1, metal: 1, grip: 1, enchantment: 1 }
  }
});

// --- LISTEN TO THE SERVER ---
onMounted(() => {
  socket.on('loginSuccess', (serverState) => {
    auth.isAuthenticated = true;
    auth.error = '';
    updateLocalState(serverState);
  });

  socket.on('loginError', (errorMessage) => {
    auth.error = errorMessage;
  });

  socket.on('gameStateUpdate', (serverState) => {
    updateLocalState(serverState);
  });
});


const updateLocalState = (serverState: any) => {
  state.level = serverState.level;
  state.xp = serverState.xp;
  state.xpNeeded = serverState.xp_needed;
  state.workersTotal = serverState.workers_total;
  state.inventory = { ...(serverState.inventory ?? {}) };
  state.manualAction = serverState.manualAction ?? null;
  state.workerAction = serverState.workerAction ?? null;

  // BULLETPROOF PARSING: Ensure tools is safely read even if it's a string or null
  let incomingTools = serverState.tools;
  if (typeof incomingTools === 'string') {
    try { incomingTools = JSON.parse(incomingTools); } catch (e) { incomingTools = null; }
  }

  if (incomingTools && typeof incomingTools === 'object') {
    state.tools = {
      woodcutting: {
        handle: incomingTools.woodcutting?.handle ?? state.tools?.woodcutting?.handle ?? 1,
        metal: incomingTools.woodcutting?.metal ?? state.tools?.woodcutting?.metal ?? 1,
        grip: incomingTools.woodcutting?.grip ?? state.tools?.woodcutting?.grip ?? 1,
        enchantment: incomingTools.woodcutting?.enchantment ?? state.tools?.woodcutting?.enchantment ?? 1
      },
      mining: {
        handle: incomingTools.mining?.handle ?? state.tools?.mining?.handle ?? 1,
        metal: incomingTools.mining?.metal ?? state.tools?.mining?.metal ?? 1,
        grip: incomingTools.mining?.grip ?? state.tools?.mining?.grip ?? 1,
        enchantment: incomingTools.mining?.enchantment ?? state.tools?.mining?.enchantment ?? 1
      }
    };
  }
};

onUnmounted(() => {
  socket.disconnect();
});

// --- ACTIONS ---
const handleLogin = () => {
  if (auth.usernameInput.trim().length < 3) {
    auth.error = 'Username must be at least 3 characters.';
    return;
  }
  auth.error = '';
  socket.emit('playerLogin', auth.usernameInput.trim());
};

const changeView = (newView: 'main' | 'woodcutting' | 'mining' | "crafting") => {
  state.view = newView;
};

const startManualTask = (node: any) => {
  socket.emit('playerAction', { type: 'startManual', node });
};

const assignWorker = (node: any) => {
  socket.emit('playerAction', { type: 'assignWorker', node });
};

const recallWorker = () => {
  socket.emit('playerAction', { type: 'recallWorker' });
};

// --- CRAFTING ACTIONS ---
const upgradeTool = (skill: 'woodcutting' | 'mining', part: 'handle' | 'metal' | 'grip' | 'enchantment') => {
  socket.emit('playerAction', { type: 'upgradeTool', skill, part });
};

// Helpers for the UI to display costs (Safely defaults to level 1 if undefined)
const getUpgradeCost = (level?: number) => Math.floor(15 * Math.pow(1.8, (level || 1) - 1));

const getUpgradeResource = (skill: 'woodcutting' | 'mining', part: 'handle' | 'metal' | 'grip' | 'enchantment') => {
  if (skill === 'mining') {
    if (part === 'grip') return 'Silver Ore';
    if (part === 'enchantment') return 'Gold Ore';
    return part === 'handle' ? 'Copper Ore' : 'Iron Ore';
  }
  if (part === 'grip') return 'Maple Log';
  if (part === 'enchantment') return 'Mahogany Log';
  return part === 'handle' ? 'Oak Log' : 'Copper Ore';
};

const getDynamicTime = (skill: 'woodcutting' | 'mining', baseTime: number) => {
  const handleLevel = state.tools?.[skill]?.handle || 1;
  const speedMultiplier = Math.pow(1.25, handleLevel - 1);
  return (baseTime / speedMultiplier / 1000).toFixed(1);
};

// Returns the level at which the next worker is unlocked (or null if max)
const nextWorkerUnlockLevel = () => {
  if (state.workersTotal < 1) return 2;
  if (state.workersTotal < 2) return 5;
  if (state.workersTotal < 3) return 10;
  return null;
};
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 flex flex-col md:flex-row gap-6">
    
    <div v-if="!auth.isAuthenticated" class="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-white mb-2">Incremental Game</h1>
        <p class="text-slate-400">Enter a username to start or resume your game.</p>
      </div>
      
      <form @submit.prevent="handleLogin" class="flex flex-col gap-4">
        <input 
          v-model="auth.usernameInput" 
          type="text" 
          class="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="Enter Username"
        />
        <div v-if="auth.error" class="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg">{{ auth.error }}</div>
        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
          <LogIn :size="20" /> Connect
        </button>
      </form>
    </div>
    
    <div v-else class="flex-1 flex flex-col max-w-3xl border border-slate-800 rounded-xl bg-slate-900 shadow-2xl overflow-hidden">
      
      <div class="bg-slate-800 p-4 border-b border-slate-700 flex flex-col gap-2 relative">
        <div class="flex justify-between items-end">
          <div class="flex items-center gap-3">
            <div class="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-xl shadow-lg border border-blue-400">
              {{ state.level }}
            </div>
            <div>
              <h1 class="text-lg font-bold tracking-tight text-white">Player Level</h1>
              <p class="text-xs text-blue-300 font-medium">XP: {{ state.xp }} / {{ state.xpNeeded }}</p>
            </div>
          </div>
          
          <div class="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
            <User :class="state.workersTotal > 0 ? 'text-amber-400' : 'text-slate-600'" :size="18" />
            <span class="text-sm font-medium">
              Workers: {{ state.workerAction ? 0 : state.workersTotal }} / {{ state.workersTotal }}
            </span>
          </div>
        </div>
        
        <div class="w-full bg-slate-950 rounded-full h-2.5 mt-1 border border-slate-900">
          <div 
            class="bg-blue-500 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
            :style="{ width: `${(state.xp / state.xpNeeded) * 100}%` }"
          ></div>
        </div>
      </div>

      <div class="p-6 flex-1 flex flex-col">
        
        <div v-if="state.view === 'main'" class="flex-1 flex flex-col justify-center gap-4">
          <h2 class="text-2xl font-bold text-center text-slate-400 mb-4">Select an Operation</h2>
          
          <button 
            @click="changeView('woodcutting')"
            class="group relative flex items-center p-6 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 hover:border-green-500/50 transition-all text-left"
          >
            <div class="bg-green-900/30 p-4 rounded-lg text-green-500 group-hover:scale-110 transition-transform">
              <Axe :size="32" />
            </div>
            <div class="ml-6 flex-1">
              <h3 class="text-xl font-bold text-white">Woodcutting</h3>
              <p class="text-slate-400 text-sm">Chop trees to gather logs for construction.</p>
            </div>
            <ChevronRight class="text-slate-500 group-hover:text-white transition-colors" />
          </button>

          <button 
            @click="changeView('mining')"
            class="group relative flex items-center p-6 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 hover:border-orange-500/50 transition-all text-left"
          >
            <div class="bg-orange-900/30 p-4 rounded-lg text-orange-500 group-hover:scale-110 transition-transform">
              <Pickaxe :size="32" />
            </div>
            <div class="ml-6 flex-1">
              <h3 class="text-xl font-bold text-white">Mining</h3>
              <p class="text-slate-400 text-sm">Extract ores from the earth for smelting.</p>
            </div>
            <ChevronRight class="text-slate-500 group-hover:text-white transition-colors" />
          </button>

          <button @click="changeView('crafting')" class="group relative flex items-center p-6 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 hover:border-blue-500/50 transition-all text-left mt-4">
            <div class="bg-blue-900/30 p-4 rounded-lg text-blue-500 group-hover:scale-110 transition-transform">
              <Wrench :size="32" />
            </div>
            <div class="ml-6 flex-1">
              <h3 class="text-xl font-bold text-white">Crafting & Upgrades</h3>
              <p class="text-slate-400 text-sm">Use resources to improve your tools and yield.</p>
            </div>
            <ChevronRight class="text-slate-500 group-hover:text-white transition-colors" />
          </button>
        </div>

        <div v-if="state.view === 'woodcutting' || state.view === 'mining'" class="flex flex-col h-full">
          <button
            @click="changeView('main')"
            class="self-start flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft :size="18" /> Back to Operations
          </button>

          <div class="grid gap-4">
            <div
              v-for="node in NODES[state.view]"
              :key="node.id"
              :class="[
                'p-5 rounded-xl border shadow-sm flex flex-col gap-3 transition-all',
                state.level >= node.unlockLevel
                  ? 'bg-slate-800 border-slate-700'
                  : 'bg-slate-900/50 border-slate-800 opacity-60'
              ]"
            >
              <!-- LOCKED NODE -->
              <div v-if="state.level < node.unlockLevel" class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-md bg-slate-950 border border-slate-800 text-slate-600">
                    <component :is="node.icon" :size="24" />
                  </div>
                  <div>
                    <h3 class="font-bold text-slate-500">{{ node.name }}</h3>
                    <p class="text-xs text-slate-600">Yields: {{ node.yields }}</p>
                  </div>
                </div>
                <span class="text-xs font-semibold text-slate-500 bg-slate-800 border border-slate-700 px-3 py-1 rounded-full">
                  🔒 Level {{ node.unlockLevel }}
                </span>
              </div>

              <!-- UNLOCKED NODE -->
              <template v-else>
                <div class="flex justify-between items-center">
                  <div class="flex items-center gap-3">
                    <div :class="['p-2 rounded-md bg-slate-900 border border-slate-700', node.color]">
                      <component :is="node.icon" :size="24" />
                    </div>
                    <div>
                      <h3 class="font-bold text-white">{{ node.name }}</h3>
                      <p class="text-xs text-slate-400">Yields: {{ node.yields }} | XP: {{ node.xpReward }}</p>
                    </div>
                  </div>
                  <div class="text-sm font-mono text-slate-500">
                    {{ getDynamicTime(state.view, node.time) }}s
                  </div>
                </div>

                <div class="flex gap-2 mt-2">
                  <button
                    @click="startManualTask(node)"
                    :disabled="state.manualAction !== null"
                    :class="[
                      'flex-1 py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all',
                      state.manualAction?.id === node.id
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : state.manualAction
                          ? 'bg-slate-900 text-slate-600 cursor-not-allowed'
                          : 'bg-slate-700 hover:bg-blue-600 text-white border border-slate-600 hover:border-blue-500'
                    ]"
                  >
                    {{ state.manualAction?.id === node.id ? 'Working...' : 'Start Action (Manual)' }}
                  </button>

                  <button
                    v-if="state.workersTotal > 0"
                    @click="state.workerAction?.id === node.id ? recallWorker() : assignWorker(node)"
                    :class="[
                      'flex-1 py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all border',
                      state.workerAction?.id === node.id
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30'
                        : 'bg-slate-900 text-slate-400 hover:text-amber-400 border-slate-700 hover:border-amber-500/50'
                    ]"
                  >
                    <User :size="16" />
                    {{ state.workerAction?.id === node.id ? 'Recall Worker' : 'Assign Worker' }}
                  </button>
                </div>

                <div v-if="state.manualAction?.id === node.id" class="mt-1">
                  <p class="text-xs text-blue-400 font-medium mb-1 flex justify-between">
                    <span>Player Progress</span>
                    <span>{{ Math.floor((state.manualAction.progress / node.time) * 100) }}%</span>
                  </p>
                  <div class="w-full bg-slate-800 rounded-full h-3 mt-2 overflow-hidden border border-slate-700">
                    <div class="h-full bg-blue-500 transition-all duration-100 ease-linear" :style="{ width: `${Math.min((state.manualAction.progress / node.time) * 100, 100)}%` }"></div>
                  </div>
                </div>

                <div v-if="state.workerAction?.id === node.id" class="mt-1">
                  <p class="text-xs text-amber-400 font-medium mb-1 flex justify-between">
                    <span>Worker Automating</span>
                    <span>{{ Math.floor((state.workerAction.progress / node.time) * 100) }}%</span>
                  </p>
                  <div class="w-full bg-slate-800 rounded-full h-3 mt-2 overflow-hidden border border-slate-700">
                    <div class="h-full bg-amber-500 transition-all duration-100 ease-linear" :style="{ width: `${Math.min((state.workerAction.progress / node.time) * 100, 100)}%` }"></div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div v-if="state.view === 'crafting'" class="flex flex-col h-full">
          <button @click="changeView('main')" class="self-start flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors">
            <ArrowLeft :size="18" /> Back to Operations
          </button>

          <div class="grid gap-6">
            <div class="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
              <h3 class="text-lg font-bold text-white flex items-center gap-2 mb-4 border-b border-slate-700 pb-2">
                <Axe class="text-green-500" :size="20" /> Hatchet Upgrades
              </h3>

              <div class="flex flex-col gap-4">
                <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <h4 class="font-bold text-slate-200">Reinforced Handle (Lvl {{ state.tools?.woodcutting?.handle || 1 }})</h4>
                    <p class="text-xs text-slate-400">Increases chopping speed by 25%</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('woodcutting', 'handle')] || 0) >= getUpgradeCost(state.tools?.woodcutting?.handle) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools?.woodcutting?.handle) }} {{ getUpgradeResource('woodcutting', 'handle') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('woodcutting', 'handle')"
                    :disabled="(state.inventory[getUpgradeResource('woodcutting', 'handle')] || 0) < getUpgradeCost(state.tools?.woodcutting?.handle)"
                    class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-1.5 px-4 rounded font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                </div>

                <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <h4 class="font-bold text-slate-200">Sharpened Metal (Lvl {{ state.tools?.woodcutting?.metal || 1 }})</h4>
                    <p class="text-xs text-slate-400">Increases log yield by +1</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('woodcutting', 'metal')] || 0) >= getUpgradeCost(state.tools?.woodcutting?.metal) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools?.woodcutting?.metal) }} {{ getUpgradeResource('woodcutting', 'metal') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('woodcutting', 'metal')"
                    :disabled="(state.inventory[getUpgradeResource('woodcutting', 'metal')] || 0) < getUpgradeCost(state.tools?.woodcutting?.metal)"
                    class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-1.5 px-4 rounded font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                </div>

                <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <h4 class="font-bold text-slate-200">Firm Grip (Lvl {{ state.tools?.woodcutting?.grip || 1 }})</h4>
                    <p class="text-xs text-slate-400">5% chance per level to double yield</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('woodcutting', 'grip')] || 0) >= getUpgradeCost(state.tools?.woodcutting?.grip) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools?.woodcutting?.grip) }} {{ getUpgradeResource('woodcutting', 'grip') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('woodcutting', 'grip')"
                    :disabled="(state.inventory[getUpgradeResource('woodcutting', 'grip')] || 0) < getUpgradeCost(state.tools?.woodcutting?.grip)"
                    class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-1.5 px-4 rounded font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                </div>

                <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <h4 class="font-bold text-slate-200">Nature Enchantment (Lvl {{ state.tools?.woodcutting?.enchantment || 1 }})</h4>
                    <p class="text-xs text-slate-400">5% chance per level to double XP</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('woodcutting', 'enchantment')] || 0) >= getUpgradeCost(state.tools?.woodcutting?.enchantment) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools?.woodcutting?.enchantment) }} {{ getUpgradeResource('woodcutting', 'enchantment') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('woodcutting', 'enchantment')"
                    :disabled="(state.inventory[getUpgradeResource('woodcutting', 'enchantment')] || 0) < getUpgradeCost(state.tools?.woodcutting?.enchantment)"
                    class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-1.5 px-4 rounded font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                </div>
              </div>
            </div>

            <div class="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
              <h3 class="text-lg font-bold text-white flex items-center gap-2 mb-4 border-b border-slate-700 pb-2">
                <Pickaxe class="text-orange-500" :size="20" /> Pickaxe Upgrades
              </h3>

              <div class="flex flex-col gap-4">
                <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <h4 class="font-bold text-slate-200">Sturdy Handle (Lvl {{ state.tools?.mining?.handle || 1 }})</h4>
                    <p class="text-xs text-slate-400">Increases mining speed by 25%</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('mining', 'handle')] || 0) >= getUpgradeCost(state.tools?.mining?.handle) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools?.mining?.handle) }} {{ getUpgradeResource('mining', 'handle') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('mining', 'handle')"
                    :disabled="(state.inventory[getUpgradeResource('mining', 'handle')] || 0) < getUpgradeCost(state.tools?.mining?.handle)"
                    class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-1.5 px-4 rounded font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                </div>

                <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <h4 class="font-bold text-slate-200">Hardened Head (Lvl {{ state.tools?.mining?.metal || 1 }})</h4>
                    <p class="text-xs text-slate-400">Increases ore yield by +1</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('mining', 'metal')] || 0) >= getUpgradeCost(state.tools?.mining?.metal) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools?.mining?.metal) }} {{ getUpgradeResource('mining', 'metal') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('mining', 'metal')"
                    :disabled="(state.inventory[getUpgradeResource('mining', 'metal')] || 0) < getUpgradeCost(state.tools?.mining?.metal)"
                    class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-1.5 px-4 rounded font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                </div>

                <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <h4 class="font-bold text-slate-200">Steady Grip (Lvl {{ state.tools?.mining?.grip || 1 }})</h4>
                    <p class="text-xs text-slate-400">5% chance per level to double yield</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('mining', 'grip')] || 0) >= getUpgradeCost(state.tools?.mining?.grip) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools?.mining?.grip) }} {{ getUpgradeResource('mining', 'grip') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('mining', 'grip')"
                    :disabled="(state.inventory[getUpgradeResource('mining', 'grip')] || 0) < getUpgradeCost(state.tools?.mining?.grip)"
                    class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-1.5 px-4 rounded font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                </div>

                <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <h4 class="font-bold text-slate-200">Earth Enchantment (Lvl {{ state.tools?.mining?.enchantment || 1 }})</h4>
                    <p class="text-xs text-slate-400">5% chance per level to double XP</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('mining', 'enchantment')] || 0) >= getUpgradeCost(state.tools?.mining?.enchantment) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools?.mining?.enchantment) }} {{ getUpgradeResource('mining', 'enchantment') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('mining', 'enchantment')"
                    :disabled="(state.inventory[getUpgradeResource('mining', 'enchantment')] || 0) < getUpgradeCost(state.tools?.mining?.enchantment)"
                    class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-1.5 px-4 rounded font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="w-full md:w-80 flex flex-col gap-6">
        
        <!-- Worker panel -->
        <div v-if="state.workersTotal > 0" class="bg-amber-900/20 border border-amber-500/30 p-4 rounded-xl shadow-lg">
          <h3 class="text-amber-400 font-bold flex items-center gap-2 mb-1">
            <User :size="18" /> Workers: {{ state.workersTotal }} / 3
          </h3>
          <p class="text-sm text-amber-200/70 leading-relaxed">
            Workers run at 10% speed — stay active for full efficiency!
          </p>
          <p v-if="nextWorkerUnlockLevel()" class="text-xs text-amber-300/50 mt-2">
            Next worker unlocks at level {{ nextWorkerUnlockLevel() }}
          </p>
          <p v-else class="text-xs text-amber-300/50 mt-2">Max workers reached!</p>
        </div>

        <!-- Pre-worker hint -->
        <div v-if="state.workersTotal === 0" class="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-lg">
          <h3 class="text-slate-400 font-bold flex items-center gap-2 mb-1">
            <User :size="18" /> Workers
          </h3>
          <p class="text-sm text-slate-500 leading-relaxed">
            Reach level 2 to unlock your first worker!
          </p>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex-1 flex flex-col">
          <h2 class="text-lg font-bold text-white mb-4 flex items-center gap-2 pb-3 border-b border-slate-800">
            <Box :size="20" class="text-slate-400" /> Storage
          </h2>
          
          <div class="space-y-2 flex-1">
            <template v-for="item in ALL_MATERIALS" :key="item.name">
              <!-- Only show if the player has reached the required level -->
              <div v-if="state.level >= item.unlockLevel" class="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div class="flex items-center gap-3">
                  <Axe v-if="item.name.includes('Log')" :size="16" class="text-slate-500" />
                  <Gem v-else-if="item.name.includes('Ore')" :size="16" class="text-slate-500" />
                  <Box v-else :size="16" class="text-slate-500" />
                  <span class="font-medium text-slate-300">{{ item.name }}</span>
                </div>
                <span class="font-bold text-white font-mono bg-slate-800 px-2 py-1 rounded">
                  {{ (state.inventory[item.name] || 0).toLocaleString() }}
                </span>
              </div>
            </template>
          </div>
        </div>
        
      </div>
    </div>
  </div>
</template>