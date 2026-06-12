/* ═══════════════════════════════════════════════════════════
   SMART CAMPUS AI – APPLICATION ENGINE
   ─────────────────────────────────────────────────────────
   Architecture:
   1. State Management    – Central appState object
   2. Router              – Page navigation
   3. AI Engine           – Simulated intelligence layer
   4. Page Controllers    – Per-page logic
   5. Three.js 3D Module  – Campus digital twin
   6. Landing Canvas      – Particle background
   7. Utilities           – Shared helpers
   8. Initializer         – Bootstrap on load
═══════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────
// 1. STATE MANAGEMENT
// ─────────────────────────────────────────────────────────

const appState = {
  collegeName: '',
  currentPage: 'landing',
  selectedBlueprintBlock: null,
  selectedBlueprintFloor: null,
  selectedBlueprintCell: null,

  // Blocks: [ { id, name, floors, classroomsPerFloor, labs, auditoriums, others } ]
  blocks: [],

  // Rooms: [ { id, name, type, capacity, blockId, blockName, floor, col } ]
  rooms: [],

  // Timetable: [ { id, branch, section, subject, professor, roomId, day, startTime, endTime } ]
  timetable: [],

  // Auditorium bookings: [ { id, roomId, date, startTime, endTime, event, organizer } ]
  auditBookings: [],
};

// ─────────────────────────────────────────────────────────
// 2. ROUTER
// ─────────────────────────────────────────────────────────

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const target = document.getElementById(`page-${pageId}`);
  if (target) target.classList.add('active');

  const navBtn = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
  if (navBtn) navBtn.classList.add('active');

  appState.currentPage = pageId;

  // Show nav after leaving landing
  if (pageId !== 'landing') {
    document.getElementById('main-nav').classList.remove('hidden');
  }

  // Page-specific setup on navigation
  const hooks = {
    blueprint: setupBlueprintPage,
    timetable: setupTimetablePage,
    dashboard: refreshDashboard,
    search:    setupSearchPage,
    viz3d:     setupViz3D,
  };
  if (hooks[pageId]) hooks[pageId]();
}

// ─────────────────────────────────────────────────────────
// 3. AI ENGINE  (Simulated intelligence)
// ─────────────────────────────────────────────────────────

const AI = {
  /**
   * Get current day-of-week string matching timetable format
   */
  getCurrentDay() {
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
  },

  /**
   * Convert "HH:MM" string to minutes since midnight
   */
  timeToMins(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  },

  minsToTime(m) {
    const h = Math.floor(m / 60), min = m % 60;
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  },

  /**
   * Get current time as "HH:MM"
   */
  getNow() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  },

  /**
   * Find all timetable entries for a room on a given day.
   * @returns array sorted by start time
   */
  getRoomSchedule(roomId, day) {
    return appState.timetable
      .filter(e => e.roomId === roomId && e.day === day)
      .sort((a, b) => AI.timeToMins(a.startTime) - AI.timeToMins(b.startTime));
  },

  /**
   * Determine room status at a given time on a given day.
   * Returns: { status: 'occupied'|'upcoming'|'free', entry?, nextEntry? }
   */
  getRoomStatus(roomId, day, timeStr) {
    const schedule = AI.getRoomSchedule(roomId, day);
    const nowMins = AI.timeToMins(timeStr);

    // Check if currently occupied
    const current = schedule.find(e =>
      AI.timeToMins(e.startTime) <= nowMins && nowMins < AI.timeToMins(e.endTime)
    );
    if (current) return { status: 'occupied', entry: current };

    // Check if booked in next 60 minutes
    const upcoming = schedule.find(e =>
      AI.timeToMins(e.startTime) > nowMins &&
      AI.timeToMins(e.startTime) <= nowMins + 60
    );
    if (upcoming) return { status: 'upcoming', entry: upcoming };

    // Find next entry today
    const nextEntry = schedule.find(e => AI.timeToMins(e.startTime) > nowMins);
    return { status: 'free', nextEntry };
  },

  /**
   * Get live status for all rooms right now
   */
  getAllRoomStatuses() {
    const day = AI.getCurrentDay();
    const now = AI.getNow();
    const result = {};
    appState.rooms.forEach(r => {
      result[r.id] = AI.getRoomStatus(r.id, day, now);
    });
    return result;
  },

  /**
   * AI conflict detection – check if a new timetable entry conflicts.
   * Detects: room double-booking, professor double-booking, section double-booking.
   */
  detectConflicts(newEntry) {
    const conflicts = [];
    const newStart = AI.timeToMins(newEntry.startTime);
    const newEnd   = AI.timeToMins(newEntry.endTime);

    appState.timetable.forEach(e => {
      if (e.id === newEntry.id) return; // skip self
      if (e.day !== newEntry.day) return;

      const eStart = AI.timeToMins(e.startTime);
      const eEnd   = AI.timeToMins(e.endTime);
      const overlaps = newStart < eEnd && newEnd > eStart;

      if (!overlaps) return;

      if (e.roomId === newEntry.roomId) {
        const room = appState.rooms.find(r => r.id === e.roomId);
        conflicts.push(`⚠ Room "${room ? room.name : e.roomId}" is already booked (${e.startTime}–${e.endTime}) for ${e.subject}`);
      }
      if (e.professor && newEntry.professor &&
          e.professor.trim().toLowerCase() === newEntry.professor.trim().toLowerCase()) {
        conflicts.push(`⚠ Prof. ${e.professor} already has a class (${e.startTime}–${e.endTime}) – ${e.subject}`);
      }
      if (e.section && newEntry.section &&
          e.section.trim().toLowerCase() === newEntry.section.trim().toLowerCase() &&
          e.branch && newEntry.branch &&
          e.branch.trim().toLowerCase() === newEntry.branch.trim().toLowerCase()) {
        conflicts.push(`⚠ ${e.branch}-${e.section} already has a class at ${e.startTime}–${e.endTime}`);
      }
    });

    return conflicts;
  },

  /**
   * Run full validation on all timetable entries, return insights
   */
  generateInsights() {
    const insights = [];
    const total = appState.timetable.length;

    if (total === 0) {
      insights.push({ type: 'ok', msg: 'No schedule entries yet. Add some lectures to get started.' });
      return insights;
    }

    insights.push({ type: 'ok', msg: `${total} lecture entries loaded successfully.` });

    // Detect all conflicts
    let conflictCount = 0;
    appState.timetable.forEach(entry => {
      const conflicts = AI.detectConflicts(entry);
      if (conflicts.length > 0) conflictCount++;
    });

    if (conflictCount > 0) {
      insights.push({ type: 'err', msg: `${conflictCount} schedule conflicts detected. Review entries below.` });
    } else {
      insights.push({ type: 'ok', msg: 'No scheduling conflicts detected.' });
    }

    // Room utilization
    const usedRooms = new Set(appState.timetable.map(e => e.roomId));
    const totalRooms = appState.rooms.length;
    if (totalRooms > 0) {
      const pct = Math.round((usedRooms.size / totalRooms) * 100);
      const t = pct > 70 ? 'warn' : 'ok';
      insights.push({ type: t, msg: `Room utilization: ${usedRooms.size}/${totalRooms} rooms scheduled (${pct}%)` });
    }

    // Count professors
    const profs = new Set(appState.timetable.map(e => e.professor).filter(Boolean));
    insights.push({ type: 'ok', msg: `${profs.size} unique professors scheduled across ${new Set(appState.timetable.map(e => e.day)).size} days.` });

    return insights;
  },

  /**
   * Smart search: find entries matching query by type
   */
  search(type, query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const day = AI.getCurrentDay();
    const now = AI.getNow();

    let matches = appState.timetable.filter(e => {
      if (type === 'classroom') {
        const room = appState.rooms.find(r => r.id === e.roomId);
        return room && room.name.toLowerCase().includes(q);
      }
      if (type === 'professor') return e.professor && e.professor.toLowerCase().includes(q);
      if (type === 'section')   return (e.branch + ' ' + e.section).toLowerCase().includes(q);
      if (type === 'subject')   return e.subject && e.subject.toLowerCase().includes(q);
      return false;
    });

    // Enrich each match with room and status info
    return matches.map(e => {
      const room = appState.rooms.find(r => r.id === e.roomId) || {};
      const status = AI.getRoomStatus(e.roomId, day, now);
      const isCurrent = e.day === day && AI.timeToMins(e.startTime) <= AI.timeToMins(now) && AI.timeToMins(now) < AI.timeToMins(e.endTime);
      return { ...e, room, statusNow: isCurrent ? 'occupied' : (e.day === day && AI.timeToMins(e.startTime) > AI.timeToMins(now) ? 'upcoming' : 'past'), roomStatus: status };
    }).sort((a, b) => {
      // Sort: current day first, then by time
      if (a.day === day && b.day !== day) return -1;
      if (b.day === day && a.day !== day) return 1;
      return AI.timeToMins(a.startTime) - AI.timeToMins(b.startTime);
    });
  },

  /**
   * Get suggestions for search typeahead
   */
  getSuggestions(type) {
    const set = new Set();
    appState.timetable.forEach(e => {
      if (type === 'classroom') {
        const r = appState.rooms.find(rm => rm.id === e.roomId);
        if (r) set.add(r.name);
      } else if (type === 'professor') {
        if (e.professor) set.add(e.professor);
      } else if (type === 'section') {
        if (e.branch && e.section) set.add(`${e.branch} ${e.section}`);
      } else if (type === 'subject') {
        if (e.subject) set.add(e.subject);
      }
    });
    return [...set].slice(0, 10);
  },

  /**
   * Check auditorium booking conflicts
   */
  checkAuditConflict(roomId, date, startTime, endTime, excludeId) {
    const s = AI.timeToMins(startTime);
    const e = AI.timeToMins(endTime);
    return appState.auditBookings.filter(b => {
      if (b.id === excludeId) return false;
      if (b.roomId !== roomId || b.date !== date) return false;
      const bs = AI.timeToMins(b.startTime);
      const be = AI.timeToMins(b.endTime);
      return s < be && e > bs;
    });
  },
};

