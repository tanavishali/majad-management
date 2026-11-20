import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from './server';
import { API, order, renderApp } from './utils';
import NewOrderPage from '../features/orders/NewOrderPage';

vi.mock('../lib/images', () => ({ compressImage: async (f: File) => f }));
const receipt = vi.fn(async (_o: unknown) => true);
vi.mock('../lib/receipt', () => ({ downloadReceipt: (o: unknown) => receipt(o) }));
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

const LISTS = { flavours: ['Chocolate', 'Red velvet'], locations: ['DHA', 'Johar Town'], addons: ['Candles', 'Toppers'] };
const png = (name = 'cake.png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

/** Captures every POST/PATCH body sent to /orders so tests can assert on the payload. */
function mockApi(opts: { createStatus?: number; createBody?: unknown; onCreate?: (b: any) => void } = {}) {
  const bodies: any[] = [];
  server.use(
    http.get(`${API}/settings`, () => HttpResponse.json({ data: LISTS })),
    http.post(`${API}/uploads`, async () => {
      const n = 6;
      return HttpResponse.json({ data: Array.from({ length: n }, (_, i) => ({ key: `up${i}.webp`, thumbKey: `up${i}.t.webp`, w: 10, h: 10 })) }, { status: 201 });
    }),
    http.post(`${API}/orders`, async ({ request }) => {
      const b = await request.json();
      bodies.push(b);
      opts.onCreate?.(b);
      if (opts.createStatus && opts.createStatus !== 201) return HttpResponse.json(opts.createBody as any, { status: opts.createStatus });
      return HttpResponse.json({ data: order(1, { scheduledAt: (b as any).scheduledAt }) }, { status: 201 });
    }),
  );
  return bodies;
}

const render = (route = '/new') => renderApp(<NewOrderPage />, { route, path: route.startsWith('/edit') ? '/edit/:id' : '/new' });
const fill = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const setWhen = () => { fill('date', '2030-03-10'); fill('time', '11:30'); };

describe('New order form', () => {
  it('shows flavours, add-ons and areas from the saved lists; a flavour fills the cake name', async () => {
    mockApi();
    render();
    expect(await screen.findByRole('button', { name: 'Red velvet' })).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByTestId('addons')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Candles', 'Toppers']));
    await waitFor(() => expect(within(screen.getByTestId('areas')).getAllByRole('button').map((b) => b.textContent)).toEqual(['DHA', 'Johar Town']));
    await userEvent.click(screen.getByRole('button', { name: 'Red velvet' }));
    expect(screen.getByTestId('cake')).toHaveValue('Red velvet cake');
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByTestId('cake')).toHaveValue('');
  });

  it('live ticket: when, balance, add-ons and the pound stepper', async () => {
    mockApi();
    render();
    setWhen();
    fill('price', '5000'); fill('advance', '1500'); fill('profit', '1200');
    await userEvent.click(screen.getByRole('button', { name: 'Candles' }));
    await userEvent.click(screen.getByTestId('lbs-plus'));
    expect(screen.getByTestId('lbs')).toHaveValue(2.5);
    expect(screen.getByTestId('t-when')).toHaveTextContent('Sun 10 Mar, 11:30 AM');
    expect(screen.getByTestId('t-balance')).toHaveTextContent('Rs 3,500');
    expect(screen.getByTestId('t-add-ons')).toHaveTextContent('Candles');
    expect(screen.getByTestId('t-profit')).toHaveTextContent('Rs 1,200');
    for (let i = 0; i < 6; i++) await userEvent.click(screen.getByTestId('lbs-minus'));
    expect(screen.getByTestId('lbs')).toHaveValue(0.5); // never below half a pound
  });

  it('asks for the cake name and a valid weight before saving', async () => {
    const bodies = mockApi();
    render();
    await userEvent.click(screen.getByTestId('save'));
    expect(screen.getByTestId('form-error')).toHaveTextContent('Add the cake name.');
    fill('cake', 'Vanilla cake'); fill('lbs', '0');
    await userEvent.click(screen.getByTestId('save'));
    expect(screen.getByTestId('form-error')).toHaveTextContent('Add the pounds of cake.');
    expect(bodies).toHaveLength(0);
  });

  it('creates an order with every field, then resets the form and moves the time 30 minutes on', async () => {
    const bodies = mockApi();
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Red velvet' }));
    await userEvent.click(screen.getByRole('button', { name: 'Candles' }));
    await userEvent.click(screen.getByRole('button', { name: 'DHA' }));
    await userEvent.click(screen.getByTestId('source-instagram'));
    expect(screen.getByTestId('t-ordered via')).toHaveTextContent('Instagram');
    fill('cust', 'Sara'); fill('phone', '0300 1234567'); setWhen(); fill('lbs', '3');
    fill('price', '6000'); fill('advance', '2000'); fill('profit', '1500'); fill('details', 'Happy birthday');
    await userEvent.click(screen.getByTestId('save'));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      cake: 'Red velvet cake', addons: ['Candles'], customer: { name: 'Sara', phone: '0300 1234567' }, location: 'DHA', source: 'instagram',
      scheduledAt: '2030-03-10T06:30:00.000Z', lbs: 3, price: 6000, advance: 2000, profit: 1500, details: 'Happy birthday', images: [],
    });
    expect(await screen.findByTestId('added')).toHaveTextContent('Order added at 11:30 AM · receipt downloaded');
    expect(receipt).toHaveBeenCalledWith(expect.objectContaining({ code: '#OD-1001' }));
    expect(screen.getByTestId('cake')).toHaveValue('');
    expect(screen.getByTestId('time')).toHaveValue('12:00');
    expect(screen.getByTestId('date')).toHaveValue('2030-03-10');
  });

  it('only cake, weight and a time are required: empty optional fields are sent as null / empty', async () => {
    const bodies = mockApi();
    render();
    fill('cake', 'Vanilla cake'); setWhen();
    await userEvent.click(screen.getByTestId('save'));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ price: null, profit: null, advance: 0, addons: [], location: '', customer: { name: '', phone: '' }, images: [] });
  });

  it('adds several pictures from the gallery, uploads them and sends the keys; pictures can be removed', async () => {
    const bodies = mockApi();
    render();
    fill('cake', 'Photo cake'); setWhen();
    await userEvent.upload(screen.getByTestId('photo-gallery-input'), [png('a.png'), png('b.png'), png('c.png')]);
    expect(await screen.findByTestId('photo-item-2')).toBeInTheDocument();
    expect(screen.getByTestId('photo-hint')).toHaveTextContent('3 of 6 pictures');
    await userEvent.click(screen.getByTestId('photo-remove-1'));
    expect(screen.getByTestId('photo-hint')).toHaveTextContent('2 of 6 pictures');
    await userEvent.click(screen.getByTestId('save'));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].images).toEqual(['up0.webp', 'up1.webp']);
    await waitFor(() => expect(screen.queryByTestId('photo-item-0')).not.toBeInTheDocument()); // cleared for the next order
  });

  it('the camera input takes a photo too, and the picture limit is 6', async () => {
    mockApi();
    render();
    await userEvent.upload(screen.getByTestId('photo-camera-input'), png('cam.png'));
    expect(await screen.findByTestId('photo-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('photo-camera-input')).toHaveAttribute('capture', 'environment');
    await userEvent.upload(screen.getByTestId('photo-gallery-input'), Array.from({ length: 7 }, (_, i) => png(`${i}.png`)));
    await waitFor(() => expect(screen.getByTestId('photo-hint')).toHaveTextContent('6 of 6 pictures'));
    expect(screen.getByTestId('toast')).toHaveTextContent('up to 6 pictures');
    expect(screen.getByTestId('photo-camera')).toBeDisabled();
    expect(screen.getByTestId('photo-gallery')).toBeDisabled();
  });

  describe('time clash', () => {
    const conflict = (n = 1) => ({
      error: {
        code: 'SLOT_CONFLICT', message: 'clash', requestId: 'r',
        details: {
          conflicts: Array.from({ length: n }, (_, i) => ({ orderNo: i + 1, code: `#OD-${1001 + i}`, cake: `Existing ${i + 1}`, customer: { name: i ? '' : 'Ali' }, scheduledAt: `2030-03-10T06:${i ? 45 : 30}:00.000Z` })),
          nextFree: '2030-03-10T07:15:00.000Z',
        },
      },
    });

    it('names the clashing order and books the next free slot with one tap', async () => {
      let calls = 0;
      const bodies = mockApi({ onCreate: () => { calls++; }, createStatus: 409, createBody: conflict() });
      server.use(http.post(`${API}/orders`, async ({ request }) => {
        const b: any = await request.json(); bodies.push(b);
        if (++calls === 1) return HttpResponse.json(conflict(), { status: 409 });
        return HttpResponse.json({ data: order(2, { scheduledAt: b.scheduledAt }) }, { status: 201 });
      }));
      render();
      fill('cake', 'Second cake'); setWhen();
      await userEvent.click(screen.getByTestId('save'));
      const dlg = await screen.findByTestId('clash-dialog');
      expect(dlg).toHaveTextContent('Existing 1');
      expect(dlg).toHaveTextContent('for Ali');
      expect(screen.getByTestId('next-free')).toHaveTextContent('Next free slot: 12:15 PM');
      await userEvent.click(screen.getByTestId('clash-next'));
      await waitFor(() => expect(bodies.length).toBeGreaterThanOrEqual(2));
      const last = bodies.at(-1);
      expect(last.scheduledAt).toBe('2030-03-10T07:15:00.000Z');
      expect(last.force).toBeUndefined();
      await waitFor(() => expect(screen.queryByTestId('clash-dialog')).not.toBeInTheDocument());
    });

    it('lists several clashes; "add anyway" saves with force; "change time" just closes', async () => {
      const bodies: any[] = [];
      mockApi();
      server.use(http.post(`${API}/orders`, async ({ request }) => {
        const b: any = await request.json(); bodies.push(b);
        if (!b.force) return HttpResponse.json(conflict(2), { status: 409 });
        return HttpResponse.json({ data: order(3, { scheduledAt: b.scheduledAt }) }, { status: 201 });
      }));
      render();
      fill('cake', 'Third cake'); setWhen();
      await userEvent.click(screen.getByTestId('save'));
      const dlg = await screen.findByTestId('clash-dialog');
      expect(dlg).toHaveTextContent('You already have 2 orders in this slot');
      await userEvent.click(screen.getByTestId('clash-change'));
      expect(screen.queryByTestId('clash-dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('time')).toHaveValue('11:30');
      await userEvent.click(screen.getByTestId('save'));
      await userEvent.click(await screen.findByTestId('clash-anyway'));
      await waitFor(() => expect(bodies.at(-1).force).toBe(true));
      expect(bodies.at(-1).scheduledAt).toBe('2030-03-10T06:30:00.000Z');
      expect(await screen.findByTestId('added')).toBeInTheDocument();
    });

    it('a full day offers no next slot', async () => {
      mockApi();
      server.use(http.post(`${API}/orders`, () => HttpResponse.json({ error: { ...conflict().error, details: { ...conflict().error.details, nextFree: null } } }, { status: 409 })));
      render();
      fill('cake', 'Late cake'); setWhen();
      await userEvent.click(screen.getByTestId('save'));
      expect(await screen.findByText('No free 30-min slot left on this date.')).toBeInTheDocument();
      expect(screen.queryByTestId('clash-next')).not.toBeInTheDocument();
    });
  });

  it('shows the server message when saving fails', async () => {
    mockApi();
    server.use(http.post(`${API}/orders`, () => HttpResponse.json({ error: { code: 'INTERNAL', message: 'Database is down', requestId: 'r' } }, { status: 500 })));
    render();
    fill('cake', 'Vanilla cake'); setWhen();
    await userEvent.click(screen.getByTestId('save'));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('Database is down');
    expect(screen.getByTestId('save')).toBeEnabled();
  });

  describe('edit mode', () => {
    const saved = order(7, {
      id: 'o7', cake: 'Biscoff cake', addons: ['Toppers'], location: 'Johar Town', lbs: 4, price: 8000, advance: 3000, profit: 2500, details: 'No nuts',
      customer: { name: 'Hira', phone: '03111234567' }, scheduledAt: '2030-03-10T06:30:00.000Z', version: 3, imageCount: 1,
    });
    const detail = { ...saved, images: [{ key: 'old.webp', thumbKey: 'old.t.webp', w: 10, h: 10, url: '/api/v1/files/old.webp', thumbUrl: '/api/v1/files/old.t.webp' }] };

    it('loads the order, keeps its saved picture, and saves with If-Match and the same image key', async () => {
      mockApi();
      let patch: any; let ifMatch: string | null = null;
      server.use(
        http.get(`${API}/orders/o7`, () => HttpResponse.json({ data: detail })),
        http.patch(`${API}/orders/o7`, async ({ request }) => { patch = await request.json(); ifMatch = request.headers.get('if-match'); return HttpResponse.json({ data: detail }); }),
      );
      render('/edit/o7');
      expect(await screen.findByRole('heading', { name: 'Edit order' })).toBeInTheDocument();
      expect(screen.getByTestId('cake')).toHaveValue('Biscoff cake');
      expect(screen.getByTestId('cust')).toHaveValue('Hira');
      expect(screen.getByTestId('time')).toHaveValue('11:30');
      expect(screen.getByTestId('price')).toHaveValue(8000);
      expect(screen.getByRole('button', { name: 'Toppers' })).toHaveClass('on');
      expect(screen.getByTestId('photo-item-0')).toBeInTheDocument();
      fill('advance', '4000');
      await userEvent.click(screen.getByTestId('save'));
      await waitFor(() => expect(patch).toBeDefined());
      expect(ifMatch).toBe('3');
      expect(patch).toMatchObject({ cake: 'Biscoff cake', advance: 4000, images: ['old.webp'], location: 'Johar Town', scheduledAt: '2030-03-10T06:30:00.000Z' });
      await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/orders'));
    });

    it('says so when the order was changed somewhere else (412)', async () => {
      mockApi();
      server.use(
        http.get(`${API}/orders/o7`, () => HttpResponse.json({ data: detail })),
        http.patch(`${API}/orders/o7`, () => HttpResponse.json({ error: { code: 'VERSION_CONFLICT', message: 'changed', requestId: 'r' } }, { status: 412 })),
      );
      render('/edit/o7');
      await screen.findByTestId('cake');
      await userEvent.click(screen.getByTestId('save'));
      expect(await screen.findByTestId('form-error')).toHaveTextContent('changed somewhere else');
    });

    it('cancel edit goes back to the list; an unknown order shows an error', async () => {
      mockApi();
      server.use(http.get(`${API}/orders/o7`, () => HttpResponse.json({ data: detail })));
      render('/edit/o7');
      await userEvent.click(await screen.findByTestId('cancel-edit'));
      expect(screen.getByTestId('loc')).toHaveTextContent('/orders');
    });
  });
});
