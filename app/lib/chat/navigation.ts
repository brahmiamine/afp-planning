/** Revenir à la liste des discussions depuis l’onglet Chat de la barre mobile. */
export const CHAT_SHOW_LIST_EVENT = 'chat-show-list';

export function notifyChatShowList() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHAT_SHOW_LIST_EVENT));
  }
}
