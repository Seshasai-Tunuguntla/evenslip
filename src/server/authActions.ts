'use server';
import { signIn, signOut } from '@/auth';

export async function signInAsDemo() {
  await signIn('demo', { redirectTo: '/dashboard' });
}

export async function signInWithGithub(form: FormData) {
  const to = form.get('redirectTo');
  // Only back to a page of our own.
  const redirectTo = typeof to === 'string' && /^\/(?!\/)[\w/-]*$/.test(to) ? to : '/dashboard';
  await signIn('github', { redirectTo });
}

export async function signOutNow() {
  await signOut({ redirectTo: '/' });
}
