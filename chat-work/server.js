
require('./alkfory-screen');

require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const dataDir = process.env.DATA_DIR || require('path').join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dataFile = require('path').join(dataDir, 'alkfory-data.json');
let store = { settings: {}, apps: [], messages: [] };
if (fs.existsSync(dataFile)) {
  try { store = { ...store, ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) }; }
  catch (err) { console.error('تعذر قراءة ملف البيانات:', err.message); }
}
function saveStore() {
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET || !process.env.DEVELOPER_CODE) {
  console.error('❌ إعدادات الجلسة أو المطور ناقصة في .env');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '30kb' }));

app.use(session({
  name: 'alkfory.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 2 * 60 * 60 * 1000
  }
}));

// ALKFORY REAL VISITOR ANALYTICS
function alkforyToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

app.use((req, res, next) => {
  const ignored =
    req.path === '/api/health' ||
    req.path === '/admin' ||
    req.path.startsWith('/api/admin/') ||
    req.path.startsWith('/api/developer-');

  if (ignored || req.session?.isDeveloper === true) return next();

  const cookies = String(req.headers.cookie || '').split(';');
  const savedCookie = cookies.find(v => v.trim().startsWith('alkfory.vid='));
  let visitorId = savedCookie ? savedCookie.trim().slice('alkfory.vid='.length) : '';

  if (!/^[a-f0-9-]{36}$/i.test(visitorId)) {
    visitorId = crypto.randomUUID();
    res.cookie('alkfory.vid', visitorId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60 * 1000
    });
  }

  const pageView = req.method === 'GET' &&
    (req.path === '/' || req.path.endsWith('.html') ||
     ['/ai', '/platforms'].includes(req.path));

  const activity = pageView || req.path.startsWith('/api/');

  if (!pageView && !activity) return next();

  store.analytics ||= { visitors: {}, days: {}, firstSeenAt: new Date().toISOString() };
  store.analytics.visitors ||= {};
  store.analytics.days ||= {};

  let changed = false;
  if (!store.analytics.visitors[visitorId]) {
    store.analytics.visitors[visitorId] = new Date().toISOString();
    changed = true;
  }

  const day = alkforyToday();
  store.analytics.days[day] ||= { visitors: [], active: [] };
  const record = store.analytics.days[day];

  if (pageView && !record.visitors.includes(visitorId)) {
    record.visitors.push(visitorId);
    changed = true;
  }

  if (activity && !record.active.includes(visitorId)) {
    record.active.push(visitorId);
    changed = true;
  }

  if (changed) saveStore();
  next();
});

// اختيار طريقة الدخول من جديد عند فتح الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'alkfory-ai.html'));
});

// السماح للزائر بالدخول مرة واحدة بعد اختياره

// ALKFORY REAL VISITOR ANALYTICS V2
app.use((req, res, next) => {
  try {
    if (req.session?.isDeveloper === true) return next();

    const path = req.path || "/";
    if (
      path === "/api/health" ||
      path.startsWith("/api/admin/") ||
      path.startsWith("/api/developer-")
    ) return next();

    const cookies = {};
    String(req.headers.cookie || "").split(";").forEach(part => {
      const i = part.indexOf("=");
      if (i > 0) cookies[part.slice(0, i).trim()] =
        decodeURIComponent(part.slice(i + 1).trim());
    });

    const crypto = require("crypto");
    let visitorId = cookies["alkfory.vid2"];

    if (!visitorId || !/^[a-f0-9-]{20,60}$/i.test(visitorId)) {
      visitorId = crypto.randomUUID();
      res.cookie("alkfory.vid2", visitorId, {
        httpOnly: true,
        sameSite: "lax",
        secure: req.secure || req.headers["x-forwarded-proto"] === "https",
        maxAge: 365 * 24 * 60 * 60 * 1000
      });
    }

    const now = new Date();
    const nowISO = now.toISOString();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(now);

    const isPageView =
      req.method === "GET" &&
      !path.startsWith("/api/") &&
      !/\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?|map|txt|json)$/i.test(path);

    const analytics = store.analyticsV2 ||= {
      visitors: {},
      days: {},
      pages: {},
      lastVisitAt: null
    };

    const visitor = analytics.visitors[visitorId] ||= {
      firstSeenAt: nowISO,
      lastSeenAt: null
    };

    visitor.lastSeenAt = nowISO;

    if (isPageView) {
      const day = analytics.days[today] ||= {
        visitors: [],
        pageViews: 0
      };

      if (!day.visitors.includes(visitorId)) {
        day.visitors.push(visitorId);
      }

      day.pageViews = (day.pageViews || 0) + 1;
      analytics.pages[path] = (analytics.pages[path] || 0) + 1;
      analytics.lastVisitAt = nowISO;
    }

    const lastSave = Number(analytics.lastSavedAt || 0);
    if (isPageView || Date.now() - lastSave > 30000) {
      analytics.lastSavedAt = Date.now();
      saveStore();
    }
  } catch (error) {
    console.error("ALKFORY analytics error:", error.message);
  }

  next();
});
// END ALKFORY REAL VISITOR ANALYTICS V2

