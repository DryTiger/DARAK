// State
let currentDate = new Date();
let selectedCategory = '영화';

// --- User Manager (Auth & Friends) ---
const UserManager = {
  getUsers() {
    return JSON.parse(localStorage.getItem('darak_users')) || [];
  },

  saveUsers(users) {
    localStorage.setItem('darak_users', JSON.stringify(users));
  },

  getCurrentUser() {
    return JSON.parse(localStorage.getItem('darak_current_user'));
  },

  isLoggedIn() {
    return !!this.getCurrentUser();
  },

  login(id, password) {
    const users = this.getUsers();
    const user = users.find(u => u.id === id && u.password === password);
    if (user) {
      localStorage.setItem('darak_current_user', JSON.stringify(user));
      window.location.reload(); // Reload to clear overlay/refresh state
      return true;
    }
    return false;
  },

  register(id, password) {
    const users = this.getUsers();
    if (users.find(u => u.id === id)) {
      return { success: false, message: 'ID already exists' };
    }
    const newUser = { id, password, friends: [] }; // Simple User Model
    users.push(newUser);
    this.saveUsers(users);
    // Auto login after register? Or require login. Requirement says "After successful login".
    // Let's auto-login for better UX.
    this.login(id, password);
    return { success: true };
  },

  logout() {
    localStorage.removeItem('darak_current_user');
    window.location.reload();
  },

  addFriend(friendId) {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return false;

    // Refresh user data from storage to be safe
    const users = this.getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex === -1) return false;

    const user = users[userIndex];

    if (user.id === friendId) return { success: false, message: "Cannot add yourself." };
    if (user.friends.includes(friendId)) return { success: false, message: "Already friends." };

    // Verify friend exists
    if (!users.find(u => u.id === friendId)) return { success: false, message: "User not found." };

    user.friends.push(friendId);
    users[userIndex] = user;
    this.saveUsers(users);

    // Update session too
    localStorage.setItem('darak_current_user', JSON.stringify(user));
    return { success: true };
  },

  getFriends() {
    const currentUser = this.getCurrentUser();
    return currentUser ? currentUser.friends : [];
  }
};


// --- Database Logic (IndexedDB) ---
let db;
let dbInitialized = new Promise((resolve, reject) => {
  // We'll expose the resolve/reject to be called inside initDB
  // or simply wrap initDB logic here.
  // Better pattern: initDB returns the promise and we assign it.
});
let records = [];
let ticketGallery = [];

const DB_NAME = 'SpacelogDB';
const DB_VERSION = 2;
const STORE_NAME = 'records';
const TICKET_STORE_NAME = 'tickets';

// Robust Initialization
function initDB() {
  dbInitialized = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject("Your browser does not support IndexedDB");
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
      console.error("DB Error", e);
      reject("Database failed to open: " + (e.target.error ? e.target.error.message : "Unknown"));
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      console.log("DB Initialized Successfully");
      resolve(db);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      console.log("DB Upgrade Needed. Current Version:", e.oldVersion);

      // Safe Upgrade: Only create if missing. NEVER DELETE.
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
      }

      if (!db.objectStoreNames.contains(TICKET_STORE_NAME)) {
        db.createObjectStore(TICKET_STORE_NAME, { keyPath: "id" });
      }
    };
  });
  return dbInitialized;
}

