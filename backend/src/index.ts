import express, { type Request, type Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { getPlayer, createPlayer, savePlayer } from './db.js';

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
      activePlayers.set(username, { ...data, socketId: socket.id });

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
          state.workerAction = { ...node, progress: 0 };
        }
        
        if (type === 'recallWorker') {
          state.workerAction = null;
        }
        
        // --- ADD THIS BLOCK ---
        if (type === 'upgradeTool') {
          const { skill, part } = payload;

          // Ensure the tools object exists for players created before this update
          if (!state.tools) {
            state.tools = {
              woodcutting: { handle: 1, metal: 1 },
              mining: { handle: 1, metal: 1 }
            };
          }

          const costMap: Record<string, Record<string, string>> = {
            woodcutting: { handle: 'Oak Log', metal: 'Copper Ore' },
            mining: { handle: 'Copper Ore', metal: 'Iron Ore' }
          };

          const currentLevel = state.tools[skill][part];
          const costAmount = currentLevel * 10;
          const costItem = costMap[skill]?.[part] ?? 'Oak Log';

          if ((state.inventory[costItem] || 0) >= costAmount) {
            state.inventory[costItem] -= costAmount;
            state.tools[skill][part] += 1;
          }
        }
        // ----------------------
        
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

    // 1. Process Manual Action
    if (state.manualAction) {
      const skill = state.manualAction.yields.includes("Log") ? "woodcutting" : "mining";
      const handleLevel = state.tools?.[skill]?.handle || 1;
      const speedMultiplier = 1 + ((handleLevel - 1) * 0.25);

      state.manualAction.progress += (100 * speedMultiplier);
      stateChanged = true;

      if (state.manualAction.progress >= state.manualAction.time) {
        const metalLevel = state.tools?.[skill]?.metal || 1;

        xpGained += state.manualAction.xpReward;
        resGained[state.manualAction.yields] = (resGained[state.manualAction.yields] || 0) + (1 * metalLevel);
        state.manualAction = null;
      }
    }

    // 2. Process Worker Action
    if (state.workerAction) {
      // Infer skill based on the yield name
      const skill = state.workerAction.yields.includes('Log') ? 'woodcutting' : 'mining';
      const handleLevel = state.tools?.[skill]?.handle || 1;
      const speedMultiplier = 1 + ((handleLevel - 1) * 0.25); // +25% speed per level

      state.workerAction.progress += (100 * speedMultiplier);
      stateChanged = true;
      
      if (state.workerAction.progress >= state.workerAction.time) {
        const metalLevel = state.tools?.[skill]?.metal || 1;

        xpGained += state.workerAction.xpReward;
        resGained[state.workerAction.yields] = (resGained[state.workerAction.yields] || 0) + (1 * metalLevel);
        state.workerAction.progress = 0;
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
        if (state.level >= 2 && state.workers_total === 0) {
          state.workers_total = 1;
        }
      }
      stateChanged = true;
    }

    // 4. Send updates ONLY to the player who owns this state
    if (stateChanged) {
      const socket = io.sockets.sockets.get(state.socketId);
      if (socket) {
        socket.emit('gameStateUpdate', state);
      }
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