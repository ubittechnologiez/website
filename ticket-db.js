/* ============================================================
   UBIT TECHNOLOGIEZ — Ticketing System Data Layer (CLOUD SYNC)
   Powered by Firebase Firestore — Data syncs across all devices.
   ============================================================ */

const DB = {

  // ── COLLECTIONS ───────────────────────────────────────────
  // We use db.collection('name') directly in methods.
  
  // ── PLANS (Static) ────────────────────────────────────────
  PLANS: {
    basic: {
      id: 'basic', name: 'Basic', price: 999, currency: '₹', period: '/mo',
      desc: 'For small businesses with occasional IT needs.',
      maxTickets: 5, sla: '72 hours',
      features: ['5 tickets / month', '72-hour response SLA', 'Email support', 'Hardware enquiry', 'Basic priority handling', 'No phone support', 'No dedicated engineer'],
      noFeatures: [5, 6]
    },
    pro: {
      id: 'pro', name: 'Pro', price: 2999, currency: '₹', period: '/mo',
      desc: 'For growing businesses needing reliable IT support.',
      maxTickets: 20, sla: '24 hours',
      features: ['20 tickets / month', '24-hour response SLA', 'Email + Phone support', 'Hardware & software issues', 'High priority handling', 'Monthly health report', 'No dedicated engineer'],
      noFeatures: [6], popular: true
    },
    enterprise: {
      id: 'enterprise', name: 'Enterprise', price: 7999, currency: '₹', period: '/mo',
      desc: 'For enterprises requiring dedicated IT partnership.',
      maxTickets: 999, sla: '4 hours',
      features: ['Unlimited tickets', '4-hour response SLA', 'Email + Phone + WhatsApp', 'Full IT infrastructure support', 'Critical priority handling', 'Weekly reports & reviews', 'Dedicated support engineer'],
      noFeatures: []
    }
  },

  // ── LOCAL MIRROR (for synchronous reads) ──────────────────
  _data: {
    users: [],
    tickets: [],
    prices: {},
    staffChat: []
  },

  // ── INIT & REAL-TIME SYNC ─────────────────────────────────
  async init(onReady) {
    // 1. Sync Users
    db.collection('users').onSnapshot(snap => {
      this._data.users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // ── SEEDING: Create default admin if DB is empty ──
      if (this._data.users.length === 0) {
        console.log('DB: Seeding default admin...');
        const defaultAdmin = {
          role: 'admin',
          name: 'UBIT Admin',
          email: 'admin@ubit.com',
          password: 'admin123',
          createdAt: new Date().toISOString()
        };
        db.collection('users').doc('admin_default').set(defaultAdmin);
      }
      
      if (onReady) onReady('users');
    });

    // 2. Sync Tickets
    db.collection('tickets').onSnapshot(snap => {
      this._data.tickets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (onReady) onReady('tickets');
    });

    // 3. Sync Prices
    db.collection('settings').doc('prices').onSnapshot(doc => {
      if (doc.exists) this._data.prices = doc.data();
      if (onReady) onReady('prices');
    });

    // 4. Sync Staff Chat
    db.collection('staffChat').orderBy('time', 'desc').limit(100).onSnapshot(snap => {
      this._data.staffChat = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).reverse();
      if (onReady) onReady('chat');
    });

    // 5. Sync Gallery
    db.collection('gallery').orderBy('order', 'asc').onSnapshot(snap => {
      this._data.gallery = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // SEEDING: If gallery is empty, add the 8 generated images
      if (this._data.gallery.length === 0) {
        console.log('DB: Seeding default gallery...');
        for(let i=1; i<=8; i++) {
          db.collection('gallery').add({
            url: `images/gallery_${i}.png`,
            title: `Enterprise Solution ${i}`,
            order: i,
            createdAt: new Date().toISOString()
          });
        }
      }
      if (onReady) onReady('gallery');
    });

    // 6. Sync Gallery Settings
    db.collection('settings').doc('gallery').onSnapshot(doc => {
      if (doc.exists) this._data.gallerySettings = doc.data();
      else {
        this._data.gallerySettings = {
          title: 'gallery.',
          subtitle: "We design People Inspired Experiences that create positive change in people's lives."
        };
      }
      if (onReady) onReady('gallerySettings');
    });
  },

  // ── GALLERY MANAGEMENT ─────────────────────────────────────
  getGallery() { return this._data.gallery || []; },
  getGallerySettings() { return this._data.gallerySettings || {}; },

  async saveGallerySettings(data) {
    await db.collection('settings').doc('gallery').set(data);
  },

  async addGalleryImage(data) {
    const nextOrder = (this._data.gallery?.length || 0) + 1;
    await db.collection('gallery').add({
      url: data.url,
      title: data.title || 'Untitled',
      order: nextOrder,
      createdAt: new Date().toISOString()
    });
  },

  async deleteGalleryImage(id) {
    await db.collection('gallery').doc(id).delete();
  },

  async updateGalleryOrder(images) {
    // images is an array of {id, order}
    const batch = db.batch();
    images.forEach(img => {
      const ref = db.collection('gallery').doc(img.id);
      batch.update(ref, { order: img.order });
    });
    await batch.commit();
  },

  // ── AUTH ──────────────────────────────────────────────────
  getSession() {
    try { return JSON.parse(sessionStorage.getItem('ubit_session')); } catch { return null; }
  },

  setSession(user) {
    sessionStorage.setItem('ubit_session', JSON.stringify(user));
  },

  clearSession() {
    sessionStorage.removeItem('ubit_session');
  },

  async login(email, password) {
    const user = this._data.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) return null;
    const safe = { ...user }; delete safe.password;
    this.setSession(safe);
    return safe;
  },

  // ── USERS ─────────────────────────────────────────────────
  getUsers() { return this._data.users; },
  
  getUserById(id) { return this._data.users.find(u => u.id === id); },

  async registerClient(data) {
    if (this._data.users.find(u => u.email.toLowerCase() === data.email.toLowerCase())) {
      return { error: 'Email already registered.' };
    }
    const id = 'client_' + Date.now();
    const newUser = {
      role: 'client',
      name: data.name,
      email: data.email,
      password: data.password,
      plan: null,
      company: data.company || '',
      phone: data.phone || '',
      createdAt: new Date().toISOString(),
      ticketsUsed: 0
    };
    await db.collection('users').doc(id).set(newUser);
    const safe = { id, ...newUser }; delete safe.password;
    this.setSession(safe);
    return safe;
  },

  async updateUserPlan(userId, plan) {
    await db.collection('users').doc(userId).update({ plan, ticketsUsed: 0 });
    const user = this.getUserById(userId);
    if (user) {
      user.plan = plan;
      user.ticketsUsed = 0;
    }
  },

  async incrementTicketsUsed(userId) {
    const user = this.getUserById(userId);
    if (!user) return;
    const newVal = (user.ticketsUsed || 0) + 1;
    await db.collection('users').doc(userId).update({ ticketsUsed: newVal });
    user.ticketsUsed = newVal;
  },

  async updateUser(userId, data) {
    await db.collection('users').doc(userId).update(data);
    const session = this.getSession();
    if (session && session.id === userId) {
      const updated = { ...session, ...data };
      delete updated.password;
      this.setSession(updated);
    }
    return true;
  },

  async deleteUser(userId) {
    await db.collection('users').doc(userId).delete();
    return true;
  },

  // ── TICKETS ───────────────────────────────────────────────
  getTickets() { return this._data.tickets; },

  getTicketsByClient(clientId) {
    return this._data.tickets.filter(t => t.clientId === clientId);
  },

  getTicketById(id) {
    return this._data.tickets.find(t => t.id === id);
  },

  async createTicket(clientId, data) {
    const user = this.getUserById(clientId);
    if (!user) return { error: 'User not found.' };
    if (!user.plan) return { error: 'No active subscription.' };

    const plan = this.getPlan(user.plan);
    if (user.ticketsUsed >= plan.maxTickets) {
      return { error: `You have reached your ${plan.name} plan limit.` };
    }

    const id = 'TKT-' + String(this._data.tickets.length + 1001);
    const now = new Date().toISOString();

    const ticket = {
      clientId,
      clientName: user.name,
      clientEmail: user.email,
      company: user.company,
      subject: data.subject,
      category: data.category,
      priority: data.priority || 'medium',
      status: 'open',
      plan: user.plan,
      assignedTo: null,
      createdAt: now,
      updatedAt: now,
      messages: [{ from: 'client', name: user.name, text: data.description, time: now }]
    };

    await db.collection('tickets').doc(id).set(ticket);
    await this.incrementTicketsUsed(clientId);
    return { id, ...ticket };
  },

  async addMessage(ticketId, fromRole, fromName, text, imageDataUrl, replyTo = null) {
    const t = this.getTicketById(ticketId);
    if (!t) return false;
    if (fromRole === 'client' && t.status === 'closed') return { error: 'Ticket closed.' };

    const now = new Date().toISOString();
    const msg = { from: fromRole, name: fromName, text, time: now };
    if (imageDataUrl) msg.image = imageDataUrl;
    if (replyTo) msg.replyTo = replyTo;

    const messages = [...t.messages, msg];
    const updates = { messages, updatedAt: now };
    if (fromRole !== 'client' && t.status === 'open') updates.status = 'in-progress';

    await db.collection('tickets').doc(ticketId).update(updates);
    return { ...t, ...updates };
  },

  async deleteMessage(ticketId, msgTime) {
    const t = this.getTicketById(ticketId);
    if (!t) return false;
    const messages = t.messages.filter(m => m.time !== msgTime);
    await db.collection('tickets').doc(ticketId).update({ messages });
    return true;
  },

  async markAsRead(ticketId, role) {
    const field = role === 'admin' ? 'adminReadAt' : (role === 'agent' ? 'agentReadAt' : 'clientReadAt');
    const now = new Date().toISOString();
    await db.collection('tickets').doc(ticketId).update({ [field]: now });
    const t = this.getTicketById(ticketId);
    if (t) t[field] = now;
  },

  async updateTicketStatus(ticketId, status) {
    await db.collection('tickets').doc(ticketId).update({ status, updatedAt: new Date().toISOString() });
    return true;
  },

  async assignTicket(ticketId, agentId) {
    await db.collection('tickets').doc(ticketId).update({ assignedTo: agentId, updatedAt: new Date().toISOString() });
    return true;
  },

  async clearDatabase() {
    try {
      // 1. Delete all tickets
      const tickets = await db.collection('tickets').get();
      for (const doc of tickets.docs) { await doc.ref.delete(); }

      // 2. Delete all staff chat
      const chat = await db.collection('staffChat').get();
      for (const doc of chat.docs) { await doc.ref.delete(); }

      // 3. Delete all users
      const users = await db.collection('users').get();
      for (const doc of users.docs) { await doc.ref.delete(); }

      // 4. Re-seed default admin
      const defaultAdmin = {
        role: 'admin',
        name: 'UBIT Admin',
        email: 'admin@ubit.com',
        password: 'admin123',
        createdAt: new Date().toISOString()
      };
      await db.collection('users').doc('admin_default').set(defaultAdmin);
      
      return true;
    } catch (err) {
      console.error('Clear DB Error:', err);
      return false;
    }
  },

  // ── HELPERS ───────────────────────────────────────────────
  getPlan(id) { return this.PLANS[id] || null; },
  getPlans() { return this.PLANS; },
  
  formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  compressImage(dataUrl, quality = 0.5) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    });
  },

  timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff/60000), h = Math.floor(m/60), d = Math.floor(h/24);
    if (d > 0) return d + 'd ago';
    if (h > 0) return h + 'h ago';
    if (m > 0) return m + 'm ago';
    return 'just now';
  },

  getStatusLabel(s) {
    return { open:'Open', 'in-progress':'In Progress', resolved:'Resolved', closed:'Closed' }[s] || s;
  },

  // ── STAFF CHAT ──────────────────────────────────────────
  getStaffMessages() { return this._data.staffChat; },

  async addStaffMessage(fromId, fromName, fromRole, text, toId = null) {
    const msg = {
      fromId, fromName, fromRole, text,
      toId, time: new Date().toISOString()
    };
    await db.collection('staffChat').add(msg);
    return msg;
  }
};

// Start initialization
DB.init(() => {
  // Global event to notify pages that data is synced
  window.dispatchEvent(new CustomEvent('db-synced'));
});
