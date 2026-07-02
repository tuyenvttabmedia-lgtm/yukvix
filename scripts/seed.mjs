/**
 * CosplayVault — Demo Data Seed Script
 * =====================================
 * Creates:
 *   - 1 Admin user  (openId: "demo-admin-001")
 *   - 1 VIP user    (openId: "demo-vip-001")
 *   - 1 Regular user (openId: "demo-user-001")
 *   - 8 Categories
 *   - 12 Tags
 *   - 20 Demo albums (10 free, 10 VIP) with 8–15 photos each
 *   - Active VIP subscription for the VIP user
 *   - Sample bookmarks
 *
 * Usage:
 *   node scripts/seed.mjs
 *
 * Requires DATABASE_URL in environment (or .env file).
 */

import { createConnection } from "mysql2/promise";
import { config } from "dotenv";

config(); // load .env if present

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌  DATABASE_URL not set. Copy .env.example to .env and configure it.");
  process.exit(1);
}

// ─── Parse MySQL connection URL ───────────────────────────────────────────────
function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306"),
    user: u.username,
    password: u.password,
    database: u.pathname.replace(/^\//, ""),
    ssl: u.searchParams.get("ssl") ? { rejectUnauthorized: false } : undefined,
    multipleStatements: true,
  };
}

// ─── Placeholder image URLs (public Unsplash cosplay-style images) ────────────
const PLACEHOLDER_COVERS = [
  "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&q=80",
  "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&q=80",
  "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&q=80",
  "https://images.unsplash.com/photo-1535223289429-462dc9e7f5e1?w=800&q=80",
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
  "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&q=80",
  "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=800&q=80",
  "https://images.unsplash.com/photo-1520637836862-4d197d17c93a?w=800&q=80",
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80",
  "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&q=80",
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80",
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80",
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80",
  "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800&q=80",
  "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800&q=80",
  "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80",
  "https://images.unsplash.com/photo-1496337589254-7e19d01cec44?w=800&q=80",
];

const PHOTO_URLS = [
  "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1200&q=85",
  "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1200&q=85",
  "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1200&q=85",
  "https://images.unsplash.com/photo-1535223289429-462dc9e7f5e1?w=1200&q=85",
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=85",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=85",
  "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=1200&q=85",
  "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=1200&q=85",
  "https://images.unsplash.com/photo-1520637836862-4d197d17c93a?w=1200&q=85",
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200&q=85",
  "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1200&q=85",
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200&q=85",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&q=85",
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&q=85",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200&q=85",
];

// ─── Demo data definitions ────────────────────────────────────────────────────
const DEMO_CATEGORIES = [
  { name: "Anime", slug: "anime", description: "Japanese anime character cosplays" },
  { name: "Game", slug: "game", description: "Video game character cosplays" },
  { name: "Marvel & DC", slug: "marvel-dc", description: "Superhero cosplays" },
  { name: "Fantasy", slug: "fantasy", description: "Fantasy and medieval cosplays" },
  { name: "Sci-Fi", slug: "sci-fi", description: "Science fiction cosplays" },
  { name: "Horror", slug: "horror", description: "Horror and dark cosplays" },
  { name: "Original", slug: "original", description: "Original character designs" },
  { name: "Group", slug: "group", description: "Group cosplay shoots" },
];

const DEMO_TAGS = [
  { name: "Sword Art Online", slug: "sword-art-online" },
  { name: "Naruto", slug: "naruto" },
  { name: "One Piece", slug: "one-piece" },
  { name: "Genshin Impact", slug: "genshin-impact" },
  { name: "League of Legends", slug: "league-of-legends" },
  { name: "Demon Slayer", slug: "demon-slayer" },
  { name: "Attack on Titan", slug: "attack-on-titan" },
  { name: "Jujutsu Kaisen", slug: "jujutsu-kaisen" },
  { name: "My Hero Academia", slug: "my-hero-academia" },
  { name: "Chainsaw Man", slug: "chainsaw-man" },
  { name: "Spy x Family", slug: "spy-x-family" },
  { name: "Elden Ring", slug: "elden-ring" },
];

