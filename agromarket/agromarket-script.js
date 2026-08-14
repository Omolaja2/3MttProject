/*

AgroMarket - Fresh Farm Produce Marketplace

Frontend wired to the Express + SQLite backend (see server.js / db.js).

*/

/* ===== Mobile Nav Toggle ===== */
const navToggle = document.getElementById('navToggle');
const navLinks  = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('active');
    navLinks.classList.toggle('open');
    document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
    navToggle.setAttribute('aria-expanded',
        navToggle.classList.contains('active'));
});

navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navLinks.classList.remove('open');
        document.body.style.overflow = '';
        navToggle.setAttribute('aria-expanded', 'false');
    });
});

/* ===== FAQ Accordion ===== */
function faqOpen(item) {
    const answer = item.querySelector('.faq-answer');
    item.classList.add('open');
    answer.style.maxHeight = answer.scrollHeight + 'px';
    item.querySelector('.faq-question').setAttribute('aria-expanded', 'true');
}

function faqClose(item) {
    const answer = item.querySelector('.faq-answer');
    item.classList.remove('open');
    answer.style.maxHeight = '0';
    item.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
}

document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        if (item.classList.contains('open')) {
            faqClose(item);
        } else {
            faqOpen(item);
        }
    });
});

document.getElementById('faqExpandAll').addEventListener('click', () => {
    document.querySelectorAll('.faq-item').forEach(item => faqOpen(item));
});

document.getElementById('faqCollapseAll').addEventListener('click', () => {
    document.querySelectorAll('.faq-item').forEach(item => faqClose(item));
});

/* ===== Toast ===== */
const toast = document.getElementById('toast');
let toastTimer = null;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2600);
}

/* ===== State ===== */
const STORAGE = {
    token: 'agromarket_token',
    user:  'agromarket_user',
    cart:  'agromarket_cart'
};

const state = {
    products:   [],
    farmers:    [],
    categories: [],
    locations:  [],
    user:       null,
    cart:       [],
    filter:     { search: '', category: '', location: '' }
};

try {
    state.user = JSON.parse(localStorage.getItem(STORAGE.user) || 'null');
    state.cart = JSON.parse(localStorage.getItem(STORAGE.cart) || '[]');
} catch (err) {
    state.user = null;
    state.cart = [];
}

const money = n => '₦' + Number(n).toLocaleString('en-NG');

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ===== API ===== */
async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = localStorage.getItem(STORAGE.token);
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch('/api' + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong on the server.');
    return data;
}

/* ===== Product image helpers ===== */
const IMG = {
    tomato:   { ill: 'ill-tomato',   cls: 'pimg-tomato' },
    rice:     { ill: 'ill-rice',     cls: 'pimg-rice' },
    yam:      { ill: 'ill-yam',      cls: 'pimg-yam' },
    pepper:   { ill: 'ill-pepper',   cls: 'pimg-pepper' },
    maize:    { ill: 'ill-maize',    cls: 'pimg-maize' },
    plantain: { ill: 'ill-plantain', cls: 'pimg-plantain' },
    beans:    { ill: 'ill-beans',    cls: 'pimg-beans' },
    eggs:     { ill: 'ill-eggs',     cls: 'pimg-eggs' }
};
const DEFAULT_IMG = { ill: 'ill-basket', cls: 'pimg-default' };

function productImg(key) {
    return IMG[key] || DEFAULT_IMG;
}

function stars(rating) {
    const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    let html = '';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= r;
        html += `<svg viewBox="0 0 24 24" class="${filled ? '' : 'empty'}"><use href="#${filled ? 'icon-star' : 'icon-star-empty'}"/></svg>`;
    }
    return html;
}

function initials(name) {
    return String(name || '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0])
        .join('')
        .toUpperCase();
}

/* ===== Product grid ===== */
const productGrid = document.getElementById('productGrid');
const searchInput = document.getElementById('searchInput');
const searchCategory = document.getElementById('searchCategory');
const searchLocation = document.getElementById('searchLocation');
const searchForm = document.getElementById('searchForm');

function gridProducts() {
    const my = JSON.parse(localStorage.getItem(DASH_STORAGE.products) || '[]');
    const seen = new Set();
    return my.concat(state.products).filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
    });
}

