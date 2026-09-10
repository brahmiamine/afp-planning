import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect, createAccount, authedContext } from './fixtures';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';
import { getOrCreateDirectRoom } from '@/lib/chat/service';

/** Bulle du fil, pas l'aperçu « Auteur: … » de la liste des conversations. */
function chatBubble(page: Page, text: string) {
  return page.locator('p.whitespace-pre-wrap.break-words', { hasText: text });
}

/**
 * Parcours e2e chat (issue #263) : le chat — fonctionnalité majeure à temps réel
 * Socket.IO — n'avait aucun parcours navigateur bout-en-bout malgré la fermeture de
 * #207. Deux comptes réels, un salon privé, envoi/réception en temps réel, accusé de
 * lecture, puis reconnexion avec reprise (`chat:resume`) après une coupure réseau —
 * un comportement que seuls de vrais navigateurs/sockets peuvent vérifier (les tests
 * d'intégration `socket-server.integration.test.ts` couvrent le protocole, pas la
 * page réellement rendue ni la reconnexion du client socket.io-client).
 */
test('un message privé est reçu en temps réel, marqué lu, puis repris après une reconnexion (issue #263)', async ({ browser, club, adminPage }) => {
  const member = await createAccount('dirigeant', club.clubId, ['arbitre_club']);
  const memberContext = await authedContext(browser, member);
  const memberPage = await memberContext.newPage();
  const db = await getDb();
  const adminSession = await getSessionUser(club.admin.token);
  const room = await getOrCreateDirectRoom(db, adminSession!, member.user.id);

  try {
    // Les deux comptes ouvrent le chat avant tout envoi : la réception du premier
    // message doit donc passer par le socket temps réel, pas par le chargement initial.
    await Promise.all([
      adminPage.goto('/club/chat'),
      memberPage.goto('/mon-planning/chat'),
    ]);

    const firstMessage = `Bonjour ${randomBytes(4).toString('hex')}`;
    await adminPage.getByLabel('Message', { exact: true }).fill(firstMessage);
    await adminPage.getByLabel('Envoyer').click();
    await expect(chatBubble(adminPage, firstMessage)).toHaveCount(1);

    // Réception en temps réel chez le destinataire, sans rechargement de page.
    await expect(chatBubble(memberPage, firstMessage)).toHaveCount(1, { timeout: 10_000 });

    // Accusé de lecture : la conversation ouverte du destinataire marque automatiquement
    // le message comme lu (~500 ms après réception) ; l'expéditeur voit la double coche.
    await expect(adminPage.locator('.lucide-check-check').first()).toBeVisible({ timeout: 10_000 });

    // Reconnexion avec reprise : le destinataire passe hors ligne, rate un message, puis
    // le reçoit via `chat:resume` à la reconnexion — sans jamais recharger la page.
    const secondMessage = `Deuxième message ${randomBytes(4).toString('hex')}`;
    await memberContext.setOffline(true);
    await adminPage.getByLabel('Message', { exact: true }).fill(secondMessage);
    await adminPage.getByLabel('Envoyer').click();
    await expect(chatBubble(adminPage, secondMessage)).toHaveCount(1);
    await expect(chatBubble(memberPage, secondMessage)).toHaveCount(0);

    await memberContext.setOffline(false);
    await expect(chatBubble(memberPage, secondMessage)).toHaveCount(1, { timeout: 20_000 });
  } finally {
    await memberContext.close();
    await member.cleanup();
    await db.getRepository('ChatReadState').delete({ roomId: room.id });
    await db.getRepository('ChatMessage').delete({ roomId: room.id });
    await db.getRepository('ChatParticipant').delete({ roomId: room.id });
    await db.getRepository('ChatRoom').delete({ id: room.id });
  }
});
