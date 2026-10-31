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

// اختيار طريقة الدخول من جديد عند فتح الصفحة الرئيسية
app.get('/', (req, res) => {
  req.session.allowHomeOnce = false;
  res.sendFile(path.join(__dirname, 'public', 'entry.html'));
});

// السماح للزائر بالدخول مرة واحدة بعد اختياره
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
    aiEnabled: s.aiEnabled !== false
  });
});

app.get('/api/public/apps', (req, res) => {
  res.json({
    apps: (store.apps || [])
      .filter(item => item.active === true)
      .map(({ name, url }) => ({ name, url }))
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
  const allowed = ['siteName','welcomeText','theme','language','showVisitorCard','aiEnabled','aiPersona','aiReplyLength'];
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) store.settings[key] = req.body[key];
  saveStore(); res.json({ success: true });
});
app.get('/api/admin/apps', requireDeveloper, (req, res) => res.json({ apps: store.apps }));
app.post('/api/admin/apps', requireDeveloper, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const url = String(req.body?.url || '').trim().slice(0, 500);
  if (!name || !/^https:\/\//i.test(url)) return res.status(400).json({ error: 'أدخل اسمًا ورابط HTTPS صحيحًا' });
  const app = { id: Date.now(), name, url, active: true };
  store.apps.push(app); saveStore(); res.json({ success: true, app });
});
app.patch('/api/admin/apps/:id', requireDeveloper, (req, res) => {
  const item = store.apps.find(x => x.id === Number(req.params.id));
  if (!item) return res.status(404).json({ success: false });
  item.active = !!req.body?.active; saveStore(); res.json({ success: true });
});
app.delete('/api/admin/apps/:id', requireDeveloper, (req, res) => {
  store.apps = store.apps.filter(x => x.id !== Number(req.params.id));
  saveStore(); res.json({ success: true });
});
app.post('/api/ai', async (req, res) => {
  try {
    if (store.settings.aiEnabled === false) {
      return res.status(403).json({ error: 'الذكاء الاصطناعي متوقف حاليًا.' });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    const message = String(req.body?.message || '').trim();

    if (!apiKey || apiKey === 'PUT_NEW_KEY_HERE') {
      return res.status(503).json({
        error: 'مفتاح ALKFORY AI يحتاج إلى الإعداد.'
      });
    }

    if (!message || message.length > 4000) {
      return res.status(400).json({
        error: 'الرسالة فارغة أو طويلة جدًا.'
      });
    }

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: (() => {
                const persona = store.settings.aiPersona || 'friendly';
                const length = store.settings.aiReplyLength || 'medium';
                const personas = {
                  friendly: 'كن ودودًا وبسيطًا.',
                  professional: 'كن احترافيًا ومنظمًا.',
                  concise: 'كن مختصرًا ومباشرًا.'
                };
                const lengths = {
                  short: 'اجعل الرد قصيرًا.',
                  medium: 'اجعل الرد متوسط الطول.',
                  long: 'قدّم شرحًا مفصلًا عند الحاجة.'
                };
                return 'أنت ALKFORY AI، مساعد لموقع Ziad Alkfory. أجب بلغة المستخدم، وكن واضحًا ومفيدًا. ' +
                  (personas[persona] || personas.friendly) + ' ' +
                  (lengths[length] || lengths.medium);
              })()
            }]
          },
          contents: [{
            role: 'user',
            parts: [{ text: message }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: store.settings.aiReplyLength === 'short' ? 250 : store.settings.aiReplyLength === 'long' ? 1200 : 700
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('AI API error:', response.status);
      return res.status(502).json({
        error: 'خدمة AI غير متاحة حاليًا. حاول مرة أخرى.'
      });
    }

    const answer = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim();

    if (!answer) {
      return res.status(502).json({
        error: 'لم يصل رد من الذكاء الاصطناعي.'
      });
    }

    res.json({ answer });
  } catch (error) {
    console.error('AI request failed:', error.message);
    res.status(500).json({
      error: 'حدث خطأ في الاتصال. حاول مرة أخرى.'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'online' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('⚜️ Ziad Alkfory ⚜️');
  console.log('✅ Server started on port ' + PORT);
  console.log('🌐 http://localhost:' + PORT);
});
