import { expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from './server';
import { API, renderApp } from './utils';
import SettingsPage from '../features/settings/SettingsPage';

it('shows only the selected settings list and preserves the other lists when saving', async () => {
  const lists = { flavours: ['Vanilla'], locations: ['DHA'], addons: ['Balloon', 'Bouquet'] };
  let updated: typeof lists | undefined;
  server.use(
    http.get(`${API}/settings`, () => HttpResponse.json({ data: lists })),
    http.put(`${API}/settings`, async ({ request }) => {
      updated = await request.json() as typeof lists;
      return HttpResponse.json({ data: updated });
    }),
  );
  renderApp(<SettingsPage listKey="addons" />);

  expect(await screen.findByTestId('section-addons')).toBeInTheDocument();
  expect(screen.queryByTestId('section-flavours')).not.toBeInTheDocument();
  expect(screen.queryByTestId('section-locations')).not.toBeInTheDocument();
  fireEvent.change(screen.getByTestId('add-addons'), { target: { value: 'Sparkler' } });
  await waitFor(() => expect(screen.getByTestId('add-btn-addons')).toBeEnabled());
  await userEvent.click(screen.getByTestId('add-btn-addons'));
  await waitFor(() => expect(screen.getByTestId('add-addons')).toHaveValue(''));
  await waitFor(() => expect(updated).toEqual({
    flavours: ['Vanilla'], locations: ['DHA'], addons: ['Balloon', 'Bouquet', 'Sparkler'],
  }));
});
