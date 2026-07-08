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
const NODES = {
  woodcutting: [
    { id: 'oak', name: 'Oak Tree', time: 2000, xpReward: 15, yields: 'Oak Log', icon: Trees, color: 'text-green-500', bg: 'bg-green-500' },
    { id: 'pine', name: 'Pine Tree', time: 3500, xpReward: 30, yields: 'Pine Log', icon: Trees, color: 'text-emerald-700', bg: 'bg-emerald-700' }
  ],
  mining: [
    { id: 'copper', name: 'Copper Vein', time: 3000, xpReward: 20, yields: 'Copper Ore', icon: Pickaxe, color: 'text-orange-500', bg: 'bg-orange-500' },
    { id: 'iron', name: 'Iron Vein', time: 5000, xpReward: 45, yields: 'Iron Ore', icon: Pickaxe, color: 'text-gray-400', bg: 'bg-gray-400' }
  ]
};

// --- CENTRAL GAME STATE ---
// Notice how it starts empty/default. The server will immediately overwrite this!
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
    woodcutting: { handle: 1, metal: 1 },
    mining: { handle: 1, metal: 1 }
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
  // manualAction/workerAction aren't columns in the DB, so right after login
  // the server sends them back as undefined, not null. The template checks
  // `!== null` (e.g. to disable the "Start Action" button), so without this
  // fallback that check is permanently true and the button never enables.
  state.manualAction = serverState.manualAction ?? null;
  state.workerAction = serverState.workerAction ?? null;

  if (serverState.tools) {
    state.tools = {
      woodcutting: {
        handle: serverState.tools.woodcutting?.handle ?? state.tools.woodcutting.handle,
        metal: serverState.tools.woodcutting?.metal ?? state.tools.woodcutting.metal
      },
      mining: {
        handle: serverState.tools.mining?.handle ?? state.tools.mining.handle,
        metal: serverState.tools.mining?.metal ?? state.tools.mining.metal
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

// These actions no longer change the state directly! 
// They just send a message to the backend asking it to do the work.
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
const upgradeTool = (skill: 'woodcutting' | 'mining', part: 'handle' | 'metal') => {
  socket.emit('playerAction', { type: 'upgradeTool', skill, part });
};

// Helpers for the UI to display costs
const getUpgradeCost = (level: number) => level * 10;
const getUpgradeResource = (skill: 'woodcutting' | 'mining', part: 'handle' | 'metal') => {
  if (skill === 'mining') {
    return part === 'handle' ? 'Copper Ore' : 'Iron Ore';
  }

  return part === 'handle' ? 'Oak Log' : 'Copper Ore';
};
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 flex flex-col md:flex-row gap-6">
    
    <!-- LOGIN SCREEN -->
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

          <!-- NEW CRAFTING BUTTON -->
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
              class="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm flex flex-col gap-3"
            >
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
                  {{ (node.time / 1000).toFixed(1) }}s
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
                    <h4 class="font-bold text-slate-200">Reinforced Handle (Lvl {{ state.tools.woodcutting.handle }})</h4>
                    <p class="text-xs text-slate-400">Increases chopping speed by 25%</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('woodcutting', 'handle')] || 0) >= getUpgradeCost(state.tools.woodcutting.handle) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools.woodcutting.handle) }} {{ getUpgradeResource('woodcutting', 'handle') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('woodcutting', 'handle')"
                    :disabled="(state.inventory[getUpgradeResource('woodcutting', 'handle')] || 0) < getUpgradeCost(state.tools.woodcutting.handle)"
                    class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-1.5 px-4 rounded font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                </div>

                <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <h4 class="font-bold text-slate-200">Sharpened Metal (Lvl {{ state.tools.woodcutting.metal }})</h4>
                    <p class="text-xs text-slate-400">Increases log yield by +1</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('woodcutting', 'metal')] || 0) >= getUpgradeCost(state.tools.woodcutting.metal) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools.woodcutting.metal) }} {{ getUpgradeResource('woodcutting', 'metal') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('woodcutting', 'metal')"
                    :disabled="(state.inventory[getUpgradeResource('woodcutting', 'metal')] || 0) < getUpgradeCost(state.tools.woodcutting.metal)"
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
                    <h4 class="font-bold text-slate-200">Sturdy Handle (Lvl {{ state.tools.mining.handle }})</h4>
                    <p class="text-xs text-slate-400">Increases mining speed by 25%</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('mining', 'handle')] || 0) >= getUpgradeCost(state.tools.mining.handle) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools.mining.handle) }} {{ getUpgradeResource('mining', 'handle') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('mining', 'handle')"
                    :disabled="(state.inventory[getUpgradeResource('mining', 'handle')] || 0) < getUpgradeCost(state.tools.mining.handle)"
                    class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-1.5 px-4 rounded font-medium transition-colors"
                  >
                    Upgrade
                  </button>
                </div>

                <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <h4 class="font-bold text-slate-200">Hardened Head (Lvl {{ state.tools.mining.metal }})</h4>
                    <p class="text-xs text-slate-400">Increases ore yield by +1</p>
                    <p class="text-xs mt-1" :class="(state.inventory[getUpgradeResource('mining', 'metal')] || 0) >= getUpgradeCost(state.tools.mining.metal) ? 'text-green-400' : 'text-red-400'">
                      Cost: {{ getUpgradeCost(state.tools.mining.metal) }} {{ getUpgradeResource('mining', 'metal') }}
                    </p>
                  </div>
                  <button
                    @click="upgradeTool('mining', 'metal')"
                    :disabled="(state.inventory[getUpgradeResource('mining', 'metal')] || 0) < getUpgradeCost(state.tools.mining.metal)"
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

      <!-- SIDEBAR INVENTORY -->
      <div class="w-full md:w-80 flex flex-col gap-6">
        
        <div v-if="state.workersTotal > 0" class="bg-amber-900/20 border border-amber-500/30 p-4 rounded-xl shadow-lg">
          <h3 class="text-amber-400 font-bold flex items-center gap-2 mb-2">
            <Box :size="18" /> Automation Unlocked
          </h3>
          <p class="text-sm text-amber-200/70 leading-relaxed">
            You have a worker available! Assign them to a task and they will loop it continuously without your input.
          </p>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex-1 flex flex-col">
          <h2 class="text-lg font-bold text-white mb-4 flex items-center gap-2 pb-3 border-b border-slate-800">
            <Box :size="20" class="text-slate-400" /> Storage
          </h2>
          
          <div class="space-y-4 flex-1">
            <template v-for="(amount, itemName) in state.inventory" :key="itemName">
              <div v-if="amount > 0" class="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div class="flex items-center gap-3">
                  <Axe v-if="String(itemName).includes('Log')" :size="16" class="text-slate-500" />
                  <Gem v-else-if="String(itemName).includes('Ore')" :size="16" class="text-slate-500" />
                  <Box v-else :size="16" class="text-slate-500" />
                  <span class="font-medium text-slate-300">{{ itemName }}</span>
                </div>
                <span class="font-bold text-white font-mono bg-slate-800 px-2 py-1 rounded">
                  {{ amount.toLocaleString() }}
                </span>
              </div>
            </template>
            
            <div v-if="!state.inventory || Object.values(state.inventory).every(v => v === 0)" class="h-full flex items-center justify-center text-slate-500 text-sm text-center italic px-4">
              Storage is empty. Complete tasks to gather resources.
            </div>
          </div>
        </div>
        
      </div>
    </div>
  </div>
</template>