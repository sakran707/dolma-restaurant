import { supabase } from '../supabase-client.js';

// تحويل رقم هاتف عراقي محلي (07xxxxxxxxx أو 7xxxxxxxxx) إلى صيغة دولية +964xxxxxxxxx
// المطلوبة من Supabase Auth لتسجيل الدخول بالهاتف
function normalizePhone(raw) {
  const digits = raw.replace(/[\s-]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  if (digits.startsWith('0')) return '+964' + digits.slice(1);
  return '+964' + digits;
}

// تقبل إما بريداً إلكترونياً أو رقم هاتف عراقي في نفس الحقل
export async function login(identifier, password) {
  const trimmed = identifier.trim();
  const isEmail = trimmed.includes('@');
  const payload = isEmail
    ? { email: trimmed, password }
    : { phone: normalizePhone(trimmed), password };

  const { data, error } = await supabase.auth.signInWithPassword(payload);
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
