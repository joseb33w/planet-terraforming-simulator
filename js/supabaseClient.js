import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://xhhmxabftbyxrirvvihn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NZHoIxqqpSvVBP8MrLHCYA_gmg1AbN-';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const APP_ID = 'planet-terraform';

export const TABLES = {
  APP_USERS: 'uNMexs7BYTXQ2_planet_terraform_app_users',
  PLANETS:   'uNMexs7BYTXQ2_planet_terraform_planets',
  RATINGS:   'uNMexs7BYTXQ2_planet_terraform_ratings'
};