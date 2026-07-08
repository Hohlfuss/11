import express, { type Request, type Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { getPlayer, createPlayer, savePlayer } from './db.js';
import { applyToolUpgrade } from './gameLogic.js';
import bcrypt from "bcrypt";

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
  // --- REGISTRATION LOGIC ---
  socket.on('registerUser', async (payload) => {
    const { username, password } = payload;

    if (!username || username.trim().length < 3) {
      return socket.emit('registerError', 'Username must be at least 3 characters.');
    }
    if (!password || password.length < 6) {
      return socket.emit('registerError', 'Password must be at least 6 characters.');
    }

    try {
      // 1. Check availability
      const { data: existingUser } = await getPlayer(username);
      if (existingUser) {
        return socket.emit('registerError', 'Username is already taken.');
      }

      // 2. Hash and store
      const saltRounds = 10;
      const hash = await bcrypt.hash(password, saltRounds);
      
      const { error: createError } = await createPlayer(username, hash);
      if (createError) {
        console.error('Supabase Registration Error:', createError);
        return socket.emit('registerError', 'Database error during registration.');
      }
      
      socket.emit('registerSuccess', 'Registration successful! You can now log in.');
    } catch (err) {
      socket.emit('registerError', 'Server error during registration.');
    }
  });

  // --- LOGIN LOGIC ---
  socket.on('playerLogin', async (payload) => {
    const { username, password } = payload;
  
    // ---> ADD THIS: Attach the username to this specific connection
    socket.data = { username };

    try {
      let { data, error } = await getPlayer(username);

      if (!data) {
        return socket.emit('loginError', 'Invalid username or password.');
      }

      // Verify password
      const match = await bcrypt.compare(password, data.password_hash);
      if (!match) {
        return socket.emit('loginError', 'Invalid username or password.');
      }

      // Initialize memory state
      const defaultInventory = { 'Oak Log': 0, /* ... fill defaults ... */ };
      data.inventory = { ...defaultInventory, ...(data.inventory || {}) };

      // ---> ADD THIS BLOCK: Ensure 'tools' exists so the frontend doesn't crash
      const defaultTools = {
        woodcutting: { handle: 1, metal: 1, grip: 1 },
        mining: { handle: 1, metal: 1, grip: 1 },
        foraging: { handle: 1, bindings: 1, grip: 1 }
      };
      data.tools = { ...defaultTools, ...(data.tools || {}) };
      // <---

      activePlayers.set(username, { ...data, socketId: socket.id, workerActions: [], pendingEvents: [] });
      socket.emit('loginSuccess', activePlayers.get(username));
    } catch (err) {
      socket.emit('loginError', 'Server error during login.');
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
      let skill = state.manualAction.skill || 'woodcutting';
      if (state.manualAction.yields.includes('Ore')) skill = 'mining';
      if (state.manualAction.yields.includes('Fiber')) skill = 'foraging';

      const handleLevel = state.tools?.[skill]?.handle || 1;
      const speedMultiplier = Math.pow(1.25, handleLevel - 1);

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