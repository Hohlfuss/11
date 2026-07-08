import express, { type Request, type Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { getPlayer, createPlayer, savePlayer, getTopPlayers } from './db.js';
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

      const savedTools = data.tools || {};
      data.tools = {
        woodcutting: { handle: 1, metal: 1, grip: 1, ...savedTools.woodcutting },
        mining: { handle: 1, metal: 1, grip: 1, ...savedTools.mining },
        foraging: { handle: 1, bindings: 1, grip: 1, ...savedTools.foraging }
      };

      activePlayers.set(username, { ...data, socketId: socket.id, workerActions: [], pendingEvents: [] });
      socket.emit('loginSuccess', activePlayers.get(username));
    } catch (err) {
      socket.emit('loginError', 'Server error during login.');
    }
  });

  // --- GAME ACTIONS ---
  socket.on('startManualAction', (actionPayload) => {

    const username = socket.data?.username;
    if (!username) {
      return; 
    }

    const state = activePlayers.get(username);
    if (!state) {
      return;
    }

    state.total_clicks = (state.total_clicks || 0) + 1;

    state.manualAction = {
      ...actionPayload,
      progress: 0
    };
    
    socket.emit('gameStateUpdate', state);
  });

  // 3. NEW LISTENER: FETCH LEADERBOARDS
  socket.on('requestLeaderboard', async (category) => {
    // category will be 'level', 'total_clicks', or 'total_gathered'
    const top10 = await getTopPlayers(category);
    
    // Send it right back to whoever asked for it
    socket.emit('leaderboardData', { category, players: top10 });
  });

  // --- ASSIGN A WORKER ---
  socket.on('assignWorker', (nodePayload) => {
    const username = socket.data?.username;
    if (!username) return;

    const state = activePlayers.get(username);
    if (!state) return;

    // 1. Safety Check: Make sure they actually have a free worker to assign!
    if (state.workerActions.length >= state.workers_total) {
      return; // Ignore the click if they are maxed out
    }

    // 2. Add the new task to their worker array, starting at 0 progress
    state.workerActions.push({
      ...nodePayload,
      progress: 0
    });
    
    socket.emit('gameStateUpdate', state);
  });


  // --- RECALL A WORKER ---
  socket.on('recallWorker', (nodeId) => {
    const username = socket.data?.username;
    if (!username) return;

    const state = activePlayers.get(username);
    if (!state) return;

    // Remove the worker task that matches this specific node ID
    state.workerActions = state.workerActions.filter((action: any) => action.id !== nodeId);
    
    socket.emit('gameStateUpdate', state);
  });
  
  // You will also need your upgrade handler if it's missing!
  socket.on('upgradeTool', (payload) => {
    console.log('🚨 BACKEND: Crafting request received:', payload); // TRACKER

    const username = socket.data?.username;
    if (!username) {
      console.log('❌ Crafting Failed: No username found on socket.');
      return;
    }

    const state = activePlayers.get(username);
    if (!state) {
      console.log('❌ Crafting Failed: No active state found.');
      return;
    }

    const { skill, part } = payload;
    const success = applyToolUpgrade(state, skill, part);
    
    if (success) {
      console.log(`✅ Crafting SUCCESS! Upgraded ${skill} ${part} for ${username}`);
      io.to(state.socketId).emit('gameStateUpdate', state);
    } else {
      console.log(`❌ Crafting REJECTED! Not enough resources to upgrade ${skill} ${part}.`);
      
      // Send a message back to the UI so the player knows why it didn't work!
      socket.emit('actionError', 'Not enough resources to craft this upgrade.');
    }
  })
})

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
        state.total_gathered = (state.total_gathered || 0) + (1 * metalLevel);
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
          state.total_gathered = (state.total_gathered || 0) + (1 * metalLevel);
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
      // THE FIX: Use io.to().emit() - it is foolproof for targeting socket IDs
      io.to(state.socketId).emit('gameStateUpdate', state);
      
      state.pendingEvents = []; 
    } else {
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