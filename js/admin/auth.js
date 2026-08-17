import { supabase } from '../supabase-client.js';

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
}

// تتحقق من وجود جلسة صالحة وأن صاحبها admin/owner فعلياً (وليس فقط تسجيل دخول ناجح)
export async function getAdminSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', session.user.id)
    .single();

  if (error || !profile || !['owner', 'admin'].includes(profile.role)) {
    return null;
  }

  return { session, profile };
}
