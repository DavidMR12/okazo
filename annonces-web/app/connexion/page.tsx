import type { Metadata } from 'next';
import { getAuthMethods, getCountries } from '@/lib/api';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Connexion', robots: { index: false } };

const FALLBACK = [
  { code: 'CM', name: 'Cameroun', dialCode: '+237', currencyCode: 'XAF' },
  { code: 'GA', name: 'Gabon', dialCode: '+241', currencyCode: 'XAF' },
  { code: 'CG', name: 'Congo', dialCode: '+242', currencyCode: 'XAF' },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const { retour } = await searchParams;
  const [countries, methods] = await Promise.all([getCountries().catch(() => []), getAuthMethods().catch(() => ({ otpChannels: ['sms' as const], google: false, facebook: false }))]);
  return (
    <div className="auth-page">
      <div className="narrow auth-card">
      <LoginForm countries={countries.length ? countries : FALLBACK} returnTo={retour} methods={methods} />
      </div>
    </div>
  );
}
