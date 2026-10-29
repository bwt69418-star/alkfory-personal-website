require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
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

app.post('/api/ai', async (req, res) => {
  try {
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
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'أنت ALKFORY AI، مساعد ودود لموقع Ziad Alkfory. أجب بالعربية المصرية أو الإنجليزية حسب لغة المستخدم، وكن واضحًا ومفيدًا.'
            }]
          },
          contents: [{
            role: 'user',
            parts: [{ text: message }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 700
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
  console.log('⚜️ ALKFORY PERSONAL WEBSITE ⚜️');
  console.log('✅ Server started on port ' + PORT);
  console.log('🌐 http://localhost:' + PORT);
});
