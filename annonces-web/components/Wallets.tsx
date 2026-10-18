/* eslint-disable @next/next/no-img-element -- petits logos fixes, servis tels quels */

/**
 * Portefeuilles électroniques (décision du porteur, 15 octobre 2026) : logo officiel de l'opérateur sur sa
 * couleur de marque (sources : Maquettes/logos-paiement/SOURCES.md), nom du portefeuille écrit à côté.
 * Le vendeur indique ceux qu'il accepte ; le paiement se fait entre acheteur et vendeur, à la remise.
 */
export const WALLETS: Record<string, { name: string; logo: string }> = {
  mtn_momo: { name: 'MTN MoMo', logo: '/wallets/mtn-momo.png' },
  orange_money: { name: 'Orange Money', logo: '/wallets/orange-money.png' },
  airtel_money: { name: 'Airtel Money', logo: '/wallets/airtel-money.png' },
  moov_money: { name: 'Moov Money', logo: '/wallets/moov-money.png' },
  wave: { name: 'Wave', logo: '/wallets/wave.png' },
};

export const walletName = (code: string) => WALLETS[code]?.name ?? code;

export function WalletLogo({ code, height = 28 }: { code: string; height?: number }) {
  const w = WALLETS[code];
  if (!w) return null;
  return <img className="wallet-logo" src={w.logo} alt="" width={Math.round((height * 240) / 150)} height={height} />;
}

/** « Paiement accepté » : logos et noms des portefeuilles. */
export function WalletList({ codes }: { codes: string[] }) {
  if (!codes.length) return null;
  return (
    <ul className="wallet-list" aria-label="Paiements électroniques acceptés">
      {codes.map((c) => (
        <li key={c} className="wallet">
          <WalletLogo code={c} />
          <span>{walletName(c)}</span>
        </li>
      ))}
    </ul>
  );
}
