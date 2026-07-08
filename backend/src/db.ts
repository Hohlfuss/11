import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables! Check your .env file.');
}

// Initialize the Supabase Client
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// Define a type for the game state to keep TypeScript happy
export interface PlayerState {
  username: string;
  level: number;
  xp: number;
  xp_needed: number;
  workers_total: number;
  password_hash: string;
  total_clicks: number;
  total_gathered: number;
  inventory: Record<string, number>;
}

// --- DATABASE HELPER FUNCTIONS ---

export async function getPlayer(username: string) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('username', username)
    .single(); // Returns the single row matching the username

  return { data, error };
}

export async function savePlayer(username: string, state: any) {
  // We map the memory state to the database columns
  const { error } = await supabase
    .from('players')
    .update({
      level: state.level,
      xp: state.xp,
      xp_needed: state.xp_needed,
      inventory: state.inventory,
      workers_total: state.workers_total,
      tools: state.tools,
      total_clicks: state.total_clicks || 0,
      total_gathered: state.total_gathered || 0
    })
    .eq('username', username);

  if (error) console.error('Supabase Save Error:', error);
  return { error };
}

export async function createPlayer(username: string, passwordHash: string) {
  const defaultState: PlayerState = {
    username,
    level: 1,
    xp: 0,
    xp_needed: 100,
    workers_total: 0,
    password_hash: passwordHash,
    total_clicks: 0,
    total_gathered: 0,
    inventory: {
      'Oak Log': 0, 'Pine Log': 0, 'Maple Log': 0, 'Mahogany Log': 0, 'Yew Log': 0,
      'Copper Ore': 0, 'Iron Ore': 0, 'Silver Ore': 0, 'Gold Ore': 0, 'Mithril Ore': 0,
      "Cotton Fiber": 0, "Hemp Fiber": 0, 'Flax Fiber': 0, 'Silk Fiber': 0, 'Magic Fiber': 0
    }
  };

  const { data, error } = await supabase
    .from('players')
    .insert(defaultState)
    .select()
    .single();

  return { data, error };
}

// 3. ADD THIS NEW FUNCTION AT THE BOTTOM:
export async function getTopPlayers(columnName: string) {
  // columnName will be 'level', 'total_clicks', or 'total_gathered'
  const { data, error } = await supabase
    .from('players')
    .select('username, level, total_clicks, total_gathered')
    .order(columnName, { ascending: false }) // Sort highest to lowest
    .limit(10); // Only get top 10

  if (error) console.error('Leaderboard Fetch Error:', error);
  return data || [];
}