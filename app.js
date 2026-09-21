/* ==========================================================
   Crewboard: a small shared task tracker with chat.
   No build step or bundler. Firebase is the shared source of truth;
   localStorage is retained only as an offline/startup fallback.
   ========================================================== */
(() => {
  'use strict';

  /* ---------------------------------------------------------
     Constants
     --------------------------------------------------------- */
  const DATA_KEY = 'crewboard.data.v1';   // shared workspace data (localStorage)
  const UI_KEY = 'crewboard.ui.v1';       // per-tab state: who am I, which view (sessionStorage)
  const AUTH_KEY = 'crewboard.auth.v1';
  const NOTIFY_KEY = 'crewboard.notifications.v1';
  const WORKSPACE_ID = 'main';

  const STATUSES = [
    { id: 'todo', label: 'To do' },
    { id: 'doing', label: 'In progress' },
    { id: 'review', label: 'In review' },
    { id: 'done', label: 'Done' },
  ];
  const PRIORITIES = [
    { id: 'low', label: 'Low' },
    { id: 'normal', label: 'Normal' },
    { id: 'high', label: 'High' },
    { id: 'urgent', label: 'Urgent' },
  ];
  const PALETTE = ['#E5534B', '#17A085', '#7C5CD6', '#E9A23B', '#2B93DB', '#D94A93', '#6B8E23', '#B9683A'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const ICONS = {
    board: '<path d="M6 5v11"/><path d="M12 5v6"/><path d="M18 5v14"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6"/>',
  };
  const icon = (name, size = 18) =>
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /* ---------------------------------------------------------
     Small helpers
     --------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const near = (e, sel) => (e.target instanceof Element ? e.target.closest(sel) : null);
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayISO = () => toISO(new Date());
  const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const uid = p => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const firstName = n => n.trim().split(/\s+/)[0];
  const listNames = a => (a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  const slug = s => s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const mentionKeys = m => [...new Set([firstName(m.name), m.name, (m.email || '').split('@')[0]].filter(Boolean))];
  const mentionsMember = (text, member) => mentionKeys(member).some(key => new RegExp(`(^|\\s)@${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$|[.,!?])`, 'i').test(text));

  function inkOn(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.62 ? '#1B2233' : '#FFFFFF';
  }

  function fmtDay(iso) {
    const t = todayISO();
    if (iso === t) return 'Today';
    if (iso === addDays(t, 1)) return 'Tomorrow';
    if (iso === addDays(t, -1)) return 'Yesterday';
    const d = fromISO(iso);
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }
  const fmtTime = ts => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const fmtStamp = ts => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  function dayLabel(ts) {
    const iso = toISO(new Date(ts));
    const t = todayISO();
    if (iso === t) return 'Today';
    if (iso === addDays(t, -1)) return 'Yesterday';
    return new Date(ts).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  /* ---------------------------------------------------------
     Data: demo seed, load, save
     --------------------------------------------------------- */
  function seed() {
    const now = Date.now();
    const min = 60e3;
    const today = todayISO();
    const members = [
      { id: 'm1', name: 'Maya Santos', email: 'maya@crewboard.local', color: PALETTE[0] },
      { id: 'm2', name: 'Jonas Reyes', email: 'jonas@crewboard.local', color: PALETTE[1] },
      { id: 'm3', name: 'Ines Duarte', email: 'ines@crewboard.local', color: PALETTE[2] },
      { id: 'm4', name: 'Theo Lim', email: 'theo@crewboard.local', color: PALETTE[3] },
    ];
    const [maya, jonas, ines, theo] = members.map(m => m.id);

    const mk = (title, status, priority, dueOffset, assignees, desc = '', steps = [], comments = []) => ({
      id: uid('t_'), title, desc, status, priority,
      due: dueOffset === null ? '' : addDays(today, dueOffset),
      assignees,
      checklist: steps.map(([text, done]) => ({ id: uid('c_'), text, done })),
      comments, created: now,
    });

    const tasks = [
      mk('Draft the launch announcement', 'doing', 'high', 1, [maya, ines],
        'Short and friendly. Lead with the date and the sign-up link.',
        [['Outline the key points', true], ['Write the first draft', true], ['Get feedback from the team', false], ['Final edit and schedule', false]],
        [{ id: uid('k_'), by: ines, text: 'First draft is in the shared folder. @Maya can you take the intro?', ts: now - 62 * min }]),
      mk('Confirm the speaker list', 'doing', 'high', -1, [jonas, maya], 'Two speakers are still waiting on our reply.'),
      mk('Book the venue for Saturday', 'todo', 'urgent', 0, [jonas], 'Ask about the projector and how early we can set up.'),
      mk('Order snacks and drinks', 'todo', 'normal', 5, [theo]),
      mk('Test the sign-up form on a phone', 'todo', 'normal', 7, []),
      mk('Write thank-you notes', 'todo', 'low', null, []),
      mk('Design the poster and social tiles', 'review', 'normal', 3, [ines, theo], 'Two size options: square and story.',
        [['Poster', true], ['Square tile', true], ['Story tile', false]]),
      mk('Set up the shared budget sheet', 'done', 'low', -2, [theo]),
    ];

    const sys = (text, ago) => ({ id: uid('g_'), by: null, system: true, text, ts: now - ago * min });
    const msg = (by, text, ago) => ({ id: uid('g_'), by, text, ts: now - ago * min });

    return {
      members,
      tasks,
      channels: [
        { id: 'general', name: 'general', topic: 'Everyday chat for the whole crew' },
        { id: 'ideas', name: 'ideas', topic: 'Half-baked thoughts welcome' },
        { id: 'activity', name: 'activity', topic: 'Automatic updates whenever a task changes' },
      ],
      messages: {
        general: [
          msg(maya, 'Morning all! The launch tasks are on the board. Grab anything unassigned.', 190),
          msg(jonas, 'On it. I will call the venue today.', 175),
          msg(theo, 'Budget sheet is done and shared. @Ines the poster budget is on tab 2.', 60),
          msg(ines, 'Thanks Theo, moving the poster to review shortly.', 55),
        ],
        ideas: [
          msg(theo, 'What about a small raffle at the end? Cheap, and people love it.', 300),
        ],
        activity: [
          sys('Maya Santos created “Draft the launch announcement” and assigned Maya and Ines', 240),
          sys('Theo Lim moved “Set up the shared budget sheet” to Done', 70),
          sys('Ines Duarte moved “Design the poster and social tiles” to In review', 40),
        ],
      },
      notifications: {},
    };
  }

  function normalize(d) {
    d.members = d.members.filter(m => m && m.id && m.name).map(m => ({
      id: String(m.id), name: String(m.name),
      email: String(m.email || ''),
      color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : PALETTE[0],
    }));
    d.tasks = d.tasks.filter(t => t && t.id).map(t => ({
      id: String(t.id),
      title: String(t.title || 'Untitled task'),
      desc: String(t.desc || ''),
      status: STATUSES.some(s => s.id === t.status) ? t.status : 'todo',
      priority: PRIORITIES.some(p => p.id === t.priority) ? t.priority : 'normal',
      due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') ? t.due : '',
      assignees: Array.isArray(t.assignees) ? t.assignees : [],
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
      comments: Array.isArray(t.comments) ? t.comments : [],
      created: t.created || Date.now(),
    }));
    d.channels = d.channels.filter(c => c && c.id && c.name).map(c => ({ id: String(c.id), name: String(c.name), topic: String(c.topic || '') }));
    if (!d.channels.some(c => c.id === 'activity')) {
      d.channels.push({ id: 'activity', name: 'activity', topic: 'Automatic updates whenever a task changes' });
    }
    for (const c of d.channels) if (!Array.isArray(d.messages[c.id])) d.messages[c.id] = [];
    d.notifications = d.notifications && typeof d.notifications === 'object' ? d.notifications : {};
    return d;
  }

  function emptyWorkspace(member) {
    return normalize({
      members: member ? [{ id: member.uid, name: member.email, email: member.email, color: PALETTE[0] }] : [],
      tasks: [],
      channels: [
        { id: 'general', name: 'general', topic: 'Everyday chat for the whole crew' },
        { id: 'ideas', name: 'ideas', topic: 'Half-baked thoughts welcome' },
        { id: 'activity', name: 'activity', topic: 'Automatic updates whenever a task changes' },
      ],
      messages: { general: [], ideas: [], activity: [] },
      notifications: {},
    });
  }

  function parseData(text) {
    try {
      const d = JSON.parse(text);
      if (!d || !Array.isArray(d.members) || !Array.isArray(d.tasks) || !Array.isArray(d.channels) || !d.messages || typeof d.messages !== 'object') return null;
      const n = normalize(d);
      return n.members.length && n.channels.length ? n : null;
    } catch (e) { return null; }
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (raw) { const d = parseData(raw); if (d) return d; }
    } catch (e) { /* storage blocked: fall through to demo data */ }
    return seed();
  }
  let firestore = null;
  let cloudReady = false;
  let cloudUnsubscribe = null;
  let cloudWrite = Promise.resolve();

  function save() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    if (!cloudReady || !firestore || !authUser) return;
    const payload = JSON.parse(JSON.stringify({ initialized: true, members: data.members, tasks: data.tasks, channels: data.channels, messages: data.messages, notifications: data.notifications || {} }));
    cloudWrite = cloudWrite
      .then(() => firestore.collection('workspace').doc(WORKSPACE_ID).set({
        ...payload,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: authUser.uid
      }, { merge: true }))
      .catch(error => {
        console.error('Crewboard could not save to Firestore.', error);
        toast('Cloud save failed. Your local copy is still available.');
      });
  }

  function loadUI() {
    const base = { me: data.members[0].id, view: 'board', channel: data.channels[0].id, filter: null, search: '', calMonth: `${todayISO().slice(0, 8)}01` };
    try { const raw = sessionStorage.getItem(UI_KEY); if (raw) Object.assign(base, JSON.parse(raw)); } catch (e) { /* ignore */ }
    base.search = '';
    return base;
  }
  function saveUI() { try { sessionStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* ignore */ } }
  function normalizeUI() {
    if (!memberById(ui.me)) ui.me = data.members[0].id;
    if (!data.channels.some(c => c.id === ui.channel)) ui.channel = data.channels[0].id;
    if (ui.filter && !memberById(ui.filter)) ui.filter = null;
    if (!['board', 'list', 'calendar', 'chat'].includes(ui.view)) ui.view = 'board';
    if (!/^\d{4}-\d{2}-01$/.test(ui.calMonth)) ui.calMonth = `${todayISO().slice(0, 8)}01`;
  }

  let data = loadData();
  let ui = loadUI();
  let modal = null;       // the open dialog, if any
  let dragId = null;      // task currently being dragged
  let toastTimer = null;
  let authUser = null;

  function firebaseReady() {
    const c = window.CREWBOARD_FIREBASE_CONFIG || {};
    return Boolean(window.firebase && c.apiKey && c.authDomain && c.projectId && c.appId);
  }

  function currentAuthMember() {
    if (!authUser) return null;
    return data.members.find(m => (m.email || '').toLowerCase() === (authUser.email || '').toLowerCase()) ||
      data.members.find(m => m.id === authUser.uid);
  }

  function showApp(member) {
    authUser = member || authUser || { uid: 'demo', email: 'demo@crewboard.local' };
    let matched = currentAuthMember();
    if (!matched && authUser.email && authUser.uid !== 'demo') {
      matched = { id: authUser.uid, name: authUser.email, email: authUser.email, color: PALETTE[data.members.length % PALETTE.length] };
      data.members.push(matched);
      save();
    }
    if (matched && authUser.uid !== 'demo') {
      matched.id = authUser.uid;
      matched.email = authUser.email;
      if (!matched.name || matched.name === 'hmdeanon') matched.name = authUser.email;
    }
    if (matched) {
      ui.me = matched.id;
      ui.filter = matched.id;
    }
    $('#auth-screen').classList.add('hidden');
    $('#app').classList.add('ready');
    normalizeUI(); saveUI(); renderAll();
    connectFirestore();
  }

  function showLoginError(message) {
    const el = $('#login-error');
    if (el) el.textContent = message;
  }

  function signOut() {
    if (firebaseReady()) window.firebase.auth().signOut().catch(() => showLoginError('Unable to sign out. Please try again.'));
    else {
      sessionStorage.removeItem(AUTH_KEY);
      authUser = null;
      $('#app').classList.remove('ready');
      $('#auth-screen').classList.remove('hidden');
    }
  }

  function notifications() {
    return data.notifications || {};
  }
  function saveNotifications(value) {
    data.notifications = value;
    save();
  }
  function notify(memberId, text, taskId = null) {
    if (!memberId || memberId === ui.me) return;
    const all = notifications();
    all[memberId] = Array.isArray(all[memberId]) ? all[memberId] : [];
    all[memberId].unshift({ id: uid('n_'), text, taskId, ts: Date.now(), read: false });
    all[memberId] = all[memberId].slice(0, 100);
    saveNotifications(all);
  }
  function myNotifications() {
    const all = notifications();
    return Array.isArray(all[ui.me]) ? all[ui.me] : [];
  }
  function unreadNotifications() { return myNotifications().filter(n => !n.read).length; }
  function openNotifications() {
    const items = myNotifications();
    mountModal(`
      <div class="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title">
        <div class="modal-head"><div><h2 id="notification-title">Notifications</h2><p class="modal-sub">${items.length ? `${unreadNotifications()} unread` : 'You are all caught up'}</p></div><button class="icon-btn" data-action="close-modal" aria-label="Close">${icon('x')}</button></div>
        <div class="notification-list">${items.length ? items.map(n => `<button class="notification-item ${n.read ? '' : 'unread'}" data-action="read-notification" data-id="${n.id}" data-task="${n.taskId || ''}"><span class="notification-dot"></span><span><strong>${esc(n.text)}</strong><time>${fmtStamp(n.ts)}</time></span></button>`).join('') : '<p class="empty-state">Mentions, assignments, and task changes will appear here.</p>'}</div>
        ${items.some(n => !n.read) ? '<button class="btn" data-action="read-all-notifications">Mark all as read</button>' : ''}
      </div>`, null);
  }
  function markNotifications(readId) {
    const all = notifications();
    all[ui.me] = (all[ui.me] || []).map(n => readId === 'all' || n.id === readId ? { ...n, read: true } : n);
    saveNotifications(all); closeModal(); renderSidebar();
  }

  function connectFirestore() {
    if (!firebaseReady() || !window.firebase.firestore) return;
    try {
      if (!firestore) firestore = window.firebase.firestore();
      if (cloudUnsubscribe) cloudUnsubscribe();
      cloudUnsubscribe = firestore.collection('workspace').doc(WORKSPACE_ID).onSnapshot(snapshot => {
        if (snapshot.exists) {
          const remote = snapshot.data();
          if (!remote.initialized) {
            data = emptyWorkspace(authUser);
            cloudReady = true;
            save();
            return;
          }
          data = normalize({
            members: Array.isArray(remote.members) ? remote.members : data.members,
            tasks: Array.isArray(remote.tasks) ? remote.tasks : data.tasks,
            channels: Array.isArray(remote.channels) ? remote.channels : data.channels,
            messages: remote.messages && typeof remote.messages === 'object' ? remote.messages : data.messages,
            notifications: remote.notifications || data.notifications
          });
          let addedCurrent = false;
          let current = data.members.find(m => m.id === authUser.uid) || data.members.find(m => m.email === authUser.email);
          if (!current && authUser.uid !== 'demo') {
            current = { id: authUser.uid, name: authUser.email, email: authUser.email, color: PALETTE[data.members.length % PALETTE.length] };
            data.members.push(current);
            addedCurrent = true;
          }
          if (current) {
            current.id = authUser.uid;
            current.email = authUser.email;
            if (!current.name || current.name === 'hmdeanon') current.name = authUser.email;
          }
          cloudReady = true;
          if (addedCurrent) save();
          try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
          normalizeUI();
          renderAll();
        } else {
          data = emptyWorkspace(authUser);
          cloudReady = true;
          save();
        }
      }, error => {
        console.error('Crewboard could not read Firestore.', error);
        cloudReady = false;
        toast('Cloud data could not be loaded. Check your Firestore rules.');
      });
    } catch (error) {
      console.error('Crewboard could not connect to Firestore.', error);
      toast('Firestore is unavailable. The local fallback is still active.');
    }
  }

  /* ---------------------------------------------------------
     Lookups
     --------------------------------------------------------- */
  const memberById = id => data.members.find(m => m.id === id);
  const me = () => memberById(ui.me) || data.members[0];
  const channelById = id => data.channels.find(c => c.id === id) || data.channels[0];
  const taskById = id => data.tasks.find(t => t.id === id);
  const statusLabel = id => (STATUSES.find(s => s.id === id) || {}).label || id;
  const priorityLabel = id => (PRIORITIES.find(p => p.id === id) || {}).label || id;
  const openCount = m => data.tasks.filter(t => t.status !== 'done' && t.assignees.includes(m.id)).length;
  const assigneesOf = t => t.assignees.map(memberById).filter(Boolean);

  function visibleTasks() {
    const q = ui.search.trim().toLowerCase();
    return data.tasks.filter(t => {
      if (ui.filter && !t.assignees.includes(ui.filter)) return false;
      if (!q) return true;
      const names = assigneesOf(t).map(m => m.name).join(' ');
      return `${t.title} ${t.desc} ${names}`.toLowerCase().includes(q);
    });
  }

  /* ---------------------------------------------------------
     Small view pieces
     --------------------------------------------------------- */
  const avatar = (m, size = 26) =>
    `<span class="avatar" title="${esc(m.name)}" style="--c:${esc(m.color)};--av-ink:${inkOn(m.color)};--s:${size}px">${esc(initials(m.name))}</span>`;
  const ghostAvatar = (size = 26) => `<span class="avatar ghost" title="Former teammate" style="--s:${size}px">?</span>`;

  function avatarStack(list, max = 4) {
    if (!list.length) return '';
    const shown = list.slice(0, max);
    const extra = list.length - shown.length;
    return `<span class="stack">${shown.map(m => avatar(m)).join('')}${extra > 0 ? `<span class="avatar more" style="--s:26px">+${extra}</span>` : ''}</span>`;
  }

  // Vertical color edge: one color per assignee, split evenly.
  function stripe(list) {
    if (!list.length) return 'var(--line-strong)';
    if (list.length === 1) return list[0].color;
    const step = 100 / list.length;
    return `linear-gradient(to bottom, ${list.map((m, i) => `${m.color} ${(i * step).toFixed(1)}% ${((i + 1) * step).toFixed(1)}%`).join(', ')})`;
  }

  function dueInfo(t) {
    if (!t.due) return null;
    const today = todayISO();
    const open = t.status !== 'done';
    return { text: fmtDay(t.due), cls: open && t.due < today ? 'overdue' : open && t.due === today ? 'today' : '' };
  }

  // Escapes text, then turns @firstname into a colored mention and keeps line breaks.
  function fmtText(text) {
    return esc(text)
      .replace(/@([\p{L}\p{N}_]+)/gu, (m, name) => {
        const mem = data.members.find(x => mentionKeys(x).some(key => key.toLowerCase() === name.toLowerCase()));
        if (!mem) return m;
        return `<span class="mention ${mem.id === me().id ? 'is-me' : ''}" style="--who:${esc(mem.color)}">@${esc(firstName(mem.name))}</span>`;
      })
      .replace(/\n/g, '<br>');
  }

  /* ---------------------------------------------------------
     Rendering: frame (sidebar, top bar, content)
     --------------------------------------------------------- */
  function renderAll() { renderSidebar(); renderTopbar(); renderContent(); }

  // Refresh after data changes without disturbing search box or chat draft.
  function refresh() {
    renderSidebar();
    const sub = $('#topbar-sub');
    if (sub && ui.view !== 'chat') sub.textContent = subText();
    if (ui.view === 'chat') renderMessages(false); else renderContent();
  }

  function subText() {
    const open = data.tasks.filter(t => t.status !== 'done').length;
    return `${open} open, ${data.tasks.length - open} done`;
  }

  function renderSidebar() {
    const views = [['board', 'Board', 'board'], ['list', 'List', 'list'], ['calendar', 'Calendar', 'calendar']];
    const totalOpen = data.tasks.filter(t => t.status !== 'done').length;
    const mine = me();

    $('#sidebar').innerHTML = `
      <div class="brand">
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" fill="#3552FF"/><circle cx="10" cy="11" r="3.3" fill="#fff"/><circle cx="18" cy="11" r="3.3" fill="#E9A23B"/><circle cx="14" cy="18.5" r="3.3" fill="#FF7A70"/></svg>
        <span>Crewboard</span>
      </div>

      <nav class="nav" aria-label="Views">
        ${views.map(([id, label, ic]) => `
          <button class="nav-item ${ui.view === id ? 'active' : ''}" data-action="view" data-view="${id}">${icon(ic)}<span>${label}</span></button>`).join('')}
      </nav>

      <div class="side-scroll">
        <div class="side-head">
          <h2>Team</h2>
          <button class="side-btn" data-action="add-member" aria-label="Add teammate">${icon('plus', 16)}</button>
        </div>
        <ul class="side-list">
          <li class="team-row">
            <button class="team-item ${!ui.filter && ui.view !== 'chat' ? 'active' : ''}" data-action="filter" data-id="">
              <span class="glyph">${icon('users', 15)}</span><span class="grow">Everyone</span><span class="n">${totalOpen}</span>
            </button>
          </li>
          ${data.members.map(m => `
            <li class="team-row">
              <button class="team-item ${ui.filter === m.id ? 'active' : ''}" data-action="filter" data-id="${m.id}" title="Show ${esc(firstName(m.name))}'s tasks">
                ${avatar(m)}<span class="grow">${esc(m.name)}${m.id === mine.id ? '<span class="you">you</span>' : ''}</span><span class="n">${openCount(m)}</span>
              </button>
              <button class="edit" data-action="edit-member" data-id="${m.id}" aria-label="Edit ${esc(m.name)}">${icon('pencil', 14)}</button>
            </li>`).join('')}
        </ul>

        <div class="side-head">
          <h2>Channels</h2>
          <button class="side-btn" data-action="add-channel" aria-label="Add channel">${icon('plus', 16)}</button>
        </div>
        <ul class="side-list">
          ${data.channels.map(c => `
            <li class="team-row">
              <button class="team-item ${ui.view === 'chat' && ui.channel === c.id ? 'active' : ''}" data-action="channel" data-id="${c.id}">
                <span class="glyph hash">${icon('hash', 14)}</span><span class="grow">${esc(c.name)}</span>
              </button>
            </li>`).join('')}
        </ul>
      </div>

      <div class="side-foot">
        <div class="me-row">
          ${avatar(mine, 30)}
          <span class="signed-in-user"><strong>${esc(mine.name)}</strong><small>${esc(authUser && authUser.email ? authUser.email : 'Signed in')}</small></span>
          <button class="side-btn" data-action="edit-member" data-id="${mine.id}" aria-label="Edit your username">${icon('pencil', 14)}</button>
        </div>
        <div class="foot-tools">
          <button class="tool notification-trigger" data-action="notifications" title="Notifications">${icon('bell', 14)}<span>Alerts</span>${unreadNotifications() ? `<b>${unreadNotifications()}</b>` : ''}</button>
          <button class="tool" data-action="logout" title="Sign out">${icon('logout', 14)}Sign out</button>
        </div>
      </div>`;
  }

  function renderTopbar() {
    const isChat = ui.view === 'chat';
    let title, sub;
    if (isChat) {
      const ch = channelById(ui.channel);
      title = `<span class="hash">#</span>${esc(ch.name)}`;
      sub = esc(ch.topic);
    } else {
      title = { board: 'Board', list: 'List', calendar: 'Calendar' }[ui.view];
      sub = subText();
    }
    const who = ui.filter ? memberById(ui.filter) : null;

    $('#topbar').innerHTML = `
      <button class="icon-btn menu-btn" data-action="toggle-nav" aria-label="Open menu">${icon('menu')}</button>
      <div class="titles">
        <h1>${title}</h1>
        <p id="topbar-sub">${sub}</p>
      </div>
      ${isChat ? '' : `
        <div class="actions">
          ${who ? `<button class="filter-chip" data-action="filter" data-id="" aria-label="Clear filter">${esc(firstName(who.name))}'s tasks ${icon('x', 14)}</button>` : ''}
          <label class="search">${icon('search', 16)}<input id="search" type="search" placeholder="Search tasks" aria-label="Search tasks" value="${esc(ui.search)}"></label>
          <button class="btn primary" data-action="new-task" data-status="todo">${icon('plus', 16)} New task</button>
        </div>`}
      <button class="notification-top" data-action="notifications" aria-label="Open notifications">${icon('bell', 18)}${unreadNotifications() ? `<span>${unreadNotifications()}</span>` : ''}</button>`;
  }

  function renderContent() {
    const el = $('#content');
    el.className = `content view-${ui.view}`;
    if (ui.view === 'board') el.innerHTML = boardHTML();
    else if (ui.view === 'list') el.innerHTML = listHTML();
    else if (ui.view === 'calendar') el.innerHTML = calendarHTML();
    else { el.innerHTML = chatHTML(); renderMessages(true); }
  }

  /* ---------------------------------------------------------
     Board
     --------------------------------------------------------- */
  function boardHTML() {
    const tasks = visibleTasks();
    const filtered = Boolean(ui.search || ui.filter);
    return `<div class="board">${STATUSES.map(s => {
      const col = tasks.filter(t => t.status === s.id);
      return `
        <section class="lane" aria-label="${s.label}">
          <header class="lane-head">
            <span class="dot s-${s.id}"></span>
            <h2>${s.label}</h2>
            <span class="count">${col.length}</span>
            <button class="icon-btn" data-action="new-task" data-status="${s.id}" aria-label="Add task to ${s.label}">${icon('plus', 16)}</button>
          </header>
          <div class="lane-body" data-drop="${s.id}">
            ${col.length ? col.map(cardHTML).join('') : `<p class="lane-empty">${filtered ? 'Nothing here for this filter' : 'Drop a task here'}</p>`}
          </div>
        </section>`;
    }).join('')}</div>`;
  }

  function cardHTML(t) {
    const asg = assigneesOf(t);
    const due = dueInfo(t);
    const doneSteps = t.checklist.filter(c => c.done).length;
    const showFlag = t.priority === 'high' || t.priority === 'urgent';
    return `
      <article class="card ${t.status === 'done' ? 'is-done' : ''}" draggable="true" tabindex="0" data-action="open-task" data-id="${t.id}" style="--stripe:${stripe(asg)}">
        <h3>${esc(t.title)}</h3>
        ${(showFlag || due || t.checklist.length || t.comments.length) ? `
          <div class="card-meta">
            ${showFlag ? `<span class="flag p-${t.priority}">${icon('flag', 13)}${priorityLabel(t.priority)}</span>` : ''}
            ${due ? `<span class="due ${due.cls}">${icon('calendar', 13)}${esc(due.text)}</span>` : ''}
            ${t.checklist.length ? `<span>${icon('check', 13)}${doneSteps}/${t.checklist.length}</span>` : ''}
            ${t.comments.length ? `<span>${icon('message', 13)}${t.comments.length}</span>` : ''}
          </div>` : ''}
        <div class="card-foot">${asg.length ? avatarStack(asg) : '<span class="unassigned">Unassigned</span>'}</div>
      </article>`;
  }

  /* ---------------------------------------------------------
     List
     --------------------------------------------------------- */
  const byDue = (a, b) => {
    const x = a.due || '9999', y = b.due || '9999';
    return x < y ? -1 : x > y ? 1 : 0;
  };

  function emptyHTML() {
    return `
      <div class="empty">
        <h2>No tasks to show</h2>
        <p>${ui.search || ui.filter ? 'Nothing matches your search or filter.' : 'Add the first task to get your crew moving.'}</p>
        <div class="btn-row">
          ${ui.search || ui.filter ? '<button class="btn" data-action="clear-filters">Clear filters</button>' : ''}
          <button class="btn primary" data-action="new-task" data-status="todo">${icon('plus', 16)} New task</button>
        </div>
      </div>`;
  }

  function listHTML() {
    const tasks = visibleTasks();
    if (!tasks.length) return emptyHTML();
    return `
      <div class="list">
        <div class="list-cols" aria-hidden="true"><span></span><span>Task</span><span>Assigned</span><span>Priority</span><span>Due</span></div>
        ${STATUSES.map(s => {
          const rows = tasks.filter(t => t.status === s.id).sort(byDue);
          if (!rows.length) return '';
          return `
            <section>
              <h2 class="group-head"><span class="dot s-${s.id}"></span>${s.label}<span class="count">${rows.length}</span></h2>
              ${rows.map(rowHTML).join('')}
            </section>`;
        }).join('')}
      </div>`;
  }

  function rowHTML(t) {
    const due = dueInfo(t);
    const done = t.status === 'done';
    const steps = t.checklist.length ? `<small>${t.checklist.filter(c => c.done).length}/${t.checklist.length} steps</small>` : '';
    return `
      <div class="row ${done ? 'is-done' : ''}" tabindex="0" data-action="open-task" data-id="${t.id}">
        <button class="check ${done ? 'on' : ''}" data-action="toggle-done" data-id="${t.id}" aria-pressed="${done}" aria-label="${done ? 'Mark not done' : 'Mark done'}">${icon('check', 14)}</button>
        <span class="row-title">${esc(t.title)}${steps}</span>
        <span class="row-who">${avatarStack(assigneesOf(t), 3)}</span>
        <span class="row-prio flag p-${t.priority}">${icon('flag', 14)}${priorityLabel(t.priority)}</span>
        <span class="row-due due ${due ? due.cls : ''}">${due ? esc(due.text) : '<span style="color:var(--muted)">No date</span>'}</span>
      </div>`;
  }

  /* ---------------------------------------------------------
     Calendar
     --------------------------------------------------------- */
  function calendarHTML() {
    const first = fromISO(ui.calMonth);
    const year = first.getFullYear(), month = first.getMonth();
    const offset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weeks = Math.ceil((offset + daysInMonth) / 7);
    const tasks = visibleTasks();
    const byDay = {};
    tasks.forEach(t => { if (t.due) (byDay[t.due] = byDay[t.due] || []).push(t); });
    const today = todayISO();

    let cells = WEEKDAYS.map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(year, month, 1 - offset + i);
      const iso = toISO(d);
      const chips = (byDay[iso] || []).map(t => `
        <button class="chip-task ${t.status === 'done' ? 'is-done' : ''}" data-action="open-task" data-id="${t.id}" style="--stripe:${stripe(assigneesOf(t))}" title="${esc(t.title)}">${esc(t.title)}</button>`).join('');
      cells += `
        <div class="day ${d.getMonth() === month ? '' : 'out'} ${iso === today ? 'today' : ''}" data-action="new-task" data-status="todo" data-due="${iso}">
          <span class="day-num">${d.getDate()}</span>${chips}
        </div>`;
    }

    const undated = tasks.filter(t => !t.due && t.status !== 'done').length;
    return `
      <div class="cal-head">
        <h2>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button class="icon-btn" data-action="cal-prev" aria-label="Previous month">${icon('left')}</button>
        <button class="btn" data-action="cal-today">Today</button>
        <button class="icon-btn" data-action="cal-next" aria-label="Next month">${icon('right')}</button>
      </div>
      <div class="cal">${cells}</div>
      ${undated ? `<p class="cal-note">${undated} open ${undated === 1 ? 'task has' : 'tasks have'} no due date and ${undated === 1 ? "isn't" : "aren't"} shown here. Click any day to add one.</p>` : '<p class="cal-note">Click any day to add a task due that day.</p>'}`;
  }

  function shiftMonth(n) {
    const d = fromISO(ui.calMonth);
    d.setMonth(d.getMonth() + n);
    ui.calMonth = toISO(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  /* ---------------------------------------------------------
     Chat
     --------------------------------------------------------- */
  function chatHTML() {
    const ch = channelById(ui.channel);
    return `
      <div class="chat">
        <div class="chat-scroll" id="chat-scroll"><div class="msg-list" id="msg-list"></div></div>
        <form class="composer" id="composer" autocomplete="off">
          <textarea id="chat-input" rows="1" placeholder="Message #${esc(ch.name)}. Type @name to mention someone." aria-label="Message"></textarea>
          <button class="btn primary" type="submit">${icon('send', 16)} Send</button>
        </form>
      </div>`;
  }

  function renderMessages(stick) {
    const list = $('#msg-list');
    const scroller = $('#chat-scroll');
    if (!list || !scroller) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    const msgs = data.messages[ui.channel] || [];
    let html = '', lastDay = '', prev = null;

    if (!msgs.length) {
      html = `<div class="chat-empty"><p>Nothing in #${esc(channelById(ui.channel).name)} yet.</p><p>Say hello to the crew.</p></div>`;
    }
    for (const m of msgs) {
      const day = toISO(new Date(m.ts));
      if (day !== lastDay) { html += `<div class="day-divider"><span>${dayLabel(m.ts)}</span></div>`; lastDay = day; prev = null; }
      if (m.system) {
        html += `<div class="sys-msg"><span>${esc(m.text)}</span><time>${fmtTime(m.ts)}</time></div>`;
        prev = null;
        continue;
      }
      const author = memberById(m.by);
      const compact = prev && prev.by === m.by && m.ts - prev.ts < 5 * 60e3;
      html += compact
        ? `<div class="msg compact"><time class="hover-time">${fmtTime(m.ts)}</time><div class="msg-body">${fmtText(m.text)}</div></div>`
        : `<div class="msg">${author ? avatar(author, 36) : ghostAvatar(36)}<div><div class="msg-head"><strong>${esc(author ? author.name : 'Former teammate')}</strong><time>${fmtTime(m.ts)}</time></div><div class="msg-body">${fmtText(m.text)}</div></div></div>`;
      prev = m;
    }
    list.innerHTML = html;
    if (stick || nearBottom) scroller.scrollTop = scroller.scrollHeight;
  }

  function submitChat() {
    const input = $('#chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    (data.messages[ui.channel] = data.messages[ui.channel] || []).push({ id: uid('g_'), by: me().id, text, ts: Date.now() });
    for (const member of data.members) {
      if (member.id !== me().id && mentionsMember(text, member)) {
        notify(member.id, `${me().name} mentioned you in #${channelById(ui.channel).name}`);
      }
    }
    input.value = '';
    input.style.height = 'auto';
    save();
    renderMessages(true);
    input.focus();
  }

  // Automatic feed in #activity whenever tasks change.
  function postSystem(text) {
    (data.messages.activity = data.messages.activity || []).push({ id: uid('g_'), by: null, system: true, text, ts: Date.now() });
    if (ui.view === 'chat' && ui.channel === 'activity') renderMessages(false);
  }

  /* ---------------------------------------------------------
     Task actions
     --------------------------------------------------------- */
  function moveTask(id, status, beforeId) {
    const idx = data.tasks.findIndex(t => t.id === id);
    if (idx < 0) return;
    const [t] = data.tasks.splice(idx, 1);
    const changed = t.status !== status;
    t.status = status;
    const at = beforeId ? data.tasks.findIndex(x => x.id === beforeId) : -1;
    if (at < 0) data.tasks.push(t); else data.tasks.splice(at, 0, t);
    if (changed) postSystem(`${me().name} moved “${t.title}” to ${statusLabel(status)}`);
    if (changed) t.assignees.forEach(memberId => notify(memberId, `${me().name} moved “${t.title}” to ${statusLabel(status)}`, t.id));
    save();
    refresh();
  }

  function toggleDone(id) {
    const t = taskById(id);
    if (!t) return;
    t.status = t.status === 'done' ? 'todo' : 'done';
    postSystem(`${me().name} moved “${t.title}” to ${statusLabel(t.status)}`);
    t.assignees.forEach(memberId => notify(memberId, `${me().name} moved “${t.title}” to ${statusLabel(t.status)}`, t.id));
    save();
    refresh();
  }

  /* ---------------------------------------------------------
     Modals
     --------------------------------------------------------- */
  function mountModal(html, focusSel) {
    $('#modal-root').innerHTML = html;
    document.body.classList.add('modal-open');
    const target = focusSel ? $(focusSel) : $('.modal');
    if (target) target.focus();
  }

  function closeModal() {
    if (!modal) return;
    const m = modal;
    modal = null;
    if (m.kind === 'task' && !m.isNew) {
      if (!m.task.title.trim()) m.task.title = 'Untitled task';
      save();
    }
    $('#modal-root').innerHTML = '';
    document.body.classList.remove('modal-open');
    refresh();
    if (m.opener && m.opener.isConnected) m.opener.focus();
  }

  /* ----- Task dialog ----- */
  const optionsHTML = (list, cur) => list.map(o => `<option value="${o.id}" ${o.id === cur ? 'selected' : ''}>${o.label}</option>`).join('');

  function openTask(id, preset = {}) {
    let task, isNew = false;
    if (id) {
      task = taskById(id);
      if (!task) return;
    } else {
      isNew = true;
      task = {
        id: uid('t_'), title: '', desc: '', status: preset.status || 'todo', priority: 'normal',
        due: preset.due || '', assignees: ui.filter ? [ui.filter] : [], checklist: [], comments: [], created: Date.now(),
      };
    }
    modal = { kind: 'task', task, isNew, opener: document.activeElement };

    mountModal(`
      <div class="modal-back" data-modal-back>
        <div class="modal task-modal" role="dialog" aria-modal="true" aria-label="${isNew ? 'New task' : 'Task details'}" tabindex="-1">
          <button class="icon-btn tm-close" data-action="close-modal" aria-label="Close">${icon('x')}</button>

          <div class="tm-main">
            <input id="tm-title" class="tm-title" type="text" maxlength="140" placeholder="Task name" aria-label="Task name" value="${esc(task.title)}">
            <textarea id="tm-desc" class="tm-desc" rows="3" placeholder="Add details, links or notes" aria-label="Description">${esc(task.desc)}</textarea>

            <section class="tm-block">
              <h3>Checklist<span id="tm-check-count"></span></h3>
              <ul id="tm-checklist" class="checklist"></ul>
              <form id="tm-check-form" class="inline-form">
                <input type="text" placeholder="Add a step" aria-label="New checklist step" maxlength="120">
                <button class="btn" type="submit">Add</button>
              </form>
            </section>

            <section class="tm-block">
              <h3>Comments</h3>
              <ul id="tm-comments" class="comments"></ul>
              <form id="tm-comment-form" class="inline-form">
                <input type="text" placeholder="Comment as ${esc(firstName(me().name))}. Use @name to mention." aria-label="New comment" maxlength="400">
                <button class="btn" type="submit">Post</button>
              </form>
            </section>
          </div>

          <aside class="tm-side">
            <div class="field"><label for="tm-status">Status</label><select id="tm-status">${optionsHTML(STATUSES, task.status)}</select></div>
            <div class="field"><label for="tm-priority">Priority</label><select id="tm-priority">${optionsHTML(PRIORITIES, task.priority)}</select></div>
            <div class="field"><label for="tm-due">Due date</label><input id="tm-due" type="date" value="${esc(task.due)}"></div>
            <div class="field"><span class="label">Assigned to</span><div id="tm-assignees" class="assignees"></div></div>
            <div class="tm-actions">
              ${isNew
                ? `<button class="btn primary" data-action="create-task">Create task</button><button class="btn ghost" data-action="close-modal">Cancel</button>`
                : `<button class="btn primary" data-action="close-modal">Done</button><button class="btn danger-ghost" data-action="delete-task">${icon('trash', 16)} Delete</button>`}
            </div>
          </aside>
        </div>
      </div>`, isNew ? '#tm-title' : null);

    renderChecklist();
    renderComments();
    renderAssignees();
  }

  function renderAssignees() {
    const t = modal.task;
    $('#tm-assignees').innerHTML = data.members.map(m => {
      const on = t.assignees.includes(m.id);
      return `<button type="button" class="assignee ${on ? 'on' : ''}" data-action="toggle-assignee" data-id="${m.id}" aria-pressed="${on}">${avatar(m, 22)}<span>${esc(firstName(m.name))}</span>${on ? icon('check', 14) : ''}</button>`;
    }).join('');
  }

  function updateCheckCount() {
    const items = modal.task.checklist;
    $('#tm-check-count').textContent = items.length ? `${items.filter(i => i.done).length}/${items.length}` : '';
  }

  function renderChecklist() {
    const items = modal.task.checklist;
    $('#tm-checklist').innerHTML = items.map(i => `
      <li class="${i.done ? 'done' : ''}">
        <label><input type="checkbox" data-check="${esc(i.id)}" ${i.done ? 'checked' : ''}><span>${esc(i.text)}</span></label>
        <button type="button" class="icon-btn sm" data-action="del-check" data-id="${esc(i.id)}" aria-label="Remove step">${icon('x', 14)}</button>
      </li>`).join('');
    updateCheckCount();
  }

  function renderComments() {
    const list = modal.task.comments;
    $('#tm-comments').innerHTML = list.length
      ? list.map(c => {
          const a = memberById(c.by);
          return `<li>${a ? avatar(a, 24) : ghostAvatar(24)}<div><p class="c-meta"><strong>${esc(a ? a.name : 'Former teammate')}</strong><time>${fmtStamp(c.ts)}</time></p><p>${fmtText(c.text)}</p></div></li>`;
        }).join('')
      : '<li class="muted-empty">No comments yet.</li>';
  }

  function persistTask() { if (modal && !modal.isNew) save(); }

  function toggleAssignee(id) {
    const t = modal.task, m = memberById(id);
    if (!m) return;
    const i = t.assignees.indexOf(id);
    if (i >= 0) t.assignees.splice(i, 1); else t.assignees.push(id);
    if (!modal.isNew) {
      postSystem(i >= 0
        ? `${me().name} unassigned ${firstName(m.name)} from “${t.title}”`
        : `${me().name} assigned ${firstName(m.name)} to “${t.title}”`);
      if (i < 0) notify(m.id, `${me().name} assigned you to “${t.title}”`, t.id);
      save();
    }
    renderAssignees();
  }

  function createTask() {
    const t = modal.task;
    t.title = t.title.trim();
    if (!t.title) { toast('Give the task a name first'); $('#tm-title').focus(); return; }
    data.tasks.push(t);
    const names = assigneesOf(t).map(m => firstName(m.name));
    postSystem(`${me().name} created “${t.title}”${names.length ? ` and assigned ${listNames(names)}` : ''}`);
    t.assignees.forEach(memberId => notify(memberId, `${me().name} assigned you to “${t.title}”`, t.id));
    save();
    modal.isNew = false;
    closeModal();
    toast('Task created');
  }

  function deleteTask() {
    const t = modal.task;
    if (!confirm(`Delete “${t.title || 'this task'}”? This can't be undone.`)) return;
    data.tasks = data.tasks.filter(x => x.id !== t.id);
    postSystem(`${me().name} deleted “${t.title}”`);
    save();
    closeModal();
    toast('Task deleted');
  }

  /* ----- Teammate dialog ----- */
  function openMember(id) {
    const m = id ? memberById(id) : null;
    const used = new Set(data.members.map(x => x.color));
    const color = m ? m.color : (PALETTE.find(c => !used.has(c)) || PALETTE[data.members.length % PALETTE.length]);
    modal = { kind: 'member', id: m ? m.id : null, color, opener: document.activeElement };

    mountModal(`
      <div class="modal-back" data-modal-back>
        <form class="modal small-modal" id="member-form" role="dialog" aria-modal="true" aria-label="${m ? 'Edit teammate' : 'Add teammate'}">
          <h2>${m ? 'Edit teammate' : 'Add a teammate'}</h2>
          <div class="field"><label for="mem-name">Name</label><input id="mem-name" type="text" maxlength="40" required placeholder="e.g. Priya Nair" value="${esc(m ? m.name : '')}"></div>
          <div class="field">
            <span class="label">Color</span>
            <div class="swatches">${PALETTE.map(c => `<button type="button" class="swatch ${c === color ? 'on' : ''}" data-action="pick-color" data-color="${c}" style="--c:${c}" aria-label="Color ${c}" aria-pressed="${c === color}"></button>`).join('')}</div>
          </div>
          <div class="modal-actions">
            <button class="btn primary" type="submit">${m ? 'Save changes' : 'Add teammate'}</button>
            <button class="btn ghost" type="button" data-action="close-modal">Cancel</button>
            ${m && data.members.length > 1 ? `<button class="btn danger-ghost push-right" type="button" data-action="remove-member" data-id="${m.id}">Remove</button>` : ''}
          </div>
        </form>
      </div>`, '#mem-name');
  }

  function saveMember() {
    const name = $('#mem-name').value.trim();
    if (!name) return;
    const { id, color } = modal;
    closeModal();
    if (id) {
      const m = memberById(id);
      m.name = name; m.color = color;
      if (m.id === ui.me && authUser && authUser.email) m.email = authUser.email;
      toast('Teammate updated');
    } else {
      const m = { id: uid('m_'), name, email: '', color };
      data.members.push(m);
      postSystem(`${name} joined the crew`);
      toast(`${firstName(name)} added`);
    }
    save();
    refresh();
  }

  function removeMember(id) {
    const m = memberById(id);
    if (!m || data.members.length < 2) return;
    if (!confirm(`Remove ${m.name} from the crew? They will be unassigned from all tasks.`)) return;
    closeModal();
    data.members = data.members.filter(x => x.id !== id);
    data.tasks.forEach(t => { t.assignees = t.assignees.filter(a => a !== id); });
    postSystem(`${m.name} left the crew`);
    normalizeUI();
    save(); saveUI();
    renderAll();
    toast(`${firstName(m.name)} removed`);
  }

  /* ----- Channel dialog ----- */
  function openChannel() {
    modal = { kind: 'channel', opener: document.activeElement };
    mountModal(`
      <div class="modal-back" data-modal-back>
        <form class="modal small-modal" id="channel-form" role="dialog" aria-modal="true" aria-label="New channel">
          <h2>New channel</h2>
          <div class="field"><label for="ch-name">Name</label><input id="ch-name" type="text" maxlength="30" required placeholder="e.g. design"></div>
          <div class="field"><label for="ch-topic">What is it for? (optional)</label><input id="ch-topic" type="text" maxlength="80" placeholder="e.g. Posters, colors and layouts"></div>
          <div class="modal-actions">
            <button class="btn primary" type="submit">Create channel</button>
            <button class="btn ghost" type="button" data-action="close-modal">Cancel</button>
          </div>
        </form>
      </div>`, '#ch-name');
  }

  function saveChannel() {
    const name = slug($('#ch-name').value);
    const topic = $('#ch-topic').value.trim();
    if (!name) { toast('Use letters or numbers in the channel name'); return; }
    if (data.channels.some(c => c.name === name)) { toast(`#${name} already exists`); return; }
    closeModal();
    const ch = { id: uid('ch_'), name, topic };
    data.channels.push(ch);
    data.messages[ch.id] = [];
    ui.view = 'chat'; ui.channel = ch.id;
    save(); saveUI();
    renderAll();
  }

  /* ---------------------------------------------------------
     Toast and mobile nav
     --------------------------------------------------------- */
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  const closeNav = () => $('#app').classList.remove('nav-open');

  /* ---------------------------------------------------------
     Events: clicks
     --------------------------------------------------------- */
  document.addEventListener('click', e => {
    if (e.target instanceof Element && e.target.hasAttribute('data-modal-back')) {
      if (modal && !(modal.kind === 'task' && modal.isNew)) closeModal();
      return;
    }
    const el = near(e, '[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;

    switch (action) {
      case 'view':
        ui.view = el.dataset.view; saveUI(); closeNav(); renderAll(); break;
      case 'channel':
        ui.view = 'chat'; ui.channel = id; saveUI(); closeNav(); renderAll(); break;
      case 'filter':
        ui.filter = id || null;
        if (ui.view === 'chat') ui.view = 'board';
        saveUI(); closeNav(); renderAll(); break;
      case 'clear-filters':
        ui.filter = null; ui.search = ''; saveUI(); renderAll(); break;
      case 'toggle-nav':
        $('#app').classList.toggle('nav-open'); break;
      case 'close-nav':
        closeNav(); break;
      case 'notifications':
        openNotifications(); break;
      case 'read-notification':
        markNotifications(id);
        if (el.dataset.task) openTask(el.dataset.task);
        break;
      case 'read-all-notifications':
        markNotifications('all'); break;
      case 'logout':
        signOut(); break;

      case 'new-task': openTask(null, { status: el.dataset.status, due: el.dataset.due }); break;
      case 'open-task': openTask(id); break;
      case 'toggle-done': toggleDone(id); break;

      case 'cal-prev': shiftMonth(-1); saveUI(); renderContent(); break;
      case 'cal-next': shiftMonth(1); saveUI(); renderContent(); break;
      case 'cal-today': ui.calMonth = `${todayISO().slice(0, 8)}01`; saveUI(); renderContent(); break;

      case 'close-modal': closeModal(); break;
      case 'create-task': createTask(); break;
      case 'delete-task': deleteTask(); break;
      case 'toggle-assignee': toggleAssignee(id); break;
      case 'del-check':
        modal.task.checklist = modal.task.checklist.filter(i => i.id !== id);
        persistTask(); renderChecklist(); break;

      case 'add-member': openMember(null); break;
      case 'edit-member': openMember(id); break;
      case 'remove-member': removeMember(id); break;
      case 'pick-color':
        modal.color = el.dataset.color;
        document.querySelectorAll('.swatch').forEach(s => {
          const on = s.dataset.color === modal.color;
          s.classList.toggle('on', on);
          s.setAttribute('aria-pressed', String(on));
        });
        break;
      case 'add-channel': openChannel(); break;

    }
  });

  /* ---------------------------------------------------------
     Events: typing, selects, forms, keys
     --------------------------------------------------------- */
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'search') {
      ui.search = t.value;
      renderContent();
    } else if (t.id === 'tm-title' && modal && modal.kind === 'task') {
      modal.task.title = t.value; persistTask();
    } else if (t.id === 'tm-desc' && modal && modal.kind === 'task') {
      modal.task.desc = t.value; persistTask();
    } else if (t.id === 'chat-input') {
      t.style.height = 'auto';
      t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'me-select') {
      ui.me = t.value; saveUI();
      renderSidebar();
      if (ui.view === 'chat') renderMessages(false);
      const sel = $('#me-select'); if (sel) sel.focus();
    } else if (modal && modal.kind === 'task') {
      const task = modal.task;
      if (t.id === 'tm-status') {
        const old = task.status;
        task.status = t.value;
        if (!modal.isNew && old !== task.status) postSystem(`${me().name} moved “${task.title}” to ${statusLabel(task.status)}`);
        persistTask();
      } else if (t.id === 'tm-priority') {
        task.priority = t.value; persistTask();
      } else if (t.id === 'tm-due') {
        task.due = t.value; persistTask();
      } else if (t.dataset && t.dataset.check) {
        const item = task.checklist.find(i => i.id === t.dataset.check);
        if (item) {
          item.done = t.checked;
          const li = t.closest('li'); if (li) li.classList.toggle('done', item.done);
          updateCheckCount(); persistTask();
        }
      }
    }
  });

  document.addEventListener('submit', e => {
    e.preventDefault();
    switch (e.target.id) {
      case 'composer': submitChat(); break;
      case 'member-form': saveMember(); break;
      case 'channel-form': saveChannel(); break;
      case 'tm-check-form': {
        const input = e.target.querySelector('input');
        const text = input.value.trim();
        if (!text || !modal) return;
        modal.task.checklist.push({ id: uid('c_'), text, done: false });
        input.value = '';
        persistTask(); renderChecklist(); input.focus();
        break;
      }
      case 'tm-comment-form': {
        const input = e.target.querySelector('input');
        const text = input.value.trim();
        if (!text || !modal) return;
        modal.task.comments.push({ id: uid('k_'), by: me().id, text, ts: Date.now() });
        for (const member of data.members) {
          if (member.id !== me().id && mentionsMember(text, member)) {
            notify(member.id, `${me().name} mentioned you on “${modal.task.title}”`, modal.task.id);
          }
        }
        input.value = '';
        persistTask(); renderComments(); input.focus();
        break;
      }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (modal) closeModal(); else closeNav();
      return;
    }
    const t = e.target;
    if (!(t instanceof Element)) return;
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('.card, .row')) {
      e.preventDefault();
      openTask(t.dataset.id);
    } else if (t.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submitChat();
    }
  });

  /* ---------------------------------------------------------
     Events: drag and drop on the board
     --------------------------------------------------------- */
  const content = $('#content');

  function getBeforeId(body, y) {
    for (const c of body.querySelectorAll('.card:not(.dragging)')) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height / 2) return c.dataset.id;
    }
    return null;
  }
  function clearDropUI() {
    content.querySelectorAll('.lane-body.over').forEach(b => b.classList.remove('over'));
    content.querySelectorAll('.drop-line').forEach(l => l.remove());
  }
  function laneBodyFrom(e) {
    const direct = near(e, '.lane-body');
    if (direct) return direct;
    const lane = near(e, '.lane');
    return lane ? lane.querySelector('.lane-body') : null;
  }

  content.addEventListener('dragstart', e => {
    const card = near(e, '.card');
    if (!card) return;
    dragId = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    requestAnimationFrame(() => card.classList.add('dragging'));
  });

  content.addEventListener('dragover', e => {
    if (!dragId) return;
    const body = laneBodyFrom(e);
    if (!body) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropUI();
    body.classList.add('over');
    const before = getBeforeId(body, e.clientY);
    const ref = before ? body.querySelector(`.card[data-id="${before}"]`) : null;
    const line = document.createElement('div');
    line.className = 'drop-line';
    body.insertBefore(line, ref);
  });

  content.addEventListener('dragleave', e => {
    const body = near(e, '.lane-body');
    if (body && !body.contains(e.relatedTarget)) {
      body.classList.remove('over');
      body.querySelectorAll('.drop-line').forEach(l => l.remove());
    }
  });

  content.addEventListener('drop', e => {
    if (!dragId) return;
    const body = laneBodyFrom(e);
    if (!body) return;
    e.preventDefault();
    const id = dragId;
    const before = getBeforeId(body, e.clientY);
    dragId = null;
    clearDropUI();
    moveTask(id, body.dataset.drop, before);
  });

  content.addEventListener('dragend', () => {
    dragId = null;
    clearDropUI();
    content.querySelectorAll('.card.dragging').forEach(c => c.classList.remove('dragging'));
  });

  /* ---------------------------------------------------------
     Live sync between browser tabs.
     Open Crewboard in two tabs, act as a different teammate in
     each, and watch tasks and chat update in both.
     --------------------------------------------------------- */
  window.addEventListener('storage', e => {
    if (e.key !== DATA_KEY || !e.newValue) return;
    const fresh = parseData(e.newValue);
    if (!fresh) return;
    data = fresh;
    normalizeUI();
    if (modal && modal.kind === 'task' && !modal.isNew) {
      const same = taskById(modal.task.id);
      if (same) modal.task = same; else { closeModal(); return; }
    }
    refresh();
  });

  /* ---------------------------------------------------------
     Start and authentication
     --------------------------------------------------------- */
  function start() {
    normalizeUI();
    save();
    saveUI();
    const form = $('#login-form');
    if (firebaseReady()) {
      try {
        window.firebase.initializeApp(window.CREWBOARD_FIREBASE_CONFIG);
        window.firebase.auth().onAuthStateChanged(user => {
          if (user) showApp(user);
          else {
            $('#app').classList.remove('ready');
            $('#auth-screen').classList.remove('hidden');
          }
        });
        form.addEventListener('submit', e => {
          e.preventDefault();
          showLoginError('');
          window.firebase.auth().signInWithEmailAndPassword($('#login-email').value.trim(), $('#login-password').value)
            .catch(error => showLoginError(error.code === 'auth/invalid-credential' ? 'Incorrect email or password.' : 'Unable to sign in. Check your Firebase configuration.'));
        });
      } catch (error) {
        showLoginError('Firebase could not be initialized. Check firebase-config.js.');
      }
    } else {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const email = $('#login-email').value.trim().toLowerCase();
        const member = data.members.find(m => m.email === email);
        if (!member || $('#login-password').value !== 'demo') {
          showLoginError('Demo mode uses a seeded member email and the password “demo”.');
          return;
        }
        sessionStorage.setItem(AUTH_KEY, member.id);
        showApp({ uid: member.id, email: member.email });
      });
      const saved = sessionStorage.getItem(AUTH_KEY);
      const member = data.members.find(m => m.id === saved);
      if (member) showApp({ uid: member.id, email: member.email });
    }
  }
  start();
})();
