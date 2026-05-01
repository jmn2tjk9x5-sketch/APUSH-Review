import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const storageKeys = {
  authUser: 'apush-review-local-user',
  attempts: 'apush-review-attempts'
};

let supabase = null;
if (hasSupabaseConfig) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const auth = {
  isConfigured() {
    return hasSupabaseConfig;
  },

  async getUser() {
    if (!supabase) return loadJson(storageKeys.authUser, null);
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  },

  async signInWithEmail(email) {
    if (!supabase) {
      const fakeUser = {
        id: `local-${email.toLowerCase()}`,
        email,
        app_metadata: { provider: 'local' }
      };
      saveJson(storageKeys.authUser, fakeUser);
      window.dispatchEvent(new CustomEvent('apush-auth-changed', { detail: fakeUser }));
      return { data: { user: fakeUser }, error: null };
    }
    return supabase.auth.signInWithOtp({ email });
  },

  async signOut() {
    if (!supabase) {
      localStorage.removeItem(storageKeys.authUser);
      window.dispatchEvent(new CustomEvent('apush-auth-changed', { detail: null }));
      return;
    }
    await supabase.auth.signOut();
  },

  onChange(callback) {
    if (!supabase) {
      const handler = (event) => callback(event.detail);
      window.addEventListener('apush-auth-changed', handler);
      return () => window.removeEventListener('apush-auth-changed', handler);
    }

    const { data } = supabase.auth.onAuthStateChange(async () => {
      const { data: userData } = await supabase.auth.getUser();
      callback(userData.user ?? null);
    });

    return () => data.subscription.unsubscribe();
  }
};

const progressStore = {
  async recordAttempt(payload) {
    const attempt = {
      ...payload,
      created_at: new Date().toISOString()
    };

    if (!supabase) {
      const attempts = loadJson(storageKeys.attempts, []);
      attempts.unshift(attempt);
      saveJson(storageKeys.attempts, attempts.slice(0, 500));
      return attempt;
    }

    const user = await auth.getUser();
    if (!user) return attempt;

    const dbAttempt = {
      user_id: user.id,
      content_key: payload.content_key,
      content_title: payload.content_title,
      amsco_period: payload.amsco_period,
      mode: payload.mode,
      question_type: payload.question_type,
      correct: payload.correct,
      metadata: payload.metadata ?? {}
    };

    await supabase.from('question_attempts').insert(dbAttempt);
    return attempt;
  },

  async listAttempts() {
    if (!supabase) {
      return loadJson(storageKeys.attempts, []);
    }

    const user = await auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('question_attempts')
      .select('content_key, content_title, amsco_period, mode, question_type, correct, created_at, metadata')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return [];
    return data ?? [];
  }
};

export { auth, progressStore, hasSupabaseConfig };
