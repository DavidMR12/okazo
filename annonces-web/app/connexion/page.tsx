import type { Metadata } from 'next';
import { getAuthMethods, getCountries } from '@/lib/api';
import { requestRegion } from '@/lib/regionServer';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Connexion', robots: { index: false } };

const FALLBACK = [
  { code: 'CM', name: 'Cameroun', dialCode: '+237', currencyCode: 'XAF' },
  { code: 'GA', name: 'Gabon', dialCode: '+241', currencyCode: 'XAF' },
  { code: 'CG', name: 'Congo', dialCode: '+242', currencyCode: 'XAF' },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const { retour } = await searchParams;
  const [all, methods, region] = await Promise.all([getCountries().catch(() => []), getAuthMethods().catch(() => ({ otpChannels: ['sms' as const], google: false, facebook: false })), requestRegion()]);
  // Seulement le pays du visiteur (comme Uber) : ni liste de pays, ni indicatif au choix
  const mine = (list: typeof FALLBACK) => list.filter((c) => c.code.toLowerCase() === region.country);
  const countries = mine(all).length ? mine(all) : mine(FALLBACK).length ? mine(FALLBACK) : FALLBACK.slice(0, 1);
  return (
    <div className="auth-page">
      <div className="narrow auth-card">
      <LoginForm countries={countries} returnTo={retour} methods={methods} />
      </div>
    </div>
  );
}
