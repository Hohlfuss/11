import express, { type Request, type Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { getPlayer, createPlayer, savePlayer } from './db.js';
import { applyToolUpgrade } from './gameLogic.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "https://one1-frontend.onrender.com/",
    methods: ["GET", "POST"]
  }
});

const port = process.env.PORT || 3000;

// This Map stores the game state in memory for every active player
// Key: username, Value: player object (state + socketId)
const activePlayers = new Map<string, any>();

io.on('connection', (socket) => {
  console.log(`[server]: New connection: ${socket.id}`);

  // --- LOGIN LOGIC ---
  socket.on('playerLogin', async (username: string) => {
    console.log(`[server]: Login attempt for: ${username}`);

    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      socket.emit('loginError', 'Username must be at least 3 characters.');
      return;
    }

    try {
      // 1. Fetch from DB
      let { data, error } = await getPlayer(username);

      // 2. If user doesn't exist, create them.
      //    PGRST116 = "no rows found" from .single() - that just means this
      //    is a new player, not a real failure, so only bail out on other
      //    error codes (bad env vars, missing table, RLS, etc.)
      if (!data) {
        if (error && error.code !== 'PGRST116') {
          console.error(`[server]: Error fetching ${username}:`, error);
          socket.emit('loginError', 'Could not reach the database. Please try again.');
          return;
        }

        const { data: newData, error: createError } = await createPlayer(username);
        if (createError || !newData) {
          console.error(`[server]: Error creating ${username}:`, createError);
          socket.emit('loginError', 'Could not create a new player.');
          return;
        }
        data = newData;
      }

      // 3. Store in active memory
      const defaultInventory = { 'Oak Log': 0, 'Pine Log': 0, 'Maple Log': 0, 'Mahogany Log': 0, 'Yew Log': 0, 'Copper Ore': 0, 'Iron Ore': 0, 'Silver Ore': 0, 'Gold Ore': 0, 'Mithril Ore': 0 };
      data.inventory = { ...defaultInventory, ...(data.inventory || {}) };

      activePlayers.set(username, { ...data, socketId: socket.id, workerActions: [], pendingEvents: [] });

      // 4. Send success to client
      socket.emit('loginSuccess', activePlayers.get(username));
    } catch (err) {
      console.error(`[server]: Unexpected login error for ${username}:`, err);
      socket.emit('loginError', 'Unexpected server error. Please try again.');
    }
  });

  // --- PLAYER ACTION LOGIC ---
  socket.on('playerAction', (payload) => {
    // Find which player sent this action
    for (const [username, state] of activePlayers.entries()) {
      if (state.socketId === socket.id) {

        const { type, node } = payload;

        if (type === 'startManual' && !state.manualAction) {
          state.manualAction = { ...node, progress: 0 };
        }

        if (type === 'assignWorker' && state.workers_total > 0) {
          if (!state.workerActions) state.workerActions = [];
          if (state.workerActions.length < state.workers_total) {
            state.workerActions.push({ ...node, progress: 0 });
          }
        }

        if (type === 'recallWorker') {
          if (!state.workerActions) state.workerActions = [];
          const { nodeId } = payload;
          const idx = state.workerActions.findIndex((w: any) => w.id === nodeId);
          if (idx !== -1) state.workerActions.splice(idx, 1);
        }

        if (type === 'upgradeTool') {
          const { skill, part } = payload;

          if (!state.tools) state.tools = {};
          if (!state.tools.woodcutting) state.tools.woodcutting = { handle: 1, metal: 1, bindings: 1, critChance: 1, critDamage: 1, grip: 1, enchantment: 1 };
          if (!state.tools.mining) state.tools.mining = { handle: 1, metal: 1, bindings: 1, critChance: 1, critDamage: 1, grip: 1, enchantment: 1 };
          if (!state.tools.foraging) state.tools.foraging = { handle: 1, metal: 1, bindings: 1, critChance: 1, critDamage: 1, grip: 1, enchantment: 1 };

          if (!state.tools.woodcutting.bindings) state.tools.woodcutting.bindings = 1;
          if (!state.tools.mining.bindings) state.tools.mining.bindings = 1;
          if (!state.tools.foraging.bindings) state.tools.foraging.bindings = 1;

          applyToolUpgrade(state, skill, part);
        }

        // 🔴 FORCE SYNC: Tell the frontend the action state changed immediately
        socket.emit('gameStateUpdate', state);

        break;
      }
    }
  });

  // --- DISCONNECT LOGIC ---
  socket.on('disconnect', async () => {
    for (const [username, state] of activePlayers.entries()) {
      if (state.socketId === socket.id) {
        // Save progress one last time on logout
        await savePlayer(username, state);
        activePlayers.delete(username);
        console.log(`[server]: ${username} logged out and saved.`);
        break;
      }
    }
  });
});

