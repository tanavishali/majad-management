/** Dev-only: admin user + ~30 demo orders (ported from the old app's demoOrders). `npm run seed [-- --reset]` */
import sharp from 'sharp';
import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { UserModel } from '../modules/auth/auth.model';
import { authService, hashPassword } from '../modules/auth/auth.service';
import { CounterModel, OrderModel } from '../modules/orders/order.model';
import { processAndStore, resolveKeys } from '../modules/uploads/upload.service';
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
const offs = [-34,-31,-28,-26,-23,-21,-19,-17,-15,-13,-11,-10,-8,-7,-6,-4,-3,-2,-1,0,0,1,1,2,3,4,5,7,9,12];
const colors = ['#0B7A68', '#E07A5F', '#3D5A80', '#F2CC8F', '#81B29A', '#9B5DE5'];

async function demoImage(i: number, j: number) {
  const c = colors[(i + j) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${c}"/><text x="400" y="320" font-size="72" text-anchor="middle" fill="white" font-family="sans-serif">Demo ${i + 1}.${j + 1}</text></svg>`;
  return processAndStore(await sharp(Buffer.from(svg)).png().toBuffer());
}

async function main() {
  await connectDb();
  const username = env.ADMIN_USERNAME ?? 'admin'; const password = env.ADMIN_PASSWORD ?? 'admin123';
  if (!(await authService.ensureAdmin(username, password)) && reset) {
    await UserModel.updateOne({ username: username.toLowerCase() }, { passwordHash: await hashPassword(password), failedAttempts: 0, $unset: { lockedUntil: '' } });
  }
  if (await OrderModel.exists({}) && !reset) { console.log('Orders already exist; use --reset to wipe and reseed.'); return disconnectDb(); }
  await OrderModel.deleteMany({}); await CounterModel.deleteMany({});

  const today = fromKarachi(karachiParts(new Date()).y, karachiParts(new Date()).m, karachiParts(new Date()).d);
  const perDay: Record<string, number> = {};
  let no = 0;
  for (const [i, off] of offs.entries()) {
    const day = addDays(today, off); const dp = karachiParts(day); const k = `${dp.y}-${dp.m}-${dp.d}`;
    perDay[k] ??= 0;
    const mins = 10 * 60 + perDay[k]! * 105 + Math.floor(rnd() * 3) * 10; const first = perDay[k] === 0; perDay[k]!++;
    let status: 'pending' | 'delivered' | 'cancelled';
    if (off < 0) { const r = rnd(); status = r < .58 ? 'delivered' : r < .78 ? 'cancelled' : 'pending'; }
    else if (off === 0) status = first ? 'delivered' : 'pending'; else status = 'pending';
    const price = Math.round((1500 + rnd() * 13500) / 50) * 50;
    const cost = status === 'cancelled' ? 0 : Math.round(price * (.55 + rnd() * .25) / 50) * 50;
    const nImg = rnd() < .45 ? 1 + Math.floor(rnd() * 3) : 0;
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
  console.log(`Seeded ${no} demo orders. Login: ${username} / ${password}`);
  await disconnectDb();
}
main().catch(e => { console.error(e); process.exit(1); });