// ─────────────────────────────────────────────────────────
// 4a. PAGE 1: LANDING
// ─────────────────────────────────────────────────────────

function initLandingCanvas() {
  const canvas = document.getElementById('landing-canvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Hexagonal node network
  const nodes = Array.from({ length: 60 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    size: Math.random() * 2 + 1,
    opacity: Math.random() * 0.6 + 0.1,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    // Draw connections
    nodes.forEach((a, i) => {
      nodes.slice(i + 1).forEach(b => {
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < 160) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          const alpha = (1 - dist / 160) * 0.12;
          ctx.strokeStyle = `rgba(0,212,255,${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    });

    // Draw nodes
    nodes.forEach(n => {
      const pulse = 0.5 + 0.5 * Math.sin(frame * 0.02 + n.x);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.size * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,212,255,${n.opacity * pulse})`;
      ctx.fill();

      // Move
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
      if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// ─────────────────────────────────────────────────────────
// 4b. PAGE 2: COLLEGE SETUP
// ─────────────────────────────────────────────────────────

function initSetupPage() {
  document.getElementById('btn-gen-blocks').addEventListener('click', generateBlockInputs);
  document.getElementById('btn-save-setup').addEventListener('click', saveSetup);
}

function generateBlockInputs() {
  const n = parseInt(document.getElementById('num-blocks').value) || 1;
  const container = document.getElementById('blocks-config');
  container.innerHTML = '';

  for (let i = 0; i < Math.min(n, 12); i++) {
    const letter = String.fromCharCode(65 + i);
    const div = document.createElement('div');
    div.className = 'block-config-item';
    div.innerHTML = `
      <div class="block-config-title">BLOCK ${letter}</div>
      <div class="block-config-fields">
        <div class="bcf-group">
          <label class="bcf-label">Block Name</label>
          <input class="bcf-input" id="b${i}-name" value="Block ${letter}" placeholder="Name">
        </div>
        <div class="bcf-group">
          <label class="bcf-label">Floors</label>
          <input class="bcf-input" type="number" id="b${i}-floors" value="3" min="1" max="10">
        </div>
        <div class="bcf-group">
          <label class="bcf-label">Rooms/Floor</label>
          <input class="bcf-input" type="number" id="b${i}-rooms" value="6" min="1" max="20">
        </div>
        <div class="bcf-group">
          <label class="bcf-label">Labs</label>
          <input class="bcf-input" type="number" id="b${i}-labs" value="2" min="0" max="20">
        </div>
        <div class="bcf-group">
          <label class="bcf-label">Auditoriums</label>
          <input class="bcf-input" type="number" id="b${i}-audit" value="1" min="0" max="5">
        </div>
        <div class="bcf-group">
          <label class="bcf-label">Others</label>
          <input class="bcf-input" type="number" id="b${i}-other" value="1" min="0" max="10">
        </div>
      </div>
    `;
    container.appendChild(div);
    updateSetupPreview();
  }

  // Live preview updates
  container.querySelectorAll('.bcf-input').forEach(inp => inp.addEventListener('input', updateSetupPreview));
}

function updateSetupPreview() {
  const n = parseInt(document.getElementById('num-blocks').value) || 0;
  const preview = document.getElementById('setup-preview-content');
  let html = '<div class="preview-tree">';

  for (let i = 0; i < Math.min(n, 12); i++) {
    const name  = document.getElementById(`b${i}-name`)?.value  || `Block ${String.fromCharCode(65+i)}`;
    const floors = parseInt(document.getElementById(`b${i}-floors`)?.value) || 3;
    const rooms  = parseInt(document.getElementById(`b${i}-rooms`)?.value) || 6;
    const labs   = parseInt(document.getElementById(`b${i}-labs`)?.value)  || 0;
    const audit  = parseInt(document.getElementById(`b${i}-audit`)?.value) || 0;
    const other  = parseInt(document.getElementById(`b${i}-other`)?.value) || 0;
    const total  = floors * rooms + labs + audit + other;

    html += `
      <div class="pt-block">
        <div class="pt-block-name">◈ ${name}</div>
        <div class="pt-details">
          ${floors} floors × ${rooms} rooms/floor<br>
          <span class="pt-tag">Labs: ${labs}</span>
          <span class="pt-tag">Audit: ${audit}</span>
          <span class="pt-tag">Other: ${other}</span>
          <span style="color:var(--text-low);font-size:0.72rem;">Total: ~${total} rooms</span>
        </div>
      </div>`;
  }
  html += '</div>';
  preview.innerHTML = html;
}

function saveSetup() {
  const collegeName = document.getElementById('college-name').value.trim();
  if (!collegeName) { alert('Please enter a college name.'); return; }

  const n = parseInt(document.getElementById('num-blocks').value) || 0;
  if (n === 0) { alert('Please generate at least one block.'); return; }

  appState.collegeName = collegeName;
  appState.blocks = [];
  appState.rooms = [];

  for (let i = 0; i < Math.min(n, 12); i++) {
    const blockId = `BLK${i+1}`;
    const name    = document.getElementById(`b${i}-name`)?.value || `Block ${String.fromCharCode(65+i)}`;
    const floors  = parseInt(document.getElementById(`b${i}-floors`)?.value) || 3;
    const rpf     = parseInt(document.getElementById(`b${i}-rooms`)?.value) || 6;
    const labs    = parseInt(document.getElementById(`b${i}-labs`)?.value)  || 0;
    const audit   = parseInt(document.getElementById(`b${i}-audit`)?.value) || 0;
    const other   = parseInt(document.getElementById(`b${i}-other`)?.value) || 0;

    appState.blocks.push({ id: blockId, name, floors, classroomsPerFloor: rpf, labs, auditoriums: audit, others: other });

    // Create default rooms
    for (let fl = 1; fl <= floors; fl++) {
      for (let c = 1; c <= rpf; c++) {
        appState.rooms.push({
          id: `${blockId}_F${fl}_C${c}`,
          name: `${name.replace('Block ','')}-${fl}0${c}`,
          type: 'classroom',
          capacity: 60,
          blockId, blockName: name, floor: fl, col: c,
        });
      }
    }
    for (let j = 0; j < labs; j++) {
      appState.rooms.push({
        id: `${blockId}_LAB${j+1}`,
        name: `${name.replace('Block ','')}-Lab${j+1}`,
        type: 'lab', capacity: 40,
        blockId, blockName: name, floor: 1, col: rpf + j + 1,
      });
    }
    for (let j = 0; j < audit; j++) {
      appState.rooms.push({
        id: `${blockId}_AUD${j+1}`,
        name: `${name.replace('Block ','')}-Auditorium${j+1 > 1 ? j+1 : ''}`,
        type: 'auditorium', capacity: 500,
        blockId, blockName: name, floor: 1, col: rpf + labs + j + 1,
      });
    }
    for (let j = 0; j < other; j++) {
      appState.rooms.push({
        id: `${blockId}_OTH${j+1}`,
        name: `${name.replace('Block ','')}-SemHall${j+1}`,
        type: 'seminar', capacity: 100,
        blockId, blockName: name, floor: 1, col: rpf + labs + audit + j + 1,
      });
    }
  }

  document.getElementById('nav-college-name').textContent = collegeName;
  showPage('blueprint');
}

// ─────────────────────────────────────────────────────────
// 4c. PAGE 3: BLUEPRINT
// ─────────────────────────────────────────────────────────

function setupBlueprintPage() {
  if (appState.blocks.length === 0) {
    document.getElementById('blueprint-grid-info').textContent = 'No blocks configured. Please complete Setup first.';
    return;
  }

  renderBlockSelector();
  document.getElementById('bp-no-selection').classList.remove('hidden');
  document.getElementById('blueprint-room-editor').classList.add('hidden');

  document.getElementById('btn-save-room').addEventListener('click', saveRoomFromBlueprint);
}

function renderBlockSelector() {
  const container = document.getElementById('blueprint-block-selector');
  container.innerHTML = '';
  appState.blocks.forEach(b => {
    const pill = document.createElement('button');
    pill.className = 'selector-pill';
    pill.textContent = b.name;
    pill.dataset.blockId = b.id;
    pill.addEventListener('click', () => {
      document.querySelectorAll('#blueprint-block-selector .selector-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      appState.selectedBlueprintBlock = b.id;
      appState.selectedBlueprintFloor = null;
      renderFloorSelector(b);
      document.getElementById('blueprint-grid').innerHTML = '';
      document.getElementById('blueprint-grid-info').textContent = 'Select a floor to view rooms';
    });
    container.appendChild(pill);
  });
}

function renderFloorSelector(block) {
  const container = document.getElementById('blueprint-floor-selector');
  container.innerHTML = '';
  for (let f = 1; f <= block.floors; f++) {
    const pill = document.createElement('button');
    pill.className = 'selector-pill';
    pill.textContent = `Floor ${f}`;
    pill.dataset.floor = f;
    pill.addEventListener('click', () => {
      document.querySelectorAll('#blueprint-floor-selector .selector-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      appState.selectedBlueprintFloor = f;
      appState.selectedBlueprintCell = null;
      renderBlueprintGrid(block.id, f);
    });
    container.appendChild(pill);
  }
}

function renderBlueprintGrid(blockId, floor) {
  const grid = document.getElementById('blueprint-grid');
  grid.innerHTML = '';
  const block = appState.blocks.find(b => b.id === blockId);
  const cols = block.classroomsPerFloor + block.labs + block.auditoriums + block.others;

  grid.style.gridTemplateColumns = `repeat(${cols}, 80px)`;

  const roomsOnFloor = appState.rooms.filter(r => r.blockId === blockId && r.floor === floor);

  roomsOnFloor.forEach(room => {
    const cell = document.createElement('div');
    cell.className = `bp-cell type-${room.type}`;
    cell.dataset.roomId = room.id;
    cell.innerHTML = `
      <div class="bp-cell-name">${room.name}</div>
      <div class="bp-cell-type">${room.type}</div>
      <div class="bp-cell-cap">${room.capacity} seats</div>
    `;
    cell.addEventListener('click', () => {
      document.querySelectorAll('.bp-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      appState.selectedBlueprintCell = room.id;
      openRoomEditor(room);
    });
    grid.appendChild(cell);
  });

  document.getElementById('blueprint-grid-info').textContent =
    `${roomsOnFloor.length} rooms on Floor ${floor} • Click a cell to edit`;
}

function openRoomEditor(room) {
  const editor = document.getElementById('blueprint-room-editor');
  const hint = document.getElementById('bp-no-selection');
  editor.classList.remove('hidden');
  hint.classList.add('hidden');
  document.getElementById('bp-room-name').value = room.name;
  document.getElementById('bp-room-type').value = room.type;
  document.getElementById('bp-room-capacity').value = room.capacity;
}

function saveRoomFromBlueprint() {
  const cellId = appState.selectedBlueprintCell;
  if (!cellId) return;
  const room = appState.rooms.find(r => r.id === cellId);
  if (!room) return;

  room.name = document.getElementById('bp-room-name').value || room.name;
  room.type = document.getElementById('bp-room-type').value;
  room.capacity = parseInt(document.getElementById('bp-room-capacity').value) || room.capacity;

  // Update cell
  const cell = document.querySelector(`.bp-cell[data-room-id="${cellId}"]`);
  if (cell) {
    cell.className = `bp-cell type-${room.type} selected`;
    cell.innerHTML = `
      <div class="bp-cell-name">${room.name}</div>
      <div class="bp-cell-type">${room.type}</div>
      <div class="bp-cell-cap">${room.capacity} seats</div>
    `;
  }

  showToast(`Room "${room.name}" saved!`);
}

// ─────────────────────────────────────────────────────────
// 4d. PAGE 4: TIMETABLE
// ─────────────────────────────────────────────────────────

function setupTimetablePage() {
  populateRoomDropdown('tt-room');

  document.getElementById('btn-add-tt').onclick = addTimetableEntry;
  document.getElementById('tt-filter-day').onchange = renderTimetableList;
  document.getElementById('tt-filter-search').oninput = renderTimetableList;

  renderTimetableList();
  renderAIInsights();
}

function populateRoomDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Select Room —</option>';
  appState.rooms.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.name} (${r.blockName}, F${r.floor}) [${r.type}]`;
    sel.appendChild(opt);
  });
  sel.value = current;
}

function addTimetableEntry() {
  const entry = {
    id: `TT_${Date.now()}`,
    branch:    document.getElementById('tt-branch').value.trim(),
    section:   document.getElementById('tt-section').value.trim(),
    subject:   document.getElementById('tt-subject').value.trim(),
    professor: document.getElementById('tt-professor').value.trim(),
    roomId:    document.getElementById('tt-room').value,
    day:       document.getElementById('tt-day').value,
    startTime: document.getElementById('tt-start').value,
    endTime:   document.getElementById('tt-end').value,
  };

  if (!entry.subject || !entry.roomId || !entry.startTime || !entry.endTime) {
    showConflictAlert('tt-conflict-alert', 'Please fill in Subject, Room, and Time fields.');
    return;
  }

  if (AI.timeToMins(entry.startTime) >= AI.timeToMins(entry.endTime)) {
    showConflictAlert('tt-conflict-alert', 'End time must be after start time.');
    return;
  }

  const conflicts = AI.detectConflicts(entry);
  if (conflicts.length > 0) {
    showConflictAlert('tt-conflict-alert', conflicts.join('<br>'));
    return;
  }

  document.getElementById('tt-conflict-alert').classList.add('hidden');
  appState.timetable.push(entry);
  renderTimetableList();
  renderAIInsights();
  showToast('Lecture added to timetable ✓');
}

function renderTimetableList() {
  const filterDay = document.getElementById('tt-filter-day')?.value || '';
  const filterSearch = (document.getElementById('tt-filter-search')?.value || '').toLowerCase();
  const container = document.getElementById('timetable-list');
  if (!container) return;

  let entries = appState.timetable.filter(e => {
    if (filterDay && e.day !== filterDay) return false;
    if (filterSearch) {
      const room = appState.rooms.find(r => r.id === e.roomId);
      const searchStr = `${e.branch} ${e.section} ${e.subject} ${e.professor} ${room?.name || ''}`.toLowerCase();
      if (!searchStr.includes(filterSearch)) return false;
    }
    return true;
  });

  entries.sort((a, b) => {
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayDiff = days.indexOf(a.day) - days.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    return AI.timeToMins(a.startTime) - AI.timeToMins(b.startTime);
  });

  if (entries.length === 0) {
    container.innerHTML = '<div class="audit-empty">No entries found. Add schedule entries using the form.</div>';
    return;
  }

  container.innerHTML = entries.map(e => {
    const room = appState.rooms.find(r => r.id === e.roomId);
    const conflicts = AI.detectConflicts(e);
    const isConflict = conflicts.length > 0;
    return `
      <div class="tt-entry ${isConflict ? 'conflict' : ''}">
        <div class="tt-entry-top">
          <span class="tt-subject">${e.subject}</span>
          <span class="tt-day-badge">${e.day}</span>
        </div>
        <div class="tt-meta">
          <span>🕐 ${e.startTime}–${e.endTime}</span>
          <span>👤 ${e.professor || '—'}</span>
          <span>🏫 ${room ? room.name : 'Unknown Room'}</span>
          <span>👥 ${e.branch || '?'}-${e.section || '?'}</span>
        </div>
        ${isConflict ? `<div style="font-size:0.72rem;color:var(--red);margin-top:0.3rem;">${conflicts[0]}</div>` : ''}
        <button class="tt-delete" onclick="deleteTimetableEntry('${e.id}')" title="Delete">✕</button>
      </div>`;
  }).join('');
}

function deleteTimetableEntry(id) {
  appState.timetable = appState.timetable.filter(e => e.id !== id);
  renderTimetableList();
  renderAIInsights();
  showToast('Entry removed.');
}

function renderAIInsights() {
  const container = document.getElementById('ai-insights-content');
  if (!container) return;
  const insights = AI.generateInsights();
  container.innerHTML = insights.map(i => `
    <div class="insight-item">
      <span class="insight-dot ${i.type}"></span>
      <span>${i.msg}</span>
    </div>`).join('');
}

// ─────────────────────────────────────────────────────────
// 4e. PAGE 5: DASHBOARD
// ─────────────────────────────────────────────────────────

let dashTimer = null;

function refreshDashboard() {
  if (dashTimer) clearInterval(dashTimer);
  renderDashboard();
  dashTimer = setInterval(renderDashboard, 30000); // refresh every 30s
  populateAuditDropdowns();
  setupAuditBooking();
}

function renderDashboard() {
  const day = AI.getCurrentDay();
  const now = AI.getNow();

  document.getElementById('dash-current-time').textContent =
    new Date().toLocaleTimeString('en-US', { hour12: false });

  const statuses = AI.getAllRoomStatuses();
  let occupied = 0, free = 0, upcoming = 0;
  Object.values(statuses).forEach(s => {
    if (s.status === 'occupied') occupied++;
    else if (s.status === 'upcoming') upcoming++;
    else free++;
  });

  document.getElementById('stat-occupied').textContent = occupied;
  document.getElementById('stat-free').textContent = free;
  document.getElementById('stat-upcoming').textContent = upcoming;
  document.getElementById('stat-total').textContent = appState.rooms.length;

  // Render blocks
  const container = document.getElementById('dashboard-blocks');
  container.innerHTML = appState.blocks.map(block => {
    const blockRooms = appState.rooms.filter(r => r.blockId === block.id);
    const floors = [...new Set(blockRooms.map(r => r.floor))].sort((a,b) => a-b);

    return `
      <div class="db-block">
        <div class="db-block-header" onclick="toggleDBBlock(this)">
          <span class="db-block-name">◈ ${block.name}</span>
          <span class="db-block-toggle">▼</span>
        </div>
        <div class="db-block-body" style="display:none">
          ${floors.map(fl => {
            const floorRooms = blockRooms.filter(r => r.floor === fl);
            return `
              <div class="db-floor">
                <div class="db-floor-label">Floor ${fl}</div>
                <div class="db-rooms-grid">
                  ${floorRooms.map(r => {
                    const s = statuses[r.id] || { status: 'free' };
                    let who = '';
                    if (s.entry) {
                      who = `${s.entry.professor || s.entry.branch + '-' + s.entry.section} · ${s.entry.subject}`;
                    } else if (s.nextEntry) {
                      who = `Next: ${s.nextEntry.startTime}`;
                    }
                    const label = { occupied: 'OCCUPIED', upcoming: 'UPCOMING', free: 'FREE' }[s.status];
                    return `<div class="db-room status-${s.status}">
                      <span class="db-room-name">${r.name}</span>
                      <span class="db-room-status">${label}</span>
                      <span class="db-room-who" title="${who}">${who || '—'}</span>
                    </div>`;
                  }).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  if (appState.blocks.length === 0) {
    container.innerHTML = '<div class="audit-empty">No blocks configured yet. Complete the Setup step first.</div>';
  }
}

function toggleDBBlock(header) {
  const body = header.nextElementSibling;
  const toggle = header.querySelector('.db-block-toggle');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  toggle.textContent = isOpen ? '▼' : '▲';
}

function populateAuditDropdowns() {
  const sel = document.getElementById('audit-room-select');
  sel.innerHTML = '<option value="">Select Auditorium</option>';
  const audRooms = appState.rooms.filter(r => r.type === 'auditorium');
  audRooms.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.name} (${r.blockName})`;
    sel.appendChild(opt);
  });

  // Default date to today
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('audit-date').value = today;

  sel.addEventListener('change', renderAuditCalendar);
  document.getElementById('audit-date').addEventListener('change', renderAuditCalendar);
  renderAuditCalendar();
}

function renderAuditCalendar() {
  const roomId = document.getElementById('audit-room-select')?.value;
  const date   = document.getElementById('audit-date')?.value;
  const container = document.getElementById('audit-calendar');
  if (!container) return;

  if (!roomId || !date) {
    container.innerHTML = '<div class="audit-empty">Select a room and date to view bookings.</div>';
    return;
  }

  const bookings = appState.auditBookings.filter(b => b.roomId === roomId && b.date === date);

  if (bookings.length === 0) {
    container.innerHTML = '<div class="audit-empty">No bookings on this date. Auditorium is available!</div>';
    return;
  }

  container.innerHTML = bookings
    .sort((a,b) => AI.timeToMins(a.startTime) - AI.timeToMins(b.startTime))
    .map(b => `
      <div class="audit-booking-item">
        <div class="abi-top">
          <span class="abi-event">${b.event}</span>
          <span class="abi-time">${b.startTime} – ${b.endTime}</span>
        </div>
        <div class="abi-org">By: ${b.organizer}</div>
        <button onclick="deleteAuditBooking('${b.id}')" style="font-size:0.7rem;color:var(--red-dim);background:none;border:none;cursor:pointer;float:right;margin-top:0.2rem;">Remove</button>
      </div>`).join('');
}

function setupAuditBooking() {
  document.getElementById('btn-book-audit').onclick = bookAuditorium;
}

function bookAuditorium() {
  const roomId = document.getElementById('audit-room-select').value;
  const date   = document.getElementById('audit-date').value;
  const start  = document.getElementById('audit-start').value;
  const end    = document.getElementById('audit-end').value;
  const event  = document.getElementById('audit-event').value.trim();
  const org    = document.getElementById('audit-org').value.trim();

  if (!roomId) { showConflictAlert('audit-conflict-alert', 'Please select an auditorium.'); return; }
  if (!date)   { showConflictAlert('audit-conflict-alert', 'Please select a date.'); return; }
  if (!event)  { showConflictAlert('audit-conflict-alert', 'Please enter an event name.'); return; }
  if (AI.timeToMins(start) >= AI.timeToMins(end)) { showConflictAlert('audit-conflict-alert', 'End time must be after start time.'); return; }

  const conflicts = AI.checkAuditConflict(roomId, date, start, end, null);
  if (conflicts.length > 0) {
    showConflictAlert('audit-conflict-alert', `Booking conflict: "${conflicts[0].event}" (${conflicts[0].startTime}–${conflicts[0].endTime}) is already scheduled.`);
    return;
  }

  document.getElementById('audit-conflict-alert').classList.add('hidden');
  appState.auditBookings.push({ id: `AUD_${Date.now()}`, roomId, date, startTime: start, endTime: end, event, organizer: org || 'Admin' });
  renderAuditCalendar();
  document.getElementById('audit-event').value = '';
  document.getElementById('audit-org').value   = '';
  showToast('Auditorium booked successfully ✓');
}

function deleteAuditBooking(id) {
  appState.auditBookings = appState.auditBookings.filter(b => b.id !== id);
  renderAuditCalendar();
  showToast('Booking cancelled.');
}

// ─────────────────────────────────────────────────────────
// 4f. PAGE 6: SEARCH
// ─────────────────────────────────────────────────────────

let searchType = 'classroom';

function setupSearchPage() {
  document.querySelectorAll('.stab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.stab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      searchType = tab.dataset.type;
      updateSearchSuggestions();
      document.getElementById('search-results').innerHTML = '';
    });
  });

  document.getElementById('btn-search').addEventListener('click', performSearch);
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') performSearch();
  });
  document.getElementById('search-input').addEventListener('input', updateSearchSuggestions);

  updateSearchSuggestions();
  renderTodayTimeline();
  renderQuickStats();
}

function updateSearchSuggestions() {
  const suggestions = AI.getSuggestions(searchType);
  const container = document.getElementById('search-suggestions');
  container.innerHTML = suggestions.map(s => `
    <span class="suggestion-chip" onclick="selectSuggestion('${s}')">${s}</span>`).join('');
}

function selectSuggestion(val) {
  document.getElementById('search-input').value = val;
  performSearch();
}

function performSearch() {
  const query = document.getElementById('search-input').value;
  const results = AI.search(searchType, query);
  const container = document.getElementById('search-results');

  if (!query.trim()) {
    container.innerHTML = '<div class="audit-empty">Enter a search term above.</div>';
    return;
  }

  if (results.length === 0) {
    container.innerHTML = `<div class="audit-empty">No results found for "${query}". Try a different search term.</div>`;
    return;
  }

  // Group by entry
  container.innerHTML = results.map(r => {
    const statusClass = r.statusNow === 'occupied' ? 'occupied' : (r.statusNow === 'upcoming' ? 'upcoming' : 'free');
    const statusLabel = r.statusNow === 'occupied' ? 'LIVE NOW' : (r.statusNow === 'upcoming' ? 'UPCOMING' : r.day.toUpperCase());

    return `
      <div class="sr-card">
        <div class="sr-card-header">
          <div class="sr-title">${r.subject}</div>
          <span class="sr-status-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="sr-meta-grid">
          <div class="sr-meta-item">
            <div class="sr-meta-label">Room</div>
            <div class="sr-meta-value">${r.room?.name || '—'}</div>
          </div>
          <div class="sr-meta-item">
            <div class="sr-meta-label">Block / Floor</div>
            <div class="sr-meta-value">${r.room?.blockName || '—'} / F${r.room?.floor || '?'}</div>
          </div>
          <div class="sr-meta-item">
            <div class="sr-meta-label">Time</div>
            <div class="sr-meta-value">${r.startTime} – ${r.endTime}</div>
          </div>
          <div class="sr-meta-item">
            <div class="sr-meta-label">Professor</div>
            <div class="sr-meta-value">${r.professor || '—'}</div>
          </div>
          <div class="sr-meta-item">
            <div class="sr-meta-label">Branch / Section</div>
            <div class="sr-meta-value">${r.branch || '—'} ${r.section || ''}</div>
          </div>
          <div class="sr-meta-item">
            <div class="sr-meta-label">Day</div>
            <div class="sr-meta-value">${r.day}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderTodayTimeline() {
  const day = AI.getCurrentDay();
  const now = AI.getNow();
  const todayEntries = appState.timetable
    .filter(e => e.day === day)
    .sort((a,b) => AI.timeToMins(a.startTime) - AI.timeToMins(b.startTime));

  const container = document.getElementById('search-today-timeline');
  if (!container) return;

  if (todayEntries.length === 0) {
    container.innerHTML = '<div style="color:var(--text-low);font-size:0.8rem;">No classes scheduled for today.</div>';
    return;
  }

  container.innerHTML = todayEntries.slice(0, 12).map(e => {
    const room = appState.rooms.find(r => r.id === e.roomId);
    const nowMins = AI.timeToMins(now);
    const isActive = AI.timeToMins(e.startTime) <= nowMins && nowMins < AI.timeToMins(e.endTime);
    return `
      <div class="timeline-item">
        <span class="tl-time">${e.startTime}</span>
        <span class="tl-dot ${isActive ? 'active' : ''}"></span>
        <div class="tl-info">
          <div class="tl-subject">${e.subject}</div>
          <div class="tl-sub">${room?.name || ''} · ${e.professor || ''}</div>
        </div>
      </div>`;
  }).join('');
}

function renderQuickStats() {
  const container = document.getElementById('search-quick-stats');
  if (!container) return;
  const profs = new Set(appState.timetable.map(e => e.professor).filter(Boolean));
  const sections = new Set(appState.timetable.map(e => `${e.branch}-${e.section}`).filter(e => e !== '-'));
  const rooms = new Set(appState.timetable.map(e => e.roomId));

  container.innerHTML = [
    ['Total Entries', appState.timetable.length],
    ['Professors', profs.size],
    ['Sections', sections.size],
    ['Rooms Used', rooms.size],
    ['Total Rooms', appState.rooms.length],
  ].map(([label, val]) => `
    <div class="qs-item">
      <span class="qs-label">${label}</span>
      <span class="qs-val">${val}</span>
    </div>`).join('');
}

// ─────────────────────────────────────────────────────────
// 4g. PAGE 7: 3D CAMPUS VISUALIZATION
// ─────────────────────────────────────────────────────────

let threeScene = null;

function setupViz3D() {
  if (!window.THREE) {
    document.getElementById('viz3d-canvas').parentElement.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-mid);font-size:0.9rem;">Three.js not loaded. Please ensure internet connection for CDN.</div>';
    return;
  }

  if (threeScene) {
    // Already initialized; just refresh colors
    threeScene.refreshColors();
    return;
  }

  threeScene = initThreeScene();
  renderViz3DBlockList();
}

function initThreeScene() {
  const canvas = document.getElementById('viz3d-canvas');
  const W = canvas.parentElement.offsetWidth;
  const H = canvas.parentElement.offsetHeight - 44; // subtract topbar

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.setClearColor(0x070b14, 1);

  // Scene
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070b14, 0.018);

  // Camera
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 1000);
  camera.position.set(0, 35, 60);
  camera.lookAt(0, 0, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0x1a2a4a, 0.9));
  const dirLight = new THREE.DirectionalLight(0x4488ff, 0.6);
  dirLight.position.set(20, 40, 20);
  scene.add(dirLight);

  const cyanLight = new THREE.PointLight(0x00d4ff, 0.5, 80);
  cyanLight.position.set(0, 20, 0);
  scene.add(cyanLight);

  // Grid floor
  const gridHelper = new THREE.GridHelper(200, 40, 0x102030, 0x0d1a28);
  scene.add(gridHelper);

  // Build campus geometry
  const blockMeshGroups = {};
  const roomMeshes = {}; // roomId -> mesh

  const blockCount = appState.blocks.length;
  const BLOCK_GAP = 28;

  appState.blocks.forEach((block, bi) => {
    const bx = (bi - (blockCount - 1) / 2) * BLOCK_GAP;
    const group = new THREE.Group();
    group.position.set(bx, 0, 0);
    group.userData = { blockId: block.id, blockName: block.name };
    blockMeshGroups[block.id] = group;

    // Block rooms
    const blockRooms = appState.rooms.filter(r => r.blockId === block.id);
    const floors = block.floors;
    const floorH = 3.5;
    const colCount = block.classroomsPerFloor + block.labs + block.auditoriums + block.others;

    // Floor slabs
    for (let f = 1; f <= floors; f++) {
      const slabGeo = new THREE.BoxGeometry(colCount * 4.5 + 1, 0.15, 6.5);
      const slabMat = new THREE.MeshLambertMaterial({ color: 0x0d1424, transparent: true, opacity: 0.85 });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set((colCount - 1) * 2.25, (f - 1) * floorH + floorH, 0);
      group.add(slab);
    }

    // Room boxes
    blockRooms.forEach(room => {
      const isAudit = room.type === 'auditorium';
      const isLab   = room.type === 'lab';
      const w = isAudit ? 5 : 3.8;
      const h = isAudit ? floorH * 1.8 : floorH * 0.8;
      const d = isAudit ? 5.5 : 4.8;

      const geo = new THREE.BoxGeometry(w, h, d);

      // Determine color from AI
      const status = getColorForRoom(room);
      const mat = new THREE.MeshLambertMaterial({
        color: status.color,
        transparent: true,
        opacity: 0.82,
      });

      const mesh = new THREE.Mesh(geo, mat);
      const col = room.col - 1;
      const y   = isAudit ? floorH * 0.9 : (room.floor - 1) * floorH + h / 2 + 0.15;
      mesh.position.set(col * 4.5, y, 0);
      mesh.castShadow = true;
      mesh.userData = { roomId: room.id, room };

      // Room edge outline
      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({ color: status.edgeColor, transparent: true, opacity: 0.5 });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      mesh.add(wireframe);

      roomMeshes[room.id] = mesh;
      group.add(mesh);
    });

    // Block label sprite
    const canvas2d = document.createElement('canvas');
    canvas2d.width = 256; canvas2d.height = 64;
    const ctx2 = canvas2d.getContext('2d');
    ctx2.fillStyle = 'rgba(0,212,255,0.9)';
    ctx2.font = 'bold 28px Orbitron, monospace';
    ctx2.textAlign = 'center';
    ctx2.fillText(block.name.toUpperCase(), 128, 44);
    const tex = new THREE.CanvasTexture(canvas2d);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(12, 3, 1);
    sprite.position.set((colCount - 1) * 2.25, floors * floorH + 4, 0);
    group.add(sprite);

    scene.add(group);
  });

  // ── Orbit Controls (manual implementation) ──
  let isDragging = false, isRightDrag = false;
  let lastMouse = { x: 0, y: 0 };
  let spherical = { theta: 0.3, phi: 0.9, radius: 70 };
  let target = new THREE.Vector3(0, 5, 0);

  function updateCamera() {
    camera.position.set(
      target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
      target.y + spherical.radius * Math.cos(spherical.phi),
      target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta),
    );
    camera.lookAt(target);
  }
  updateCamera();

  canvas.addEventListener('mousedown', e => {
    isDragging = true;
    isRightDrag = e.button === 2;
    lastMouse = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    lastMouse = { x: e.clientX, y: e.clientY };

    if (isRightDrag) {
      // Pan
      const right = new THREE.Vector3().crossVectors(
        new THREE.Vector3(0,1,0),
        new THREE.Vector3().subVectors(target, camera.position).normalize()
      ).normalize();
      target.addScaledVector(right, -dx * 0.08);
      target.y += dy * 0.08;
    } else {
      // Rotate
      spherical.theta -= dx * 0.006;
      spherical.phi = Math.max(0.1, Math.min(Math.PI / 2, spherical.phi + dy * 0.006));
    }
    updateCamera();
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

  canvas.addEventListener('wheel', e => {
    spherical.radius = Math.max(10, Math.min(150, spherical.radius + e.deltaY * 0.05));
    updateCamera();
    e.preventDefault();
  }, { passive: false });

  // ── Raycaster for room clicks ──
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const meshArray = Object.values(roomMeshes);
    const intersects = raycaster.intersectObjects(meshArray, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData.room) {
        openViz3DPanel(hit.userData.room);
        // Animate camera focus toward block
        const blockGroup = blockMeshGroups[hit.userData.room.blockId];
        if (blockGroup) {
          const wp = new THREE.Vector3();
          blockGroup.getWorldPosition(wp);
          animateCameraTo(wp, spherical, updateCamera);
        }
      }
    }
  });

  // ── Animation loop ──
  let tick = 0;
  function animate() {
    requestAnimationFrame(animate);
    tick++;
    cyanLight.intensity = 0.4 + 0.15 * Math.sin(tick * 0.02);
    renderer.render(scene, camera);
  }
  animate();

  // ── Handle resize ──
  window.addEventListener('resize', () => {
    const W2 = canvas.parentElement.offsetWidth;
    const H2 = canvas.parentElement.offsetHeight - 44;
    renderer.setSize(W2, H2);
    camera.aspect = W2 / H2;
    camera.updateProjectionMatrix();
  });

  return {
    refreshColors() {
      Object.entries(roomMeshes).forEach(([roomId, mesh]) => {
        const room = appState.rooms.find(r => r.id === roomId);
        if (!room) return;
        const status = getColorForRoom(room);
        mesh.material.color.setHex(status.color);
        mesh.children.forEach(c => {
          if (c.material) c.material.color.setHex(status.edgeColor);
        });
      });
    },
  };
}

function getColorForRoom(room) {
  const day = AI.getCurrentDay();
  const now = AI.getNow();
  const s = AI.getRoomStatus(room.id, day, now);

  if (room.type === 'lab')       return { color: 0x1e3a8a, edgeColor: 0x4488ff };
  if (room.type === 'auditorium') return { color: 0x3d2200, edgeColor: 0xffb800 };

  if (s.status === 'occupied') return { color: 0x3a0808, edgeColor: 0xff4444 };
  if (s.status === 'upcoming') return { color: 0x2a2000, edgeColor: 0xffb800 };
  return { color: 0x042a10, edgeColor: 0x00e676 };
}

function animateCameraTo(targetPos, spherical, updateFn) {
  // Simple lerp animation toward new target
  const steps = 30;
  let step = 0;
  const origTarget = { x: 0, y: 5, z: 0 }; // approximate
  const iv = setInterval(() => {
    if (step++ >= steps) { clearInterval(iv); return; }
    const t = step / steps;
    origTarget.x += (targetPos.x - origTarget.x) * t * 0.08;
    origTarget.z += (targetPos.z - origTarget.z) * t * 0.08;
    updateFn();
  }, 16);
}

function openViz3DPanel(room) {
  const panel = document.getElementById('viz3d-panel-content');
  const day = AI.getCurrentDay();
  const now = AI.getNow();
  const s = AI.getRoomStatus(room.id, day, now);

  const statusLabel = { occupied: 'OCCUPIED', upcoming: 'UPCOMING SOON', free: 'AVAILABLE' }[s.status];
  const statusClass = s.status;

  const todaySchedule = AI.getRoomSchedule(room.id, day);

  panel.innerHTML = `
    <div class="room-detail-card">
      <div class="rdc-status-banner ${statusClass}">
        <span class="status-dot"></span>
        ${statusLabel}
      </div>
      <div class="rdc-room-name">${room.name}</div>
      <div class="rdc-block-info">${room.blockName} · Floor ${room.floor} · ${room.type.toUpperCase()}</div>
      ${s.entry ? `
        <div class="rdc-detail-row"><span class="rdc-key">Subject</span><span class="rdc-val">${s.entry.subject}</span></div>
        <div class="rdc-detail-row"><span class="rdc-key">Professor</span><span class="rdc-val">${s.entry.professor || '—'}</span></div>
        <div class="rdc-detail-row"><span class="rdc-key">Section</span><span class="rdc-val">${s.entry.branch || '?'}-${s.entry.section || '?'}</span></div>
        <div class="rdc-detail-row"><span class="rdc-key">Time</span><span class="rdc-val">${s.entry.startTime} – ${s.entry.endTime}</span></div>
      ` : `
        <div class="rdc-detail-row"><span class="rdc-key">Capacity</span><span class="rdc-val">${room.capacity} seats</span></div>
        ${s.nextEntry ? `<div class="rdc-detail-row"><span class="rdc-key">Next Class</span><span class="rdc-val">${s.nextEntry.startTime} – ${s.nextEntry.subject}</span></div>` : ''}
      `}
      <div class="rdc-schedule-header">TODAY'S SCHEDULE</div>
      ${todaySchedule.length > 0 ? todaySchedule.map(e => `
        <div class="rdc-schedule-item">
          <span style="font-family:var(--font-data);color:var(--cyan);font-size:0.7rem;">${e.startTime}–${e.endTime}</span>
          <span style="color:var(--text-hi);font-size:0.78rem;">${e.subject}</span>
        </div>`).join('') : '<div style="color:var(--text-low);font-size:0.75rem;">No classes today</div>'}
    </div>`;
}

function renderViz3DBlockList() {
  const container = document.getElementById('viz3d-block-list');
  container.innerHTML = appState.blocks.map(b => {
    const blockRooms = appState.rooms.filter(r => r.blockId === b.id);
    const statuses = AI.getAllRoomStatuses();
    const occupied = blockRooms.filter(r => statuses[r.id]?.status === 'occupied').length;
    return `
      <div class="vbl-item">
        <span class="vbl-name">◈ ${b.name}</span>
        <span class="vbl-count">${occupied}/${blockRooms.length} occupied</span>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────
// 5. DEMO DATA LOADER
// ─────────────────────────────────────────────────────────

function loadDemoData() {
  appState.collegeName = 'National Institute of Technology, Trichy';
  appState.blocks = [
    { id: 'BLK1', name: 'Block A (CSE)', floors: 4, classroomsPerFloor: 4, labs: 2, auditoriums: 1, others: 1 },
    { id: 'BLK2', name: 'Block B (ECE)', floors: 3, classroomsPerFloor: 4, labs: 2, auditoriums: 0, others: 1 },
    { id: 'BLK3', name: 'Block C (MECH)', floors: 3, classroomsPerFloor: 3, labs: 3, auditoriums: 1, others: 0 },
  ];

  appState.rooms = [];
  appState.blocks.forEach(block => {
    for (let fl = 1; fl <= block.floors; fl++) {
      for (let c = 1; c <= block.classroomsPerFloor; c++) {
        appState.rooms.push({
          id: `${block.id}_F${fl}_C${c}`,
          name: `${block.id === 'BLK1' ? 'CS' : block.id === 'BLK2' ? 'EC' : 'ME'}-${fl}0${c}`,
          type: 'classroom', capacity: 60,
          blockId: block.id, blockName: block.name, floor: fl, col: c,
        });
      }
    }
    for (let j = 0; j < block.labs; j++) {
      const prefix = block.id === 'BLK1' ? 'CS' : block.id === 'BLK2' ? 'EC' : 'ME';
      appState.rooms.push({
        id: `${block.id}_LAB${j+1}`,
        name: `${prefix}-Lab${j+1}`,
        type: 'lab', capacity: 40,
        blockId: block.id, blockName: block.name, floor: 1, col: block.classroomsPerFloor + j + 1,
      });
    }
    for (let j = 0; j < block.auditoriums; j++) {
      appState.rooms.push({
        id: `${block.id}_AUD${j+1}`,
        name: `${block.name.split(' ')[0]} ${block.name.split(' ')[1]} Auditorium`,
        type: 'auditorium', capacity: 500,
        blockId: block.id, blockName: block.name, floor: 1, col: block.classroomsPerFloor + block.labs + j + 1,
      });
    }
    for (let j = 0; j < block.others; j++) {
      appState.rooms.push({
        id: `${block.id}_OTH${j+1}`,
        name: `${block.id === 'BLK1' ? 'CS' : 'EC'}-SemHall${j+1}`,
        type: 'seminar', capacity: 100,
        blockId: block.id, blockName: block.name, floor: 2, col: 1,
      });
    }
  });

  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const cs_rooms = appState.rooms.filter(r => r.blockId === 'BLK1' && r.type === 'classroom');
  const ec_rooms = appState.rooms.filter(r => r.blockId === 'BLK2' && r.type === 'classroom');

  const csEntries = [
    { branch:'CSE', section:'A', subject:'Data Structures', professor:'Dr. Priya Sharma', day:'Monday', startTime:'09:00', endTime:'10:00', roomIdx:0 },
    { branch:'CSE', section:'B', subject:'Algorithms', professor:'Prof. Anand Kumar', day:'Monday', startTime:'09:00', endTime:'10:00', roomIdx:1 },
    { branch:'CSE', section:'A', subject:'Operating Systems', professor:'Dr. Ravi Gupta', day:'Monday', startTime:'10:00', endTime:'11:00', roomIdx:0 },
    { branch:'CSE', section:'A', subject:'DBMS', professor:'Dr. Priya Sharma', day:'Tuesday', startTime:'09:00', endTime:'10:00', roomIdx:0 },
    { branch:'CSE', section:'C', subject:'Computer Networks', professor:'Dr. Kavya Nair', day:'Tuesday', startTime:'10:00', endTime:'11:00', roomIdx:2 },
    { branch:'CSE', section:'A', subject:'Machine Learning', professor:'Prof. Suresh Rao', day:'Wednesday', startTime:'11:00', endTime:'12:00', roomIdx:3 },
    { branch:'CSE', section:'B', subject:'Web Development', professor:'Prof. Anand Kumar', day:'Thursday', startTime:'14:00', endTime:'15:00', roomIdx:1 },
    { branch:'CSE', section:'A', subject:'Compiler Design', professor:'Dr. Ravi Gupta', day:'Friday', startTime:'09:00', endTime:'10:00', roomIdx:0 },
  ];

  // Add current-day entries so dashboard shows live data
  const today = AI.getCurrentDay();
  const now = AI.getNow();
  const nowMins = AI.timeToMins(now);
  const currentHour = `${String(new Date().getHours()).padStart(2,'0')}:00`;
  const nextHour = `${String(new Date().getHours() + 1).padStart(2,'0')}:00`;
  const nextNextHour = `${String(new Date().getHours() + 2).padStart(2,'0')}:00`;

  if (today !== 'Saturday' && today !== 'Sunday' && cs_rooms.length >= 4) {
    csEntries.push(
      { branch:'CSE', section:'A', subject:'Artificial Intelligence', professor:'Dr. Priya Sharma', day: today, startTime: currentHour, endTime: nextHour, roomIdx:0 },
      { branch:'CSE', section:'B', subject:'Cloud Computing', professor:'Prof. Anand Kumar', day: today, startTime: currentHour, endTime: nextHour, roomIdx:1 },
      { branch:'CSE', section:'C', subject:'Big Data Analytics', professor:'Dr. Kavya Nair', day: today, startTime: nextHour, endTime: nextNextHour, roomIdx:2 },
    );
  }

  csEntries.forEach((e, i) => {
    if (cs_rooms[e.roomIdx]) {
      appState.timetable.push({
        id: `TT_DEMO_${i}`,
        branch: e.branch, section: e.section,
        subject: e.subject, professor: e.professor,
        roomId: cs_rooms[e.roomIdx].id,
        day: e.day, startTime: e.startTime, endTime: e.endTime,
      });
    }
  });

  // ECE entries
  if (ec_rooms.length >= 3) {
    const ecEntries = [
      { branch:'ECE', section:'A', subject:'Digital Electronics', professor:'Dr. Meena Iyer', day:'Monday', startTime:'11:00', endTime:'12:00', roomIdx:0 },
      { branch:'ECE', section:'B', subject:'Signals & Systems', professor:'Prof. Kartik Menon', day:'Tuesday', startTime:'09:00', endTime:'10:00', roomIdx:1 },
      { branch:'ECE', section:'A', subject:'VLSI Design', professor:'Dr. Meena Iyer', day:'Wednesday', startTime:'14:00', endTime:'15:00', roomIdx:0 },
    ];
    if (today !== 'Saturday' && today !== 'Sunday') {
      ecEntries.push({
        branch:'ECE', section:'A', subject:'Microcontrollers', professor:'Prof. Kartik Menon',
        day: today, startTime: currentHour, endTime: nextHour, roomIdx: 2
      });
    }
    ecEntries.forEach((e, i) => {
      appState.timetable.push({
        id: `TT_ECE_${i}`,
        branch: e.branch, section: e.section,
        subject: e.subject, professor: e.professor,
        roomId: ec_rooms[e.roomIdx].id,
        day: e.day, startTime: e.startTime, endTime: e.endTime,
      });
    });
  }

  // Demo audit bookings
  const audRoom = appState.rooms.find(r => r.type === 'auditorium');
  if (audRoom) {
    const today2 = new Date().toISOString().slice(0,10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10);
    appState.auditBookings = [
      { id:'AUD_D1', roomId: audRoom.id, date: today2, startTime:'14:00', endTime:'17:00', event:'Annual Tech Symposium', organizer:'CSE Dept' },
      { id:'AUD_D2', roomId: audRoom.id, date: tomorrow, startTime:'10:00', endTime:'13:00', event:'Guest Lecture: AI in Healthcare', organizer:'Dr. Priya Sharma' },
    ];
  }

  document.getElementById('nav-college-name').textContent = appState.collegeName;
  document.getElementById('main-nav').classList.remove('hidden');
  showToast('Demo data loaded! 🎓');
  showPage('dashboard');
}

// ─────────────────────────────────────────────────────────
// 6. UTILITIES
// ─────────────────────────────────────────────────────────

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
    background: var(--bg-card); border: 1px solid var(--border-act);
    color: var(--cyan); padding: 0.65rem 1.25rem; border-radius: 8px;
    font-family: var(--font-data); font-size: 0.82rem;
    box-shadow: 0 4px 20px rgba(0,212,255,0.15);
    animation: fadeSlideUp 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; setTimeout(() => toast.remove(), 400); }, 2800);
}

function showConflictAlert(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  const clockEl = document.getElementById('nav-clock');
  if (clockEl) clockEl.textContent = timeStr;

  // Update dashboard clock if on that page
  const dashClock = document.getElementById('dash-current-time');
  if (dashClock) dashClock.textContent = timeStr;
}

// ─────────────────────────────────────────────────────────
// 7. INITIALIZER
// ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Start clock
  updateClock();
  setInterval(updateClock, 1000);

  // Landing page
  initLandingCanvas();
  initSetupPage();

  // Navigation buttons
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  // Landing CTAs
  document.getElementById('btn-get-started').addEventListener('click', () => {
    document.getElementById('main-nav').classList.remove('hidden');
    showPage('setup');
  });

  document.getElementById('btn-load-demo').addEventListener('click', loadDemoData);

  // Viz3D close panel
  document.getElementById('viz3d-close-panel').addEventListener('click', () => {
    document.getElementById('viz3d-panel-content').innerHTML = `
      <div class="vp-empty">
        <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        <p>Click on any room<br>in the 3D view to<br>see its details here</p>
      </div>`;
  });

  // Setup page live preview on name input
  document.getElementById('college-name').addEventListener('input', e => {
    document.getElementById('nav-college-name').textContent = e.target.value || '—';
  });

  console.log('%cSmartCampus AI Engine Initialized', 'color:#00d4ff;font-family:monospace;font-size:14px;font-weight:bold;');
  console.log('%cAI Engine · Three.js 3D · Conflict Detection · Live Status Tracking', 'color:#8ba3c7;font-family:monospace;font-size:11px;');
});
