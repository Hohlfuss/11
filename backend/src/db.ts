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
      workers_total: state.workers_total
    })
    .eq('username', username);
  
  if (error) console.error('Supabase Save Error:', error);
  return { error };
}

export async function createPlayer(username: string) {
  const defaultState: PlayerState = {
    username,
    level: 1,
    xp: 0,
    xp_needed: 100,
    workers_total: 0,
    inventory: { 'Oak Log': 0, 'Pine Log': 0, 'Copper Ore': 0, 'Iron Ore': 0 }
  };
  
  const { data, error } = await supabase
    .from('players')
    .insert(defaultState)
    .select()
    .single();
  
  return { data, error };
}