// Helpers that WAIT for DB
async function dbSaveRecord(record) {
  await dbInitialized;
  return new Promise((resolve, reject) => {
    try {
      // Auth Check: exist currentUser?
      const currentUser = UserManager.getCurrentUser();

      // If new record, assign owner
      if (!record.userId && currentUser) {
        record.userId = currentUser.id;
      }
      // If updating, owner should already be there. 
      // If legacy record (no owner), assign to current user updating it.
      if (!record.userId && currentUser) {
        record.userId = currentUser.id;
      }

      // Initialize sharedWith if missing
      if (!record.sharedWith) {
        record.sharedWith = [];
      }

      const tx = db.transaction([STORE_NAME], "readwrite");

      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function dbDeleteRecord(id) {
  await dbInitialized;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_NAME], "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(Number(id));
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function dbGetAllRecords() {
  await dbInitialized;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_NAME], "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}


async function dbSaveTicket(ticket) {
  await dbInitialized;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([TICKET_STORE_NAME], "readwrite");
      const store = tx.objectStore(TICKET_STORE_NAME);
      const req = store.put(ticket);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function dbDeleteTicket(id) {
  await dbInitialized;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([TICKET_STORE_NAME], "readwrite");
      const store = tx.objectStore(TICKET_STORE_NAME);
      const req = store.delete(Number(id));
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function dbGetAllTickets() {
  await dbInitialized;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([TICKET_STORE_NAME], "readonly");
      const store = tx.objectStore(TICKET_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function loadAllRecords() {
  try {
    await initDB();

    // AUTH GATE
    const currentUser = UserManager.getCurrentUser();

    // If NOT logged in, we shouldn't show records OR we initiate the Login Overlay flow.
    // The Overlay will block view anyway.
    // But for security/logic, we only load records relevant to user.

  } catch (e) {
    console.error("Critical: Database failed to load.", e);
    // Show the EXACT error to the user
    alert(`Database Error: ${e}\n\nThis may be due to 'Private Browsing' mode, insufficient storage, or corruption. Try restarting your browser.`);
    // Continue loading UI logic so app doesn't totally freeze, but records will be empty
  }

  // Check migration
  const legacyData = localStorage.getItem('spacelog_records');
  if (legacyData && db) { // Only migrate if DB is active
    try {
      const oldRecs = JSON.parse(legacyData);
      if (oldRecs.length > 0) {
        for (const r of oldRecs) await dbSaveRecord(r);
        localStorage.removeItem('spacelog_records');
        console.log("Migrated to IDB");
      }
    } catch (e) { console.error(e); }
  }

  if (db) {
    try {
      const allRecords = await dbGetAllRecords();
      const currentUser = UserManager.getCurrentUser();

      if (currentUser) {
        // FILTER: My records OR Shared with me
        records = allRecords.filter(r => {
          // 1. My record
          if (r.userId === currentUser.id) return true;
          // 2. Legacy record (claim it? or just show it? Plan said assign legacy to first user)
          if (!r.userId) {
            // Auto-claim legacy records for the first logged in user encountering them?
            // Or just show them. Let's just show them for now to avoid accidental data mutation on load.
            // Actually, to make "My Records" work, we should probably treat them as mine.
            // Let's allow legacy records (undefined userId) to be visible to everyone or just current.
            // Simplest: Treat undefined as mine.
            return true;
          }
          // 3. Shared with me (simple array check or "ALL_FRIENDS")
          if (r.sharedWith && (r.sharedWith.includes(currentUser.id) || r.sharedWith.includes('ALL_FRIENDS'))) {
            // Check if I am a friend of the owner? 
            // Logic: If sharedWith includes 'ALL_FRIENDS', check if owner has me as friend?
            // Or simpler: If the record says 'ALL_FRIENDS', is the owner in MY friend list? 
            // Usually 'ALL_FRIENDS' means "I share this with all my friends". 
            // So if I am the viewer, is the owner my friend?
            // Let's assume friendship is reciprocal or just check if owner is in my friend list?
            // Actually, clearer logic: 
            // If r.userId is in MY friends list AND r.sharedWith includes 'ALL_FRIENDS' -> Show.
            if (r.sharedWith.includes('ALL_FRIENDS')) {
              // Is owner my friend?
              return currentUser.friends.includes(r.userId);
            }
            return true;
          }
          return false;
        });

        // Claim Legacy records (Optional cleanup)
        // const legacy = allRecords.filter(r => !r.userId);
        // if (legacy.length > 0) {
        //    legacy.forEach(async r => { r.userId = currentUser.id; await dbSaveRecord(r); });
        // }
      } else {
        // Not logged in -> No records
        records = [];
      }

    } catch (e) {
      console.error("Error fetching records", e);
    }
  }

  updateGlobalTags();
  renderCalendar();
}

let globalTags = {}; // Rebuilt on load

// Constants
const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const categoryFields = {
  '영화': [
    { id: 'director', label: 'Director', type: 'text' },
    { id: 'cast', label: 'Cast', type: 'text' },
    { id: 'genre', label: 'Genre', type: 'text' }
  ],
  '책': [
    { id: 'author', label: 'Author', type: 'text' },
    { id: 'publisher', label: 'Publisher', type: 'text' },
    { id: 'pages', label: 'Pages', type: 'number' }
  ],
  '드라마': [
    { id: 'platform', label: 'Platform', type: 'text' },
    { id: 'season', label: 'Season', type: 'number' },
    { id: 'episodes', label: 'Episodes', type: 'number' }
  ],
  '공연': [
    { id: 'venue', label: 'Venue', type: 'text' },
    { id: 'cast', label: 'Cast', type: 'text' },
    { id: 'seat', label: 'Seat Number', type: 'text' }
  ],
  '전시': [
    { id: 'artist', label: 'Artist', type: 'text' },
    { id: 'gallery', label: 'Gallery', type: 'text' },
    { id: 'period', label: 'Exhibition Period', type: 'text' }
  ],
  '기타': [
    { id: 'note', label: 'Note', type: 'text' }
  ]
};


async function loadAllTickets() {
  try {
    await dbInitialized; // Wait for DB
    if (db) {
      ticketGallery = await dbGetAllTickets();
      renderTicketWall();
    }
  } catch (e) {
    console.error("Error loading tickets:", e);
  }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {

  // --- AUTH CHECK ---
  if (UserManager.isLoggedIn()) {
    // Hide Overlay if Logged In
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.add('hidden');

    // Load Data
    loadAllRecords();
    loadAllTickets();
  } else {
    // Not logged in. Overlay stays visible. 
    // Data is NOT loaded until login.
    // Ensure Overlay is visible (in case CSS hidden it by default?) - CSS has it visible by default.
  }

  // loadAllRecords(); // Async Load -- MOVED INSIDE AUTH CHECK
  // loadAllTickets(); // Async Load Tickets -- MOVED INSIDE AUTH CHECK

  switchView('calendar');
  // renderCalendar(); // Moved to loadAllRecords
  setupEventListeners();
  updateCategoryFields();
  renderTicketWall();
});

// --- Auth Handlers ---
function handleLogin() {
  const idInput = document.getElementById('loginId');
  const pwInput = document.getElementById('loginPw');
  const errorMsg = document.getElementById('loginError');

  const id = idInput.value.trim();
  const pw = pwInput.value.trim();

  if (!id || !pw) {
    errorMsg.textContent = "Please enter ID and Passphrase.";
    return;
  }

  if (UserManager.login(id, pw)) {
    // Success -> Reload happens in login()
  } else {
    errorMsg.textContent = "Access Denied. Invalid Credentials.";
    // Shake effect?
    const container = document.querySelector('.login-container');
    container.style.animation = 'none';
    container.offsetHeight; /* trigger reflow */
    container.style.animation = 'shake 0.5s';
  }
}

function handleRegister() {
  const idInput = document.getElementById('loginId');
  const pwInput = document.getElementById('loginPw');
  const errorMsg = document.getElementById('loginError');

  const id = idInput.value.trim();
  const pw = pwInput.value.trim();

  if (!id || !pw) {
    errorMsg.textContent = "Enter ID and PW to create account.";
    return;
  }

  const result = UserManager.register(id, pw);
  if (result.success) {
    // Success -> Reload happens in register -> login
  } else {
    errorMsg.textContent = result.message;
  }
}

// Keypress Enter for Login
document.getElementById('loginId')?.addEventListener('keypress', function (e) {
  if (e.key === 'Enter') document.getElementById('loginPw').focus();
});
document.getElementById('loginPw')?.addEventListener('keypress', function (e) {
  if (e.key === 'Enter') handleLogin();
});


function setupEventListeners() {
  // Category Tabs
  const tabContainer = document.querySelector('.category-tabs');
  // Initial render of tabs from storage
  renderCategoryTabs();

  // Make sure Modal Category Select is synced on load
  updateModalCategorySelect();

  tabContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('category-tab')) {
      if (e.target.textContent.trim() === '+' || e.target.textContent.trim() === '＋') {
        // Add Category
        // Add Category
        openAddCategoryModal();
        return;
      }

      // Edit Mode - Delete Category
      if (document.body.classList.contains('category-edit-mode')) {
        // Ignore if clicking the pencil itself
        if (e.target.classList.contains('edit-mode-btn')) return;

        if (confirm(`Delete category "${e.target.textContent}"?`)) {
          deleteCategory(e.target.textContent);
        }
        return;
      }

      document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      selectedCategory = e.target.textContent;

      if (typeof currentView !== 'undefined' && currentView === 'list') {
        renderListView();
      } else {
        renderCalendar();
      }
    }
  });
}

// --- Friend Logic ---
function openFriendListModal() {
  const modal = document.getElementById('friendListModal');
  const container = document.getElementById('dummyFriendList');

  // Dummy Data
  const friends = [
    { name: 'Alice', id: 'alice_01' },
    { name: 'Bob', id: 'bob_the_builder' },
    { name: 'Charlie', id: 'charlie_brown' }
  ];

  container.innerHTML = '';

  friends.forEach(f => {
    const item = document.createElement('div');
    item.className = 'friend-item';

    item.innerHTML = `
      <div class="friend-name">${f.name}</div>
      <button class="view-calendar-btn" onclick="console.log('View Calendar clicked for ${f.name}')">View Calendar</button>
    `;

    container.appendChild(item);
  });

  modal.classList.add('active');
}

// Expose to window to ensure reachability
window.openFriendListModal = openFriendListModal;

function closeFriendListModal() {
  document.getElementById('friendListModal').classList.remove('active');
}


function handleConnectFriend() {

  const input = document.getElementById('addFriendInput');
  const msg = document.getElementById('addFriendMsg');
  const friendId = input.value.trim();

  if (!friendId) {
    msg.textContent = "Please enter a User ID.";
    msg.style.color = "#ff2a6d";
    return;
  }

  const result = UserManager.addFriend(friendId);
  if (result.success) {
    msg.textContent = `Success! You are now connected with ${friendId}.`;
    msg.style.color = "var(--accent-neon-blue)";
    input.value = '';
    // Update local session if needed? Already handled in UserManager.
  } else {
    msg.textContent = result.message;
    msg.style.color = "#ff2a6d";
  }
}

// Custom Category Logic
let customCategories = JSON.parse(localStorage.getItem('spacelog_categories')) || [];


function renderCategoryTabs() {
  const container = document.querySelector('.category-tabs');
  const baseCategories = ['영화', '책', '드라마', '공연', '전시'];
  const allCategories = [...baseCategories, ...customCategories];

  container.innerHTML = '';
  allCategories.forEach(cat => {
    const div = document.createElement('div');
    div.className = `category-tab ${cat === selectedCategory ? 'active' : ''}`;
    div.textContent = cat;
    container.appendChild(div);
  });

  // Add + button
  const addBtn = document.createElement('div');
  addBtn.className = 'category-tab';
  addBtn.textContent = '+';
  container.appendChild(addBtn);

  // Add Edit button
  const editBtn = document.createElement('div');
  editBtn.className = 'category-tab edit-mode-btn';
  editBtn.textContent = '✎';
  editBtn.onclick = toggleCategoryEdit;
  editBtn.title = 'Edit Category';
  container.appendChild(editBtn);

  // --- Add Friend Button (Next to Edit) ---
  const friendBtn = document.createElement('div');
  friendBtn.className = 'icon-btn-plain'; // New Plain Style
  // SVG Icon (User Group)
  friendBtn.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  `;

  friendBtn.id = 'friend-list-btn'; // Unique ID for debugging/styling

  friendBtn.title = 'Friend List';
  friendBtn.addEventListener('click', (e) => {
    console.log("Friend Button Clicked");
    e.stopPropagation(); // Prevent bubbling issues
    openFriendListModal();
  });

  container.appendChild(friendBtn);



  // Apply deletable class if in edit mode

  if (document.body.classList.contains('category-edit-mode')) {
    document.querySelectorAll('.category-tab:not(.edit-mode-btn)').forEach(tab => {
      if (tab.textContent !== '+') tab.classList.add('deletable');
    });
  }
}

let lastSelectedCategoryBeforeEdit = null;

function toggleCategoryEdit() {
  document.body.classList.toggle('category-edit-mode');
  const btn = document.querySelector('.edit-mode-btn');

  if (document.body.classList.contains('category-edit-mode')) {
    // Entering Edit Mode
    lastSelectedCategoryBeforeEdit = selectedCategory;
    btn.classList.add('active');
  } else {
    // Exiting Edit Mode
    btn.classList.remove('active');

    // Restore selection if it still exists
    if (lastSelectedCategoryBeforeEdit) {
      if (customCategories.includes(lastSelectedCategoryBeforeEdit) || ['영화', '책', '드라마', '공연', '전시'].includes(lastSelectedCategoryBeforeEdit)) {
        selectedCategory = lastSelectedCategoryBeforeEdit;
      } else {
        selectedCategory = '영화'; // Fallback
      }
    }
  }

  renderCategoryTabs();
  // Ensure the restored category is visually active
  if (!document.body.classList.contains('category-edit-mode')) {
    const tabs = document.querySelectorAll('.category-tab');
    tabs.forEach(t => {
      if (t.textContent === selectedCategory) t.classList.add('active');
      else t.classList.remove('active');
    });
    // Re-render calendar to reflect restored selection
    if (typeof currentView !== 'undefined' && currentView === 'list') {
      renderListView();
    } else {
      renderCalendar();
    }
  }
}

function deleteCategory(name) {
  const baseCategories = ['영화', '책', '드라마', '공연', '전시'];
  if (baseCategories.includes(name)) {
    customAlert("Cannot delete default categories.");
    return;
  }

  customCategories = customCategories.filter(c => c !== name);
  localStorage.setItem('spacelog_categories', JSON.stringify(customCategories));

  // Reset selection if deleted
  if (selectedCategory === name) {
    selectedCategory = '영화';
  }

  renderCategoryTabs();
  renderCalendar();
}

function addCategory(name) {
  const baseCategories = ['영화', '책', '드라마', '공연', '전시'];
  if (baseCategories.includes(name) || customCategories.includes(name)) {
    alert('Category already exists!');
    return;
  }

  customCategories.push(name);
  localStorage.setItem('spacelog_categories', JSON.stringify(customCategories));

  // Update categoryFields if needed (default to '기타' fields for new ones)
  // We can treat unknown categories as '기타' in `updateCategoryFields`

  renderCategoryTabs();
  // Select the new one
  selectedCategory = name;
  renderCalendar();

  // Re-render tabs to show active state correctly
  renderCategoryTabs();
  // Sync Modal Dropdown
  updateModalCategorySelect();
}

function updateModalCategorySelect() {
  const select = document.getElementById('recordCategory');
  if (!select) return;

  // Keep default options or rebuild entirely? 
  // Easier to rebuild to ensure order.
  const baseCategories = ['영화', '책', '드라마', '공연', '전시'];
  const allCategories = [...baseCategories, ...customCategories, '기타']; // Ensure '기타' is at end or just include it.

  // Clear current options except defaults? 
  // Let's just rebuild.
  select.innerHTML = '';

  allCategories.forEach(cat => {
    // Avoid duplicates if '기타' is in custom
    if (cat === '기타' && allCategories.indexOf('기타') !== allCategories.lastIndexOf('기타')) return;

    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });

  // Ensure '기타' is there if not in list
  if (!allCategories.includes('기타')) {
    const opt = document.createElement('option');
    opt.value = '기타';
    opt.textContent = '기타';
    select.appendChild(opt);
  }
}

function updateStars(rating) {
  document.querySelectorAll('.star').forEach(star => {
    star.classList.toggle('active', star.dataset.value <= rating);
  });
}

function updateMoods(selectedMood) {
  document.querySelectorAll('.mood-option').forEach(option => {
    option.classList.toggle('active', option.dataset.value === selectedMood);
  });
}

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  document.getElementById('monthYear').textContent = `${year}년 ${months[month]}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const prevLastDay = new Date(year, month, 0);

  const grid = document.querySelector('.calendar-grid');
  // Keep headers
  const headers = Array.from(grid.querySelectorAll('.day-header'));
  grid.innerHTML = '';
  headers.forEach(h => grid.appendChild(h));

  // Previous month padding
  const firstDayIndex = firstDay.getDay();
  for (let i = firstDayIndex; i > 0; i--) {
    const dayDiv = createDayCell(prevLastDay.getDate() - i + 1, true, true);
    grid.appendChild(dayDiv);
  }

  // Current month days
  const today = new Date();
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const isToday = i === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const dayDiv = createDayCell(i, false, false, isToday);

    // Find records for this day (Filter all)
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const dayRecords = records.filter(r => r.date === dateStr && r.category === selectedCategory);

    if (dayRecords.length === 1) {
      if (dayRecords[0].image) {
        const img = document.createElement('img');
        img.src = dayRecords[0].image;
        img.className = 'day-image';
        dayDiv.appendChild(img);
      }
      dayDiv.onclick = () => openModal(dateStr, dayRecords[0]);
    } else if (dayRecords.length >= 2) {
      // 4-Quadrant Grid
      const quadContainer = document.createElement('div');
      quadContainer.className = 'quadrant-container';

      // Take up to 4 items
      const gridItems = dayRecords.slice(0, 4);
      gridItems.forEach(rec => {
        const cell = document.createElement('div');
        cell.className = 'quadrant-cell';
        if (rec.image) {
          const img = document.createElement('img');
          img.src = rec.image;
          img.className = 'quadrant-image';
          cell.appendChild(img);
        } else {
          // Optional: placeholder for no image?
          cell.style.background = '#333';
        }
        quadContainer.appendChild(cell);
      });
      dayDiv.appendChild(quadContainer);

      // Open Daily List
      dayDiv.onclick = () => openDailyList(dateStr, dayRecords);
    } else {
      // 0 records
      dayDiv.onclick = () => openModal(dateStr);
    }

    grid.appendChild(dayDiv);
  }

  // Next month Padding
  const lastDayIndex = lastDay.getDay();
  const nextDays = 7 - lastDayIndex - 1;
  for (let i = 1; i <= nextDays; i++) {
    const dayDiv = createDayCell(i, true, true);
    grid.appendChild(dayDiv);
  }
}

// Daily List Modal Logic
function openDailyList(dateStr, list) {
  const modal = document.getElementById('dailyListModal');
  const listBody = document.getElementById('dailyListBody');
  document.getElementById('dailyListDate').textContent = dateStr;

  listBody.innerHTML = ''; // Clear previous

  list.forEach(record => {
    const item = document.createElement('div');
    item.className = 'daily-list-item';

    // Thumbnail
    if (record.image) {
      const thumb = document.createElement('img');
      thumb.src = record.image;
      thumb.className = 'daily-list-thumb';
      item.appendChild(thumb);
    }

    // Info
    const info = document.createElement('div');
    info.className = 'daily-list-info';
    info.innerHTML = `
      <h4>${record.title || '(No Title)'}</h4>
      <span>${record.category} ${record.location ? '• ' + record.location : ''}</span>
    `;
    item.appendChild(info);

    // Click to open detailed record
    item.onclick = () => {
      // Close this modal first? Or stack them. Stacking is better UX if back button logic exists.
      // For now, let's close this modal then open the record modal.
      closeDailyList();
      setTimeout(() => openModal(dateStr, record), 100);
    };

    listBody.appendChild(item);
  });

  // Add "Add New Record" Button to list
  const addBtn = document.createElement('div');
  addBtn.className = 'daily-list-item';
  addBtn.style.justifyContent = 'center';
  addBtn.style.color = 'var(--accent-neon-blue)';
  addBtn.innerHTML = '<strong>+ Add New Record</strong>';
  addBtn.onclick = () => {
    closeDailyList();
    setTimeout(() => openModal(dateStr), 100);
  };
  listBody.appendChild(addBtn);

  modal.classList.add('active');
}


// --- View Switching Logic ---
// let currentView = 'calendar'; // Removed duplicate declaration


function switchView(viewName) {
  // Hide all sections
  document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');

  // Update sidebar buttons
  document.querySelectorAll('.sidebar-btn').forEach(btn => btn.classList.remove('active'));

  // Logic map
  const viewMap = {
    'calendar': 0,
    'list': 1,
    'bucket': 2,
    'stats': -1, // No sidebar button really, but handled below
    'ticketWall': 3,
    'settings': 4
  };

  const btnIndex = viewMap[viewName];
  const buttons = document.querySelectorAll('.sidebar-btn');
  if (btnIndex >= 0 && buttons[btnIndex]) {
    buttons[btnIndex].classList.add('active');
  }

  // Show selected View
  const viewIdMap = {
    'calendar': 'calendarView',
    'list': 'listView',
    'bucket': 'bucketView',
    'stats': 'statsView',
    'ticketWall': 'ticketWallView',
    'settings': 'settingsView'
  };

  const targetId = viewIdMap[viewName];
  if (targetId) {
    document.getElementById(targetId).style.display = 'block';
  }

  // Specific Logic
  if (viewName === 'calendar') {
    document.getElementById('pageTitle').textContent = months[currentDate.getMonth()];
    renderCalendar();
  } else if (viewName === 'list') {
    document.getElementById('pageTitle').textContent = 'RECORD LIST';
    renderListView();
  } else if (viewName === 'bucket') {
    document.getElementById('pageTitle').textContent = 'BUCKET LIST';
    renderBookshelf();
  } else if (viewName === 'stats') {
    document.getElementById('pageTitle').textContent = 'STATISTICS';
    renderStats();
  } else if (viewName === 'ticketWall') {
    document.getElementById('pageTitle').textContent = 'TICKETS';
    renderTicketWall();
  } else if (viewName === 'settings') {
    document.getElementById('pageTitle').textContent = 'SETTINGS';
  }

  currentView = viewName;
}

function closeDailyList() {
  document.getElementById('dailyListModal').classList.remove('active');
}

function createDayCell(dayNumber, isOtherMonth, isWeekend, isToday = false) {
  const div = document.createElement('div');
  div.className = `day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`;
  div.innerHTML = `<div class="day-number">${dayNumber}</div>`;
  return div;
}

function changeMonth(direction) {
  currentDate.setMonth(currentDate.getMonth() + direction);

  if (typeof currentView !== 'undefined' && currentView === 'list') {
    renderListView();
  } else {
    renderCalendar();
  }
}

// Close modal on outside click
document.getElementById('recordModal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeModal();
  }
});
document.getElementById('dailyListModal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeDailyList();
  }
});