function renderProducts() {
    const list = gridProducts();
    if (!list.length) {
        productGrid.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 3c2.9 3.4 4.3 6.2 4.3 9.7a4.3 4.3 0 0 1-8.6 0c0-3.5 1.4-6.3 4.3-9.7Z"/>
                </svg>
                <h3>No produce found</h3>
                <p>Try a different search term or clear your filters.</p>
            </div>`;
        initReveal();
        return;
    }

    productGrid.innerHTML = list.map(productCard).join('');
    initReveal();
}

function productCard(p) {
    const img = productImg(p.image);
    return `
        <div class="product-card reveal" data-id="${p.id}">
            <div class="product-image ${img.cls}">
                <svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${img.ill}"/></svg>
            </div>
            <div class="product-info">
                <div class="product-top">
                    <h3>${esc(p.name)}</h3>
                    <span class="product-price">${money(p.price)}</span>
                </div>
                <div class="product-meta">
                    <span>${esc(p.farmer.name)}</span>
                    <span class="meta-loc"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-pin"/></svg> ${esc(p.location)}</span>
                </div>
                <div class="product-stars" aria-label="Rated ${p.rating} out of 5">
                    <span class="stars">${stars(p.rating)}</span>
                    <span class="count">(${p.rating_count})</span>
                </div>
                <div class="product-actions">
                    <button class="btn-primary btn-sm" data-add="${p.id}">Add to Cart</button>
                    <a href="#" class="btn-outline btn-sm" data-detail="${p.id}">View Details</a>
                </div>
            </div>
        </div>`;
}

function loadProducts() {
    productGrid.classList.add('loading');
    const q = new URLSearchParams();
    if (state.filter.search)    q.set('search', state.filter.search);
    if (state.filter.category)  q.set('category', state.filter.category);
    if (state.filter.location)  q.set('location', state.filter.location);
    const qs = q.toString() ? '?' + q.toString() : '';

    api('/products' + qs)
        .then(data => {
            state.products = data;
            renderProducts();
            if (dashboardView && !dashboardView.hidden && state.user) {
                refreshDashboardData();
            }
        })
        .catch(() => {
            state.products = FALLBACK_PRODUCTS;
            renderProducts();
            if (dashboardView && !dashboardView.hidden && state.user) {
                refreshDashboardData();
            }
        })
        .finally(() => productGrid.classList.remove('loading'));
}

/* ===== Search ===== */
searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.filter.search = searchInput.value.trim();
    state.filter.category = searchCategory.value;
    state.filter.location = searchLocation.value;
    loadProducts();
});

searchCategory.addEventListener('change', () => {
    state.filter.category = searchCategory.value;
    loadProducts();
});

searchLocation.addEventListener('change', () => {
    state.filter.location = searchLocation.value;
    loadProducts();
});

document.querySelectorAll('.search-popular .chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = chip.textContent;
        state.filter.search = chip.textContent;
        loadProducts();
    });
});

/* ===== Category & location filters ===== */
function loadFilters() {
    api('/categories')
        .then(cats => {
            state.categories = cats;
            const current = searchCategory.value;
            searchCategory.innerHTML = '<option value="">All Categories</option>' +
                cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
            if (cats.includes(current)) searchCategory.value = current;
        })
        .catch(() => {});

    api('/locations')
        .then(locs => {
            state.locations = locs;
            const current = searchLocation.value;
            searchLocation.innerHTML = '<option value="">All Locations</option>' +
                locs.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
            if (locs.includes(current)) searchLocation.value = current;
        })
        .catch(() => {});
}

/* ===== Farmers ===== */
const farmerGrid = document.getElementById('farmerGrid');

function renderFarmers() {
    if (!state.farmers.length) return;
    const classes = ['fp1', 'fp2', 'fp3', 'fp4'];
    farmerGrid.innerHTML = state.farmers.map((f, i) => {
        const products = (f.products || []).map(esc).join(' &middot; ');
        return `
            <div class="farmer-card reveal">
                <div class="farmer-photo ${classes[i % 4]}" aria-hidden="true">${initials(f.name)}</div>
                <h3>${esc(f.name)} <span class="verified" title="Verified farmer"><svg viewBox="0 0 24 24"><use href="#icon-check"/></svg></span></h3>
                <p class="farmer-loc"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-pin"/></svg> ${esc(f.location)}</p>
                <p class="farmer-products">${products}</p>
                <div class="farmer-stars" aria-label="Rated ${f.avg_rating} out of 5">
                    <span class="stars">${stars(f.avg_rating)}</span>
                    <span class="rate">${f.avg_rating}</span>
                </div>
            </div>`;
    }).join('');
    initReveal();
}

function loadFarmers() {
    api('/farmers')
        .then(list => {
            state.farmers = list;
            renderFarmers();
        })
        .catch(() => {});
}

/* ===== Stats ===== */
function loadStats() {
    api('/products')
        .then(products => {
            document.getElementById('statProducts').textContent = products.length.toLocaleString('en-NG');
        })
        .catch(() => {});

    api('/farmers')
        .then(farmers => {
            document.getElementById('statFarmers').textContent = farmers.length.toLocaleString('en-NG');
        })
        .catch(() => {});
}

/* ===== Cart ===== */
const cartModal = document.getElementById('cartModal');
const cartItemsEl = document.getElementById('cartItems');
const cartTotal = document.getElementById('cartTotal');
const checkoutBtn = document.getElementById('checkoutBtn');

function saveCart() {
    localStorage.setItem(STORAGE.cart, JSON.stringify(state.cart));
}

function cartCount() {
    return state.cart.reduce((sum, i) => sum + i.quantity, 0);
}

function updateCartBadge() {
    const count = cartCount();
    [document.getElementById('cartBadge'), document.getElementById('cartBadgeMobile')].forEach(badge => {
        badge.hidden = count === 0;
        badge.textContent = count;
    });
}

function addToCart(productId) {
    const product = gridProducts().find(p => p.id === Number(productId));
    if (!product) return;

    const line = state.cart.find(i => i.product_id === product.id);
    if (line) {
        line.quantity += 1;
    } else {
        state.cart.push({
            product_id: product.id,
            quantity: 1,
            name: product.name,
            price: product.price,
            image: product.image
        });
    }

    saveCart();
    updateCartBadge();
    showToast(`${product.name} added to cart`);
}

function renderCart() {
    cartItemsEl.innerHTML = '';

    if (!state.cart.length) {
        cartItemsEl.innerHTML = '<p class="cart-empty">Your cart is empty. Browse the marketplace to add items.</p>';
        checkoutBtn.disabled = true;
        cartTotal.textContent = money(0);
        return;
    }

    state.cart.forEach((item, idx) => {
        const img = productImg(item.image);
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <span class="cart-item-img ${img.cls}"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${img.ill}"/></svg></span>
            <div class="cart-item-info">
                <strong>${esc(item.name)}</strong>
                <small>${money(item.price)} each</small>
            </div>
            <div class="cart-qty">
                <button type="button" data-dec="${idx}" aria-label="Decrease quantity">&minus;</button>
                <span>${item.quantity}</span>
                <button type="button" data-inc="${idx}" aria-label="Increase quantity">+</button>
            </div>
            <span class="cart-line-total">${money(item.price * item.quantity)}</span>
            <button type="button" class="cart-remove" data-remove="${idx}" aria-label="Remove ${esc(item.name)}">&times;</button>
        `;
        cartItemsEl.appendChild(row);
    });

    cartTotal.textContent = money(state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0));
    checkoutBtn.disabled = false;
}

