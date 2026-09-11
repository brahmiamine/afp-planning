import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ContactListEditor } from './contact-list-editor';

describe('ContactListEditor', () => {
  it('propose uniquement un sélecteur d’officiel, sans création ni téléphone', () => {
    const html = renderToStaticMarkup(
      <ContactListEditor
        label="Arbitres SP"
        placeholder="Sélectionner un arbitre"
        contacts={[{ nom: 'samire', numero: '0600000000' }]}
        officiels={[{ id: 1, nom: 'samire' }, { id: 2, nom: 'faidi' }]}
        onContactsChange={vi.fn()}
      />,
    );

    expect(html).toContain('samire');
    expect(html).toContain('Sélectionner un arbitre');
    expect(html).toContain('Retirer samire');
    expect(html).not.toContain('Numéro de téléphone');
    expect(html).not.toContain('Ajouter un officiel');
    expect(html).not.toContain('UserPlus');
  });
});
