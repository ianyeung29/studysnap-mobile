import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

// Central Supabase Config
// Replace these with your actual Supabase URL and Anon Key in production
export const SUPABASE_URL = "https://xxwqpanfytavfvabhtbz.supabase.co"; /* https://studysnap-backend-kittycatty.supabase.co */
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4d3FwYW5meXRhdmZ2YWJodGJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2Mzg4NzMsImV4cCI6MjA5OTIxNDg3M30.ZK6xHXELadLNOBfacwJBw7dEG7dozjWW-g5OQZMnHvg"; 

// Custom SecureStore storage adapter for Supabase session persistence
const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Helper to fetch the current active session access token from SecureStore.
 */
export async function getVerifiedToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}