cartItemsEl.addEventListener('click', (e) => {
    const inc = e.target.closest('[data-inc]');
    const dec = e.target.closest('[data-dec]');
    const remove = e.target.closest('[data-remove]');

    if (inc) {
        state.cart[Number(inc.dataset.inc)].quantity += 1;
    } else if (dec) {
        const item = state.cart[Number(dec.dataset.dec)];
        item.quantity -= 1;
        if (item.quantity <= 0) state.cart.splice(Number(dec.dataset.dec), 1);
    } else if (remove) {
        state.cart.splice(Number(remove.dataset.remove), 1);
    } else {
        return;
    }

    saveCart();
    updateCartBadge();
    renderCart();
});

function openCart() {
    renderCart();
    openModal('cartModal');
}

checkoutBtn.addEventListener('click', () => {
    if (!state.user) {
        closeModal('cartModal');
        openAuthModal('login');
        showToast('Please log in to checkout.');
        return;
    }

    checkoutBtn.disabled = true;
    const total = state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const orderId = Math.floor(1000 + Math.random() * 9000);
    const placed = {
        id: orderId,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        status: 'processing',
        total,
        items: state.cart.map(i => ({ name: i.name, image: i.image, quantity: i.quantity, price: i.price }))
    };

    setTimeout(() => {
        const orders = JSON.parse(localStorage.getItem(DASH_STORAGE.orders) || '[]');
        orders.unshift(placed);
        localStorage.setItem(DASH_STORAGE.orders, JSON.stringify(orders));

        state.cart = [];
        saveCart();
        updateCartBadge();
        renderCart();
        closeModal('cartModal');
        showToast(`Order #${orderId} placed — total ${money(total)} (demo)`);
        checkoutBtn.disabled = false;
    }, 700);
});

/* ===== Modals ===== */
function openModal(id) {
    document.getElementById(id).hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).hidden = true;
    const anyOpen = ['authModal', 'detailModal', 'cartModal'].some(m => !document.getElementById(m).hidden);
    if (!anyOpen) document.body.style.overflow = '';
}