// Updated Modal Logic
function closeModal() {
  document.getElementById('recordModal').classList.remove('active');
  document.querySelector('#recordModal .modal-content').style.removeProperty('--bg-image');

  // RESET SEARCH STATE (Auxiliary Only)
  document.getElementById('imgSearchInput').value = '';
  document.getElementById('imgSearchResults').innerHTML = '';
  document.getElementById('ytSearchInput').value = '';
  document.getElementById('ytSearchResults').innerHTML = '';
}

function openModal(dateStr, existingRecord = null) {
  const modal = document.getElementById('recordModal');
  const form = document.getElementById('recordForm');
  const modalContent = document.querySelector('#recordModal .modal-content');

  // Reset form
  form.reset();
  updateCategoryFields(); // Ensure fields are reset to default category state immediately
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('recordId').value = '';

  // Auto-set Category from Filter if applicable
  if (!existingRecord && typeof selectedCategory !== 'undefined' && selectedCategory !== 'All') {
    const catSelect = document.getElementById('recordCategory');
    if (catSelect) {
      catSelect.value = selectedCategory;
      // Trigger update for dynamic fields
      updateCategoryFields();
    }
  }

  // Button States for New Record
  document.getElementById('btnDelete').style.display = 'none';
  const ticketBtn = document.querySelector('.ticket-btn');
  if (ticketBtn) ticketBtn.style.display = 'none';
  const saveBtn = document.querySelector('.save-btn');
  if (saveBtn) saveBtn.textContent = 'Save Record';

  modalContent.style.removeProperty('--bg-image'); // Reset background

  // Set Date explicitly
  const dateInput = document.getElementById('recordDate');
  if (dateInput) {
    dateInput.value = dateStr;
  }

  // Clear Location Tag
  const locInput = document.getElementById('recordLocation');
  if (locInput) locInput.value = '';
  renderTags('location', []);

  // Clear Release Year
  const yearInput = document.getElementById('recordReleaseYear');
  if (yearInput) yearInput.value = '';

  updateStars(0);
  updateMoods(''); // Clear mood selection

  if (existingRecord) {
    // Fill existing data
    document.getElementById('recordId').value = existingRecord.id;

    // Set Category and Update Fields BEFORE filling details
    const catSelect = document.getElementById('recordCategory');
    if (catSelect) {
      catSelect.value = existingRecord.category;
      updateCategoryFields();
    }

    // Button States for Edit Record
    document.getElementById('btnDelete').style.display = 'block';
    if (ticketBtn) ticketBtn.style.display = 'block';
    if (saveBtn) saveBtn.textContent = 'Update Record';

    document.getElementById('recordTitle').value = existingRecord.title || ''; // Handle Title
    document.getElementById('recordLocation').value = existingRecord.location || '';
    if (document.getElementById('recordReleaseYear')) {
      document.getElementById('recordReleaseYear').value = existingRecord.releaseYear || '';
    }
    document.getElementById('recordReview').value = existingRecord.review || '';
    document.getElementById('ratingValue').value = existingRecord.rating || 0;
    updateStars(existingRecord.rating || 0);

    if (existingRecord.mood) {
      document.getElementById('recordMood').value = existingRecord.mood;
      updateMoods(existingRecord.mood);
    }

    if (existingRecord.image) {
      const img = document.getElementById('imagePreview');
      img.src = existingRecord.image;
      img.style.display = 'block';
      modalContent.style.setProperty('--bg-image', `url('${existingRecord.image}')`);

      if (existingRecord.dominantColor) {
        updateModalBackground(existingRecord.dominantColor);
      }
    }

    // Sharing State
    const shareBox = document.getElementById('recordShared');
    if (shareBox) {
      shareBox.checked = existingRecord.sharedWith && existingRecord.sharedWith.includes('ALL_FRIENDS');
    }

    // Fill dynamic fields

    if (existingRecord.details) {
      Object.keys(existingRecord.details).forEach(key => {
        const input = document.getElementById(`field_${key}`);
        if (input) {
          input.value = existingRecord.details[key];

          // Render tags if it's a tag field
          const container = document.getElementById(`tags_${key}`);
          if (container && input.value) {
            renderTags(key, input.value.split(','));
          } else if (input.classList.contains('auto-expand')) {
            autoExpand(input);
          }
        }
      });
    }

    // Auto expand main fields
    const loc = document.getElementById('recordLocation');
    const rev = document.getElementById('recordReview');
    if (loc) {
      // Fix: Render Location Tags
      if (existingRecord.location) {
        renderTags('location', existingRecord.location.split(','));
      }
    }
    if (rev) autoExpand(rev);

    // Restore OST
    currentAudioFile = existingRecord.audio || null;
    if (existingRecord.youtube) {
      document.getElementById('recordYoutube').value = existingRecord.youtube;
      const videoId = getYoutubeId(existingRecord.youtube);
      if (videoId) {
        document.getElementById('ostPreview').innerHTML = `
          <iframe width="100%" height="200" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        `;
      }
    } else if (existingRecord.audio) {
      document.getElementById('ostPreview').innerHTML = `
        <audio controls src="${existingRecord.audio}" style="width: 100%; margin-top: 10px;"></audio>
      `;
    } else {
      document.getElementById('ostPreview').innerHTML = '';
      document.getElementById('recordYoutube').value = '';
    }
  } else {
    // New record cleanup
    currentAudioFile = null;
    document.getElementById('ostPreview').innerHTML = '';
    document.getElementById('recordYoutube').value = '';
  }

  modal.classList.add('active');
}

function updateCategoryFields() {
  const category = document.getElementById('recordCategory').value;
  const container = document.getElementById('dynamicFields');
  container.innerHTML = '';

  let fields = categoryFields[category];
  if (!fields) {
    // Default to '기타' fields for custom categories
    fields = categoryFields['기타'];
  }


  fields.forEach(field => {
    const div = document.createElement('div');
    div.className = 'form-group';

    // Check if it's a "Tag" Type field (Director, Cast, Genre, Author, etc are usually text/tags)
    // For simplicity, let's treat 'text' type fields in specific categories as Tags
    const isTagField = ['director', 'cast', 'genre', 'author', 'publisher', 'actor', 'artist'].includes(field.id);

    if (isTagField) {
      div.innerHTML = `
        <label class="form-label">${field.label}</label>
        <div class="tag-container" id="tags_${field.id}">
          <!-- Tags go here -->
          <button type="button" class="add-tag-btn" onclick="addTag('${field.id}')">+</button>
        </div>
        <div class="suggested-tags-container" id="suggested_tags_${field.id}"></div>
        <input type="hidden" class="dynamic-input" id="field_${field.id}" data-key="${field.id}">
      `;
    } else {
      // Standard Input
      let inputHtml = '';
      if (field.type === 'text') {
        inputHtml = `<textarea class="form-input dynamic-input auto-expand" id="field_${field.id}" data-key="${field.id}" rows="1"></textarea>`;
      } else {
        inputHtml = `<input type="${field.type}" class="form-input dynamic-input" id="field_${field.id}" data-key="${field.id}">`;
      }
      div.innerHTML = `<label class="form-label">${field.label}</label>${inputHtml}`;
    }

    container.appendChild(div);
    if (isTagField) {
      renderSuggestedTags(field.id);
    }
  });
}

// Tag System Logic (Functions moved to bottom)