app.post('/api/visitor-login', (req, res) => {
  req.session.allowHomeOnce = true;
  req.session.save(err => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true });
  });
});

// منع فتح home.html مباشرة دون المرور بشاشة الاختيار
app.use((req, res, next) => {
  if (req.path === '/home.html') {
    if (req.session.allowHomeOnce === true) {
      req.session.allowHomeOnce = false;
      return req.session.save(err => {
        if (err) return res.status(500).send('Session error');
        next();
      });
    }
    return res.redirect('/');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  index: false
}));

app.post('/api/developer-login', (req, res) => {
  const code = String(req.body?.code || '');
  const expected = String(process.env.DEVELOPER_CODE);

  const a = Buffer.from(code);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false });
  }

  req.session.isDeveloper = true;

  req.session.save(err => {
    if (err) {
      return res.status(500).json({ success: false });
    }

    res.json({ success: true });
  });
});

app.get('/api/developer-status', (req, res) => {
  res.json({ authenticated: req.session.isDeveloper === true });
});

app.get('/admin', (req, res) => {
  if (req.session.isDeveloper !== true) {
    return res.redirect('/');
  }

  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.post('/api/developer-logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('alkfory.sid');
    res.json({ success: true });
  });
});


function requireDeveloper(req, res, next) {
  if (req.session.isDeveloper !== true) return res.status(401).json({ error: 'غير مصرح' });
  next();
}
app.get('/api/site-config', (req, res) => {
  const s = store.settings || {};
  res.json({
    siteName: s.siteName || 'ALKFORY',
    welcomeText: s.welcomeText || 'مرحبًا بك في موقعي',
    theme: s.theme || 'dark',
    language: s.language || 'ar',
    showVisitorCard: s.showVisitorCard !== false,
    aiEnabled: s.aiEnabled !== false,
    accentColor: s.accentColor || '#ed354d',
    backgroundColor: s.backgroundColor || '#090909',
    textColor: s.textColor || '#ffffff',
    buttonColor: s.buttonColor || '#a71930',
    fontFamily: s.fontFamily || 'Arial',
    fontSize: Number(s.fontSize) || 16,
    borderRadius: Number(s.borderRadius) || 12,
    showApps: s.showApps !== false,
    showAI: s.showAI !== false,
    showWelcome: s.showWelcome !== false,
    maintenanceMode: s.maintenanceMode === true,
    maintenanceMessage: s.maintenanceMessage || 'الموقع تحت الصيانة',
    announcementText: s.announcementText || '',
    footerText: s.footerText || ''
  });
});

app.get('/api/public/apps', (req, res) => {
  res.json({
    apps: (store.apps || [])
      .filter(item => item.active === true && item.visible !== false)
      .sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(({ name, url, description, category, icon, sortOrder }) =>
        ({ name, url, description, category, icon, sortOrder }))
  });
});