document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
        const overlay = btn.closest('.modal-overlay');
        if (overlay) closeModal(overlay.id);
    });
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        ['authModal', 'detailModal', 'cartModal'].forEach(id => {
            if (!document.getElementById(id).hidden) closeModal(id);
        });
    }
});

/* ===== Auth ===== */
const authModal = document.getElementById('authModal');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function setFormError(el, message) {
    if (message) {
        el.textContent = message;
        el.hidden = false;
    } else {
        el.hidden = true;
    }
}

function openAuthModal(tab) {
    switchAuthTab(tab || 'login');
    setFormError(document.getElementById('loginError'), '');
    setFormError(document.getElementById('registerError'), '');
    openModal('authModal');
}

function switchAuthTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('authTitle').textContent = isLogin ? 'Login' : 'Create an Account';
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.authTab === tab);
        t.setAttribute('aria-selected', t.dataset.authTab === tab);
    });
}

document.querySelectorAll('[data-auth-tab]').forEach(tab => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.authTab));
});

document.querySelectorAll('[data-auth]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal(btn.dataset.auth);
    });
});

function handleAuthSuccess(data) {
    localStorage.setItem(STORAGE.token, data.token);
    localStorage.setItem(STORAGE.user, JSON.stringify(data.user));
    state.user = data.user;
    setAuthUI();
    closeModal('authModal');
    showToast(`Welcome, ${data.user.name}!`);
    showDashboard();
}

const DEMO_ACCOUNTS = {
    buyer:  { id: 1,  name: 'Demo Buyer',  email: 'buyer@demo.com',  role: 'buyer',  location: 'Ibadan' },
    farmer: { id: 2,  name: 'Demo Seller', email: 'seller@demo.com', role: 'farmer', location: 'Ibadan' }
};

function demoLogin(role) {
    handleAuthSuccess({ token: 'demo-' + role, user: DEMO_ACCOUNTS[role] });
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    setFormError(document.getElementById('loginError'), '');

    if (email === 'buyer@demo.com' && password === 'demo') {
        demoLogin('buyer');
        return;
    }
    if (email === 'seller@demo.com' && password === 'demo') {
        demoLogin('farmer');
        return;
    }

    const matched = Object.values(DEMO_ACCOUNTS).find(a => a.email === email);
    if (matched) {
        setFormError(document.getElementById('loginError'), 'Wrong password. Demo password is "demo".');
        return;
    }

    setFormError(document.getElementById('loginError'), 'Demo account not found. Use a demo button or register below.');
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const role = document.getElementById('registerRole').value;

    setFormError(document.getElementById('registerError'), '');

    if (!name || !email || !password) {
        setFormError(document.getElementById('registerError'), 'Name, email and password are required.');
        return;
    }
    if (password.length < 6) {
        setFormError(document.getElementById('registerError'), 'Password must be at least 6 characters.');
        return;
    }

    handleAuthSuccess({
        token: 'demo-' + role + '-' + Date.now(),
        user: {
            id: 900 + Math.floor(Math.random() * 100),
            name,
            email,
            role,
            location: document.getElementById('registerLocation').value.trim() || 'Ibadan'
        }
    });
});

document.querySelectorAll('[data-demo]').forEach(btn => {
    btn.addEventListener('click', () => demoLogin(btn.dataset.demo));
});

function logout() {
    localStorage.removeItem(STORAGE.token);
    localStorage.removeItem(STORAGE.user);
    state.user = null;
    setAuthUI();
    showToast('You have been logged out.');
}

function setAuthUI() {
    const loggedIn = !!state.user;
    document.getElementById('loginBtn').hidden = loggedIn;
    document.getElementById('registerBtn').hidden = loggedIn;

    document.getElementById('loginBtnMobile').hidden = loggedIn;
    document.getElementById('registerBtnMobile').hidden = loggedIn;
}

function switchAccount() {
    localStorage.removeItem(STORAGE.token);
    localStorage.removeItem(STORAGE.user);
    state.user = null;
    setAuthUI();
    showMarket();
    openAuthModal('login');
}

document.getElementById('switchBtnPanel').addEventListener('click', switchAccount);

/* ===== Product detail ===== */
const detailModal = document.getElementById('detailModal');