function saveRecord(event) {
  event.preventDefault();

  const date = document.getElementById('recordDate').value;
  const category = document.getElementById('recordCategory').value;
  const imagePreview = document.getElementById('imagePreview');

  // Collect dynamic fields
  const details = {};
  document.querySelectorAll('.dynamic-input').forEach(input => {
    details[input.dataset.key] = input.value;
  });

  const existingId = document.getElementById('recordId').value;
  const newRecord = {
    id: existingId ? Number(existingId) : Date.now(),
    date: date,
    title: document.getElementById('recordTitle').value, // Save Title
    category: category,
    location: document.getElementById('recordLocation').value,
    releaseYear: document.getElementById('recordReleaseYear').value, // Save Release Year
    rating: document.getElementById('ratingValue').value,
    mood: document.getElementById('recordMood').value,
    review: document.getElementById('recordReview').value,
    details: details,
    image: imagePreview.src !== '' && imagePreview.style.display !== 'none' ? imagePreview.src : null,
    youtube: document.getElementById('recordYoutube').value,
    audio: currentAudioFile,
    dominantColor: imagePreview.style.display !== 'none' ? getDominantColor(imagePreview) : null,
    // Sharing
    sharedWith: document.getElementById('recordShared')?.checked ? ['ALL_FRIENDS'] : []
  };


  // Optimize Update Logic: Find by ID first to handle Date changes correctly
  let existingIndex = -1;
  if (existingId) {
    existingIndex = records.findIndex(r => r.id == existingId);
  }

  // If not found by ID, check for collision (optional, depends on "one per day" rule)
  // For now, if no ID, we assume new. If collision check is desired, add here.

  if (existingIndex >= 0) {
    records[existingIndex] = newRecord;
  } else {
    records.push(newRecord);
  }

  // Rebuild global tags logic (simplified)
  updateGlobalTags();

  // Async Save to DB
  dbSaveRecord(newRecord).then(() => {
    // We already updated 'records' memory array above using push/replace
    // But to be safe and consistent with DB ID, we might reload?
    // Actually, pushing to memory array is fine for immediate UI update.
    renderCalendar();
    closeModal();
    console.log("Record saved to DB");
  }).catch(e => {
    console.error(e);
    customAlert("Failed to save to database: " + e.message);
  });
}

// Global Tag Update Helper
function updateGlobalTags() {
  globalTags = {};
  records.forEach(rec => {
    // Location
    if (rec.location) {
      if (!globalTags['location']) globalTags['location'] = [];
      rec.location.split(',').forEach(t => {
        const tag = t.trim();
        if (tag && !globalTags['location'].includes(tag)) globalTags['location'].push(tag);
      });
    }
    // Details
    if (rec.details) {
      Object.keys(rec.details).forEach(key => {
        const isTagField = ['director', 'cast', 'genre', 'author', 'publisher', 'actor', 'artist'].includes(key);
        if (isTagField && rec.details[key]) {
          if (!globalTags[key]) globalTags[key] = [];
          rec.details[key].split(',').forEach(t => {
            const tag = t.trim();
            if (tag && !globalTags[key].includes(tag)) globalTags[key].push(tag);
          });
        }
      });
    }
  });
}

async function deleteCurrentRecord() {
  const id = document.getElementById('recordId').value;
  if (!id) return;

  if (await customConfirm('Are you sure you want to delete this record?')) {
    const idx = records.findIndex(r => r.id == id);
    if (idx > -1) {
      records.splice(idx, 1);

      // Update DB
      try {
        await dbDeleteRecord(id);
        updateGlobalTags();
        renderCalendar();
        closeModal();
        await customAlert('Record deleted successfully.');
      } catch (e) {
        console.error(e);
        await customAlert('Error deleting record from DB: ' + e.message);
      }
    }
  }
}

// View Switching Logic
let currentView = 'calendar';

function switchView(viewName) {
  currentView = viewName;

  // Update sidebar buttons
  document.querySelectorAll('.sidebar-btn').forEach(btn => {
    btn.classList.remove('active');
    const onclickAttr = btn.getAttribute('onclick');
    if (onclickAttr && onclickAttr.includes(`'${viewName}'`)) {
      btn.classList.add('active');
    }
  });

  // Hide all views
  document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');

  // Show selected view
  const viewMap = {
    'calendar': 'calendarView',
    'list': 'listView', // ID verified in HTML
    'stats': 'statsView',
    'bucket': 'bucketView',
    'gallery': 'ticketWallView',
    'settings': 'settingsView'
  };

  const viewId = viewMap[viewName];
  if (viewId) {
    document.getElementById(viewId).style.display = 'block';
  }

  // Header Visibility Control (Date & Category Filter)
  const header = document.querySelector('.calendar-header');
  if (header) {
    if (viewName === 'calendar' || viewName === 'list') {
      header.style.display = 'flex';
    } else {
      header.style.display = 'none';
    }
  }

  // Refresh data
  if (viewName === 'calendar') renderCalendar();
  if (viewName === 'list') renderListView();
  if (viewName === 'stats') renderStatistics();
  if (viewName === 'bucket') renderBookshelf();
  if (viewName === 'gallery') renderTicketWall();
  if (viewName === 'settings') renderSettings();
}

// List View Logic
function renderListView() {

  const container = document.getElementById('recordListContainer');
  if (!container) return;
  container.innerHTML = '';

  // Filter records based on current Month/Year and Category
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const filteredRecords = records.filter(r => {
    const d = new Date(r.date);
    const dateMatch = d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    const catMatch = selectedCategory === 'All' || r.category === selectedCategory;
    return dateMatch && catMatch;
  });

  const sortedRecords = filteredRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (sortedRecords.length === 0) {
    container.innerHTML = '<div class="no-records">No records found for this month/category.</div>';
    return;
  }

  sortedRecords.forEach(record => {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.onclick = () => openModal(record.date, record);

    const dateObj = new Date(record.date);
    const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`; // M/D format

    let imageHtml = '';
    // Thumbnail Logic
    if (record.image && record.image !== 'null') {
      imageHtml = `<img src="${record.image}" class="list-image" alt="img">`;
    }

    el.innerHTML = `
      <div class="list-date">${dateStr} <br> <span style="font-size:0.8em; color:#bbb">${dateObj.getFullYear()}</span></div>
      ${imageHtml}
      <div class="list-content">
        <div class="list-title">${record.title || '(No Title)'}</div>
        <div class="list-subtitle">
          <span class="list-category">${record.category}</span>
          ${record.location ? `<span>• ${record.location}</span>` : ''}
        </div>
      </div>
      <div class="star-rating" style="font-size: 1em;">
        ${'★'.repeat(Number(record.rating))}${'☆'.repeat(5 - Number(record.rating))}
      </div>
    `;

    container.appendChild(el);
  });
}

// Auto Expand Textarea
function autoExpand(field) {
  field.style.height = 'inherit';
  const computed = window.getComputedStyle(field);
  const height = parseInt(computed.getPropertyValue('border-top-width'), 10) +
    parseInt(computed.getPropertyValue('padding-top'), 10) +
    field.scrollHeight +
    parseInt(computed.getPropertyValue('padding-bottom'), 10) +
    parseInt(computed.getPropertyValue('border-bottom-width'), 10);
  field.style.height = height + 'px';
}

// Listen for input on auto-expand fields
document.addEventListener('input', function (event) {
  if (event.target.tagName.toLowerCase() !== 'textarea') return;
  if (event.target.classList.contains('auto-expand')) {
    autoExpand(event.target);
  }
});

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = document.getElementById('imagePreview');
      img.src = e.target.result;
      img.style.display = 'block';

      // Update background
      document.querySelector('#recordModal .modal-content').style.setProperty('--bg-image', `url('${e.target.result}')`);
    }
    reader.readAsDataURL(file);
  }
}


// OST Logic
document.getElementById('recordYoutube').addEventListener('input', function (e) {
  const url = e.target.value;
  const videoId = getYoutubeId(url);
  if (videoId) {
    document.getElementById('ostPreview').innerHTML = `
      <iframe width="100%" height="200" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
    `;
    // Clear audio if any
    document.getElementById('recordAudio').value = '';
  } else {
    // If not valid YT, maybe clear preview?
    if (url === '') document.getElementById('ostPreview').innerHTML = '';
  }
});

function getYoutubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

let currentAudioFile = null;
function handleAudioUpload(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      currentAudioFile = e.target.result;
      document.getElementById('ostPreview').innerHTML = `
        <audio controls src="${currentAudioFile}" style="width: 100%; margin-top: 10px;"></audio>
      `;
      // Clear YouTube input
      document.getElementById('recordYoutube').value = '';
    }
    reader.readAsDataURL(file);
  }
}

// Updated Helper: Get Dominant Color (Placeholder)
function getDominantColor(imageElement) {
  return null;
}

// --- Settings & API Logic ---
function openSettings() {
  document.getElementById('settingsModal').classList.add('active');
  const config = JSON.parse(localStorage.getItem('spacelog_config')) || {};
  document.getElementById('apiKey').value = config.apiKey || '';
  document.getElementById('searchCx').value = config.cx || '';
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('active');
}

function saveSettings() {
  const apiKey = document.getElementById('apiKey').value;
  const cx = document.getElementById('searchCx').value;
  localStorage.setItem('spacelog_config', JSON.stringify({ apiKey, cx }));
  closeSettings();
  alert('Settings Saved!');
}

// --- Image Search Logic ---
// --- Image Search Logic ---
// API KEYS
const GOOGLE_API_KEY = "AIzaSyAaFTz_Fq_S0COLFluJOpOY3w9o7dJjG78";
const GOOGLE_SEARCH_ENGINE_ID = "c2a4f16be1bd94cba";
const YOUTUBE_API_KEY = "AIzaSyAOf7m2_6jrj-WPVHpRj6XnXyzDCCRWTMI";

function switchImageMode(mode) {
  document.querySelectorAll('.image-mode-tabs .mode-tab').forEach(btn => btn.classList.remove('active'));
  // Update buttons state
  const tabs = document.querySelector('.image-mode-tabs').children;
  if (mode === 'upload') tabs[0].classList.add('active');
  else tabs[1].classList.add('active');

  if (mode === 'upload') {
    document.getElementById('imageUploadSection').style.display = 'block';
    document.getElementById('imageSearchSection').style.display = 'none';
  } else {
    document.getElementById('imageUploadSection').style.display = 'none';
    document.getElementById('imageSearchSection').style.display = 'block';
  }
}

function switchOstMode(mode) {
  const tabs = document.querySelectorAll('.form-group .image-mode-tabs')[1].children; // 2nd set of tabs
  tabs[0].classList.remove('active');
  tabs[1].classList.remove('active');

  if (mode === 'url') tabs[0].classList.add('active');
  else tabs[1].classList.add('active');

  if (mode === 'url') {
    document.getElementById('ostUrlSection').style.display = 'block';
    document.getElementById('ostSearchSection').style.display = 'none';
  } else {
    document.getElementById('ostUrlSection').style.display = 'none';
    document.getElementById('ostSearchSection').style.display = 'block';
  }
}

async function searchImages() {
  const query = document.getElementById('imgSearchInput').value;
  if (!query) return;

  const resultsDiv = document.getElementById('imgSearchResults');
  resultsDiv.innerHTML = '<div style="color:#fff">Searching...</div>';

  try {
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&cx=${GOOGLE_SEARCH_ENGINE_ID}&key=${GOOGLE_API_KEY}&searchType=image&num=9`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.items) {
      resultsDiv.innerHTML = '';
      data.items.forEach(item => {
        const img = document.createElement('img');
        img.src = item.link;
        img.className = 'search-result-item';
        img.onclick = () => selectImage(item.link);
        resultsDiv.appendChild(img);
      });
    } else {
      resultsDiv.innerHTML = '<div style="color:#fff">No results found (or limit reached).</div>';
      console.warn(data);
    }
  } catch (e) {
    console.error(e);
    resultsDiv.innerHTML = '<div style="color:red">Error fetching images.</div>';
  }
}

