import { Router } from 'express';
import { Schema, model } from 'mongoose';
import {
  DEFAULT_ADDONS, DEFAULT_FLAVOURS, DEFAULT_LOCATIONS, listsSchema, type Lists,
} from '@order-desk/shared';
import { requireAuth } from '../../middlewares/auth';
import { writeLimiter } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import { sendOne } from '../../utils/response';

/** Single document holding the quick-pick lists (flavours, delivery areas, add-ons). */
const listsDoc = new Schema({
  _id: String,
  flavours: [String], locations: [String], addons: [String],
}, { versionKey: false, timestamps: true });
const ListsModel = model('Lists', listsDoc);
const ID = 'lists';

function normalizeAddons(addons: string[]) {
  const normalized: string[] = [];
  for (const addon of addons) {
    if (addon.trim().toLowerCase() === 'balloon bouquet') normalized.push('Balloon', 'Bouquet');
    else normalized.push(addon);
  }
  return [...new Set(normalized.map(item => item.trim()).filter(Boolean))];
}

export const settingsService = {
  /** Defaults until the shop saves its own lists. */
  async get(): Promise<Lists> {
    const d = await ListsModel.findById(ID).lean();
    if (!d) return { flavours: [...DEFAULT_FLAVOURS], locations: [...DEFAULT_LOCATIONS], addons: [...DEFAULT_ADDONS] };
    return { flavours: d.flavours, locations: d.locations, addons: normalizeAddons(d.addons) };
  },
  async put(lists: Lists): Promise<Lists> {
    await ListsModel.updateOne({ _id: ID }, { $set: { ...lists, addons: normalizeAddons(lists.addons) } }, { upsert: true });
    return this.get();
  },
};

export const settingsRoutes = Router();
settingsRoutes.use(requireAuth);
settingsRoutes.get('/', (_req, res, next) => { settingsService.get().then(d => sendOne(res, d)).catch(next); });
settingsRoutes.put('/', writeLimiter, validate({ body: listsSchema }), (req, res, next) => {
  settingsService.put(req.body as Lists).then(d => sendOne(res, d)).catch(next);
});