app.post('/api/visitor-message', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60);
  const message = String(req.body?.message || '').trim().slice(0, 1000);
  if (!message) return res.status(400).json({ error: 'اكتب الرسالة أولًا.' });

  store.messages ||= [];
  store.messages.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: name || 'زائر',
    message,
    date: new Date().toISOString()
  });
  if (store.messages.length > 300) store.messages = store.messages.slice(-300);
  saveStore();
  res.json({ success: true });
});

app.get('/api/admin/messages', requireDeveloper, (req, res) => {
  res.json({ messages: store.messages || [] });
});

app.delete('/api/admin/messages/:id', requireDeveloper, (req, res) => {
  const before = (store.messages || []).length;
  store.messages = (store.messages || []).filter(
    item => item.id !== Number(req.params.id)
  );
  if (store.messages.length === before) {
    return res.status(404).json({ error: 'الرسالة غير موجودة.' });
  }
  saveStore();
  res.json({ success: true });
});

app.get('/api/admin/settings', requireDeveloper, (req, res) => res.json({ settings: store.settings }));
app.put('/api/admin/settings', requireDeveloper, (req, res) => {
  const allowed = ["siteName","welcomeText","theme","language","showVisitorCard","accentColor","backgroundColor","textColor","buttonColor","fontFamily","fontSize","borderRadius","showSocialLinks","showApps","showAI","showWelcome","maintenanceMode","maintenanceMessage","contactEmail","footerText","announcementText","aiEnabled","aiPersona","aiReplyLength","aiLanguage","aiTone","aiEmoji","aiGreeting","aiSignature","aiTemperature","aiMaxTokens","aiAnswerFormat","aiUseSiteContext","aiAllowCode","aiExplainSteps","aiCustomInstructions","aiFallbackMessage","aiWelcomeMessage","aiCreativity","aiFormality","aiUseExamples","aiResponseStyle"];
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) store.settings[key] = req.body[key];
  saveStore(); res.json({ success: true });
});
app.get('/api/admin/apps', requireDeveloper, (req, res) => res.json({ apps: store.apps }));
app.post('/api/admin/apps', requireDeveloper, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const url = String(req.body?.url || '').trim().slice(0, 500);
  if (!name || !/^https:\/\//i.test(url)) return res.status(400).json({ error: 'أدخل اسمًا ورابط HTTPS صحيحًا' });
  const body = req.body || {};
  const app = {
    id: Date.now(),
    name,
    url,
    description: String(body.description || '').slice(0, 300),
    category: String(body.category || '').slice(0, 60),
    icon: String(body.icon || '').slice(0, 500),
    sortOrder: Math.max(0, Math.min(9999, Number(body.sortOrder) || 0)),
    visible: true,
    active: true
  };
  store.apps.push(app);
  saveStore();
  res.json({ success: true, app });
});
app.patch('/api/admin/apps/:id', requireDeveloper, (req, res) => {
  const item = store.apps.find(x => x.id === Number(req.params.id));
  if (!item) return res.status(404).json({ success: false });

  const body = req.body || {};
  if (Object.prototype.hasOwnProperty.call(body, 'active')) item.active = !!body.active;
  if (Object.prototype.hasOwnProperty.call(body, 'description')) item.description = String(body.description).slice(0, 300);
  if (Object.prototype.hasOwnProperty.call(body, 'category')) item.category = String(body.category).slice(0, 60);
  if (Object.prototype.hasOwnProperty.call(body, 'icon')) item.icon = String(body.icon).slice(0, 300);
  if (Object.prototype.hasOwnProperty.call(body, 'sortOrder')) item.sortOrder = Math.max(0, Math.min(9999, Number(body.sortOrder) || 0));
  if (Object.prototype.hasOwnProperty.call(body, 'visible')) item.visible = !!body.visible;

  saveStore();
  res.json({ success: true, app: item });
});
app.delete('/api/admin/apps/:id', requireDeveloper, (req, res) => {
  store.apps = store.apps.filter(x => x.id !== Number(req.params.id));
  saveStore(); res.json({ success: true });
});