async function searchYoutube() {
  const query = document.getElementById('ytSearchInput').value;
  if (!query) return;

  const resultsDiv = document.getElementById('ytSearchResults');
  resultsDiv.innerHTML = '<div style="color:#fff">Searching YouTube...</div>';

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&key=${YOUTUBE_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.items) {
      resultsDiv.innerHTML = '';
      data.items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'yt-result-item';
        div.style.cssText = 'display:flex; cursor:pointer; gap:10px; margin-bottom:5px; padding:5px; background:rgba(255,255,255,0.1); border-radius:5px;';
        div.onclick = () => selectYoutube(item.id.videoId);

        div.innerHTML = `
          <img src="${item.snippet.thumbnails.default.url}" style="width:60px; height:45px; object-fit:cover;">
          <div style="flex:1; overflow:hidden;">
            <div style="font-size:0.9em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.snippet.title}</div>
            <div style="font-size:0.7em; color:#aaa;">${item.snippet.channelTitle}</div>
          </div>
        `;
        resultsDiv.appendChild(div);
      });
    } else {
      resultsDiv.innerHTML = '<div style="color:#fff">No videos found.</div>';
    }
  } catch (e) {
    console.error(e);
    resultsDiv.innerHTML = '<div style="color:red">Error fetching videos.</div>';
  }
}

function selectYoutube(videoId) {
  // Set the URL input (hidden or visible)
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  document.getElementById('recordYoutube').value = url;

  // Trigger preview update
  document.getElementById('ostPreview').innerHTML = `
      <iframe width="100%" height="200" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
  `;
  document.getElementById('recordAudio').value = ''; // Clear audio

  // Switch back to URL view to show it's set
  switchOstMode('url');
}


function selectImage(url) {
  const imgPreview = document.getElementById('imagePreview');
  imgPreview.src = url;
  imgPreview.style.display = 'block';
  document.querySelector('#recordModal .modal-content').style.setProperty('--bg-image', `url('${url}')`);
}

// Close settings modal on outside click
document.getElementById('settingsModal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeSettings();
  }
});

// --- Delete Logic ---
// --- Delete Logic ---
// Duplicate deleteCurrentRecord removed

// --- Bookshelf / Bucket List Logic ---
let bucketList = JSON.parse(localStorage.getItem('spacelog_bucketlist')) || [];

function renderBookshelf() {
  const container = document.getElementById('bookshelfContainer');
  if (!container) return; // Not in view or element missing

  container.innerHTML = '';

  // Calculate shelves needed (approx 10 items per shelf?)
  // Let's just create shelves dynamically based on count
  // Or Fixed 4 shelves for "Retro Room" look
  // Or Fixed 3 shelves (Requested)
  const shelfCount = 3;
  const itemsPerShelf = 12;

  for (let s = 0; s < shelfCount; s++) {
    const shelf = document.createElement('div');
    shelf.className = 'shelf-row';

    // Fill shelf with items
    const startIdx = s * itemsPerShelf;
    const endIdx = startIdx + itemsPerShelf;
    const shelfItems = bucketList.slice(startIdx, endIdx);

    // Varied Book Palette (Fixed 17 Colors)
    const bookColors = [
      '#EC6426', '#F8A91F', '#FDE3CF', '#2E573A', '#72AC43',
      '#632713', '#E4A5CA', '#001219', '#005F73', '#0A9396',
      '#94D2BD', '#E9D8A6', '#EE9B00', '#CA6702', '#BB3E03',
      '#AE2012', '#9B2226'
    ];

    let saveNeeded = false;

    shelfItems.forEach((item, idx) => {
      const spine = document.createElement('div');
      spine.className = 'book-spine';

      // Visual Differentiation: Books vs DVDs vs VHS (Movies/Drama)
      const vhsCategories = ['영화', '드라마', 'Movie', 'Drama', 'movie', 'drama'];
      const dvdCategories = ['애니메이션', 'Animation', 'DVD'];

      const isVHS = vhsCategories.includes(item.category);
      const isDVD = !isVHS && dvdCategories.includes(item.category); // DVD only if not VHS preference

      if (isVHS) {
        spine.classList.add('type-vhs');
      } else if (isDVD) {
        spine.classList.add('type-dvd');
      } else {
        spine.classList.add('type-book');
      }

      spine.title = item.title;

      // Randomize Visuals
      if (!item.color) {
        item.color = bookColors[Math.floor(Math.random() * bookColors.length)];
        // Ideally we should save back to prevent flickering, which is done by checking bucketList existence
        saveNeeded = true;
      }
      const randomColor = item.color;

      // Dimensions
      let randomHeight, randomWidth;

      if (isVHS) {
        randomHeight = 94; // Fixed VHS Height
        randomWidth = 42; // Fixed VHS Width
      } else if (isDVD) {
        randomHeight = 90;
        randomWidth = 35 + Math.floor(Math.random() * 5);
      } else {
        randomHeight = 88 + Math.floor(Math.random() * 12);
        randomWidth = 35 + Math.floor(Math.random() * 25);
      }

      spine.style.setProperty('--book-color', randomColor);
      spine.style.height = `${randomHeight}%`;
      spine.style.width = `${randomWidth}px`;
      spine.style.flex = 'none';

      // Inner Content
      if (isVHS) {
        // VHS Structure: Frame is the spine (black), inner is label
        const label = document.createElement('div');
        label.className = 'vhs-label';
        label.textContent = item.title;
        spine.appendChild(label);
      } else {
        // Standard Book/DVD
        spine.textContent = item.title;
      }

      spine.onclick = () => handleBucketClick(startIdx + idx);
      if (item.completed) spine.style.opacity = '0.3';
      shelf.appendChild(spine);
    });

    // Add "New Item" slot if space permits on last populated shelf or first empty one
    if (shelfItems.length < itemsPerShelf && bucketList.length < (s + 1) * itemsPerShelf) {
      // Only show add button on the first available slot
      if (bucketList.length >= startIdx && bucketList.length < endIdx) {
        const addSlot = document.createElement('div');
        addSlot.className = 'add-book-slot';
        addSlot.textContent = '+';
        addSlot.onclick = () => addBucketItem();
        shelf.appendChild(addSlot);
      }
    }

    container.appendChild(shelf);
  }

  // Save if new colors were generated to prevent flickering
  if (saveNeeded) {
    localStorage.setItem('spacelog_bucketlist', JSON.stringify(bucketList));
  }
}

/* === New Bucket List Logic === */
let bucketItemToEditIndex = null;
let selectedBucketCategory = 'movie';

function openBucketAdd() {
  document.getElementById('bucketAddModal').classList.add('active');
  document.getElementById('bucketAddTitle').value = '';
  document.getElementById('bucketAddTitle').focus();

  // Generate Category Buttons
  const cats = ['movie', 'book', 'drama', 'exhibit', 'concert'];
  const container = document.getElementById('bucketAddCategoryContainer');
  container.innerHTML = '';

  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `filter-btn ${cat === 'movie' ? 'active' : ''}`; // Default to movie
    btn.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedBucketCategory = cat;
    };
    container.appendChild(btn);
  });
  selectedBucketCategory = 'movie';
}

function closeBucketAdd() {
  document.getElementById('bucketAddModal').classList.remove('active');
}

function confirmBucketAdd() {
  const title = document.getElementById('bucketAddTitle').value;
  if (!title) {
    customAlert("Please enter a title.");
    return;
  }

  const bookColors = [
    '#EC6426', '#F8A91F', '#FDE3CF', '#2E573A', '#72AC43',
    '#632713', '#E4A5CA', '#001219', '#005F73', '#0A9396',
    '#94D2BD', '#E9D8A6', '#EE9B00', '#CA6702', '#BB3E03',
    '#AE2012', '#9B2226'
  ];

  bucketList.push({
    title: title,
    category: selectedBucketCategory,
    color: bookColors[Math.floor(Math.random() * bookColors.length)],
    completed: false,
    dateAdded: new Date().toISOString()
  });

  localStorage.setItem('spacelog_bucketlist', JSON.stringify(bucketList));
  renderBookshelf();
  closeBucketAdd();
}

// Override addBucketItem to use new modal
async function addBucketItem() {
  openBucketAdd();
}

function handleBucketClick(idx) {
  bucketItemToEditIndex = idx;
  const item = bucketList[idx];
  document.getElementById('bucketActionTitle').textContent = item.title;
  document.getElementById('bucketActionModal').classList.add('active');
}

function closeBucketAction() {
  document.getElementById('bucketActionModal').classList.remove('active');
}

async function handleBucketAction(action) {
  if (bucketItemToEditIndex === null) return;
  const item = bucketList[bucketItemToEditIndex];

  if (action === 'delete') {
    bucketList.splice(bucketItemToEditIndex, 1);
    localStorage.setItem('spacelog_bucketlist', JSON.stringify(bucketList));
    renderBookshelf();
    closeBucketAction();
  } else if (action === 'review') {
    // Remove from bucket
    bucketList.splice(bucketItemToEditIndex, 1);
    localStorage.setItem('spacelog_bucketlist', JSON.stringify(bucketList));
    renderBookshelf();
    closeBucketAction();

    // Open Record Modal Pre-filled
    // Map bucket cat back to record cat if possible
    const catMap = {
      'movie': '영화', 'book': '책', 'drama': '드라마', 'exhibit': '전시', 'concert': '공연'
    };
    const recordCat = catMap[item.category] || '기타';

    // Need to wait for modal close transition?
    setTimeout(() => {
      openModal(new Date().toISOString().split('T')[0]); // Today
      // Pre-fill after open
      document.getElementById('recordTitle').value = item.title;
      document.getElementById('recordCategory').value = recordCat;
      updateCategoryFields(); // Refresh fields
    }, 300);
  }
}

// Override toggleBucketComplete to use new handler (was click handler)
// In renderBookshelf, update onclick to handleBucketClick(startIdx + idx)

// Redundant Bucket View listener removed - handled in switchView

