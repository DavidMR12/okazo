import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="narrow stack">
      <h1>Page introuvable</h1>
      <p>L’annonce a peut-être été vendue, retirée ou a expiré.</p>
      <Link href="/" className="btn">Voir les annonces</Link>
    </div>
  );
}
