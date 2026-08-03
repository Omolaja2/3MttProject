const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { db, hashPassword, verifyPassword, productFields } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

function formatProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: row.price,
    unit: row.unit,
    location: row.location,
    stock: row.stock,
    image: row.image,
    rating: row.rating,
    rating_count: row.rating_count,
    farmer: { id: row.farmer_id, name: row.farmer_name, location: row.farmer_location }
  };
}

function formatUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, location: row.location };
}

function currentUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  req.user = user;
  req.token = (req.headers.authorization || '').slice(7);
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/products', (req, res) => {
  const { search, category, location, farmer_id } = req.query;
  const where = [];
  const params = [];

  if (search) {
    where.push('(p.name LIKE ? OR p.description LIKE ?)');
    const like = '%' + search + '%';
    params.push(like, like);
  }
  if (category) { where.push('p.category = ?'); params.push(category); }
  if (location) { where.push('p.location = ?'); params.push(location); }
  if (farmer_id) { where.push('p.farmer_id = ?'); params.push(Number(farmer_id)); }

  const sql = `
    SELECT ${productFields}
    FROM products p
    JOIN users u ON u.id = p.farmer_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.rating DESC, p.rating_count DESC
  `;

  res.json(db.prepare(sql).all(...params).map(formatProduct));
});

app.get('/api/products/:id', (req, res) => {
  const row = db.prepare(
    `SELECT ${productFields}
     FROM products p JOIN users u ON u.id = p.farmer_id
     WHERE p.id = ?`
  ).get(Number(req.params.id));

  if (!row) return res.status(404).json({ error: 'Product not found.' });
  res.json(formatProduct(row));
});

app.post('/api/products', requireUser, (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only farmers can list products.' });
  }

  const { name, category, description, price, unit, location, stock, image } = req.body;
  if (!name || !category || !price || !location) {
    return res.status(400).json({ error: 'Name, category, price and location are required.' });
  }

  const info = db.prepare(
    `INSERT INTO products (farmer_id, name, category, description, price, unit, location, stock, image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.id, name, category, description || '',
    Number(price), unit || 'unit', location, Math.max(0, Number(stock) || 0), image || 'tomato'
  );

  const row = db.prepare(
    `SELECT ${productFields}
     FROM products p JOIN users u ON u.id = p.farmer_id
     WHERE p.id = ?`
  ).get(Number(info.lastInsertRowid));

  res.status(201).json(formatProduct(row));
});

app.get('/api/farmers', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.location,
           COUNT(p.id) AS product_count,
           COALESCE(AVG(p.rating), 0) AS avg_rating,
           COALESCE(GROUP_CONCAT(p.name, ' | '), '') AS product_names
    FROM users u
    LEFT JOIN products p ON p.farmer_id = u.id
    WHERE u.role = 'farmer'
    GROUP BY u.id
    ORDER BY avg_rating DESC
  `).all();

  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    location: r.location,
    product_count: r.product_count,
    avg_rating: Number(r.avg_rating),
    products: r.product_names.split(' | ').filter(Boolean).slice(0, 3)
  })));
});

app.get('/api/categories', (req, res) => {
  const rows = db.prepare(
    'SELECT DISTINCT category FROM products ORDER BY category'
  ).all();
  res.json(rows.map(r => r.category));
});

app.get('/api/locations', (req, res) => {
  const rows = db.prepare(
    'SELECT DISTINCT location FROM products ORDER BY location'
  ).all();
  res.json(rows.map(r => r.location));
});

app.post('/api/register', (req, res) => {
  const { name, email, password, role, location } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const userRole = role === 'farmer' ? 'farmer' : 'buyer';

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, location) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, hashPassword(password), userRole, location || null);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);

  res.status(201).json({ token, user: formatUser(user) });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);

  res.json({ token, user: formatUser(user) });
});

app.post('/api/logout', requireUser, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

app.post('/api/orders', requireUser, (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty.' });
  }

  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
  let total = 0;
  const lines = [];

  for (const item of items) {
    const product = getProduct.get(Number(item.product_id));
    const quantity = Math.floor(Number(item.quantity));

    if (!product) return res.status(400).json({ error: 'A product in your cart no longer exists.' });
    if (!(quantity > 0)) return res.status(400).json({ error: 'Quantity must be at least 1.' });
    if (quantity > product.stock) {
      return res.status(400).json({ error: `Only ${product.stock} left of ${product.name}.` });
    }

    total += product.price * quantity;
    lines.push({ product, quantity });
  }

  try {
    db.exec('BEGIN');
    const orderInfo = db.prepare(
      'INSERT INTO orders (buyer_id, status, total) VALUES (?, ?, ?)'
    ).run(req.user.id, 'pending', total);
    const orderId = Number(orderInfo.lastInsertRowid);

    const addItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    );
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const line of lines) {
      addItem.run(orderId, line.product.id, line.quantity, line.product.price);
      updateStock.run(line.quantity, line.product.id);
    }

    db.exec('COMMIT');
    res.status(201).json({ id: orderId, total });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});

app.get('/api/orders', requireUser, (req, res) => {
  const orders = db.prepare(
    'SELECT * FROM orders WHERE buyer_id = ? ORDER BY id DESC'
  ).all(req.user.id);

  const getItems = db.prepare(
    `SELECT oi.quantity, oi.unit_price, p.name, p.image
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`
  );

  res.json(orders.map(order => ({
    id: order.id,
    status: order.status,
    total: order.total,
    created_at: order.created_at,
    items: getItems.all(order.id)
  })));
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`AgroMarket running at http://localhost:${PORT}`);
});
