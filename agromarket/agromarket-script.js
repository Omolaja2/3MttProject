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

function renderProducts() {
    if (!state.products.length) {
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

    productGrid.innerHTML = state.products.map(productCard).join('');
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
        })
        .catch(err => {
            productGrid.innerHTML = `<div class="empty-state"><h3>Could not load products</h3><p>${esc(err.message)}</p></div>`;
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
    const product = state.products.find(p => p.id === Number(productId));
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
    api('/orders', {
        method: 'POST',
        body: JSON.stringify({
            items: state.cart.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
        })
    })
        .then(res => {
            state.cart = [];
            saveCart();
            updateCartBadge();
            renderCart();
            showToast(`Order #${res.id} placed — total ${money(res.total)}`);
        })
        .catch(err => {
            showToast(err.message);
        })
        .finally(() => {
            checkoutBtn.disabled = false;
        });
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
const loginSubmit = document.getElementById('loginSubmit');
const registerSubmit = document.getElementById('registerSubmit');

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
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setFormError(document.getElementById('loginError'), '');
    loginSubmit.disabled = true;

    api('/login', {
        method: 'POST',
        body: JSON.stringify({
            email: document.getElementById('loginEmail').value.trim(),
            password: document.getElementById('loginPassword').value
        })
    })
        .then(handleAuthSuccess)
        .catch(err => setFormError(document.getElementById('loginError'), err.message))
        .finally(() => { loginSubmit.disabled = false; });
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setFormError(document.getElementById('registerError'), '');
    registerSubmit.disabled = true;

    api('/register', {
        method: 'POST',
        body: JSON.stringify({
            name: document.getElementById('registerName').value.trim(),
            email: document.getElementById('registerEmail').value.trim(),
            password: document.getElementById('registerPassword').value,
            role: document.getElementById('registerRole').value,
            location: document.getElementById('registerLocation').value.trim() || null
        })
    })
        .then(handleAuthSuccess)
        .catch(err => setFormError(document.getElementById('registerError'), err.message))
        .finally(() => { registerSubmit.disabled = false; });
});

function logout() {
    api('/logout', { method: 'POST' }).catch(() => {});
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
    document.getElementById('accountBtn').hidden = !loggedIn;
    document.getElementById('logoutBtn').hidden = !loggedIn;

    document.getElementById('loginBtnMobile').hidden = loggedIn;
    document.getElementById('registerBtnMobile').hidden = loggedIn;
    document.getElementById('accountBtnMobile').hidden = !loggedIn;
    document.getElementById('logoutBtnMobile').hidden = !loggedIn;
}

document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('logoutBtnMobile').addEventListener('click', logout);

document.getElementById('accountBtn').addEventListener('click', () => {
    showToast(`Signed in as ${state.user.name} (${state.user.role})`);
});
document.getElementById('accountBtnMobile').addEventListener('click', () => {
    showToast(`Signed in as ${state.user.name} (${state.user.role})`);
});

/* ===== Product detail ===== */
const detailModal = document.getElementById('detailModal');

function openDetail(productId) {
    const p = state.products.find(prod => prod.id === Number(productId));
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

/* ===== Init ===== */
setAuthUI();
updateCartBadge();
initReveal();
loadProducts();
loadFilters();
loadFarmers();
loadStats();