function openDetail(productId) {
    const p = gridProducts().find(prod => prod.id === Number(productId));
    if (!p) return;

    const img = productImg(p.image);
    document.getElementById('detailImage').className = 'detail-image ' + img.cls;
    document.getElementById('detailImage').innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${img.ill}"/></svg>`;
    document.getElementById('detailName').textContent = p.name;
    document.getElementById('detailPrice').textContent = money(p.price) + ' per ' + p.unit;
    document.getElementById('detailDesc').textContent = p.description || 'No description available for this product yet.';
    document.getElementById('detailMeta').innerHTML = `
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-pin"/></svg> ${esc(p.location)}</span>
        <span>${esc(p.farmer.name)}</span>
        <span>${stars(p.rating)}</span>`;

    const stockEl = document.getElementById('detailStock');
    stockEl.textContent = p.stock > 0 ? `${p.stock} in stock` : 'Out of stock';
    stockEl.classList.toggle('low', p.stock <= 5);

    document.getElementById('detailAdd').dataset.add = p.id;
    openModal('detailModal');
}

document.getElementById('detailAdd').addEventListener('click', (e) => {
    addToCart(e.currentTarget.dataset.add);
});

/* ===== Grid event delegation ===== */
productGrid.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-add]');
    const detailBtn = e.target.closest('[data-detail]');
    if (addBtn) {
        e.preventDefault();
        addToCart(addBtn.dataset.add);
    } else if (detailBtn) {
        e.preventDefault();
        openDetail(detailBtn.dataset.detail);
    }
});

/* ===== Cart buttons ===== */
document.getElementById('cartBtn').addEventListener('click', openCart);
document.getElementById('cartBtnMobile').addEventListener('click', openCart);

/* ===== Newsletter ===== */
document.getElementById('newsletterForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('newsletterEmail').value.trim();
    if (email) {
        showToast(`Thanks for subscribing, ${email}!`);
        document.getElementById('newsletterEmail').value = '';
    }
});

/* ===== Scroll Reveal ===== */
let revealObserver = null;