const DEMO_ALBUMS = [
  // ─── Free albums ─────────────────────────────────────────────────────────────
  {
    title: "Asuna — Sword Art Online",
    slug: "asuna-sword-art-online-demo",
    description: "A breathtaking photoshoot featuring Asuna Yuuki in her iconic Knights of the Blood Oath uniform. Shot at a forest location with natural lighting.",
    cosplayer: "Sakura Miyamoto",
    character: "Asuna Yuuki",
    series: "Sword Art Online",
    isVip: false,
    photoCount: 12,
    viewCount: 4820,
    tagSlugs: ["sword-art-online"],
    catSlug: "anime",
  },
  {
    title: "Nezuko — Demon Slayer",
    slug: "nezuko-demon-slayer-demo",
    description: "Stunning Nezuko cosplay with handcrafted bamboo prop and traditional kimono. Outdoor shoot at a Japanese garden.",
    cosplayer: "Hana Tanaka",
    character: "Nezuko Kamado",
    series: "Demon Slayer",
    isVip: false,
    photoCount: 10,
    viewCount: 6340,
    tagSlugs: ["demon-slayer"],
    catSlug: "anime",
  },
  {
    title: "Mikasa — Attack on Titan",
    slug: "mikasa-attack-on-titan-demo",
    description: "Epic Mikasa Ackerman cosplay with full Survey Corps uniform and ODM gear replica. Urban rooftop shoot.",
    cosplayer: "Yuki Sato",
    character: "Mikasa Ackerman",
    series: "Attack on Titan",
    isVip: false,
    photoCount: 14,
    viewCount: 5120,
    tagSlugs: ["attack-on-titan"],
    catSlug: "anime",
  },
  {
    title: "Hu Tao — Genshin Impact",
    slug: "hu-tao-genshin-impact-demo",
    description: "Vibrant Hu Tao cosplay from Genshin Impact. Full costume with ghost companion props and floral accessories.",
    cosplayer: "Mei Lin",
    character: "Hu Tao",
    series: "Genshin Impact",
    isVip: false,
    photoCount: 11,
    viewCount: 7890,
    tagSlugs: ["genshin-impact"],
    catSlug: "game",
  },
  {
    title: "Jinx — League of Legends",
    slug: "jinx-league-of-legends-demo",
    description: "High-energy Jinx cosplay with custom-built Fishbones rocket launcher prop. Neon-lit studio shoot.",
    cosplayer: "Alex Storm",
    character: "Jinx",
    series: "League of Legends",
    isVip: false,
    photoCount: 13,
    viewCount: 9210,
    tagSlugs: ["league-of-legends"],
    catSlug: "game",
  },
  {
    title: "Itadori Yuji — Jujutsu Kaisen",
    slug: "itadori-jujutsu-kaisen-demo",
    description: "Dynamic Yuji Itadori cosplay featuring the iconic Jujutsu High uniform with action-pose photography.",
    cosplayer: "Kenji Watanabe",
    character: "Yuji Itadori",
    series: "Jujutsu Kaisen",
    isVip: false,
    photoCount: 9,
    viewCount: 3450,
    tagSlugs: ["jujutsu-kaisen"],
    catSlug: "anime",
  },
  {
    title: "Yor Forger — Spy x Family",
    slug: "yor-forger-spy-x-family-demo",
    description: "Elegant Yor Forger cosplay in her Thorn Princess assassin outfit. Dark studio with dramatic lighting.",
    cosplayer: "Nami Kato",
    character: "Yor Forger",
    series: "Spy x Family",
    isVip: false,
    photoCount: 10,
    viewCount: 5670,
    tagSlugs: ["spy-x-family"],
    catSlug: "anime",
  },
  {
    title: "Malenia — Elden Ring",
    slug: "malenia-elden-ring-demo",
    description: "Awe-inspiring Malenia cosplay with hand-crafted golden armor and prosthetic arm prop. Epic outdoor shoot.",
    cosplayer: "Diana Voss",
    character: "Malenia",
    series: "Elden Ring",
    isVip: false,
    photoCount: 15,
    viewCount: 11200,
    tagSlugs: ["elden-ring"],
    catSlug: "game",
  },
  {
    title: "Deku — My Hero Academia",
    slug: "deku-my-hero-academia-demo",
    description: "Inspiring Izuku Midoriya cosplay in his Full Cowl hero costume. Action-packed outdoor shoot.",
    cosplayer: "Taro Yamada",
    character: "Izuku Midoriya",
    series: "My Hero Academia",
    isVip: false,
    photoCount: 11,
    viewCount: 4100,
    tagSlugs: ["my-hero-academia"],
    catSlug: "anime",
  },
  {
    title: "Nami — One Piece",
    slug: "nami-one-piece-demo",
    description: "Adventurous Nami cosplay from One Piece, featuring the Navigator's iconic orange hair and clima-tact staff.",
    cosplayer: "Lena Park",
    character: "Nami",
    series: "One Piece",
    isVip: false,
    photoCount: 10,
    viewCount: 3890,
    tagSlugs: ["one-piece"],
    catSlug: "anime",
  },
  // ─── VIP albums ──────────────────────────────────────────────────────────────
  {
    title: "Asuna — Fairy Dance Arc [VIP]",
    slug: "asuna-fairy-dance-vip-demo",
    description: "Exclusive VIP photoshoot featuring Asuna in her Fairy Dance arc costume. 18 stunning high-resolution photos with professional lighting and post-processing.",
    cosplayer: "Sakura Miyamoto",
    character: "Asuna Yuuki",
    series: "Sword Art Online",
    isVip: true,
    freePreviewCount: 3,
    photoCount: 18,
    viewCount: 8940,
    tagSlugs: ["sword-art-online"],
    catSlug: "anime",
  },
  {
    title: "Raiden Shogun — Genshin [VIP]",
    slug: "raiden-shogun-genshin-vip-demo",
    description: "Premium Raiden Shogun cosplay with custom-crafted Musou no Hitotachi sword. Exclusive VIP gallery with 20 high-res photos.",
    cosplayer: "Mei Lin",
    character: "Raiden Shogun",
    series: "Genshin Impact",
    isVip: true,
    freePreviewCount: 3,
    photoCount: 20,
    viewCount: 15600,
    tagSlugs: ["genshin-impact"],
    catSlug: "game",
  },
  {
    title: "Makima — Chainsaw Man [VIP]",
    slug: "makima-chainsaw-man-vip-demo",
    description: "Mysterious and captivating Makima cosplay. Exclusive VIP collection with dramatic lighting and cinematic editing.",
    cosplayer: "Yuki Sato",
    character: "Makima",
    series: "Chainsaw Man",
    isVip: true,
    freePreviewCount: 3,
    photoCount: 16,
    viewCount: 12300,
    tagSlugs: ["chainsaw-man"],
    catSlug: "anime",
  },
  {
    title: "Jinx — Arcane Edition [VIP]",
    slug: "jinx-arcane-vip-demo",
    description: "Arcane-inspired Jinx cosplay with detailed body paint and custom props. 22 exclusive high-resolution photos.",
    cosplayer: "Alex Storm",
    character: "Jinx",
    series: "League of Legends",
    isVip: true,
    freePreviewCount: 4,
    photoCount: 22,
    viewCount: 18900,
    tagSlugs: ["league-of-legends"],
    catSlug: "game",
  },
  {
    title: "Yor Forger — Wedding Dress [VIP]",
    slug: "yor-forger-wedding-vip-demo",
    description: "Stunning Yor Forger in her wedding dress from Spy x Family. Romantic studio shoot with 15 exclusive photos.",
    cosplayer: "Nami Kato",
    character: "Yor Forger",
    series: "Spy x Family",
    isVip: true,
    freePreviewCount: 3,
    photoCount: 15,
    viewCount: 9800,
    tagSlugs: ["spy-x-family"],
    catSlug: "anime",
  },
  {
    title: "Mikasa — Final Season [VIP]",
    slug: "mikasa-final-season-vip-demo",
    description: "Mikasa in her final season outfit. Emotional and powerful photography. Exclusive VIP collection.",
    cosplayer: "Yuki Sato",
    character: "Mikasa Ackerman",
    series: "Attack on Titan",
    isVip: true,
    freePreviewCount: 3,
    photoCount: 17,
    viewCount: 7650,
    tagSlugs: ["attack-on-titan"],
    catSlug: "anime",
  },
  {
    title: "Malenia — Goddess of Rot [VIP]",
    slug: "malenia-goddess-vip-demo",
    description: "The most detailed Malenia cosplay ever created. Full golden armor with LED effects. 25 exclusive VIP photos.",
    cosplayer: "Diana Voss",
    character: "Malenia",
    series: "Elden Ring",
    isVip: true,
    freePreviewCount: 4,
    photoCount: 25,
    viewCount: 22400,
    tagSlugs: ["elden-ring"],
    catSlug: "game",
  },
  {
    title: "Nezuko — Awakened Form [VIP]",
    slug: "nezuko-awakened-vip-demo",
    description: "Nezuko in her awakened demon form with full body paint and custom horn props. 19 exclusive VIP photos.",
    cosplayer: "Hana Tanaka",
    character: "Nezuko Kamado",
    series: "Demon Slayer",
    isVip: true,
    freePreviewCount: 3,
    photoCount: 19,
    viewCount: 14200,
    tagSlugs: ["demon-slayer"],
    catSlug: "anime",
  },
  {
    title: "Hu Tao — Ghost Festival [VIP]",
    slug: "hu-tao-ghost-festival-vip-demo",
    description: "Hu Tao in a special Ghost Festival setting with atmospheric lighting and ghost props. 16 exclusive photos.",
    cosplayer: "Mei Lin",
    character: "Hu Tao",
    series: "Genshin Impact",
    isVip: true,
    freePreviewCount: 3,
    photoCount: 16,
    viewCount: 10500,
    tagSlugs: ["genshin-impact"],
    catSlug: "game",
  },
  {
    title: "Itadori — Sukuna Domain [VIP]",
    slug: "itadori-sukuna-vip-demo",
    description: "Yuji Itadori with Ryomen Sukuna tattoo body paint. Dramatic domain expansion themed shoot. 14 exclusive VIP photos.",
    cosplayer: "Kenji Watanabe",
    character: "Yuji Itadori",
    series: "Jujutsu Kaisen",
    isVip: true,
    freePreviewCount: 3,
    photoCount: 14,
    viewCount: 8100,
    tagSlugs: ["jujutsu-kaisen"],
    catSlug: "anime",
  },
];

