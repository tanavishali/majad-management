/** Dev-only: admin user + ~30 demo orders (ported from the old app's demoOrders). `npm run seed [-- --reset]` */
import sharp from 'sharp';
import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { CounterModel, OrderModel } from '../modules/orders/order.model';
import { processAndStore, resolveKeys } from '../modules/uploads/upload.service';
import { KEY_RE, MongoStorage, setStorage } from '../modules/uploads/storage';
import { addDays, fromKarachi, karachiParts } from '../utils/time';

if (env.isProd) { console.error('Refusing to seed in production.'); process.exit(1); }
const reset = process.argv.includes('--reset');

let s = 7;
const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
const p2 = (n: number) => String(n).padStart(2, '0');
const names = ['Ali Raza','Sana Malik','Hira Noor','Usman Tariq','Ayesha Khan','Bilal Ahmed','Fatima Zahra','Hamza Sheikh','Zainab Iqbal','Omar Farooq','Maryam Aslam','Daniyal Butt','Noor Fatima','Saad Mehmood','Iqra Javed','Talha Hussain','Mahnoor Ali','Faizan Qureshi','Rabia Siddiqui','Ahsan Rafique','Laiba Chaudhry','Shahzaib Anwar','Komal Riaz','Waleed Yousaf','Hassan Raza','Anum Tahir','Kamran Akbar','Sidra Bashir','Imran Latif','Mehwish Arif'];
const areas = ['Gulberg III','DHA Phase 5','Johar Town','Model Town','Askari 10','Bahria Town','Wapda Town','Garden Town','Liberty Market','Iqbal Town','Cantt','Samanabad','Township','Faisal Town'];
const notes = ['Call before arriving.','Gift wrap please.','Fragile items, handle with care.','','Deliver after 5 PM only.','Customer wants a receipt.','','Leave with the guard if not home.','','Repeat customer.'];
const srcs = ['whatsapp', 'instagram', 'facebook'] as const;
const offs = Array.from({ length: 30 }, (_, i) => i - 29);
const colors = ['#0B7A68', '#E07A5F', '#3D5A80', '#F2CC8F', '#81B29A', '#9B5DE5'];

async function demoImage(i: number, j: number) {
  const c = colors[(i + j) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${c}"/><text x="400" y="320" font-size="72" text-anchor="middle" fill="white" font-family="sans-serif">Demo ${i + 1}.${j + 1}</text></svg>`;
  return processAndStore(await sharp(Buffer.from(svg)).png().toBuffer());
}

async function main() {
  await connectDb();
  const storage = new MongoStorage();
  setStorage(storage);
  if (await OrderModel.exists({}) && !reset) { console.log('Orders already exist; use --reset to wipe and reseed.'); return disconnectDb(); }
  const oldOrders = reset ? await OrderModel.find({}).select('images coverThumb').lean() : [];
  const oldImageKeys = new Set(oldOrders.flatMap(order => [
    ...(order.images ?? []).flatMap(image => [image.key, image.thumbKey]),
    order.coverThumb,
  ]).filter((key): key is string => typeof key === 'string' && KEY_RE.test(key)));
  await OrderModel.deleteMany({}); await CounterModel.deleteMany({});
  for (const key of oldImageKeys) await storage.remove(key);

  const today = fromKarachi(karachiParts(new Date()).y, karachiParts(new Date()).m, karachiParts(new Date()).d);
  let no = 0;
  for (const [i, off] of offs.entries()) {
    const day = addDays(today, off); const dp = karachiParts(day);
    const mins = 10 * 60 + Math.floor(rnd() * 10 * 60);
    const first = true;
    let status: 'pending' | 'delivered' | 'cancelled';
    if (off < 0) { const r = rnd(); status = r < .58 ? 'delivered' : r < .78 ? 'cancelled' : 'pending'; }
    else if (off === 0) status = first ? 'delivered' : 'pending'; else status = 'pending';
    const price = Math.round((1500 + rnd() * 13500) / 50) * 50;
    const cost = status === 'cancelled' ? 0 : Math.round(price * (.55 + rnd() * .25) / 50) * 50;
    const nImg = 1 + Math.floor(rnd() * 3);
    const refs = [];
    for (let j = 0; j < nImg; j++) refs.push(await demoImage(i, j));
    const imgs = await resolveKeys(refs.map(r => r.key));
    const scheduledAt = fromKarachi(dp.y, dp.m, dp.d, Math.floor(mins / 60), mins % 60);
    no++;
    await OrderModel.create({
      orderNo: no,
      cake: `Demo Cake ${i + 1}`,
      lbs: 1 + Math.floor(rnd() * 8),
      customer: { name: names[i % names.length], phone: '03' + p2(Math.floor(rnd() * 46)) + String(1000000 + Math.floor(rnd() * 8999999)) },
      location: `${1 + Math.floor(rnd() * 60)}, ${areas[Math.floor(rnd() * areas.length)]}, Lahore`,
      source: srcs[Math.floor(rnd() * 3)], scheduledAt, status, price, advance: 0, profit: price - cost, details: notes[Math.floor(rnd() * notes.length)],
      images: imgs, imageCount: imgs.length, coverThumb: imgs[0]?.thumbKey,
      deliveredAt: status === 'delivered' ? scheduledAt : undefined, cancelledAt: status === 'cancelled' ? scheduledAt : undefined,
    });
  }
  await CounterModel.updateOne({ _id: 'orderNo' }, { seq: no }, { upsert: true });
  console.log(`Seeded ${no} demo orders with MongoDB-stored images.`);
  await disconnectDb();
}
main().catch(e => { console.error(e); process.exit(1); });
