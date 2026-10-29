require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '30kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/ai', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const message = String(req.body.message || '').trim();

    if (!apiKey) {
      return res.status(503).json({
        error: 'لم يتم إعداد مفتاح الذكاء الاصطناعي.'
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
  console.log('');
  console.log('⚜️ ALKFORY PERSONAL WEBSITE ⚜️');
  console.log('✅ Server started on port ' + PORT);
  console.log('🌐 http://localhost:' + PORT);
  console.log('');
});