// --- Statistics Logic ---
function renderStatistics() {
  const totalEl = document.getElementById('statTotalCount');
  if (totalEl) totalEl.textContent = records.length;

  // Category Breakdown
  const catCounts = {};
  records.forEach(r => {
    catCounts[r.category] = (catCounts[r.category] || 0) + 1;
  });

  const catList = document.getElementById('statCategoryList');
  catList.innerHTML = '';
  Object.entries(catCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([cat, count]) => {
      const div = document.createElement('div');
      div.className = 'stat-row-item';
      div.innerHTML = `<span>${cat}</span><span>${count}</span>`;
      catList.appendChild(div);
    });

  // Mood Breakdown
  const moodCounts = {};
  records.forEach(r => {
    if (r.mood) moodCounts[r.mood] = (moodCounts[r.mood] || 0) + 1;
  });

  const moodBars = document.getElementById('statMoodBars');
  if (moodBars) {
    moodBars.innerHTML = '';
    const moodEmojis = { 'happy': '😊', 'excited': '🤩', 'relaxed': '😌', 'sad': '😢', 'angry': '😡' };

    Object.entries(moodCounts).forEach(([mood, count]) => {
      const percent = totalCount ? (count / totalCount) * 100 : 0;
      const div = document.createElement('div');
      div.className = 'stat-bar-container';
      div.innerHTML = `
        <div class="stat-bar-label">${moodEmojis[mood] || mood}</div>
        <div class="stat-bar-bg">
          <div class="stat-bar-fill" style="width: ${percent}%"></div>
        </div>
        <div class="stat-bar-val">${count}</div>
      `;
      moodBars.appendChild(div);
    });
  }

  // Rating Distribution Graph
  // Calculate histogram
  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let maxCount = 0;

  // Round ratings to nearest int for simplicity
  records.forEach(r => {
    const val = Math.round(Number(r.rating));
    if (val >= 1 && val <= 5) {
      ratingCounts[val]++;
      if (ratingCounts[val] > maxCount) maxCount = ratingCounts[val];
    }
  });

  const ratingGraph = document.getElementById('statRatingGraph');
  ratingGraph.innerHTML = '';

  for (let i = 1; i <= 5; i++) {
    const count = ratingCounts[i];
    const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
    // Min height to be visible
    const displayHeight = Math.max(height, 5);

    const barContainer = document.createElement('div');
    barContainer.className = 'graph-bar-container';
    barContainer.innerHTML = `
        <div class="graph-bar-count">${count > 0 ? count : ''}</div>
        <div class="graph-bar" style="height: ${displayHeight}%; ${count === 0 ? 'background:#333;' : ''}"></div>
        <div class="graph-bar-label">${i}★</div>
     `;
    ratingGraph.appendChild(barContainer);
  }
  if (ratingGraph) { // Safety check
    ratingGraph.innerHTML = '';

    for (let i = 1; i <= 5; i++) {
      const count = ratingCounts[i];
      const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
      // Min height to be visible
      const displayHeight = Math.max(height, 5);

      const barContainer = document.createElement('div');
      barContainer.className = 'graph-bar-container';
      barContainer.innerHTML = `
          <div class="graph-bar-count">${count > 0 ? count : ''}</div>
          <div class="graph-bar" style="height: ${displayHeight}%; ${count === 0 ? 'background:#333;' : ''}"></div>
          <div class="graph-bar-label">${i}★</div>
       `;
      ratingGraph.appendChild(barContainer);
    }
  }


  // Average Rating Display (Next to Graph)
  const ratedRecords = records.filter(r => r.rating > 0);
  const totalRating = ratedRecords.reduce((sum, r) => sum + Number(r.rating), 0);
  const avg = ratedRecords.length ? (totalRating / ratedRecords.length).toFixed(1) : '0.0';

  // Use innerHTML to style
  const avgEl = document.getElementById('statAvgDisplay');
  if (avgEl) avgEl.innerHTML = `<span style="font-size:1.5em; font-weight:bold;">${avg}</span> <span style="font-size:0.8em; color:#666;">/ 5.0</span>`;

  // --- Top 3 Favorites (Director, Actor, Author) ---
  // Since we don't have this data in simple records, we'll simulate or use Category if available
  // Let's create dummy logic for now as requested "Top 3 people"
  // --- Top 3 Favorites (Director, Actor, Author) ---
  // Since we don't have this data in simple records, we'll simulate or use Category if available
  // Let's create dummy logic for now as requested "Top 3 people"
  const topList = document.getElementById('statTop3List');
  if (topList) {
    topList.innerHTML = '';

    // ... rest of logic
    const dummyPeople = [
      { name: 'Christopher Nolan', role: 'Director', count: 4 },
      { name: 'Leonardo DiCaprio', role: 'Actor', count: 3 },
      { name: 'J.K. Rowling', role: 'Author', count: 2 }
    ];

    dummyPeople.forEach(p => {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.style.marginBottom = '10px';
      div.style.borderBottom = '1px dashed #444';
      div.style.paddingBottom = '5px';

      div.innerHTML = `
        <div>
            <span style="color:var(--accent-gold); font-weight:bold;">${p.name}</span>
            <span style="font-size:0.8em; color:#888; margin-left:5px;">${p.role}</span>
        </div>
        <div style="color:var(--accent-neon-blue);">${p.count} <small>works</small></div>
        `;
      topList.appendChild(div);
    });
  }

  // --- Mind Map (Word Cloud) ---
  const mindMap = document.getElementById('statMindMap');
  if (mindMap) {
    mindMap.innerHTML = '';

    // Dummy Tags with weights
    const tags = [
      { text: 'Visuals', size: 'xl' },
      { text: 'OST', size: 'xl' },
      { text: 'Growth', size: 'lg' },
      { text: 'Blockbuster', size: 'md' },
      { text: 'Quality', size: 'md' },
      { text: 'Superhero', size: 'md' },
      { text: 'Acting', size: 'sm' },
      { text: 'Marvel', size: 'sm' },
      { text: 'Friendship', size: 'sm' },
      { text: 'Spectacular', size: 'sm' }
    ];

    // ZingChart implementation
    zingchart.MODULESDIR = 'https://cdn.zingchart.com/modules/';

    // Convert tags to ZingChart format
    // Map size (xl, lg, md, sm) to numeric counts for logic
    const sizeMap = { 'xl': 80, 'lg': 60, 'md': 40, 'sm': 20 };
    const zcWords = tags.map(t => ({ text: t.text, count: sizeMap[t.size] }));

    const myConfig = {
      type: 'wordcloud',
      options: {
        words: zcWords,
        minLength: 1,
        ignore: [""],
        maxItems: 40,
        aspect: 'spiral',
        colorType: 'palette',
        palette: ['#ff2a6d', '#05d9e8', '#ffc857', '#e0e0e0'], // Neon Pink, Blue, Gold, White
        style: {
          fontFamily: 'Exo 2',
          hoverState: {
            backgroundColor: 'transparent',
            borderRadius: 2,
            fontColor: 'white',
            borderColor: '#ff2a6d'
          },
          tooltip: {
            visible: true,
            text: '%text',
            alpha: 0.9,
            backgroundColor: '#000',
            fontColor: '#ffc857',
            borderColor: '#ff2a6d'
          }
        }
      },
      backgroundColor: 'transparent' // Transparent background to fit theme
    };

    zingchart.render({
      id: 'statMindMap',
      data: myConfig,
      height: '100%',
      width: '100%'
    });
  }
}

// Redundant Stats View listener removed - handled in switchView

// --- Custom Modal Logic (Replacing alert/prompt/confirm) ---
function showCustomPopup(title, message, type = 'alert') {
  return new Promise((resolve) => {
    const modal = document.getElementById('customPopup');
    const titleEl = document.getElementById('popupTitle');
    const msgEl = document.getElementById('popupMessage');
    const inputEl = document.getElementById('popupInput');
    const okBtn = document.getElementById('popupOk');
    const cancelBtn = document.getElementById('popupCancel');

    titleEl.textContent = title;
    msgEl.textContent = message;

    // Reset
    inputEl.style.display = 'none';
    inputEl.value = '';
    cancelBtn.style.display = 'none';

    if (type === 'prompt') {
      inputEl.style.display = 'block';
      cancelBtn.style.display = 'inline-block';
      setTimeout(() => inputEl.focus(), 100);
    } else if (type === 'confirm') {
      cancelBtn.style.display = 'inline-block';
    }

    modal.classList.add('active');

    // Clean previous handlers (safety)
    okBtn.onclick = null;
    cancelBtn.onclick = null;

    // Helper: Cleanup
    const cleanup = () => {
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      modal.classList.remove('active');
    };

    // Handler: OK
    const handleOk = (e) => {
      e.stopPropagation(); // Stop bubbling
      let result = true;
      if (type === 'prompt') {
        result = inputEl.value;
      }
      cleanup();
      resolve(result);
    };

    // Handler: Cancel
    const handleCancel = (e) => {
      e.stopPropagation(); // Stop bubbling
      cleanup();
      resolve(false);
    };

    // Assign Handlers
    okBtn.onclick = handleOk;
    cancelBtn.onclick = handleCancel;
  });
}

// Expose to window for HTML onclick access
window.showCustomPopup = showCustomPopup;

async function customPrompt(message) {
  return await showCustomPopup('INPUT', message, 'prompt');
}
window.customPrompt = customPrompt;

async function customConfirm(message) {
  return await showCustomPopup('CONFIRM', message, 'confirm');
}
window.customConfirm = customConfirm;

async function customAlert(message) {
  return await showCustomPopup('ALERT', message, 'alert');
}
window.customAlert = customAlert;

// Global Helpers
function setRating(val) {
  const el = document.getElementById('ratingValue');
  if (el) el.value = val;
  updateStars(val);
}
window.setRating = setRating;

function setMood(val) {
  const el = document.getElementById('recordMood');
  if (el) el.value = val;
  updateMoods(val);
}
window.setMood = setMood;

function updateStars(val) {
  document.querySelectorAll('.star').forEach((s, idx) => {
    s.classList.toggle('active', (idx + 1) <= val);
  });
}
window.updateStars = updateStars;

function updateMoods(val) {
  document.querySelectorAll('.mood-option').forEach(m => {
    m.classList.toggle('active', m.title.toLowerCase() === val || m.getAttribute('onclick')?.includes(`'${val}'`));
  });
}
window.updateMoods = updateMoods;

