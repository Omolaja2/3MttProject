const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'agromarket.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'buyer',
    location TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'unit',
    location TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    image TEXT NOT NULL DEFAULT 'tomato',
    rating REAL NOT NULL DEFAULT 5.0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending',
    total REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calc, 'hex'));
}

const productFields = `
  p.id, p.farmer_id, p.name, p.category, p.description, p.price, p.unit,
  p.location, p.stock, p.image, p.rating, p.rating_count,
  u.name AS farmer_name, u.location AS farmer_location
`;

function seed() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (existing > 0) return;

  const addUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, location) VALUES (?, ?, ?, ?, ?)'
  );
  const addProduct = db.prepare(
    `INSERT INTO products (farmer_id, name, category, description, price, unit, location, stock, image, rating, rating_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const farmerHash = hashPassword('farmer123');
  const farmers = [
    ['Aisha Bello', 'aisha@agromarket.test', 'Kaduna'],
    ['Emeka Obi', 'emeka@agromarket.test', 'Enugu'],
    ['Adewale Johnson', 'adewale@agromarket.test', 'Ibadan'],
    ['Ngozi Eze', 'ngozi@agromarket.test', 'Enugu'],
    ['Musa Ibrahim', 'musa@agromarket.test', 'Kano'],
    ['Funke Adetola', 'funke@agromarket.test', 'Lagos'],
    ['Suleiman Bala', 'suleiman@agromarket.test', 'Kaduna'],
    ['Grace Okon', 'grace@agromarket.test', 'Abuja']
  ];

  const farmerIds = {};
  for (const [name, email, location] of farmers) {
    farmerIds[name] = Number(addUser.run(name, email, farmerHash, 'farmer', location).lastInsertRowid);
  }

  const products = [
    ['Fresh Tomatoes', 'Vegetables', 'Sweet, firm tomatoes picked at peak ripeness.', 4500, 'basket', 'Kaduna', 120, 'tomato', 5.0, 120, 'Aisha Bello'],
    ['Local Rice', 'Grains', 'Clean, stone-free local rice. Perfect for everyday meals.', 38000, '50kg bag', 'Enugu', 40, 'rice', 5.0, 98, 'Emeka Obi'],
    ['White Yam (1 tuber)', 'Tubers', 'Large healthy yam tubers from Ibadan farms.', 2800, 'tuber', 'Ibadan', 200, 'yam', 5.0, 76, 'Adewale Johnson'],
    ['Fresh Red Pepper', 'Vegetables', 'Hot, fresh red pepper great for stews and pepper soup.', 3200, 'basket', 'Enugu', 90, 'pepper', 4.0, 64, 'Ngozi Eze'],
    ['Sweet Corn Maize', 'Grains', 'Sweet corn on the cob, harvested this week.', 1500, 'dozen', 'Kano', 150, 'maize', 5.0, 53, 'Musa Ibrahim'],
    ['Ripe Plantain', 'Fruits', 'Ripe, sweet plantain ready for roasting or frying.', 2200, 'bunch', 'Lagos', 80, 'plantain', 5.0, 87, 'Funke Adetola'],
    ['Brown Beans', 'Legumes', 'High-quality brown beans, cleaned and bagged.', 9500, '5kg bag', 'Kaduna', 60, 'beans', 4.0, 41, 'Suleiman Bala'],
    ['Farm Eggs (Crate)', 'Livestock & Poultry', 'Fresh farm eggs in a full crate of 30.', 4000, 'crate', 'Abuja', 100, 'eggs', 5.0, 135, 'Grace Okon']
  ];

  for (const [name, category, description, price, unit, location, stock, image, rating, ratingCount, farmer] of products) {
    addProduct.run(
      farmerIds[farmer], name, category, description, price, unit,
      location, stock, image, rating, ratingCount
    );
  }
}

seed();

module.exports = { db, hashPassword, verifyPassword, productFields, seed };
