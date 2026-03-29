import { supabase, APP_ID, TABLES } from './supabaseClient.js';
import { currentUser } from './auth.js';

// ── Planets ──
export async function savePlanet(planetState, name, isPublic) {
  if (!currentUser) return null;
  const payload = {
    app_id: APP_ID,
    name,
    planet_data: planetState.planetData,
    atmosphere: planetState.atmosphere,
    biome_counts: planetState.biomeCounts,
    moon_count: planetState.moonCount,
    population: planetState.population,
    habitability_score: planetState.habitability,
    is_public: isPublic
  };
  const { data, error } = await supabase.from(TABLES.PLANETS).insert(payload).select();
  if (error) { console.error('Save error:', error); return null; }
  return data?.[0];
}

export async function fetchMyPlanets() {
  if (!currentUser) return [];
  const { data } = await supabase.from(TABLES.PLANETS)
    .select('*').eq('user_id', currentUser.id).eq('app_id', APP_ID)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function deletePlanet(id) {
  await supabase.from(TABLES.PLANETS).delete().eq('id', id);
}

export async function fetchPublicPlanets() {
  const { data } = await supabase.from(TABLES.PLANETS)
    .select('*').eq('app_id', APP_ID).eq('is_public', true)
    .order('created_at', { ascending: false }).limit(50);
  return data || [];
}

export async function fetchLeaderboard() {
  const { data } = await supabase.from(TABLES.PLANETS)
    .select('*').eq('app_id', APP_ID).eq('is_public', true)
    .order('habitability_score', { ascending: false }).limit(20);
  return data || [];
}

// ── Ratings ──
export async function fetchPlanetRatings(planetId) {
  const { data } = await supabase.from(TABLES.RATINGS)
    .select('stars').eq('planet_id', planetId).eq('app_id', APP_ID);
  if (!data || data.length === 0) return { avg: 0, count: 0 };
  const avg = data.reduce((s, r) => s + r.stars, 0) / data.length;
  return { avg: Math.round(avg * 10) / 10, count: data.length };
}

export async function ratePlanet(planetId, stars) {
  if (!currentUser) return;
  const { data: existing } = await supabase.from(TABLES.RATINGS)
    .select('id').eq('planet_id', planetId).eq('rater_user_id', currentUser.id)
    .eq('app_id', APP_ID).limit(1);
  if (existing && existing.length > 0) {
    await supabase.from(TABLES.RATINGS).update({ stars }).eq('id', existing[0].id);
  } else {
    await supabase.from(TABLES.RATINGS).insert({
      app_id: APP_ID, planet_id: planetId, stars, rater_user_id: currentUser.id
    });
  }
}

export async function getUserProfile(userId) {
  const { data } = await supabase.from(TABLES.APP_USERS)
    .select('display_name, avatar_emoji')
    .eq('user_id', userId).eq('app_id', APP_ID).limit(1);
  return data?.[0] || { display_name: 'Unknown', avatar_emoji: '🌍' };
}