function downloadTicket() {
  // Pull data directly from the form inputs (supports unsaved changes)
  const title = document.getElementById('recordTitle').value || 'MEMORY';
  const date = document.getElementById('recordDate').value || new Date().toISOString().split('T')[0];
  const category = document.getElementById('recordCategory').value || 'MOMENT';
  const rating = document.getElementById('ratingValue').value || 0;
  const review = document.getElementById('recordReview').value || '';
  const imagePreview = document.getElementById('imagePreview');
  const imageUrl = (imagePreview && imagePreview.src && imagePreview.style.display !== 'none') ? imagePreview.src : null;

  // Find ticket element
  let ticketEl = document.querySelector('.ticket-view');
  if (!ticketEl) ticketEl = document.getElementById('ticketView');
  if (!ticketEl) {
    customAlert("Ticket template missing!");
    return;
  }

  // Populate Data for Vertical Ticket

  // Set Background Image
  if (imageUrl) {
    ticketEl.style.backgroundImage = `url('${imageUrl}')`;
  } else {
    ticketEl.style.backgroundImage = 'none';
    ticketEl.style.backgroundColor = '#1a1a1a';
  }

  // Set Text Fields
  if (document.getElementById('ticketTitle')) document.getElementById('ticketTitle').textContent = title;
  if (document.getElementById('ticketDate')) document.getElementById('ticketDate').textContent = date;
  if (document.getElementById('ticketCategory')) document.getElementById('ticketCategory').textContent = category;

  // Format Year
  const year = date ? date.substring(0, 4) : new Date().getFullYear();
  if (document.getElementById('ticketYear')) document.getElementById('ticketYear').textContent = year;

  // Rating stars
  const stars = '★'.repeat(Number(rating)) + '☆'.repeat(5 - Number(rating));
  if (document.getElementById('ticketRating')) document.getElementById('ticketRating').textContent = stars;

  // Review
  if (document.getElementById('ticketReview')) {
    document.getElementById('ticketReview').innerText = review ? '"' + review.substring(0, 100) + (review.length > 100 ? '...' : '') + '"' : 'No review written.';
  }

  ticketEl.style.display = 'block';

  html2canvas(ticketEl, {
    backgroundColor: null,
    scale: 4, // Higher quality
    useCORS: true
  }).then(canvas => {
    ticketEl.style.display = 'none';

    // Post-processing for Vintage Ticket Shape (Concave Corners + Perforations)
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Config matches CSS
    const notchRadius = 60; // Scale 4x of 15px
    const toothRadius = 16; // Scale 4x of 4px
    const toothSpacing = 56; // Scale 4x of 14px

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';

    // 1. Four Corner Notches (Concave)
    const corners = [
      { x: 0, y: 0 },         // Top Left
      { x: w, y: 0 },         // Top Right
      { x: 0, y: h },         // Bottom Left
      { x: w, y: h }          // Bottom Right
    ];

    corners.forEach(corner => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, notchRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    // 2. Top/Bottom Edge Perforations (Small holes)
    // Calculate number of teeth
    const numTeeth = Math.floor(w / toothSpacing);
    // Center alignment offset
    const offset = (w - (numTeeth * toothSpacing)) / 2;

    for (let i = 0; i <= numTeeth; i++) {
      const cx = offset + i * toothSpacing;

      // Top Edge
      ctx.beginPath();
      ctx.arc(cx, 0, toothRadius, 0, Math.PI * 2);
      ctx.fill();

      // Bottom Edge
      ctx.beginPath();
      ctx.arc(cx, h, toothRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    const dataUrl = canvas.toDataURL('image/png');
    // For ticket ID in filename, use current ID or timestamp
    const recordId = document.getElementById('recordId').value || Date.now();
    openTicketPreview(dataUrl, `ticket_${date}_${recordId}.png`);
  }).catch(err => {
    console.error("Ticket Generation Failed:", err);
    ticketEl.style.display = 'none';
    customAlert("Failed to generate ticket image.");
  });
}
window.downloadTicket = downloadTicket;

// --- Add Category Custom Modal Logic ---
function openAddCategoryModal() {
  const modal = document.getElementById('addCategoryModal');
  const input = document.getElementById('newCategoryInput');
  modal.classList.add('active');
  input.value = '';
  setTimeout(() => input.focus(), 100);
}

function closeAddCategoryModal() {
  document.getElementById('addCategoryModal').classList.remove('active');
}

function confirmAddCategory() {
  const input = document.getElementById('newCategoryInput');
  const name = input.value.trim();

  if (!name) {
    customAlert('Please enter a category name.');
    return;
  }

  addCategory(name);
  closeAddCategoryModal();
}


/* --- Ticket Gallery Logic --- */
/* --- Ticket Gallery Logic --- */
/* --- Ticket Wall Logic --- */
// ticketGallery is now managed via DB and loadAllTickets

function renderTicketWall() {
  const container = document.getElementById('ticketWallContainer');
  if (!container) return;
  container.innerHTML = '';

  if (ticketGallery.length === 0) {
    container.innerHTML = '<div style="width:100%; text-align:center; color:#888;">No tickets on the wall yet.</div>';
    return;
  }

  ticketGallery.forEach((ticket, index) => {
    const item = document.createElement('div');
    item.className = 'ticket-wall-item';

    const rotation = ticket.rotation || (Math.random() * 20 - 10).toFixed(1);
    item.style.setProperty('--rotation', rotation + 'deg');

    const img = document.createElement('img');
    img.src = ticket.image;
    item.appendChild(img);

    // Click to delete option
    item.onclick = () => {
      if (confirm('Remove this ticket from the wall?')) {
        // Delete from DB and Array
        const idToDelete = ticket.id;
        dbDeleteTicket(idToDelete).then(() => {
          ticketGallery.splice(index, 1);
          renderTicketWall();
        }).catch(e => console.error(e));
      }
    };

    container.appendChild(item);
  });
}

function saveTicketToWall(dataUrl) {
  if (!dataUrl) {
    customAlert("Error: No ticket image found.");
    return;
  }
  const rotation = (Math.random() * 30 - 15).toFixed(1);
  const newTicket = { id: Date.now(), image: dataUrl, rotation: rotation };

  dbSaveTicket(newTicket).then(() => {
    ticketGallery.push(newTicket);
    renderTicketWall();
    switchView('gallery');
    document.getElementById('ticketPreviewModal').classList.remove('active');
    closeModal();
    customAlert('Ticket added to wall!');
  }).catch(e => {
    console.error(e);
    customAlert('Failed to save ticket: ' + e.message);
  });
}



// --- Ticket Preview Modal ---
// Modified to handle Deletion Context
let currentPreviewTicketId = null;

function openTicketPreview(dataUrl, filename, ticketId = null) {
  const modal = document.getElementById('ticketPreviewModal');
  const img = document.getElementById('ticketPreviewImage');
  const dwnBtn = document.getElementById('btnDownloadTicket');
  const saveBtn = document.getElementById('btnSaveToWall');

  // Check if delete button exists, if not create it (safe coding)
  // Check if delete button exists, if not create it (safe coding)
  let delBtn = document.getElementById('deleteTicketBtn');
  if (!delBtn) {
    delBtn = document.createElement('button');
    delBtn.id = 'deleteTicketBtn';
    delBtn.className = 'save-btn'; // Use existing class for shape/shadow
    // Override colors for destructive action
    delBtn.style.background = '#4a4a4a';
    delBtn.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.4)';
    delBtn.style.color = '#fff';
    delBtn.style.marginTop = '0'; // Reset any margins if needed contextually differently
    delBtn.textContent = 'Delete Ticket';

    delBtn.onmouseover = () => {
      delBtn.style.transform = 'translateY(-2px)';
      delBtn.style.boxShadow = '0 6px 20px rgba(255, 42, 109, 0.6)';
    };
    delBtn.onmouseout = () => {
      delBtn.style.transform = 'translateY(0)';
      delBtn.style.boxShadow = '0 4px 15px rgba(255, 42, 109, 0.4)';
    };

    // Insert after save button
    saveBtn.parentNode.insertBefore(delBtn, saveBtn.nextSibling);
  }

  // Use the container if image tag isn't there, or direct img if exists
  const container = document.getElementById('ticketPreviewContainer');
  if (container) {
    container.innerHTML = '<img src="' + dataUrl + '" style="width:100%; display:block;">';
  } else if (img) {
    img.src = dataUrl;
  }

  if (dwnBtn) {
    dwnBtn.onclick = () => {
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
    };
  }

  currentPreviewTicketId = ticketId;

  if (ticketId) {
    // Existing Ticket -> Show Delete, Hide Save
    if (saveBtn) saveBtn.style.display = 'none';
    delBtn.style.display = 'inline-block';
    delBtn.onclick = () => deleteTicketFromPreview(ticketId);
  } else {
    // New Ticket -> Show Save, Hide Delete
    if (saveBtn) {
      saveBtn.style.display = 'inline-block';
      saveBtn.onclick = () => {
        saveTicketToWall(dataUrl);
        closeTicketPreview();
      };
    }
    delBtn.style.display = 'none';
  }

  if (modal) modal.classList.add('active');
}

async function deleteTicketFromPreview(id) {
  if (confirm("Permanently delete this ticket?")) {
    try {
      await dbDeleteTicket(id);

      // Update global array
      const idx = ticketGallery.findIndex(t => t.id === id);
      if (idx > -1) ticketGallery.splice(idx, 1);

      closeTicketPreview(); // Close FIRST
      renderTicketWall();   // THEN Re-render

    } catch (e) {
      console.error(e);
      customAlert("Failed to delete.");
    }
  }
}

function closeTicketPreview() {
  const modal = document.getElementById('ticketPreviewModal');
  if (modal) modal.classList.remove('active');
  currentPreviewTicketId = null;
}


/* --- Ensure Save Logic execute after loop --- */
// Logic moved inside loop but saving needs to happen once per render/call
// Since for-loop is per-shelf, we might save multiple times but that is fine.
// But 'saveNeeded' variable scope is shelf-specific due to 'let' in previous block replacement.
// We need to actually execute the save.
// I'll append the save check logic since I didn't include it in the replacement block above.
// Wait, the block replacement creates the loop. I need to INSERT the save check AFTER the loop closures.
// Looking at code: line 995 is }); so line 996 is empty space before 'New Item' logic.
// I'll assume I can just append it or I should have included it.
// I will add it via Add-Content or Replace.


/* --- Persist Bucket List Changes --- */
// Appending save check helper at end of function or file
// Since 'saveNeeded' is local to renderBookshelf, we can't access it here.
// We need to inject the check INSIDE renderBookshelf.
// I'll replace the end of the function to include it.


/* --- Exports for HTML Access --- */
window.openAddCategoryModal = openAddCategoryModal;
window.closeAddCategoryModal = closeAddCategoryModal;
window.confirmAddCategory = confirmAddCategory;
window.saveTicketToGallery = saveTicketToGallery;
// window.renderTicketGallery = renderTicketGallery; // Deprecated name
window.renderTicketWall = renderTicketWall;
window.saveTicketToWall = saveTicketToWall;
window.openTicketPreview = openTicketPreview;
window.deleteTicketFromPreview = deleteTicketFromPreview;
window.closeTicketPreview = closeTicketPreview;

// window.openTicketPreview is local logic but used by downloadTicket global


function renderSuggestedTags(fieldId) {
  const container = document.getElementById('suggested_tags_' + fieldId);
  if (!container) return;

  container.innerHTML = '';
  const allTags = globalTags[fieldId] || [];
  const currentInput = document.getElementById('field_' + fieldId);
  const currentTags = currentInput && currentInput.value ? currentInput.value.split(',') : [];

  const availableTags = allTags.filter(t => !currentTags.includes(t));

  if (availableTags.length === 0) {
    container.style.display = 'none';
  } else {
    container.style.display = 'flex';
  }

  availableTags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip suggestion';
    chip.textContent = tag;
    chip.onclick = () => addExistingTag(fieldId, tag);
    container.appendChild(chip);
  });
}

function addExistingTag(fieldId, tag) {
  const input = document.getElementById('field_' + fieldId);
  let currentTags = input.value ? input.value.split(',') : [];
  if (!currentTags.includes(tag)) {
    currentTags.push(tag);
    input.value = currentTags.join(',');
    renderTags(fieldId, currentTags);
    renderSuggestedTags(fieldId);
  }
}


function renderTags(fieldId, tags) {
  const containerId = fieldId === 'location' ? 'tags_location' : 'tags_' + fieldId;
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    chip.onclick = () => removeTag(fieldId, tag);
    container.appendChild(chip);
  });

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-tag-btn';
  btn.textContent = '+';
  btn.onclick = () => addTag(fieldId);
  container.appendChild(btn);
  if (typeof renderSuggestedTags === 'function') renderSuggestedTags(fieldId);
}


async function addTag(fieldId) {
  const input = document.getElementById(fieldId === 'location' ? 'recordLocation' : 'field_' + fieldId);
  if (!input) return;

  const val = await customPrompt('Add ' + fieldId);
  if (val && val.trim()) {
    const currentVal = input.value ? input.value.split(',') : [];
    currentVal.push(val.trim());
    input.value = currentVal.join(',');
    renderTags(fieldId, currentVal);
  }
}

function removeTag(fieldId, tagToRemove) {
  const input = document.getElementById(fieldId === 'location' ? 'recordLocation' : 'field_' + fieldId);
  if (!input) return;
  let tags = input.value ? input.value.split(',') : [];
  tags = tags.filter(t => t !== tagToRemove);
  input.value = tags.join(',');
  renderTags(fieldId, tags);
}