// --- THE GAME LOOP (Tick Rate: 100ms) ---
setInterval(() => {
  for (const [username, state] of activePlayers.entries()) {
    let stateChanged = false;
    let xpGained = 0;
    const resGained: Record<string, number> = {};

    if (state.manualAction) {
      // Infer skill based on the yield name
      let skill = 'woodcutting';
      if (state.manualAction.yields.includes('Ore')) skill = 'mining';
      if (state.manualAction.yields.includes('Fiber')) skill = 'foraging';

      const handleLevel = state.tools?.[skill]?.handle || 1;
      const speedMultiplier = 1 + ((handleLevel - 1) * 0.25);

      state.manualAction.progress += (100 * speedMultiplier);
      stateChanged = true;

      if (state.manualAction.progress >= state.manualAction.time) {
        const metalLevel = state.tools?.[skill]?.metal || 1;
        const bindingsLevel = state.tools?.[skill]?.bindings || 1;
        const xpMultiplier = 1 + ((bindingsLevel - 1) * 0.20); // +20% XP per level

        xpGained += Math.floor(state.manualAction.xpReward * xpMultiplier);
        resGained[state.manualAction.yields] = (resGained[state.manualAction.yields] || 0) + (1 * metalLevel);
        state.manualAction = null;
      }
    }

    // 2. Process Worker Actions
    if (state.workerActions?.length) {
      for (const workerAction of state.workerActions) {
        let skill = 'woodcutting';
        if (workerAction.yields.includes('Ore')) skill = 'mining';
        if (workerAction.yields.includes('Fiber')) skill = 'foraging';

        const handleLevel = state.tools?.[skill]?.handle || 1;
        const speedMultiplier = 1 + ((handleLevel - 1) * 0.25);

        workerAction.progress += (20 * speedMultiplier);
        stateChanged = true;

        if (workerAction.progress >= workerAction.time) {
          const metalLevel = state.tools?.[skill]?.metal || 1;
          const bindingsLevel = state.tools?.[skill]?.bindings || 1;
          const xpMultiplier = 1 + ((bindingsLevel - 1) * 0.20);

          xpGained += Math.floor(workerAction.xpReward * xpMultiplier);
          resGained[workerAction.yields] = (resGained[workerAction.yields] || 0) + (1 * metalLevel);
          workerAction.progress = 0;
        }
      }
    }

    // 3. Update XP and Resources
    if (xpGained > 0 || Object.keys(resGained).length > 0) {
      state.xp += xpGained;
      for (const [item, amount] of Object.entries(resGained)) {
        state.inventory[item] = (state.inventory[item] || 0) + amount;
      }

      // Level Up Logic
      if (state.xp >= state.xp_needed) {
        state.level += 1;
        state.xp -= state.xp_needed;
        state.xp_needed = Math.floor(state.xp_needed * 1.6);
        // Grant workers at levels 2, 5, and 10 (max 3)
        if (state.level >= 2 && state.workers_total < 1) state.workers_total = 1;
        if (state.level >= 5 && state.workers_total < 2) state.workers_total = 2;
        if (state.level >= 10 && state.workers_total < 3) state.workers_total = 3;
      }
      stateChanged = true;
    }

    // 4. Send updates ONLY to the player who owns this state
    if (stateChanged) {
      const socket = io.sockets.sockets.get(state.socketId);
      if (socket) {
        socket.emit('gameStateUpdate', state);
        state.pendingEvents = []; // clear after sending so events don't fire twice
      }
    } else {
      // Always clear pending events even if state didn't change this tick
      state.pendingEvents = [];
    }
  }
}, 100);

// --- PERIODIC SAVE LOOP ---
// Save active players to DB every 30 seconds
setInterval(async () => {
  for (const [username, state] of activePlayers.entries()) {
    await savePlayer(username, state);
  }
  console.log(`[server]: Auto-saved ${activePlayers.size} players to DB.`);
}, 30000);

app.get('/status', (req: Request, res: Response) => {
  res.json({ status: 'game server running' });
});

// Cast port to a Number and explicitly bind to '0.0.0.0'
httpServer.listen(Number(port), '0.0.0.0', () => {
  console.log(`[server]: Listening on port ${port}`);
});