function initReveal() {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveals = document.querySelectorAll('.reveal:not(.visible)');
    if (prefersReduced || !reveals.length) {
        reveals.forEach(el => el.classList.add('visible'));
        return;
    }

    if (!revealObserver) {
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry, i) => {
                if (entry.isIntersecting) {
                    entry.target.style.transitionDelay = `${i * 60}ms`;
                    entry.target.classList.add('visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    }

    reveals.forEach(el => revealObserver.observe(el));
}

/* ===== Dashboard ===== */
const dashboardView = document.getElementById('dashboardView');
const landingView = document.getElementById('landingView');

const DASH_STORAGE = {
    orders: 'agromarket_orders',
    products: 'agromarket_myproducts',
    sales: 'agromarket_sales'
};

const FALLBACK_PRODUCTS = [
    { id: 101, name: 'Fresh Tomatoes', category: 'Vegetables', price: 1500, unit: 'kg', location: 'Ibadan', stock: 40, image: 'tomato', rating: 4.8, rating_count: 214, farmer: { name: 'Mama Bola Farms' } },
    { id: 102, name: 'Basmati Rice', category: 'Grains', price: 3500, unit: 'kg', location: 'Kano', stock: 25, image: 'rice', rating: 4.7, rating_count: 168, farmer: { name: 'Green Valley Farm' } },
    { id: 103, name: 'White Yam', category: 'Tubers', price: 1200, unit: 'unit', location: 'Oyo', stock: 60, image: 'yam', rating: 4.6, rating_count: 132, farmer: { name: 'Omo Yams' } },
    { id: 104, name: 'Scotch Bonnet Pepper', category: 'Vegetables', price: 800, unit: 'kg', location: 'Abeokuta', stock: 55, image: 'pepper', rating: 4.9, rating_count: 240, farmer: { name: 'Tasty Pepper Co' } },
    { id: 105, name: 'Sweet Corn', category: 'Grains', price: 900, unit: 'unit', location: 'Osun', stock: 90, image: 'maize', rating: 4.5, rating_count: 98, farmer: { name: 'Farm Fresh Org' } },
    { id: 106, name: 'Ripe Plantains', category: 'Fruits', price: 650, unit: 'unit', location: 'Ekiti', stock: 70, image: 'plantain', rating: 4.6, rating_count: 121, farmer: { name: 'Village Harvest' } },
    { id: 107, name: 'Brown Beans', category: 'Legumes', price: 1100, unit: 'kg', location: 'Benin', stock: 45, image: 'beans', rating: 4.7, rating_count: 143, farmer: { name: 'Green Valley Farm' } },
    { id: 108, name: 'Farm Eggs (crate)', category: 'Livestock', price: 2800, unit: 'crate', location: 'Ibadan', stock: 30, image: 'eggs', rating: 4.8, rating_count: 176, farmer: { name: 'Mama Bola Farms' } }
];

function marketProducts() {
    return state.products.length ? state.products : FALLBACK_PRODUCTS;
}

function dashboardProducts() {
    const my = JSON.parse(localStorage.getItem(DASH_STORAGE.products) || '[]');
    return marketProducts().concat(my);
}

function dashboardOrders() {
    let orders = JSON.parse(localStorage.getItem(DASH_STORAGE.orders) || '[]');
    if (!orders.length && marketProducts().length) {
        const src = marketProducts();
        const pick = i => src[i % src.length];
        const statuses = ['delivered', 'delivered', 'processing'];
        orders = [
            { id: 4821, date: 'Aug 12, 2026', status: statuses[0], total: 0, items: [pick(0), pick(2)].map(p => ({ name: p.name, image: p.image, quantity: 2, price: p.price })) },
            { id: 4776, date: 'Aug 5, 2026', status: statuses[1], total: 0, items: [pick(1), pick(4)].map(p => ({ name: p.name, image: p.image, quantity: 1, price: p.price })) },
            { id: 4710, date: 'Jul 28, 2026', status: statuses[2], total: 0, items: [pick(3), pick(5)].map(p => ({ name: p.name, image: p.image, quantity: 3, price: p.price })) }
        ];
        orders.forEach(o => {
            o.total = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
        });
        localStorage.setItem(DASH_STORAGE.orders, JSON.stringify(orders));
    }
    return orders;
}

function dashboardSales() {
    let sales = JSON.parse(localStorage.getItem(DASH_STORAGE.sales) || '[]');
    if (!sales.length && marketProducts().length) {
        const src = marketProducts();
        const names = ['Aisha O.', 'Tunde A.', 'Ngozi E.', 'Ibrahim S.', 'Chidi N.'];
        const statuses = ['delivered', 'processing', 'pending', 'delivered', 'cancelled'];
        sales = src.slice(0, 5).map((p, i) => ({
            id: 3800 - i * 7,
            buyer: names[i],
            product: p.name,
            image: p.image,
            quantity: i + 2,
            price: p.price,
            total: p.price * (i + 2),
            status: statuses[i],
            date: `Aug ${14 - i}, 2026`
        }));
        localStorage.setItem(DASH_STORAGE.sales, JSON.stringify(sales));
    }
    return sales;
}

function imgClsFor(key) {
    return productImg(key).cls;
}

function imgUseFor(key) {
    return productImg(key).ill;
}

function initialsOf(name) {
    return initials(name);
}

function setActivePanel(panel, opts = {}) {
    document.querySelectorAll('.dash-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.panel === panel);
    });
    document.querySelectorAll('.dash-panel').forEach(p => {
        p.hidden = p.dataset.panel !== panel;
    });
    if (opts.scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function statusChip(status) {
    return `<span class="dash-status ${esc(status)}">${esc(status)}</span>`;
}

function renderBuyerOverview() {
    const orders = dashboardOrders();
    const src = marketProducts();
    const totalSpent = orders.reduce((s, o) => s + o.total, 0);
    const itemsBought = orders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);

    document.getElementById('statOrders').textContent = orders.length;
    document.getElementById('statRevenue').textContent = money(totalSpent);
    document.getElementById('statRevenueLabel').textContent = 'Total spent';
    document.getElementById('statItems').textContent = itemsBought;
    document.getElementById('statItemsLabel').textContent = 'Items bought';
    document.getElementById('statRating').textContent = '★ 4.8';

    const list = document.getElementById('overviewOrders');
    if (!orders.length) {
        list.innerHTML = '<p class="dash-empty">No orders yet.</p>';
    } else {
        list.innerHTML = orders.slice(0, 3).map(o => `
            <div class="dash-list-item">
                <span class="dash-list-img ${imgClsFor(o.items[0].image)}"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${imgUseFor(o.items[0].image)}"/></svg></span>
                <div class="dash-list-info">
                    <strong>Order #${o.id}</strong>
                    <small>${esc(o.date)} &middot; ${o.items.length} item(s)</small>
                </div>
                <span class="dash-list-price">${money(o.total)}</span>
            </div>`).join('');
    }

    const top = src.slice(0, 4);
    document.getElementById('overviewProducts').innerHTML = top.length ? top.map(p => `
        <div class="dash-list-item">
            <span class="dash-list-img ${imgClsFor(p.image)}"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${imgUseFor(p.image)}"/></svg></span>
            <div class="dash-list-info">
                <strong>${esc(p.name)}</strong>
                <small>${esc(p.category)}</small>
            </div>
            <span class="dash-list-price">${money(p.price)}</span>
        </div>`).join('') : '<p class="dash-empty">Loading marketplace data…</p>';
}

function renderSellerOverview() {
    const products = dashboardProducts();
    const sales = dashboardSales();
    const revenue = sales.reduce((s, x) => s + x.total, 0);
    const unitsSold = sales.reduce((s, x) => s + x.quantity, 0);

    document.getElementById('statOrders').textContent = sales.length;
    document.getElementById('statRevenue').textContent = money(revenue);
    document.getElementById('statRevenueLabel').textContent = 'Total revenue';
    document.getElementById('statItems').textContent = unitsSold;
    document.getElementById('statItemsLabel').textContent = 'Units sold';
    document.getElementById('statRating').textContent = '★ 4.7';

    const list = document.getElementById('overviewOrders');
    list.innerHTML = sales.length ? sales.slice(0, 3).map(s => `
        <div class="dash-list-item">
            <span class="dash-list-img ${imgClsFor(s.image)}"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${imgUseFor(s.image)}"/></svg></span>
            <div class="dash-list-info">
                <strong>${esc(s.product)}</strong>
                <small>${esc(s.buyer)} &middot; ${esc(s.date)}</small>
            </div>
            ${statusChip(s.status)}
        </div>`).join('') : '<p class="dash-empty">No sales yet.</p>';

    const top = products.slice(0, 4);
    document.getElementById('overviewProducts').innerHTML = top.length ? top.map(p => `
        <div class="dash-list-item">
            <span class="dash-list-img ${imgClsFor(p.image)}"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${imgUseFor(p.image)}"/></svg></span>
            <div class="dash-list-info">
                <strong>${esc(p.name)}</strong>
                <small>${p.stock} in stock</small>
            </div>
            <span class="dash-list-price">${money(p.price)}</span>
        </div>`).join('') : '<p class="dash-empty">Loading marketplace data…</p>';
}

function renderOverview() {
    document.getElementById('dashGreetingName').textContent = (state.user.name || 'Demo').split(' ')[0];
    if (state.user.role === 'farmer') {
        document.getElementById('dashGreetingSub').textContent = 'Here\'s your store performance at a glance.';
        document.getElementById('dashActionLabel').textContent = 'Add Product';
        renderSellerOverview();
    } else {
        document.getElementById('dashGreetingSub').textContent = 'Here\'s what\'s happening on AgroMarket today.';
        document.getElementById('dashActionLabel').textContent = 'Browse Market';
        renderBuyerOverview();
    }
    setActivePanel('overview');
}

function renderBuyerOrders() {
    const orders = dashboardOrders();
    const list = document.getElementById('buyerOrders');
    if (!orders.length) {
        list.innerHTML = '<p class="dash-empty">You haven\'t placed any orders yet.</p>';
        return;
    }
    list.innerHTML = orders.map(o => `
        <div class="order-item">
            <div class="order-top">
                <strong>Order #${o.id}</strong>
                <small>${esc(o.date)}</small>
                ${statusChip(o.status)}
            </div>
            <div class="order-items">
                ${o.items.map(i => `
                    <div class="order-line">
                        <span>${esc(i.name)}</span>
                        <span class="qty">${i.quantity} &times; ${money(i.price)}</span>
                    </div>`).join('')}
            </div>
            <div class="order-total"><span>Total</span><strong>${money(o.total)}</strong></div>
        </div>`).join('');
}

function stockPill(stock) {
    if (stock <= 0) return '<span class="pill out-stock">Out of stock</span>';
    if (stock <= 10) return '<span class="pill low-stock">Low stock</span>';
    return '<span class="pill in-stock">In stock</span>';
}

function renderSellerProducts() {
    const products = dashboardProducts();
    const tbody = document.getElementById('sellerProductsTable');
    if (!products.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="dash-empty">No products yet. Add your first product!</td></tr>';
        return;
    }
    tbody.innerHTML = products.map(p => `
        <tr>
            <td><span class="prod-cell"><span class="dash-list-img ${imgClsFor(p.image)}"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${imgUseFor(p.image)}"/></svg></span><strong>${esc(p.name)}</strong></span></td>
            <td>${esc(p.category || 'General')}</td>
            <td>${money(p.price)} / ${esc(p.unit || 'unit')}</td>
            <td>${esc(p.stock)}</td>
            <td>★ ${Number(p.rating || 4.5).toFixed(1)}</td>
            <td>${stockPill(p.stock)}</td>
        </tr>`).join('');
}

function renderSellerSales() {
    const sales = dashboardSales();
    const list = document.getElementById('sellerSales');
    if (!sales.length) {
        list.innerHTML = '<p class="dash-empty">No sales yet.</p>';
        return;
    }
    list.innerHTML = sales.map(s => `
        <div class="order-item">
            <div class="order-top">
                <strong>${esc(s.product)}</strong>
                <small>${esc(s.buyer)} &middot; ${esc(s.date)}</small>
                ${statusChip(s.status)}
            </div>
            <div class="order-total"><span>${s.quantity} sold</span><strong>${money(s.total)}</strong></div>
        </div>`).join('');
}

function renderAccount() {
    const u = state.user;
    document.getElementById('dashAvatar').textContent = initialsOf(u.name);
    document.getElementById('dashName').textContent = u.name;
    document.getElementById('dashRole').textContent = u.role === 'farmer' ? 'Seller' : 'Buyer';
    document.getElementById('accountRows').innerHTML = `
        <div class="account-row"><span>Full name</span><strong>${esc(u.name)}</strong></div>
        <div class="account-row"><span>Email</span><strong>${esc(u.email || '—')}</strong></div>
        <div class="account-row"><span>Role</span><strong>${esc(u.role === 'farmer' ? 'Seller (farmer)' : 'Buyer')}</strong></div>
        <div class="account-row"><span>Location</span><strong>${esc(u.location || 'Ibadan')}</strong></div>
        <div class="account-row"><span>Account</span><strong>Demo account</strong></div>`;
}

function renderDashboard() {
    if (!state.user) return;
    const isFarmer = state.user.role === 'farmer';
    document.getElementById('sellerProductsNav').hidden = !isFarmer;
    document.getElementById('sellerSalesNav').hidden = !isFarmer;
    document.getElementById('buyerOrdersNav').hidden = isFarmer;

    renderAccount();
    renderOverview();
    setActivePanel('overview');
}

function refreshDashboardData() {
    if (!state.user || dashboardView.hidden) return;
    dashboardOrders();
    dashboardSales();
    const active = document.querySelector('.dash-nav-item.active');
    const panel = active ? active.dataset.panel : 'overview';
    if (panel === 'overview') renderOverview();
    if (panel === 'orders') renderBuyerOrders();
    if (panel === 'products') renderSellerProducts();
    if (panel === 'sales') renderSellerSales();
    if (panel === 'account') renderAccount();
}

function showDashboard() {
    landingView.hidden = true;
    dashboardView.hidden = false;
    document.body.classList.add('dash-mode');
    closeModal('authModal');
    renderDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showMarket() {
    dashboardView.hidden = true;
    landingView.hidden = false;
    document.body.classList.remove('dash-mode');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.dash-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        setActivePanel(panel);
        if (panel === 'orders') renderBuyerOrders();
        if (panel === 'products') renderSellerProducts();
        if (panel === 'sales') renderSellerSales();
        if (panel === 'account') renderAccount();
    });
});

document.querySelectorAll('.dash-link').forEach(el => {
    el.addEventListener('click', () => {
        setActivePanel(el.dataset.panel);
    });
});

document.querySelectorAll('.dash-back').forEach(btn => {
    btn.addEventListener('click', showMarket);
});

document.getElementById('dashActionBtn').addEventListener('click', () => {
    if (state.user.role === 'farmer') {
        setActivePanel('products', { scroll: false });
        openAddProduct();
    } else {
        showMarket();
    }
});

const addProductCard = document.getElementById('addProductCard');
const addProductForm = document.getElementById('addProductForm');

function openAddProduct() {
    addProductCard.hidden = false;
    document.getElementById('apName').focus();
    if (addProductCard.scrollIntoView) {
        addProductCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

document.getElementById('openAddProduct').addEventListener('click', openAddProduct);
document.getElementById('closeAddProduct').addEventListener('click', () => {
    addProductCard.hidden = true;
});

addProductForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const products = JSON.parse(localStorage.getItem(DASH_STORAGE.products) || '[]');
    products.unshift({
        id: 900 + Date.now() % 1000,
        name: document.getElementById('apName').value.trim(),
        category: document.getElementById('apCategory').value,
        price: Number(document.getElementById('apPrice').value),
        unit: document.getElementById('apUnit').value.trim() || 'unit',
        stock: Number(document.getElementById('apStock').value),
        image: document.getElementById('apImage').value,
        description: document.getElementById('apDesc').value.trim(),
        rating: 5,
        rating_count: 0,
        location: state.user.location || 'Ibadan',
        farmer: { name: state.user.name }
    });
    localStorage.setItem(DASH_STORAGE.products, JSON.stringify(products));
    addProductForm.reset();
    addProductCard.hidden = true;
    renderSellerProducts();
    renderSellerOverview();
    renderProducts();
    showToast('Product published successfully!');
});

/* ===== Init ===== */
setAuthUI();
updateCartBadge();
initReveal();
loadProducts();
loadFilters();
loadFarmers();
loadStats();

if (state.user) {
    showDashboard();
}
