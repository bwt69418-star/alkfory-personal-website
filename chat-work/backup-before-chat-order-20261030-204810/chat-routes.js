const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

module.exports = function installChat(app, options) {
  const { dataDir, requireDeveloper, getStore, saveStore } = options;

  const uploadDir = path.join(dataDir, 'chat-uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 12);
      cb(null, crypto.randomUUID() + ext);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = [
        'image/jpeg', 'image/png', 'image/webp',
        'image/gif', 'video/mp4', 'video/webm',
        'application/pdf'
      ];
      cb(null, allowed.includes(file.mimetype));
    }
  });

  const store = getStore();
  store.chats ||= [];

  function findChat(id) {
    return store.chats.find(c => c.id === id);
  }

  function guestAuth(req, res, next) {
    const chat = findChat(req.params.id);
    const token = String(req.headers['x-chat-token'] || req.query.token || '');
    if (!chat || !token || !chat.tokenHash) {
      return res.status(401).json({ error: 'المحادثة غير متاحة' });
    }

    const hash = crypto.createHash('sha256').update(token).digest();
    const saved = Buffer.from(chat.tokenHash, 'hex');

    if (saved.length !== hash.length || !crypto.timingSafeEqual(saved, hash)) {
      return res.status(401).json({ error: 'بيانات المحادثة غير صحيحة' });
    }
    req.chat = chat;
    next();
  }

  function cleanMessage(m) {
    return {
      id: m.id,
      sender: m.sender,
      text: m.text || '',
      file: m.file || null,
      date: m.date
    };
  }

  app.post('/api/chat/start', (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const phone = String(req.body?.phone || '').trim().slice(0, 25);

    if (!name) return res.status(400).json({ error: 'اكتب اسمك أولاً' });

    const token = crypto.randomBytes(32).toString('hex');
    const chat = {
      id: crypto.randomUUID(),
      name,
      phone,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      createdAt: new Date().toISOString(),
      messages: []
    };

    store.chats.push(chat);
    saveStore();

    res.json({ success: true, id: chat.id, token });
  });

  app.get('/api/chat/:id', guestAuth, (req, res) => {
    res.json({
      chat: {
        id: req.chat.id,
        name: req.chat.name,
        messages: req.chat.messages.map(cleanMessage)
      }
    });
  });

  app.post('/api/chat/:id/messages', guestAuth, upload.single('file'), (req, res) => {
    const text = String(req.body?.text || '').trim().slice(0, 3000);
    if (!text && !req.file) {
      return res.status(400).json({ error: 'اكتب رسالة أو اختر ملفًا' });
    }

    const message = {
      id: crypto.randomUUID(),
      sender: 'visitor',
      text,
      date: new Date().toISOString(),
      file: req.file ? {
        name: req.file.originalname.slice(0, 120),
        type: req.file.mimetype,
        path: req.file.filename,
        size: req.file.size
      } : null
    };

    req.chat.messages.push(message);
    saveStore();
    res.json({ success: true, message: cleanMessage(message) });
  });

  app.get('/api/admin/chats', requireDeveloper, (req, res) => {
    res.json({
      chats: store.chats.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        createdAt: c.createdAt,
        lastMessage: c.messages[c.messages.length - 1] || null
      })).reverse()
    });
  });

  app.get('/api/admin/chats/:id', requireDeveloper, (req, res) => {
    const chat = findChat(req.params.id);
    if (!chat) return res.status(404).json({ error: 'المحادثة غير موجودة' });
    res.json({
      chat: {
        id: chat.id,
        name: chat.name,
        phone: chat.phone,
        messages: chat.messages.map(cleanMessage)
      }
    });
  });

  app.post('/api/admin/chats/:id/messages', requireDeveloper, upload.single('file'), (req, res) => {
    const chat = findChat(req.params.id);
    if (!chat) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    const text = String(req.body?.text || '').trim().slice(0, 3000);
    if (!text && !req.file) {
      return res.status(400).json({ error: 'اكتب رسالة أو اختر ملفًا' });
    }

    const message = {
      id: crypto.randomUUID(),
      sender: 'developer',
      text,
      date: new Date().toISOString(),
      file: req.file ? {
        name: req.file.originalname.slice(0, 120),
        type: req.file.mimetype,
        path: req.file.filename,
        size: req.file.size
      } : null
    };

    chat.messages.push(message);
    saveStore();
    res.json({ success: true, message: cleanMessage(message) });
  });

  app.get('/api/chat-media/:id/:messageId', (req, res, next) => {
    const chat = findChat(req.params.id);
    if (!chat) return res.sendStatus(404);

    const isDeveloper = req.session?.isDeveloper === true;
    const token = String(req.headers['x-chat-token'] || req.query.token || '');
    let authorized = isDeveloper;

    if (!authorized && token && chat.tokenHash) {
      const a = crypto.createHash('sha256').update(token).digest();
      const b = Buffer.from(chat.tokenHash, 'hex');
      authorized = a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    if (!authorized) return res.sendStatus(401);

    const msg = chat.messages.find(m => m.id === req.params.messageId);
    if (!msg?.file?.path) return res.sendStatus(404);

    const filePath = path.join(uploadDir, path.basename(msg.file.path));
    if (!fs.existsSync(filePath)) return res.sendStatus(404);

    res.type(msg.file.type);
    res.sendFile(filePath);
  });

  app.delete('/api/admin/chats/:id/messages/:messageId', requireDeveloper, (req, res) => {
    const chat = findChat(req.params.id);
    if (!chat) return res.sendStatus(404);

    const index = chat.messages.findIndex(m => m.id === req.params.messageId);
    if (index < 0) return res.sendStatus(404);

    const [msg] = chat.messages.splice(index, 1);
    if (msg.file?.path) {
      fs.rmSync(path.join(uploadDir, path.basename(msg.file.path)), { force: true });
    }
    saveStore();
    res.json({ success: true });
  });

  app.delete('/api/admin/chats/:id', requireDeveloper, (req, res) => {
    const index = store.chats.findIndex(c => c.id === req.params.id);
    if (index < 0) return res.sendStatus(404);

    const [chat] = store.chats.splice(index, 1);
    for (const msg of chat.messages) {
      if (msg.file?.path) {
        fs.rmSync(path.join(uploadDir, path.basename(msg.file.path)), { force: true });
      }
    }
    saveStore();
    res.json({ success: true });
  });

  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'حجم الملف الأقصى 3 ميجابايت أو الملف غير صالح' });
    }
    next(err);
  });
};