// ─── Main seed function ───────────────────────────────────────────────────────
async function seed() {
  console.log("🌱  CosplayVault — Starting seed...\n");

  const conn = await createConnection(parseDbUrl(DB_URL));
  console.log("✅  Database connected\n");

  try {
    // ── 1. Upsert Users ──────────────────────────────────────────────────────
    console.log("👤  Creating demo users...");

    const now = new Date();
    const vipExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // +1 year

    await conn.execute(
      `INSERT INTO users (openId, name, email, loginMethod, role, avatarUrl, createdAt, updatedAt, lastSignedIn)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), updatedAt=NOW()`,
      ["demo-admin-001", "Demo Admin", "admin@cosplayvault.test", "demo", "admin",
       "https://api.dicebear.com/7.x/avataaars/svg?seed=admin"]
    );

    await conn.execute(
      `INSERT INTO users (openId, name, email, loginMethod, role, avatarUrl, createdAt, updatedAt, lastSignedIn)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), updatedAt=NOW()`,
      ["demo-vip-001", "Demo VIP User", "vip@cosplayvault.test", "demo", "vip",
       "https://api.dicebear.com/7.x/avataaars/svg?seed=vip"]
    );

    await conn.execute(
      `INSERT INTO users (openId, name, email, loginMethod, role, avatarUrl, createdAt, updatedAt, lastSignedIn)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), updatedAt=NOW()`,
      ["demo-user-001", "Demo Regular User", "user@cosplayvault.test", "demo", "user",
       "https://api.dicebear.com/7.x/avataaars/svg?seed=user"]
    );

    const [adminRows] = await conn.execute(`SELECT id FROM users WHERE openId = ?`, ["demo-admin-001"]);
    const [vipRows] = await conn.execute(`SELECT id FROM users WHERE openId = ?`, ["demo-vip-001"]);
    const adminId = adminRows[0].id;
    const vipUserId = vipRows[0].id;

    console.log(`   ✓ Admin user    → ID: ${adminId}  | openId: demo-admin-001`);
    console.log(`   ✓ VIP user      → ID: ${vipUserId} | openId: demo-vip-001`);
    console.log(`   ✓ Regular user  → openId: demo-user-001\n`);

    // ── 2. Upsert Categories ─────────────────────────────────────────────────
    console.log("📂  Creating categories...");
    for (const cat of DEMO_CATEGORIES) {
      await conn.execute(
        `INSERT INTO categories (name, slug, description, createdAt)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE description=VALUES(description)`,
        [cat.name, cat.slug, cat.description]
      );
    }
    console.log(`   ✓ ${DEMO_CATEGORIES.length} categories created\n`);

    // ── 3. Upsert Tags ───────────────────────────────────────────────────────
    console.log("🏷️   Creating tags...");
    for (const tag of DEMO_TAGS) {
      await conn.execute(
        `INSERT INTO tags (name, slug, createdAt)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE name=VALUES(name)`,
        [tag.name, tag.slug]
      );
    }
    console.log(`   ✓ ${DEMO_TAGS.length} tags created\n`);

    // ── 4. Fetch category and tag ID maps ────────────────────────────────────
    const [catRows] = await conn.execute(`SELECT id, slug FROM categories`);
    const catMap = Object.fromEntries(catRows.map((r) => [r.slug, r.id]));

    const [tagRows] = await conn.execute(`SELECT id, slug FROM tags`);
    const tagMap = Object.fromEntries(tagRows.map((r) => [r.slug, r.id]));

    // ── 5. Upsert Albums + Photos ────────────────────────────────────────────
    console.log("🖼️   Creating albums and photos...");
    let albumIndex = 0;

    for (const albumDef of DEMO_ALBUMS) {
      const coverUrl = PLACEHOLDER_COVERS[albumIndex % PLACEHOLDER_COVERS.length];
      const catId = catMap[albumDef.catSlug] || null;
      const freePreviewCount = albumDef.freePreviewCount ?? 3;

      // Upsert album
      await conn.execute(
        `INSERT INTO albums
           (title, slug, description, coverUrl, categoryId, isVip, freePreviewCount,
            photoCount, viewCount, status, cosplayer, \`character\`, series, createdBy,
            seoTitle, seoDescription, seoKeywords, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           title=VALUES(title), description=VALUES(description), coverUrl=VALUES(coverUrl),
           viewCount=VALUES(viewCount), updatedAt=NOW()`,
        [
          albumDef.title,
          albumDef.slug,
          albumDef.description,
          coverUrl,
          catId,
          albumDef.isVip ? 1 : 0,
          freePreviewCount,
          albumDef.photoCount,
          albumDef.viewCount,
          albumDef.cosplayer,
          albumDef.character,
          albumDef.series,
          adminId,
          `${albumDef.title} - CosplayVault`,
          albumDef.description.substring(0, 160),
          [albumDef.cosplayer, albumDef.character, albumDef.series, "cosplay", "gallery"].filter(Boolean).join(", "),
        ]
      );

      const [albumRows] = await conn.execute(`SELECT id FROM albums WHERE slug = ?`, [albumDef.slug]);
      const albumId = albumRows[0].id;

      // Delete existing photos for this album (clean re-seed)
      await conn.execute(`DELETE FROM photos WHERE albumId = ?`, [albumId]);

      // Insert demo photos
      const photoCount = albumDef.photoCount;
      for (let i = 0; i < photoCount; i++) {
        const photoUrl = PHOTO_URLS[i % PHOTO_URLS.length];
        const thumbUrl = photoUrl.replace("w=1200", "w=400").replace("q=85", "q=75");
        const isFreePreview = i < freePreviewCount ? 1 : 0;

        await conn.execute(
          `INSERT INTO photos
             (albumId, originalKey, originalUrl, webpKey, webpUrl, thumbKey, thumbUrl,
              width, height, fileSize, mimeType, sortOrder, isFreePreview, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'image/webp', ?, ?, NOW())`,
          [
            albumId,
            `albums/${albumId}/original/demo_${i + 1}.jpg`,
            photoUrl,
            `albums/${albumId}/webp/demo_${i + 1}.webp`,
            photoUrl,
            `albums/${albumId}/thumb/demo_${i + 1}_thumb.webp`,
            thumbUrl,
            1200,
            800,
            Math.floor(Math.random() * 500000) + 200000,
            i,
            isFreePreview,
          ]
        );
      }

      // Set cover to first photo URL
      await conn.execute(
        `UPDATE albums SET coverUrl = ? WHERE id = ?`,
        [PLACEHOLDER_COVERS[albumIndex % PLACEHOLDER_COVERS.length], albumId]
      );

      // Upsert album tags
      await conn.execute(`DELETE FROM album_tags WHERE albumId = ?`, [albumId]);
      for (const tagSlug of albumDef.tagSlugs || []) {
        const tagId = tagMap[tagSlug];
        if (tagId) {
          await conn.execute(
            `INSERT IGNORE INTO album_tags (albumId, tagId) VALUES (?, ?)`,
            [albumId, tagId]
          );
        }
      }

      const vipLabel = albumDef.isVip ? " [VIP]" : "";
      console.log(`   ✓ "${albumDef.title}"${vipLabel} → ${photoCount} photos`);
      albumIndex++;
    }
    console.log();

    // ── 6. Create VIP subscription for VIP user ──────────────────────────────
    console.log("👑  Creating VIP subscription...");
    const [planRows] = await conn.execute(`SELECT id FROM subscription_plans WHERE slug = 'vip-yearly' LIMIT 1`);
    const planId = planRows.length > 0 ? planRows[0].id : null;

    if (planId) {
      await conn.execute(
        `INSERT INTO subscriptions
           (userId, planId, status, startedAt, expiresAt, createdAt, updatedAt)
         VALUES (?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NOW(), NOW())
         ON DUPLICATE KEY UPDATE status='active', expiresAt=DATE_ADD(NOW(), INTERVAL 1 YEAR), updatedAt=NOW()`,
        [vipUserId, planId]
      );
      console.log(`   ✓ VIP subscription created for user ID ${vipUserId} (expires in 1 year)\n`);
    } else {
      console.log("   ⚠️  No subscription plan found — skipping VIP subscription\n");
    }

    // ── 7. Create sample bookmarks ───────────────────────────────────────────
    console.log("🔖  Creating sample bookmarks...");
    const [firstAlbums] = await conn.execute(`SELECT id FROM albums LIMIT 5`);
    const [userRows] = await conn.execute(`SELECT id FROM users WHERE openId = ?`, ["demo-user-001"]);
    if (userRows.length > 0) {
      const regularUserId = userRows[0].id;
      for (const album of firstAlbums.slice(0, 3)) {
        await conn.execute(
          `INSERT IGNORE INTO bookmarks (userId, albumId, createdAt) VALUES (?, ?, NOW())`,
          [regularUserId, album.id]
        );
      }
      console.log(`   ✓ 3 bookmarks created for regular user\n`);
    }

    // ── 8. Summary ───────────────────────────────────────────────────────────
    const [albumCount] = await conn.execute(`SELECT COUNT(*) as c FROM albums WHERE status='published'`);
    const [photoCount] = await conn.execute(`SELECT COUNT(*) as c FROM photos`);
    const [userCount] = await conn.execute(`SELECT COUNT(*) as c FROM users`);

    console.log("═══════════════════════════════════════════════════════");
    console.log("✅  SEED COMPLETE");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`   Albums  : ${albumCount[0].c} published (10 free + 10 VIP)`);
    console.log(`   Photos  : ${photoCount[0].c} total`);
    console.log(`   Users   : ${userCount[0].c} total`);
    console.log("───────────────────────────────────────────────────────");
    console.log("   DEMO ACCOUNTS (for local testing only):");
    console.log("   ┌─────────────┬──────────────────────┬──────────┐");
    console.log("   │ Role        │ openId               │ Email    │");
    console.log("   ├─────────────┼──────────────────────┼──────────┤");
    console.log("   │ admin       │ demo-admin-001       │ admin@   │");
    console.log("   │ vip         │ demo-vip-001         │ vip@     │");
    console.log("   │ user        │ demo-user-001        │ user@    │");
    console.log("   └─────────────┴──────────────────────┴──────────┘");
    console.log("   NOTE: Login uses Manus OAuth. To test as admin,");
    console.log("   set OWNER_OPEN_ID to your own Manus openId.");
    console.log("═══════════════════════════════════════════════════════\n");

  } finally {
    await conn.end();
  }
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err.message);
  process.exit(1);
});
