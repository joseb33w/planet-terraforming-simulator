import { supabase, APP_ID, TABLES } from './supabaseClient.js';

export let currentUser = null;
export let userProfile = null;

export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: 'https://sling-gogiapp.web.app/email-confirmed.html' }
  });
  if (error) throw error;
  await supabase.from(TABLES.APP_USERS).insert({
    app_id: APP_ID, email,
    display_name: displayName || email.split('@')[0],
    avatar_emoji: '🌍'
  });
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  currentUser = null;
  userProfile = null;
}

export async function getSession() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    currentUser = user;
    const { data } = await supabase.from(TABLES.APP_USERS)
      .select('*').eq('user_id', user.id).eq('app_id', APP_ID).limit(1);
    userProfile = data?.[0] || null;
  }
  return currentUser;
}

export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      currentUser = session.user;
      const { data } = await supabase.from(TABLES.APP_USERS)
        .select('*').eq('user_id', session.user.id).eq('app_id', APP_ID).limit(1);
      userProfile = data?.[0] || null;
    } else {
      currentUser = null; userProfile = null;
    }
    callback(event, session);
  });
}