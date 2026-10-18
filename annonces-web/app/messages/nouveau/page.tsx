import { NewConversation } from './NewConversation';

export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ annonce?: string; titre?: string; message?: string }> }) {
  const { annonce, titre, message } = await searchParams;
  // message : texte préparé (depuis le panier, avec tous les articles du vendeur)
  return <NewConversation listingId={annonce ?? ''} title={titre ?? ''} message={message?.slice(0, 2000)} />;
}