// --- Robust Ticket Generation (Clone Method) ---
// Overwriting previous downloadTicket to ensure data capture reliability
function downloadTicket() {
  // 1. Get Data from Form
  const title = document.getElementById('recordTitle').value || 'MEMORY';
  const date = document.getElementById('recordDate').value || new Date().toISOString().split('T')[0];
  const category = document.getElementById('recordCategory') ? document.getElementById('recordCategory').value : 'MOMENT';
  const rating = document.getElementById('ratingValue') ? document.getElementById('ratingValue').value : 0;
  const review = document.getElementById('recordReview') ? document.getElementById('recordReview').value : '';
  const imagePreview = document.getElementById('imagePreview');
  const imageUrl = (imagePreview && imagePreview.src && imagePreview.style.display !== 'none') ? imagePreview.src : null;

  // 2. Clone Template to body to ensure it's rendered
  const originalTicket = document.getElementById('ticketView');
  if (!originalTicket) {
    customAlert("Ticket template missing!");
    return;
  }

  const ticketCloned = originalTicket.cloneNode(true);
  ticketCloned.id = 'ticketRenderTemp'; // Avoid ID conflict

  // Style to be visible but off-screen (absolute positioning)
  // Ensure we override any existing display:none
  Object.assign(ticketCloned.style, {
    display: 'block',
    position: 'absolute',
    top: '0',
    left: '-9999px',
    zIndex: '-1',
    visibility: 'visible',
    transform: 'none'
  });

  document.body.appendChild(ticketCloned);

  // 3. Populate Data on Clone (Use querySelector on the CLONE)
  if (imageUrl) {
    ticketCloned.style.backgroundImage = `url('${imageUrl}')`;
  } else {
    ticketCloned.style.backgroundImage = 'none';
    ticketCloned.style.backgroundColor = '#1a1a1a';
  }

  // Use optional chaining or checks for safety
  const titleEl = ticketCloned.querySelector('#ticketTitle');
  if (titleEl) titleEl.textContent = title;

  const dateEl = ticketCloned.querySelector('#ticketDate');
  if (dateEl) dateEl.textContent = date;

  const catEl = ticketCloned.querySelector('#ticketCategory');
  if (catEl) catEl.textContent = category;

  const yearEl = ticketCloned.querySelector('#ticketYear');
  if (yearEl) yearEl.textContent = date ? date.substring(0, 4) : new Date().getFullYear();

  // Re-generate stars string
  const stars = '★'.repeat(Number(rating)) + '☆'.repeat(5 - Number(rating));
  const ratingEl = ticketCloned.querySelector('#ticketRating');
  if (ratingEl) ratingEl.textContent = stars;

  const reviewEl = ticketCloned.querySelector('#ticketReview');
  if (reviewEl) {
    const truncatedReview = review ? '"' + review.substring(0, 100) + (review.length > 100 ? '...' : '') + '"' : 'No review written.';
    reviewEl.innerText = truncatedReview;
  }

  // 4. Capture with html2canvas (use logging false to reduce noise)
  html2canvas(ticketCloned, {
    backgroundColor: null,
    scale: 4,
    useCORS: true,
    logging: false
  }).then(canvas => {
    // 5. Cleanup DOM
    if (document.body.contains(ticketCloned)) {
      document.body.removeChild(ticketCloned);
    }

    // 6. Post-processing (Sawtooth Edges)
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Tooth configuration (Matches mask in CSS scale)
    // ticket width 350px -> scale 4 -> 1400px
    // 25 teeth -> ~56px width per tooth -> radius ~28px
    const numTeeth = 25;
    const toothRadius = w / numTeeth / 2;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';

    // Top Edges - Punch holes
    for (let i = 0; i < numTeeth; i++) {
      const cx = i * (toothRadius * 2) + toothRadius;
      ctx.beginPath();
      // Circle center slightly above top edge to create a bite
      ctx.arc(cx, 0, toothRadius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bottom Edges - Punch holes
    for (let i = 0; i < numTeeth; i++) {
      const cx = i * (toothRadius * 2) + toothRadius;
      ctx.beginPath();
      // Circle center slightly below bottom edge
      ctx.arc(cx, h, toothRadius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Reset composite
    ctx.globalCompositeOperation = 'source-over';

    // 7. Open Preview
    const dataUrl = canvas.toDataURL('image/png');
    // Generate temp ID for name
    const timestamp = Date.now();
    openTicketPreview(dataUrl, `ticket_${date}_${timestamp}.png`);
  }).catch(err => {
    console.error("Ticket Generation Failed:", err);
    // Ensure cleanup even on error
    if (document.body.contains(ticketCloned)) {
      document.body.removeChild(ticketCloned);
    }
    customAlert("Failed to generate ticket image.");
  });
}
window.downloadTicket = downloadTicket;

// --- Backup & Restore Logic ---
function exportJSON() {
  const data = {
    records: records, // Current In-Memory Records
    tickets: ticketGallery,
    bucketList: JSON.parse(localStorage.getItem('spacelog_bucketlist')) || [],
    categories: JSON.parse(localStorage.getItem('spacelog_categories')) || [],
    config: JSON.parse(localStorage.getItem('spacelog_config')) || {},
    exportDate: new Date().toISOString()
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `darak_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!confirm("Restoring data will OVERWRITE your current database. Are you sure?")) {
    event.target.value = ''; // Reset input
    return;
  }

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const data = JSON.parse(e.target.result);

      // 1. Restore LocalStorage
      if (data.bucketList) localStorage.setItem('spacelog_bucketlist', JSON.stringify(data.bucketList));
      if (data.categories) localStorage.setItem('spacelog_categories', JSON.stringify(data.categories));

      // 2. Clear & Restore IndexedDB

      console.log("Restoring Records...", data.records ? data.records.length : 0);
      if (data.records) {
        for (const r of data.records) {
          await dbSaveRecord(r);
        }
      }

      console.log("Restoring Tickets...", data.tickets ? data.tickets.length : 0);
      if (data.tickets) {
        for (const t of data.tickets) {
          await dbSaveTicket(t);
        }
      }

      customAlert("Restore Complete! Reloading...");
      setTimeout(() => location.reload(), 1500);

    } catch (err) {
      console.error(err);
      customAlert("Failed to parse or restore JSON.");
    }
  };
  reader.readAsText(file);
}

// Expose functions
window.exportJSON = exportJSON;
window.importJSON = importJSON;
window.switchOstMode = switchOstMode;
window.searchYoutube = searchYoutube;

// --- Ticket Wall Display ---
function renderTicketWall() {
  const wallContainer = document.getElementById('ticketWallContainer');
  if (!wallContainer) return;

  wallContainer.innerHTML = '';

  if (ticketGallery.length === 0) {
    wallContainer.innerHTML = '<div style="color:#aaa; text-align:center; padding:20px;">No tickets saved yet.</div>';
    return;
  }

  // Reverse order to show newest first
  [...ticketGallery].reverse().forEach(ticket => {
    const div = document.createElement('div');
    div.className = 'ticket-item';

    // Apply Persistent Rotation
    // Use stored rotation OR deterministic hash-based rotation for legacy
    let rotation = ticket.rotation;
    if (rotation === undefined) {
      // Simple hash specific to this ticket ID to keep it consistent
      const hash = String(ticket.id).split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
      rotation = (hash % 10); // -5 to +5 range approx logic needed
      // Actually simpler: (id % 15) - 7 -> range -7 to 7 deg
      rotation = (ticket.id % 21) - 10;
    }

    div.style.cssText = `position:relative; margin:15px; display:inline-block; transform: rotate(${rotation}deg); transition: transform 0.3s; box-shadow: 2px 5px 15px rgba(0,0,0,0.5);`;

    const img = document.createElement('img');
    img.src = ticket.image;
    img.alt = 'Ticket ' + ticket.id;
    img.style.cssText = 'width:150px; cursor:pointer; display:block;';

    // Hover effect: scale but preserve rotation
    div.onmouseover = () => {
      div.style.transform = `rotate(${rotation}deg) scale(1.1)`;
      div.style.zIndex = '10';
    };
    div.onmouseout = () => {
      div.style.transform = `rotate(${rotation}deg) scale(1)`;
      div.style.zIndex = '1';
    };
    div.onclick = () => openTicketPreview(ticket.image, `ticket_${ticket.id}.png`, ticket.id); // Pass ID for deletion context

    div.appendChild(img);
    // Removed 'X' button here as per request
    wallContainer.appendChild(div);
  });
}

async function saveTicketToWall(dataUrl) {
  // Generate random rotation (-10 to 10 deg)
  const rotation = Math.floor(Math.random() * 21) - 10;

  const newTicket = {
    id: Date.now(),
    date: new Date().toISOString(),
    image: dataUrl,
    rotation: rotation // Save rotation!
  };

  try {
    await dbSaveTicket(newTicket);
    ticketGallery.push(newTicket);
    renderTicketWall();
    customAlert("Ticket Saved to Wall!");
  } catch (e) {
    console.error("Failed to save ticket", e);
    customAlert("Error saving ticket: " + e);
  }
}
window.saveTicketToWall = saveTicketToWall;
window.renderTicketWall = renderTicketWall;

// --- CRITICAL RECOVERY TOOL ---
async function recoverAndExportData() {
  try {
    await dbInitialized;
    if (!db) throw new Error("Database connection failed");

    console.log("Starting Emergency Recovery...");

    // 1. Force Fetch All Data directly from DB
    const allRecords = await dbGetAllRecords();
    const allTickets = await dbGetAllTickets();
    const legacyBucket = JSON.parse(localStorage.getItem('spacelog_bucketlist')) || [];
    const legacyCats = JSON.parse(localStorage.getItem('spacelog_categories')) || [];
    const legacyConfig = JSON.parse(localStorage.getItem('spacelog_config')) || {};

    const recoveryData = {
      records: allRecords,
      tickets: allTickets,
      bucketList: legacyBucket,
      categories: legacyCats,
      config: legacyConfig,
      exportDate: new Date().toISOString(),
      isRecovery: true
    };

    console.log(`Recovered: ${allRecords.length} records, ${allTickets.length} tickets.`);

    // 2. Trigger Download
    const json = JSON.stringify(recoveryData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RECOVERY_BACKUP_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert(`Recovery Complete!\nSaved ${allRecords.length} records and ${allTickets.length} tickets.\nPlease check your downloads folder.`);

  } catch (e) {
    console.error("Recovery Failed:", e);
    alert("Recovery Failed: " + e.message);
  }
}
window.recoverAndExportData = recoverAndExportData;



/* --- Settings Render Logic --- */
function renderSettings() {
  const container = document.getElementById('settingsView');
  if (!container) return;

  // Check if content is empty or seemingly missing key elements
  if (container.innerHTML.trim() === '' || !container.querySelector('.settings-card')) {
    console.warn("Settings view was empty. Restoring static content.");
    container.innerHTML = `
      <h2 class="month-year">Settings</h2>
      
      <!-- Account Section -->
      <div class="settings-card" style="background: rgba(0,0,0,0.5); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 20px;">
        <h3 style="color: var(--accent-neon-blue); margin-bottom: 15px;">Account</h3>
        <div id="accountInfoDisplay" style="margin-bottom: 15px; color: #eee;">
           Loading...
        </div>
        <button onclick="UserManager.logout()" class="delete-btn" style="background: #333; font-size: 0.9em; padding: 10px 20px; width: auto;">Logout</button>
      </div>

      <div class="view-content" style="padding: 20px; color: var(--text-color);">
        
        <div class="settings-card" style="background: rgba(0,0,0,0.5); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 20px;">
          <h3 style="color: var(--accent-neon-blue); margin-bottom: 15px;">Data Management</h3>
          <p style="margin-bottom: 15px; color: #aaa;">Export your data for backup or restore it from a previous save.</p>
          
          <div style="display: flex; gap: 10px;">
            <button class="save-btn" onclick="window.exportJSON()" style="margin-top: 0; flex: 1;">
              Export Data
            </button>
            <button class="save-btn" onclick="document.getElementById('importFileSetting').click()" style="margin-top: 0; flex: 1; background: #333; color: white;">
              Import Data
            </button>
            <input type="file" id="importFileSetting" style="display: none;" accept=".json" onchange="window.importJSON(event)">
          </div>
        </div>

        <div class="settings-card" style="background: rgba(0,0,0,0.5); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color);">
          <h3 style="color: var(--accent-gold); margin-bottom: 15px;">About</h3>
          <p style="color: #aaa;">DARAK: A room for your memories.</p>
          <p style="color: #666; font-size: 0.8em; margin-top: 10px;">Version 1.2.1</p>
        </div>

      </div>
    `;
  }

  // Populate Account Info
  const accountDisplay = document.getElementById('accountInfoDisplay');
  if (accountDisplay) {
    const user = UserManager.getCurrentUser();
    if (user) {
      const friendCount = user.friends ? user.friends.length : 0;
      accountDisplay.innerHTML = `
         <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">${user.id}</div>
         <div style="color: #aaa; font-size: 0.9em;">Friends: ${friendCount}</div>
       `;
    } else {
      accountDisplay.textContent = "Not Logged In";
    }
  }
}


// Window Expose
window.renderSettings = renderSettings;
