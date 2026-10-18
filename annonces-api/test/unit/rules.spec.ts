import { decodeCursor, encodeCursor } from '../../src/common/cursor';
import { isPendingKeyOf, isProcessedKeyOf, pendingKey, thumbKey } from '../../src/media/media-keys';
import { scanMessage } from '../../src/messaging/message-rules';

describe('Signaux d’arnaque dans les messages', () => {
  it.each([
    ['Il faut verser un acompte de 20 000', ['advance_payment']],
    ['Payez les frais de livraison à l’avance', ['advance_payment']],
    ['Frais de dossier : 15 000 F', ['advance_payment']],
    ['Envoi par MoneyGram uniquement', ['money_transfer']],
    ['Donnez-moi le code de retrait', ['money_transfer']],
    ['Voir https://exemple.org/annonce', ['link']],
    ['Mon site : boutique-promo.xyz', ['link']],
    ['Envoie-moi ton code stp', ['code_request']],
    ['Quel est le code que vous avez reçu ?', ['code_request']],
  ])('« %s »', (text, flags) => {
    expect(scanMessage(text)).toEqual(flags);
  });

  it.each([
    'Bonjour, le prix est-il négociable ?',
    'On se voit au carrefour Ndokoti à 15 h',
    'Le code postal ne sert à rien ici',
    'Je paie à la livraison, en main propre',
  ])('ne signale pas un message normal : « %s »', (text) => {
    expect(scanMessage(text)).toEqual([]);
  });

  it('ignore accents et majuscules', () => {
    expect(scanMessage('ACOMPTE À L’AVANCE')).toEqual(['advance_payment']);
  });
});

describe('Curseur de pagination', () => {
  const id = '0b0e6f1c-4a52-4b6e-9a51-6f0a3f1f2a10';

  it('aller-retour sans perte de précision', () => {
    const ts = '2026-10-04 09:15:02.123456+00';
    expect(decodeCursor(encodeCursor(ts, id))).toEqual({ t: ts, i: id });
  });

  it.each([
    ['texte quelconque', 'abc'],
    ['JSON sans date', Buffer.from(JSON.stringify({ i: id })).toString('base64url')],
    ['date injectée', Buffer.from(JSON.stringify({ t: "2026-01-01' or 1=1 --", i: id })).toString('base64url')],
    ['identifiant invalide', Buffer.from(JSON.stringify({ t: '2026-10-04 09:15:02+00', i: '1; drop' })).toString('base64url')],
  ])('refuse : %s', (_label, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow();
  });
});

describe('Clés de stockage des photos', () => {
  const user = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const uuid = '33333333-3333-4333-8333-333333333333';

  it('une clé en attente appartient à son seul auteur', () => {
    const key = pendingKey(user, uuid, 'jpg');
    expect(isPendingKeyOf(user, key)).toBe(true);
    expect(isPendingKeyOf(other, key)).toBe(false);
  });

  it('refuse les chemins détournés', () => {
    expect(isPendingKeyOf(user, `pending/${user}/../${other}/${uuid}.jpg`)).toBe(false);
    expect(isPendingKeyOf(user, `pending/${user}/${uuid}.jpg.html`)).toBe(false);
    expect(isPendingKeyOf(user, `verifications/${user}/${uuid}.jpg`)).toBe(false);
  });

  it('photo traitée et miniature', () => {
    const full = `listings/${user}/${uuid}-1200.webp`;
    expect(isProcessedKeyOf(user, full)).toBe(true);
    expect(isProcessedKeyOf(other, full)).toBe(false);
    expect(thumbKey(full)).toBe(`listings/${user}/${uuid}-400.webp`);
  });
});