app.post('/api/ai', async (req, res) => {
  console.log('⚜️ ALKFORY AI NEW ROUTE HIT ⚜️');
  try {
    const settings = store.settings || {};

    if (settings.aiEnabled === false) {
      return res.status(403).json({ error: 'الذكاء الاصطناعي متوقف حاليًا.' });
    }

    const message = String(req.body?.message || '').trim();
    if (!message || message.length > 12000) {
      return res.status(400).json({ error: 'الرسالة فارغة أو طويلة جدًا.' });
    }

    const persona = settings.aiPersona || 'friendly';
    const length = settings.aiReplyLength || 'medium';

    const personas = {
      friendly: 'كن ودودًا وطبيعيًا.',
      professional: 'كن احترافيًا ومنظمًا.',
      concise: 'كن مختصرًا ومباشرًا.',
      creative: 'كن مبدعًا مع الحفاظ على الدقة.',
      teacher: 'اشرح تدريجيًا وبأسلوب تعليمي واضح.'
    };

    const lengths = {
      short: 'اجعل الرد مختصرًا.',
      medium: 'اجعل الرد متوسط الطول.',
      long: 'قدّم شرحًا مفصلًا عند الحاجة.'
    };

    const tones = {
      calm: 'استخدم نبرة هادئة.',
      enthusiastic: 'استخدم نبرة مشجعة.',
      formal: 'استخدم نبرة رسمية.',
      simple: 'استخدم لغة سهلة ومباشرة.'
    };

    const language = settings.aiLanguage || 'auto';
    const languageRule = language === 'auto'
      ? 'أجب بلغة المستخدم.'
      : 'أجب باللغة المحددة: ' + language + '.';

    const systemInstruction = [
      'أنت ALKFORY AI، مساعد محادثة ذكي داخل موقع شخصي.',
      'افهم رسالة المستخدم وسياقها وأجب مباشرة وبشكل مفيد.',
      'تحدث بصورة طبيعية، ويمكنك استخدام اللهجة المصرية عندما تناسب المستخدم.',
      'لا تستخدم الكرف أو الشتائم أو المناكفة الإجبارية.',
      'لا تخترع معلومات ولا تدّعِ تنفيذ أفعال لم تنفذها.',
      'لا تذكر اسم المطور أو توقيعًا داخل الرد.',
      'لا تدّعِ أنك إنسان، ولا تذكر أنك ذكاء اصطناعي إلا عند السؤال عن هويتك.',
      languageRule,
      personas[persona] || personas.friendly,
      lengths[length] || lengths.medium,
      tones[settings.aiTone] || tones.simple,
      settings.aiEmoji === false ? 'لا تستخدم الرموز التعبيرية.' : 'استخدم الرموز باعتدال.',
      String(settings.aiCustomInstructions || '')
    ].filter(Boolean).join(' ');

    const prompt = systemInstruction + '\n\nرسالة المستخدم:\n' + message;
    const endpoint = 'https://engez.a7a.online/api/v1/ai/gemini';
    const url = endpoint + '?' + new URLSearchParams({ q: prompt }).toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    let response;
    let data;
    try {
      response = await fetch(url, {
        method: 
// ALKFORY ADMIN ANALYTICS V2
app.get("/api/admin/analytics-v2", requireDeveloper, (req, res) => {
  try {
    const a = store.analyticsV2 || {
      visitors: {}, days: {}, pages: {}, lastVisitAt: null
    };

    const dateKey = (date) => new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(date);

    const now = new Date();
    const todayKey = dateKey(now);
    const yesterdayKey = dateKey(new Date(Date.now() - 86400000));

    const today = a.days?.[todayKey] || { visitors: [], pageViews: 0 };
    const yesterday = a.days?.[yesterdayKey] || { visitors: [], pageViews: 0 };

    const activeCutoff = Date.now() - 5 * 60 * 1000;
    const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const visitors = Object.entries(a.visitors || {});
    const activeNow = visitors.filter(([, v]) =>
      v.lastSeenAt && new Date(v.lastSeenAt).getTime() >= activeCutoff
    ).length;

    const visitorsLast7Days = visitors.filter(([, v]) =>
      v.lastSeenAt && new Date(v.lastSeenAt).getTime() >= weekCutoff
    ).length;

    let pageViewsLast7Days = 0;
    for (let i = 0; i < 7; i++) {
      const key = dateKey(new Date(Date.now() - i * 86400000));
      pageViewsLast7Days += Number(a.days?.[key]?.pageViews || 0);
    }

    const topPages = Object.entries(a.pages || {})
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .map(([page, views]) => ({ page, views }));

    res.json({
      success: true,
      timezone: "Africa/Cairo",
      trackingSince: visitors.length
        ? visitors.map(([, v]) => v.firstSeenAt).sort()[0]
        : null,
      totalUsers: visitors.length,
      visitorsToday: today.visitors.length,
      visitorsYesterday: yesterday.visitors.length,
      activeNow,
      visitorsLast7Days,
      pageViewsToday: today.pageViews || 0,
      pageViewsYesterday: yesterday.pageViews || 0,
      pageViewsLast7Days,
      topPages,
      lastVisitAt: a.lastVisitAt || null
    });
  } catch (error) {
    console.error("ALKFORY analytics API:", error);
    res.status(500).json({ success: false });
  }
});
// END ALKFORY ADMIN ANALYTICS V2    if (!response.ok || !data?.success) {
      const detail = data?.error || data?.message || ('HTTP ' + response.status);
      console.error('ALKFORY AI provider error:', detail);
      return res.status(502).json({ error: 'خدمة الذكاء الاصطناعي لم تتمكن من الرد حاليًا.' });
    }

    const answer = String(
      data?.response?.reply ||
      data?.response ||
      ''
    ).trim();

    if (!answer) {
      return res.status(502).json({ error: 'وصل رد فارغ من خدمة الذكاء الاصطناعي.' });
    }

    return res.json({
      success: true,
      answer,
      reply: answer,
      text: answer,
      message: answer,
      response: answer,
      provider: 'alkfory-ai-service',
      routeVersion: 'proxy-v2'
    });

  } catch (error) {
    console.error('ALKFORY AI request failed:', error.name, error.message);
    return res.status(502).json({
      error: error.name === 'AbortError'
        ? 'تأخر الرد. حاول مرة أخرى.'
        : 'خدمة الذكاء الاصطناعي غير متاحة حاليًا.'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'online' });
});

// إحصائيات الموقع - للمطور المسجل فقط
app.get('/api/admin/analytics', requireDeveloper, (req, res) => {
  const analytics = store.analytics || { visitors: {}, days: {} };
  const today = analytics.days?.[alkforyToday()] || { visitors: [], active: [] };

  res.json({
    success: true,
    trackingSince: analytics.firstSeenAt || null,
    totalUsers: Object.keys(analytics.visitors || {}).length,
    visitorsToday: (today.visitors || []).length,
    activeToday: (today.active || []).length,
    date: alkforyToday(),
    timezone: 'Africa/Cairo'
  });
});


require('./chat-routes')(app, {
  dataDir,
  requireDeveloper,
  getStore: () => store,
  saveStore
});


// شاشة ALKFORY AI الجديدة
app.get('/ai', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'alkfory-ai.html'));
});


// السماح بفتح منصة الكفوري بعد الضغط على زر المنصة
app.get('/platforms', (req, res) => {
  req.session.allowHomeOnce = true;
  req.session.save(err => {
    if (err) return res.status(500).send('تعذر فتح المنصة');
    res.redirect('/home.html');
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('⚜️ Ziad Alkfory ⚜️');
  console.log('✅ Server started on port ' + PORT);
  console.log('🌐 http://localhost:' + PORT);
});
