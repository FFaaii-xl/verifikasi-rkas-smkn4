// State
const STORAGE_KEY = 'RKAS_VERIFIKASI_DATA_2026';
const SUPABASE_URL_KEY = 'RKAS_SUPABASE_URL';
const SUPABASE_KEY_KEY = 'RKAS_SUPABASE_KEY';

// Default Supabase Credentials (100% Automatic Connection)
const DEFAULT_SUPABASE_URL = 'https://vctllgknukpegpzklwiw.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_euuqhnGSZ2uUpMfTOIWpXw_fAtbsGqy';

let rkasData = [];
let filteredData = [];
let selectedIndices = new Set();
let activeRowIndex = -1;
let supabaseClient = null;
let cloudSyncTimer = null;
let realtimeChannel = null;

// Init
window.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
  renderAll();
  initSupabase();
});

// Load Data from LocalStorage or Default
function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        rkasData = INITIAL_RKAS_DATA.map(initItem => {
          const found = parsed.find(p => p.no === initItem.no);
          return {
            ...initItem,
            status: found ? (found.status || '') : '',
            keterangan: found ? (found.keterangan || '') : ''
          };
        });
        return;
      }
    } catch (e) {
      console.error('Failed to parse localStorage', e);
    }
  }
  rkasData = JSON.parse(JSON.stringify(INITIAL_RKAS_DATA));
}

// Auto Save (Local & Cloud Sync)
function saveData() {
  saveDataLocalOnly();
  triggerCloudSync();
}

function saveDataLocalOnly() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rkasData));
  } catch (e) {
    console.error('LocalStorage save failed', e);
  }
  updateStats();
  updateParentRowsDOM();
}

function triggerCloudSync() {
  if (!supabaseClient) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    pushAllToCloud(true);
  }, 1200);
}

// Format Rupiah
function formatRp(val) {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return 'Rp ' + Number(val).toLocaleString('id-ID');
}

function formatNum(val) {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return Number(val).toLocaleString('id-ID');
}

function getTodayFormatted() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

// Setup Event Listeners
function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('filterStandar').addEventListener('change', applyFilters);
  document.getElementById('filterTahap').addEventListener('change', applyFilters);
  document.getElementById('filterStatus').addEventListener('change', applyFilters);

  // Keyboard Navigation
  window.addEventListener('keydown', handleKeyNavigation);

  // Modal Help
  document.getElementById('btnKeyboardHelp').addEventListener('click', () => toggleKeyboardModal(true));

  // Backup & Restore
  document.getElementById('btnBackup').addEventListener('click', downloadBackupJSON);
  document.getElementById('fileRestore').addEventListener('change', handleRestoreJSON);

  // Export Excel
  document.getElementById('btnExportExcel').addEventListener('click', exportToExcel);

  // Select All Checkbox
  document.getElementById('headerCheckbox').addEventListener('change', (e) => {
    if (e.target.checked) {
      filteredData.filter(x => x.level === 4).forEach(item => selectedIndices.add(item.no));
    } else {
      selectedIndices.clear();
    }
    updateSelectionUI();
    renderTable();
  });

  document.getElementById('btnSelectAllVisible').addEventListener('click', () => {
    filteredData.filter(x => x.level === 4).forEach(item => selectedIndices.add(item.no));
    updateSelectionUI();
    renderTable();
  });

  // Supabase Cloud Modal & Actions
  const btnCloudModal = document.getElementById('btnSupabaseModal');
  if (btnCloudModal) btnCloudModal.addEventListener('click', () => toggleSupabaseModal(true));

  const btnConnect = document.getElementById('btnConnectSupabase');
  if (btnConnect) btnConnect.addEventListener('click', handleConnectSupabase);

  const btnPush = document.getElementById('btnPushToCloud');
  if (btnPush) btnPush.addEventListener('click', () => pushAllToCloud(false));

  const btnPull = document.getElementById('btnPullFromCloud');
  if (btnPull) btnPull.addEventListener('click', () => pullFromCloud(false));
}

function toggleKeyboardModal(show) {
  const modal = document.getElementById('modalKeyboard');
  if (show) modal.classList.add('open');
  else modal.classList.remove('open');
}

// ==========================================================================
// SUPABASE CLOUD INTEGRATION (100% Automatic & Realtime)
// ==========================================================================
function initSupabase() {
  const url = localStorage.getItem(SUPABASE_URL_KEY) || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem(SUPABASE_KEY_KEY) || DEFAULT_SUPABASE_KEY;

  const inputUrl = document.getElementById('inputSupabaseUrl');
  const inputKey = document.getElementById('inputSupabaseAnonKey');
  if (inputUrl) inputUrl.value = url;
  if (inputKey) inputKey.value = key;

  if (window.supabase && url && key) {
    try {
      supabaseClient = window.supabase.createClient(url, key);
      updateCloudStatusUI(true, 'Terhubung Otomatis');
      
      // 1. Silently pull latest cloud data on startup
      pullFromCloud(true);

      // 2. Setup Realtime Subscription for live sync across all devices
      setupRealtimeSync();
    } catch (e) {
      console.warn('Supabase init error:', e);
      updateCloudStatusUI(false, 'Gagal terhubung: ' + e.message);
    }
  } else {
    updateCloudStatusUI(false, 'Menunggu Supabase Client...');
  }
}

function setupRealtimeSync() {
  if (!supabaseClient) return;
  try {
    if (realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel);
    }
    realtimeChannel = supabaseClient
      .channel('public:rkas_verifikasi')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rkas_verifikasi' }, payload => {
        if (payload.new && payload.new.no) {
          const item = rkasData.find(x => x.no === payload.new.no);
          if (item) {
            item.status = payload.new.status || '';
            item.keterangan = payload.new.keterangan || '';
            saveDataLocalOnly();
            applyFilters();
            const now = new Date().toLocaleTimeString('id-ID');
            updateCloudStatusUI(true, 'Sinkron Realtime', now);
          }
        }
      })
      .subscribe();
  } catch (err) {
    console.warn('Realtime subscription error:', err);
  }
}

function handleConnectSupabase() {
  const url = document.getElementById('inputSupabaseUrl').value.trim();
  const key = document.getElementById('inputSupabaseAnonKey').value.trim();

  if (!url || !key) {
    alert('Silakan masukkan Supabase Project URL dan Public Anon Key terlebih dahulu!');
    return;
  }

  localStorage.setItem(SUPABASE_URL_KEY, url);
  localStorage.setItem(SUPABASE_KEY_KEY, key);

  try {
    supabaseClient = window.supabase.createClient(url, key);
    updateCloudStatusUI(true, 'Menghubungkan...');
    pullFromCloud(false);
  } catch (err) {
    alert('Gagal inisialisasi Supabase: ' + err.message);
    updateCloudStatusUI(false, 'Error: ' + err.message);
  }
}

function updateCloudStatusUI(isConnected, desc, lastSync = null) {
  const btnCloud = document.getElementById('btnSupabaseModal');
  const statusText = document.getElementById('cloudStatusText');
  const dot = document.getElementById('cloudStatusDot');
  const descEl = document.getElementById('cloudStatusDesc');
  const lastSyncEl = document.getElementById('cloudLastSync');

  if (isConnected) {
    if (btnCloud) btnCloud.classList.add('connected');
    if (statusText) statusText.textContent = 'Cloud Aktif';
    if (dot) dot.style.background = '#10b981';
    if (descEl) {
      descEl.textContent = desc || 'Terhubung ke Supabase';
      descEl.style.color = '#065f46';
    }
  } else {
    if (btnCloud) btnCloud.classList.remove('connected');
    if (statusText) statusText.textContent = 'Cloud Supabase';
    if (dot) dot.style.background = '#94a3b8';
    if (descEl) {
      descEl.textContent = desc || 'Belum Terhubung ke Cloud';
      descEl.style.color = '#334155';
    }
  }

  if (lastSync && lastSyncEl) {
    lastSyncEl.textContent = `Sinkron: ${lastSync}`;
  }
}

function toggleSupabaseModal(show) {
  const modal = document.getElementById('modalSupabase');
  if (show) modal.classList.add('open');
  else modal.classList.remove('open');
}

async function pushAllToCloud(silent = false) {
  if (!supabaseClient) {
    if (!silent) alert('Silakan masukkan Supabase Anon Key dan klik "Hubungkan & Sinkronkan" terlebih dahulu!');
    return;
  }

  try {
    updateCloudStatusUI(true, 'Sedang mengunggah...');
    const payload = rkasData.map(item => ({
      no: item.no,
      level: item.level || 4,
      kode_program: item.kode_program || '',
      kode_rekening: item.kode_rekening || '',
      uraian: item.uraian || '',
      volume: item.volume !== null && item.volume !== undefined ? String(item.volume) : null,
      satuan: item.satuan || '',
      tarif_harga: item.tarif_harga !== null && item.tarif_harga !== undefined ? Number(item.tarif_harga) : null,
      jumlah: item.jumlah !== null && item.jumlah !== undefined ? Number(item.jumlah) : 0,
      tahap_1: item.tahap_1 !== null && item.tahap_1 !== undefined ? Number(item.tahap_1) : 0,
      tahap_2: item.tahap_2 !== null && item.tahap_2 !== undefined ? Number(item.tahap_2) : 0,
      status: item.status || '',
      keterangan: item.keterangan || '',
      updated_at: new Date().toISOString()
    }));

    // Batch in 100 rows to avoid request limits
    for (let i = 0; i < payload.length; i += 100) {
      const chunk = payload.slice(i, i + 100);
      const { error } = await supabaseClient
        .from('rkas_verifikasi')
        .upsert(chunk, { onConflict: 'no' });
      if (error) throw error;
    }

    const now = new Date().toLocaleTimeString('id-ID');
    updateCloudStatusUI(true, 'Tersinkron dengan Cloud', now);
    if (!silent) alert(`Berhasil mengunggah ${payload.length} data verifikasi ke Supabase Cloud!`);
  } catch (err) {
    console.error('Push to cloud error:', err);
    updateCloudStatusUI(false, 'Gagal unggah: ' + err.message);
    if (!silent) {
      alert('Gagal mengunggah ke Supabase: ' + err.message + '\n\nPastikan tabel "rkas_verifikasi" sudah dibuat di Supabase melalui menu SQL Editor.');
    }
  }
}

async function pullFromCloud(silent = false) {
  if (!supabaseClient) {
    if (!silent) alert('Silakan hubungkan Supabase terlebih dahulu!');
    return;
  }

  try {
    updateCloudStatusUI(true, 'Sedang memeriksa data...');
    const { data, error } = await supabaseClient
      .from('rkas_verifikasi')
      .select('no, status, keterangan')
      .order('no', { ascending: true });

    if (error) throw error;

    if (Array.isArray(data) && data.length > 0) {
      let updatedCount = 0;
      data.forEach(row => {
        const item = rkasData.find(x => x.no === row.no);
        if (item) {
          if (row.status !== undefined && row.status !== null) item.status = row.status;
          if (row.keterangan !== undefined && row.keterangan !== null) item.keterangan = row.keterangan;
          updatedCount++;
        }
      });
      saveDataLocalOnly();
      applyFilters();
      const now = new Date().toLocaleTimeString('id-ID');
      updateCloudStatusUI(true, 'Tersinkron dengan Cloud', now);
      if (!silent) alert(`Berhasil menyinkronkan ${updatedCount} data dari Supabase Cloud!`);
    } else {
      updateCloudStatusUI(true, 'Terhubung (Tabel masih kosong)');
      if (!silent) {
        if (confirm('Tabel "rkas_verifikasi" di Supabase masih kosong. Apakah Anda ingin mengunggah data verifikasi saat ini ke Supabase?')) {
          pushAllToCloud(false);
        }
      }
    }
  } catch (err) {
    console.error('Pull from cloud error:', err);
    updateCloudStatusUI(false, 'Gagal mengambil data: ' + err.message);
    if (!silent) {
      alert('Gagal mengambil data dari Supabase: ' + err.message + '\n\nPastikan tabel "rkas_verifikasi" sudah dibuat.');
    }
  }
}

function copySqlSchema() {
  const sql = `-- Migration: Create rkas_verifikasi table for SMKN 4 Surakarta
CREATE TABLE IF NOT EXISTS public.rkas_verifikasi (
  no integer PRIMARY KEY,
  level integer NOT NULL DEFAULT 4,
  kode_program text,
  kode_rekening text,
  uraian text,
  volume text,
  satuan text,
  tarif_harga numeric,
  jumlah numeric,
  tahap_1 numeric,
  tahap_2 numeric,
  status text DEFAULT '',
  keterangan text DEFAULT '',
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.rkas_verifikasi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all" ON public.rkas_verifikasi;
CREATE POLICY "Allow public all" ON public.rkas_verifikasi
  FOR ALL USING (true) WITH CHECK (true);
`;
  navigator.clipboard.writeText(sql).then(() => {
    alert('SQL Schema berhasil disalin ke clipboard! Silakan buka SQL Editor di Supabase dan Paste.');
  }).catch(() => {
    prompt('Salin teks SQL di bawah ini:', sql);
  });
}

// Filter Logic
function applyFilters() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const std = document.getElementById('filterStandar').value;
  const thp = document.getElementById('filterTahap').value;
  const sts = document.getElementById('filterStatus').value;

  filteredData = rkasData.filter(item => {
    if (q) {
      const matchText = (item.uraian || '') + ' ' + (item.kode_rekening || '') + ' ' + (item.kode_program || '') + ' ' + (item.no || '') + ' ' + (item.keterangan || '');
      if (!matchText.toLowerCase().includes(q)) return false;
    }

    if (std !== 'ALL') {
      const prog = item.kode_program || '';
      if (!prog.startsWith(std)) return false;
    }

    if (thp === 'T1' && (!item.tahap_1 || item.tahap_1 <= 0)) return false;
    if (thp === 'T2' && (!item.tahap_2 || item.tahap_2 <= 0)) return false;

    if (sts === 'UNCHECKED' && item.status) return false;
    if (sts !== 'ALL' && sts !== 'UNCHECKED' && item.status !== sts) return false;

    return true;
  });

  document.getElementById('visibleCount').textContent = filteredData.length;
  renderTable();
}

// HIERARCHY AUTO-UPDATE & MANUAL SWITCH LOGIC:
// Check if all children under a parent (Level 1, 2, or 3) are "Terlaksana"
function computeParentStatus(parentItem) {
  const prefix = (parentItem.kode_program || '').trim();
  const children = rkasData.filter(x => x.level === 4 && (x.kode_program || '').trim().startsWith(prefix));
  const total = children.length;

  if (total === 0) {
    return { status: '', isAllDone: false, label: '-', btnClass: 'parent-btn-pending', pct: 0, done: 0, total: 0 };
  }

  const done = children.filter(c => c.status === 'Terlaksana').length;
  const cancel = children.filter(c => c.status === 'Tidak Terlaksana').length;
  const pct = Math.round((done / total) * 100);

  if (done === total) {
    return {
      status: 'Terlaksana',
      isAllDone: true,
      label: '🟢 Terlaksana (100%)',
      btnClass: 'parent-btn-done',
      rowClass: 'parent-all-done',
      pct,
      done,
      total
    };
  } else if (done > 0) {
    return {
      status: 'Sebagian',
      isAllDone: false,
      label: `🔵 Sebagian (${done}/${total})`,
      btnClass: 'parent-btn-partial',
      rowClass: '',
      pct,
      done,
      total
    };
  } else if (cancel === total) {
    return {
      status: 'Tidak Terlaksana',
      isAllDone: false,
      label: '🔴 Tidak Terlaksana',
      btnClass: 'parent-btn-cancel',
      rowClass: '',
      pct: 0,
      done,
      total
    };
  } else {
    return {
      status: 'Belum Terlaksana',
      isAllDone: false,
      label: `⚪ Belum (${done}/${total})`,
      btnClass: 'parent-btn-pending',
      rowClass: '',
      pct: 0,
      done,
      total
    };
  }
}

// Render Parent Switch Button (Manual click cycles all its children + Auto displays status)
function renderParentSwitchButtonHtml(item) {
  const res = computeParentStatus(item);
  return `
    <button onclick="event.stopPropagation(); toggleParentStatus(${item.no})" 
            class="parent-switch-btn ${res.btnClass}" 
            title="Klik untuk ubah status seluruh rincian kegiatan ini (${item.kode_program || ''})">
      <span style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${res.label}
      </span>
      <span class="switch-tag">Switch ⇄</span>
    </button>
  `;
}

// Manual Parent Switch Handler
function toggleParentStatus(no) {
  const parent = rkasData.find(x => x.no === no);
  if (!parent) return;

  const res = computeParentStatus(parent);
  let nextStatus = 'Terlaksana';

  // Cycle order: Belum / Sebagian -> Terlaksana -> Tidak Terlaksana -> Belum Terlaksana
  if (res.status === 'Terlaksana') {
    nextStatus = 'Tidak Terlaksana';
  } else if (res.status === 'Tidak Terlaksana') {
    nextStatus = 'Belum Terlaksana';
  } else {
    nextStatus = 'Terlaksana';
  }

  const prefix = (parent.kode_program || '').trim();
  rkasData.forEach(item => {
    if (item.level === 4 && (item.kode_program || '').trim().startsWith(prefix)) {
      item.status = nextStatus;
    }
  });
  parent.status = nextStatus;

  saveData();
  applyFilters();
}

// Update parent status badges and switch buttons in DOM immediately
function updateParentRowsDOM() {
  const parentRows = document.querySelectorAll('.row-l1, .row-l2, .row-l3');
  parentRows.forEach(tr => {
    const no = Number(tr.dataset.no);
    const item = rkasData.find(x => x.no === no);
    if (!item) return;

    const res = computeParentStatus(item);
    item.status = res.status;

    if (res.isAllDone) {
      tr.classList.add('parent-all-done');
    } else {
      tr.classList.remove('parent-all-done');
    }

    const btnCell = tr.querySelector('.col-btn');
    if (btnCell) {
      btnCell.innerHTML = renderParentSwitchButtonHtml(item);
    }
  });
}

// Single Switch Function (Cycles: Belum -> Terlaksana -> Tidak Terlaksana -> Belum)
function cycleStatus(no, autoNext = false) {
  const target = rkasData.find(x => x.no === no);
  if (!target) return;

  const current = target.status;
  let nextStatus = 'Terlaksana';

  if (!current || current === 'Belum Terlaksana') {
    nextStatus = 'Terlaksana';
  } else if (current === 'Terlaksana') {
    nextStatus = 'Tidak Terlaksana';
  } else if (current === 'Tidak Terlaksana') {
    nextStatus = 'Belum Terlaksana';
  } else {
    nextStatus = 'Terlaksana';
  }

  setItemStatus(no, nextStatus, autoNext);
}

// Fast In-Place DOM Update for Level 4 Items & Cascade Parents
function setItemStatus(no, status, autoNext = false) {
  const target = rkasData.find(x => x.no === no);
  if (!target) return;
  target.status = status;
  saveData();

  const fIdx = filteredData.findIndex(x => x.no === no);
  if (fIdx !== -1) {
    filteredData[fIdx].status = status;
  }

  const rowEl = document.getElementById('row-' + no);
  if (rowEl) {
    rowEl.classList.remove('status-done', 'status-cancel', 'status-pending');
    if (status === 'Terlaksana') rowEl.classList.add('status-done');
    else if (status === 'Tidak Terlaksana') rowEl.classList.add('status-cancel');
    else if (status === 'Belum Terlaksana') rowEl.classList.add('status-pending');

    const btn = rowEl.querySelector('.switch-btn');
    if (btn) {
      btn.outerHTML = renderSwitchButtonHtml(target);
    }
  }

  if (autoNext && fIdx !== -1) {
    for (let i = fIdx + 1; i < filteredData.length; i++) {
      if (filteredData[i].level === 4) {
        setActiveRow(i);
        break;
      }
    }
  }
}

function renderSwitchButtonHtml(item) {
  if (item.status === 'Terlaksana') {
    return `
      <button onclick="event.stopPropagation(); cycleStatus(${item.no})" class="switch-btn state-done" title="Klik untuk beralih status">
        <span style="display: flex; align-items: center; gap: 4px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: white;"></span>
          Terlaksana
        </span>
        <span class="switch-tag">Switch ⇄</span>
      </button>
    `;
  } else if (item.status === 'Tidak Terlaksana') {
    return `
      <button onclick="event.stopPropagation(); cycleStatus(${item.no})" class="switch-btn state-cancel" title="Klik untuk beralih status">
        <span style="display: flex; align-items: center; gap: 4px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: white;"></span>
          Tidak
        </span>
        <span class="switch-tag">Switch ⇄</span>
      </button>
    `;
  } else if (item.status === 'Belum Terlaksana') {
    return `
      <button onclick="event.stopPropagation(); cycleStatus(${item.no})" class="switch-btn state-pending" title="Klik untuk beralih status">
        <span style="display: flex; align-items: center; gap: 4px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: white;"></span>
          Belum
        </span>
        <span class="switch-tag">Switch ⇄</span>
      </button>
    `;
  } else {
    return `
      <button onclick="event.stopPropagation(); cycleStatus(${item.no})" class="switch-btn state-empty" title="Klik untuk tandai Terlaksana">
        <span style="opacity: 0.7;">Pilih Status</span>
        <span class="switch-tag">Switch ⇄</span>
      </button>
    `;
  }
}

// BATCH NOTES & DATE TOOLS
function setBatchNoteDateToday() {
  const input = document.getElementById('batchNoteInput');
  input.value = `Tgl: ${getTodayFormatted()}`;
  input.focus();
}

function applyBatchNote() {
  const noteVal = document.getElementById('batchNoteInput').value.trim();
  if (!noteVal) {
    alert('Silakan ketik teks catatan atau tanggal terlebih dahulu pada kotak Catatan Massal!');
    document.getElementById('batchNoteInput').focus();
    return;
  }

  if (selectedIndices.size === 0) {
    alert('Silakan centang (pilih) minimal satu kegiatan terlebih dahulu!');
    return;
  }

  let count = 0;
  rkasData.forEach(item => {
    if (selectedIndices.has(item.no) && item.level === 4) {
      item.keterangan = noteVal;
      count++;
    }
  });

  saveData();
  applyFilters();
  alert(`Berhasil mengisi catatan "${noteVal}" ke ${count} kegiatan terpilih!`);
}

function clearBatchNote() {
  if (selectedIndices.size === 0) {
    alert('Silakan centang kegiatan yang ingin dihapus catatannya!');
    return;
  }

  if (confirm(`Hapus catatan pada ${selectedIndices.size} kegiatan terpilih?`)) {
    rkasData.forEach(item => {
      if (selectedIndices.has(item.no) && item.level === 4) {
        item.keterangan = '';
      }
    });
    saveData();
    applyFilters();
  }
}

function promptSubkegiatanNote(kodeProgramPrefix, title) {
  const defaultVal = `Tgl: ${getTodayFormatted()}`;
  const note = prompt(`Masukkan catatan/tanggal untuk seluruh rincian kegiatan "${title}":`, defaultVal);
  if (note === null) return;

  let count = 0;
  rkasData.forEach(item => {
    if (item.level === 4 && item.kode_program.startsWith(kodeProgramPrefix)) {
      item.keterangan = note;
      count++;
    }
  });

  saveData();
  applyFilters();
}

function markSubkegiatanStatus(kodeProgramPrefix, status) {
  rkasData.forEach(item => {
    if (item.level === 4 && item.kode_program.startsWith(kodeProgramPrefix)) {
      item.status = status;
    }
  });
  saveData();
  applyFilters();
}

// Render Table
function renderTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  if (filteredData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 32px; text-align: center; color: var(--text-muted);">
          Tidak ada data kegiatan yang cocok dengan filter.
        </td>
      </tr>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  filteredData.forEach((item, fIdx) => {
    const tr = document.createElement('tr');
    tr.id = `row-${item.no}`;
    tr.dataset.no = item.no;
    tr.dataset.fidx = fIdx;

    const isSelected = selectedIndices.has(item.no);
    const isActive = activeRowIndex === fIdx;
    const lvl = item.level || (item.is_header ? 1 : 4);

    if (lvl === 1) {
      // LEVEL 1: STANDAR (Deep Navy)
      const res = computeParentStatus(item);
      item.status = res.status;
      tr.className = `row-l1 ${res.isAllDone ? 'parent-all-done' : ''}`;
      tr.innerHTML = `
        <td class="col-check" style="opacity: 0.5;">•</td>
        <td class="col-no" style="font-family: monospace; opacity: 0.7;">${item.no}</td>
        <td class="col-desc">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: var(--accent); color: white; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px;">STANDAR</span>
            <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; color: #fde047;">${escapeHtml(item.uraian)}</span>
          </div>
        </td>
        <td class="col-amt" style="font-family: monospace; font-weight: 700; font-size: 12px; color: #f8fafc;">
          ${formatRp(item.jumlah)}
        </td>
        <td class="col-btn">
          ${renderParentSwitchButtonHtml(item)}
        </td>
        <td class="col-note" style="font-size: 10px; color: #cbd5e1; font-style: italic;">
          T1: ${formatRp(item.tahap_1)} | T2: ${formatRp(item.tahap_2)}
        </td>
      `;
      fragment.appendChild(tr);
      return;
    }

    if (lvl === 2) {
      // LEVEL 2: PROGRAM (Soft Mint)
      const res = computeParentStatus(item);
      item.status = res.status;
      tr.className = `row-l2 ${res.isAllDone ? 'parent-all-done' : ''}`;
      tr.innerHTML = `
        <td class="col-check"></td>
        <td class="col-no" style="font-family: monospace; opacity: 0.7;">${item.no}</td>
        <td class="col-desc">
          <div style="display: flex; align-items: center; gap: 6px; padding-left: 10px;">
            <span style="background: #a7f3d0; color: #065f46; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px;">PROGRAM</span>
            <span style="font-size: 12px; color: #064e3b;">${escapeHtml(item.uraian)}</span>
          </div>
        </td>
        <td class="col-amt" style="font-family: monospace; font-weight: 600; font-size: 11px; color: #065f46;">
          ${formatRp(item.jumlah)}
        </td>
        <td class="col-btn">
          ${renderParentSwitchButtonHtml(item)}
        </td>
        <td class="col-note" style="font-size: 10px; color: #059669;">
          T1: ${formatRp(item.tahap_1)} | T2: ${formatRp(item.tahap_2)}
        </td>
      `;
      fragment.appendChild(tr);
      return;
    }

    if (lvl === 3) {
      // LEVEL 3: KEGIATAN (Soft Butter)
      const res = computeParentStatus(item);
      item.status = res.status;
      tr.className = `row-l3 ${res.isAllDone ? 'parent-all-done' : ''}`;
      tr.innerHTML = `
        <td class="col-check"></td>
        <td class="col-no" style="font-family: monospace; opacity: 0.7;">${item.no}</td>
        <td class="col-desc">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; padding-left: 20px;">
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
              <span style="background: #fde68a; color: #92400e; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; flex-shrink: 0;">KEGIATAN</span>
              <span style="font-size: 11px; color: #78350f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.uraian)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              <button onclick="promptSubkegiatanNote('${item.kode_program}', '${escapeHtml(item.uraian)}')" 
                class="btn-batch-action" style="padding: 1px 5px; font-size: 9px;"
                title="Isi catatan/tanggal ke semua item rincian kegiatan ini">
                📝 Catatan
              </button>
              <button onclick="markSubkegiatanStatus('${item.kode_program}', 'Terlaksana')" 
                style="background: #fef3c7; border: 1px solid #fde68a; color: #92400e; font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; cursor: pointer;"
                title="Tandai semua item rincian di bawah sub-kegiatan ini menjadi Terlaksana">
                ⚡ Semua Terlaksana
              </button>
            </div>
          </div>
        </td>
        <td class="col-amt" style="font-family: monospace; font-weight: 600; font-size: 11px; color: #92400e;">
          ${formatRp(item.jumlah)}
        </td>
        <td class="col-btn">
          ${renderParentSwitchButtonHtml(item)}
        </td>
        <td class="col-note" style="font-size: 10px; color: #d97706;">
          T1: ${formatRp(item.tahap_1)} | T2: ${formatRp(item.tahap_2)}
        </td>
      `;
      fragment.appendChild(tr);
      return;
    }

    // LEVEL 4: ITEM BELANJA
    let statusClass = '';
    if (item.status === 'Terlaksana') statusClass = 'status-done';
    else if (item.status === 'Tidak Terlaksana') statusClass = 'status-cancel';
    else if (item.status === 'Belum Terlaksana') statusClass = 'status-pending';

    tr.className = `row-l4 ${statusClass} ${isActive ? 'row-active' : ''}`;
    tr.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      setActiveRow(fIdx);
    });

    const volTarifStr = item.volume ? `${formatNum(item.volume)} ${item.satuan} @ Rp ${formatNum(item.tarif_harga)}` : '';
    const rekStr = item.kode_rekening ? `Rek: ${item.kode_rekening}` : '';

    tr.innerHTML = `
      <td class="col-check">
        <input type="checkbox" ${isSelected ? 'checked' : ''} style="cursor: pointer;" onclick="event.stopPropagation(); toggleSelect(${item.no})">
      </td>
      <td class="col-no" style="font-family: monospace; color: var(--text-muted); font-size: 11px;">${item.no}</td>
      <td class="col-desc">
        <div style="padding-left: 28px; display: flex; align-items: flex-start; gap: 6px;">
          <span style="color: #94a3b8; font-family: monospace; user-select: none; margin-top: 1px;">↳</span>
          <div style="min-width: 0; flex: 1;">
            <div style="font-size: 11px; font-weight: 500; color: #1e293b; line-height: 1.35; word-break: break-word;">${escapeHtml(item.uraian)}</div>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 9px; font-family: monospace; color: var(--text-muted);">
              ${rekStr ? `<span style="background: #f1f5f9; padding: 1px 4px; border-radius: 3px; border: 1px solid #e2e8f0;">${rekStr}</span>` : ''}
              ${volTarifStr ? `<span>${volTarifStr}</span>` : ''}
            </div>
          </div>
        </div>
      </td>
      <td class="col-amt">
        <div style="font-size: 11px; font-weight: 700; color: #0f172a; font-family: monospace;">${formatRp(item.jumlah)}</div>
        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 2px; font-size: 9px; font-family: monospace;">
          ${item.tahap_1 > 0 ? `<span style="background: #e0e7ff; color: #3730a3; padding: 1px 4px; border-radius: 3px;">T1: ${formatRp(item.tahap_1)}</span>` : ''}
          ${item.tahap_2 > 0 ? `<span style="background: #f3e8ff; color: #6b21a8; padding: 1px 4px; border-radius: 3px;">T2: ${formatRp(item.tahap_2)}</span>` : ''}
        </div>
      </td>
      <td class="col-btn">
        ${renderSwitchButtonHtml(item)}
      </td>
      <td class="col-note">
        <input type="text" value="${escapeHtml(item.keterangan || '')}" placeholder="Catatan/tanggal..."
          class="input-search" style="width: 100%; font-size: 10px; padding: 2px 6px;"
          onchange="updateItemKeterangan(${item.no}, this.value)"
          onclick="event.stopPropagation()">
      </td>
    `;

    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
  updateSelectionUI();
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function updateItemKeterangan(no, ket) {
  const target = rkasData.find(x => x.no === no);
  if (target) {
    target.keterangan = ket;
    saveData();
  }
}

// Active Row & Keyboard Navigation
function setActiveRow(index) {
  if (index < 0 || index >= filteredData.length) return;
  activeRowIndex = index;

  document.querySelectorAll('#tableBody tr').forEach((tr, i) => {
    if (i === index) {
      tr.classList.add('row-active');
      tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      tr.classList.remove('row-active');
    }
  });
}

function handleKeyNavigation(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if (activeRowIndex === -1 && filteredData.length > 0) {
    for (let i = 0; i < filteredData.length; i++) {
      if (filteredData[i].level === 4) {
        setActiveRow(i);
        return;
      }
    }
  }

  if (activeRowIndex < 0 || activeRowIndex >= filteredData.length) return;
  const currentItem = filteredData[activeRowIndex];

  if (currentItem.level === 4) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cycleStatus(currentItem.no, true);
      return;
    } else if (e.key === '1') {
      e.preventDefault();
      setItemStatus(currentItem.no, 'Terlaksana', true);
      return;
    } else if (e.key === '2') {
      e.preventDefault();
      setItemStatus(currentItem.no, 'Tidak Terlaksana', true);
      return;
    } else if (e.key === '3') {
      e.preventDefault();
      setItemStatus(currentItem.no, 'Belum Terlaksana', true);
      return;
    }
  }

  if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
    e.preventDefault();
    for (let i = activeRowIndex + 1; i < filteredData.length; i++) {
      if (filteredData[i].level === 4) {
        setActiveRow(i);
        break;
      }
    }
  } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
    e.preventDefault();
    for (let i = activeRowIndex - 1; i >= 0; i--) {
      if (filteredData[i].level === 4) {
        setActiveRow(i);
        break;
      }
    }
  }
}

// Checkbox Selection Logic
function toggleSelect(no) {
  if (selectedIndices.has(no)) {
    selectedIndices.delete(no);
  } else {
    selectedIndices.add(no);
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const count = selectedIndices.size;
  document.getElementById('selectedCount').textContent = count;

  const headerCb = document.getElementById('headerCheckbox');
  const level4Items = filteredData.filter(x => x.level === 4);
  if (level4Items.length > 0 && selectedIndices.size === level4Items.length) {
    headerCb.checked = true;
    headerCb.indeterminate = false;
  } else if (selectedIndices.size > 0) {
    headerCb.checked = false;
    headerCb.indeterminate = true;
  } else {
    headerCb.checked = false;
    headerCb.indeterminate = false;
  }
}

// Batch Set Status
function batchSetStatus(status) {
  if (selectedIndices.size === 0) {
    alert('Silakan pilih (centang) minimal satu kegiatan terlebih dahulu!');
    return;
  }

  rkasData.forEach(item => {
    if (selectedIndices.has(item.no) && item.level === 4) {
      item.status = status;
    }
  });

  saveData();
  applyFilters();
}

// Stats & Dashboard Calculation
function updateStats() {
  const items = rkasData.filter(x => x.level === 4);
  const totalItems = items.length;

  let cDone = 0, sumDone = 0;
  let cCancel = 0, sumCancel = 0;
  let cPending = 0, sumPending = 0;
  let cUnchecked = 0, sumUnchecked = 0;

  items.forEach(x => {
    const amt = x.jumlah || 0;
    if (x.status === 'Terlaksana') {
      cDone++;
      sumDone += amt;
    } else if (x.status === 'Tidak Terlaksana') {
      cCancel++;
      sumCancel += amt;
    } else if (x.status === 'Belum Terlaksana') {
      cPending++;
      sumPending += amt;
    } else {
      cUnchecked++;
      sumUnchecked += amt;
    }
  });

  document.getElementById('statCountDone').textContent = cDone;
  document.getElementById('statSumDone').textContent = formatRp(sumDone);

  document.getElementById('statCountCancel').textContent = cCancel;
  document.getElementById('statCountPending').textContent = cPending;
  document.getElementById('statCountUnchecked').textContent = cUnchecked;

  const checkedCount = cDone + cCancel + cPending;
  const pDone = totalItems > 0 ? (cDone / totalItems) * 100 : 0;
  const pPending = totalItems > 0 ? (cPending / totalItems) * 100 : 0;
  const pCancel = totalItems > 0 ? (cCancel / totalItems) * 100 : 0;
  const pTotal = totalItems > 0 ? ((checkedCount / totalItems) * 100).toFixed(1) : '0';

  document.getElementById('barDone').style.width = pDone + '%';
  document.getElementById('barPending').style.width = pPending + '%';
  document.getElementById('barCancel').style.width = pCancel + '%';
  document.getElementById('statProgressPct').textContent = `${pTotal}%`;
  document.getElementById('statProgressDetail').textContent = `(${checkedCount}/${totalItems})`;
}

function renderAll() {
  filteredData = [...rkasData];
  document.getElementById('visibleCount').textContent = filteredData.length;
  updateStats();
  renderTable();
}

// Backup & Restore
function downloadBackupJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rkasData, null, 2));
  const dlAnchorElem = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `Backup_Verifikasi_RKAS_2026_${dateStr}.json`);
  dlAnchorElem.click();
}

function handleRestoreJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const parsed = JSON.parse(event.target.result);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (confirm(`Pulihkan ${parsed.length} data verifikasi dari file cadangan ini? Progres saat ini akan ditimpa.`)) {
          rkasData = parsed;
          saveData();
          applyFilters();
          alert('Data berhasil dipulihkan!');
        }
      } else {
        alert('Format file JSON tidak valid.');
      }
    } catch (err) {
      alert('Gagal membaca file JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ==========================================================================
// CHART GENERATION (Chart.js to PNG Base64 for Excel Embedding)
// ==========================================================================
async function generateChartImages() {
  const level4Items = rkasData.filter(x => x.level === 4);
  const totalItems = level4Items.length;
  const cDone = level4Items.filter(x => x.status === 'Terlaksana').length;
  const cCancel = level4Items.filter(x => x.status === 'Tidak Terlaksana').length;
  const cPending = level4Items.filter(x => x.status === 'Belum Terlaksana').length;
  const cUncheck = level4Items.filter(x => !x.status).length;

  // 1. Doughnut Chart: Status Breakdown
  if (window._chartPieInstance) {
    try { window._chartPieInstance.destroy(); } catch(e){}
  }
  const canvasPie = document.getElementById('canvasPieChart');
  const ctxPie = canvasPie.getContext('2d');
  window._chartPieInstance = new Chart(ctxPie, {
    type: 'doughnut',
    data: {
      labels: [
        `Terlaksana (${cDone} item - ${((cDone/totalItems)*100).toFixed(1)}%)`,
        `Tidak Terlaksana (${cCancel} item - ${((cCancel/totalItems)*100).toFixed(1)}%)`,
        `Belum Terlaksana (${cPending} item - ${((cPending/totalItems)*100).toFixed(1)}%)`,
        `Belum Diverifikasi (${cUncheck} item - ${((cUncheck/totalItems)*100).toFixed(1)}%)`
      ],
      datasets: [{
        data: [cDone, cCancel, cPending, cUncheck],
        backgroundColor: ['#10b981', '#f43f5e', '#f59e0b', '#94a3b8'],
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: 'Proporsi Status Verifikasi Kegiatan RKAS 2026 (Total: ' + totalItems + ' Item)',
          font: { size: 14, weight: 'bold' },
          color: '#0f172a',
          padding: { top: 10, bottom: 20 }
        },
        legend: {
          position: 'right',
          labels: { font: { size: 11, family: 'Segoe UI' }, boxWidth: 16, padding: 12 }
        }
      }
    }
  });

  // 2. Bar Chart: Pagu vs Realisasi per Standar
  const standarList = rkasData.filter(x => x.level === 1);
  const stdLabels = [];
  const stdPagu = [];
  const stdDone = [];

  standarList.forEach(std => {
    const prefix = (std.kode_program || '').trim();
    const children = level4Items.filter(c => (c.kode_program || '').trim().startsWith(prefix));
    const totalAmt = children.reduce((acc, c) => acc + (c.jumlah || 0), 0);
    const doneAmt = children.filter(c => c.status === 'Terlaksana').reduce((acc, c) => acc + (c.jumlah || 0), 0);

    let shortName = std.uraian.replace(/Standar\s+/i, '');
    if (shortName.length > 28) shortName = shortName.slice(0, 28) + '...';
    stdLabels.push(`${std.kode_program} ${shortName}`);
    stdPagu.push(Math.round(totalAmt / 1000000));
    stdDone.push(Math.round(doneAmt / 1000000));
  });

  if (window._chartBarInstance) {
    try { window._chartBarInstance.destroy(); } catch(e){}
  }
  const canvasBar = document.getElementById('canvasBarChart');
  const ctxBar = canvasBar.getContext('2d');
  window._chartBarInstance = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: stdLabels,
      datasets: [
        {
          label: 'Total Pagu Anggaran (Juta Rp)',
          data: stdPagu,
          backgroundColor: '#94a3b8',
          borderRadius: 4
        },
        {
          label: 'Realisasi Terlaksana (Juta Rp)',
          data: stdDone,
          backgroundColor: '#10b981',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: false,
      animation: false,
      indexAxis: 'y',
      plugins: {
        title: {
          display: true,
          text: 'Pagu vs Realisasi Terlaksana per Standar (dalam Juta Rupiah)',
          font: { size: 14, weight: 'bold' },
          color: '#0f172a',
          padding: { top: 10, bottom: 15 }
        },
        legend: {
          position: 'top',
          labels: { font: { size: 11, family: 'Segoe UI' }, boxWidth: 16 }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Nilai Anggaran (Juta Rupiah)', font: { size: 10, weight: 'bold' } },
          grid: { color: '#f1f5f9' }
        },
        y: {
          ticks: { font: { size: 10, family: 'Segoe UI' } }
        }
      }
    }
  });

  const pieImg = canvasPie.toDataURL('image/png');
  const barImg = canvasBar.toDataURL('image/png');

  return { pieImg, barImg };
}

// ==========================================================================
// EXCELJS PROFESSIONAL EXPORT (Light Theme Table, Sheet Grafik & Rekap)
// ==========================================================================
async function exportToExcel() {
  if (typeof ExcelJS === 'undefined') {
    alert('Library ExcelJS belum siap. Silakan periksa koneksi internet Anda atau muat ulang halaman.');
    return;
  }

  const btn = document.getElementById('btnExportExcel');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '⏳ <span>Membuat Excel + Grafik...</span>';
  btn.disabled = true;

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SMK Negeri 4 Surakarta';
    wb.created = new Date();
    const todayStr = getTodayFormatted();

    // Border Styles
    const borderThin = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };

    // -------------------------------------------------------------
    // SHEET 1: DATA VERIFIKASI KEGIATAN (Tema Ringan Pastel)
    // -------------------------------------------------------------
    const ws1 = wb.addWorksheet('Verifikasi Kegiatan', {
      views: [{ showGridLines: true }]
    });

    ws1.columns = [
      { key: 'no', width: 7 },
      { key: 'level', width: 14 },
      { key: 'kode_rekening', width: 22 },
      { key: 'kode_program', width: 15 },
      { key: 'uraian', width: 70 },
      { key: 'volume', width: 10 },
      { key: 'satuan', width: 14 },
      { key: 'tarif', width: 18 },
      { key: 'jumlah', width: 20 },
      { key: 'tahap_1', width: 18 },
      { key: 'tahap_2', width: 18 },
      { key: 'status', width: 25 },
      { key: 'keterangan', width: 35 }
    ];

    // Title rows
    const r1 = ws1.addRow(['LEMBAR VERIFIKASI PELAKSANAAN RENCANA KEGIATAN DAN ANGGARAN SEKOLAH (RKAS)']);
    r1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E293B' } };

    const r2 = ws1.addRow(['SMK NEGERI 4 SURAKARTA - TAHUN ANGGARAN 2026']);
    r2.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF4F46E5' } };

    const r3 = ws1.addRow([`NPSN: 20328152 | Sumber Dana: BOSP Reguler Rp 2.204.800.000 | Tanggal Verifikasi: ${todayStr}`]);
    r3.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };

    ws1.addRow([]); // Blank row 4

    // Table Header Row 5
    const headers = [
      "No.", "Tingkat", "Kode Rekening", "Kode Program",
      "Uraian / Rincian Kegiatan", "Volume", "Satuan",
      "Tarif Satuan (Rp)", "Jumlah Anggaran (Rp)",
      "Tahap 1 (Rp)", "Tahap 2 (Rp)", "Status Pelaksanaan",
      "Catatan / Tanggal Pelaksanaan"
    ];
    const rHead = ws1.addRow(headers);
    rHead.height = 28;
    rHead.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF94A3B8' } },
        right: { style: 'thin', color: { argb: 'FF94A3B8' } }
      };
    });

    // Data Rows
    rkasData.forEach(item => {
      let lvlLabel = 'ITEM';
      let uraianText = item.uraian || '';
      let statusText = item.status || '(Belum diverifikasi)';

      if (item.level === 1) {
        lvlLabel = 'STANDAR';
        uraianText = `[STANDAR] ${item.uraian.toUpperCase()}`;
        const res = computeParentStatus(item);
        statusText = res.label;
      } else if (item.level === 2) {
        lvlLabel = 'PROGRAM';
        uraianText = `   [PROGRAM] ${item.uraian}`;
        const res = computeParentStatus(item);
        statusText = res.label;
      } else if (item.level === 3) {
        lvlLabel = 'KEGIATAN';
        uraianText = `      [KEGIATAN] ${item.uraian}`;
        const res = computeParentStatus(item);
        statusText = res.label;
      } else {
        lvlLabel = 'ITEM';
        uraianText = `         ↳ ${item.uraian}`;
        statusText = item.status || '(Belum diverifikasi)';
      }

      const row = ws1.addRow([
        item.no,
        lvlLabel,
        item.kode_rekening || '',
        item.kode_program || '',
        uraianText,
        item.volume || '',
        item.satuan || '',
        item.tarif_harga || '',
        item.jumlah || 0,
        item.tahap_1 || 0,
        item.tahap_2 || 0,
        statusText,
        item.keterangan || ''
      ]);

      // Formats
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(5).alignment = { vertical: 'middle' };
      row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(13).alignment = { vertical: 'middle' };

      if (typeof item.tarif_harga === 'number') row.getCell(8).numFmt = '#,##0';
      row.getCell(9).numFmt = '#,##0';
      row.getCell(10).numFmt = '#,##0';
      row.getCell(11).numFmt = '#,##0';

      row.eachCell(cell => {
        cell.border = borderThin;
      });

      // Light Pastel Theming per Hierarchy Level
      if (item.level === 1) {
        // Level 1: Soft Lavender
        row.height = 24;
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E1B4B' } };
        });
      } else if (item.level === 2) {
        // Level 2: Soft Mint
        row.height = 22;
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
          cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF064E3B' } };
        });
      } else if (item.level === 3) {
        // Level 3: Soft Butter / Cream
        row.height = 20;
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEFCE8' } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF713F12' } };
        });
      } else {
        // Level 4: Item Belanja
        row.height = 19;
        const statusCell = row.getCell(12);

        if (item.status === 'Terlaksana') {
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } }; // Soft light green
          });
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF166534' } };
        } else if (item.status === 'Tidak Terlaksana') {
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } }; // Soft light red
          });
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };
          statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF9F1239' } };
        } else if (item.status === 'Belum Terlaksana') {
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }; // Soft light amber
          });
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF92400E' } };
        } else {
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          });
          statusCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } };
        }
      }
    });

    // -------------------------------------------------------------
    // SHEET 2: GRAFIK REALISASI (Embedded Chart.js Charts)
    // -------------------------------------------------------------
    const ws2 = wb.addWorksheet('Grafik Realisasi', {
      views: [{ showGridLines: false }]
    });

    const g1 = ws2.addRow(['GRAFIK REALISASI & VERIFIKASI KEGIATAN RKAS 2026']);
    g1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } };

    const g2 = ws2.addRow(['SMK NEGERI 4 SURAKARTA - BOSP REGULER RP 2.204.800.000']);
    g2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF4F46E5' } };

    const g3 = ws2.addRow([`Grafik dihasilkan otomatis per tanggal ${todayStr}`]);
    g3.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF64748B' } };

    // Render offscreen charts to PNG
    const { pieImg, barImg } = await generateChartImages();

    // Embed Doughnut Chart
    const pieImageId = wb.addImage({
      base64: pieImg,
      extension: 'png'
    });
    ws2.addImage(pieImageId, {
      tl: { col: 1, row: 4 }, // B5
      ext: { width: 560, height: 360 }
    });

    // Embed Bar Chart
    const barImageId = wb.addImage({
      base64: barImg,
      extension: 'png'
    });
    ws2.addImage(barImageId, {
      tl: { col: 1, row: 24 }, // B25
      ext: { width: 780, height: 420 }
    });

    // Set some column widths for Sheet 2
    ws2.getColumn(1).width = 4;
    ws2.getColumn(2).width = 25;
    ws2.getColumn(3).width = 25;

    // -------------------------------------------------------------
    // SHEET 3: REKAPITULASI ANGGARAN & STANDAR
    // -------------------------------------------------------------
    const ws3 = wb.addWorksheet('Rekapitulasi Anggaran', {
      views: [{ showGridLines: true }]
    });

    ws3.columns = [
      { width: 6 },
      { width: 28 },
      { width: 22 },
      { width: 22 },
      { width: 26 },
      { width: 22 },
      { width: 32 }
    ];

    const rk1 = ws3.addRow(['REKAPITULASI HASIL VERIFIKASI KEGIATAN & REALISASI ANGGARAN']);
    rk1.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } };

    const rk2 = ws3.addRow(['SMK NEGERI 4 SURAKARTA - TAHUN ANGGARAN 2026']);
    rk2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF4F46E5' } };

    const rk3 = ws3.addRow([`Tanggal Rekapitulasi: ${todayStr}`]);
    rk3.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF64748B' } };

    ws3.addRow([]); // Blank row 4

    // Table 1: Rekap per Status
    const rkHead1 = ws3.addRow([
      "No.", "Status Pelaksanaan", "Jumlah Kegiatan (Item)",
      "Persentase Kegiatan (%)", "Total Anggaran (Rp)",
      "Persentase Anggaran (%)", "Keterangan Serapan"
    ]);
    rkHead1.height = 24;
    rkHead1.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = borderThin;
    });

    const level4Items = rkasData.filter(x => x.level === 4);
    const totalItemCount = level4Items.length;
    const totalAnggaran = level4Items.reduce((acc, x) => acc + (x.jumlah || 0), 0);

    const calcSum = (st) => level4Items.filter(x => x.status === st).reduce((acc, x) => acc + (x.jumlah || 0), 0);
    const calcCnt = (st) => level4Items.filter(x => x.status === st).length;

    const cDone = calcCnt("Terlaksana");
    const sDone = calcSum("Terlaksana");
    const cCancel = calcCnt("Tidak Terlaksana");
    const sCancel = calcSum("Tidak Terlaksana");
    const cPending = calcCnt("Belum Terlaksana");
    const sPending = calcSum("Belum Terlaksana");
    const cUncheck = calcCnt("");
    const sUncheck = calcSum("");

    const statRows = [
      [1, "Terlaksana", cDone, ((cDone / totalItemCount) * 100).toFixed(1) + "%", sDone, ((sDone / totalAnggaran) * 100).toFixed(1) + "%", "Terealisasi", "FFF0FDF4"],
      [2, "Tidak Terlaksana", cCancel, ((cCancel / totalItemCount) * 100).toFixed(1) + "%", sCancel, ((sCancel / totalAnggaran) * 100).toFixed(1) + "%", "Dibatalkan / Tidak Terserap", "FFFFF1F2"],
      [3, "Belum Terlaksana", cPending, ((cPending / totalItemCount) * 100).toFixed(1) + "%", sPending, ((sPending / totalAnggaran) * 100).toFixed(1) + "%", "Menunggu Jadwal Pelaksanaan", "FFFFFBEB"],
      [4, "Belum Diverifikasi", cUncheck, ((cUncheck / totalItemCount) * 100).toFixed(1) + "%", sUncheck, ((sUncheck / totalAnggaran) * 100).toFixed(1) + "%", "Belum Dilakukan Pengecekan", "FFFFFFFF"]
    ];

    statRows.forEach(sr => {
      const r = ws3.addRow([sr[0], sr[1], sr[2], sr[3], sr[4], sr[5], sr[6]]);
      r.height = 20;
      r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(2).alignment = { vertical: 'middle' };
      r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(5).numFmt = '#,##0';
      r.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(7).alignment = { vertical: 'middle' };
      r.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sr[7] } };
        cell.border = borderThin;
        cell.font = { name: 'Calibri', size: 10 };
      });
    });

    // Total Row
    const rkTotal = ws3.addRow(["", "TOTAL KESELURUHAN", totalItemCount, "100.0%", totalAnggaran, "100.0%", "Pagu Anggaran BOSP 2026"]);
    rkTotal.height = 22;
    rkTotal.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
      cell.border = borderThin;
    });
    rkTotal.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
    rkTotal.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
    rkTotal.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    rkTotal.getCell(5).numFmt = '#,##0';
    rkTotal.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

    ws3.addRow([]); // Blank row
    ws3.addRow([]); // Blank row

    // Table 2: Breakdown Realisasi per 8 Standar
    const rkHead2 = ws3.addRow([
      "Kode", "Standar Nasional Pendidikan", "Jumlah Kegiatan",
      "Total Pagu (Rp)", "Realisasi Terlaksana (Rp)",
      "Persentase Capaian (%)", "Status Capaian"
    ]);
    rkHead2.height = 24;
    rkHead2.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
      cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = borderThin;
    });

    const standarList = rkasData.filter(x => x.level === 1);
    standarList.forEach(std => {
      const prefix = (std.kode_program || '').trim();
      const children = level4Items.filter(c => (c.kode_program || '').trim().startsWith(prefix));
      const childCount = children.length;
      const paguAmt = children.reduce((acc, c) => acc + (c.jumlah || 0), 0);
      const doneAmt = children.filter(c => c.status === 'Terlaksana').reduce((acc, c) => acc + (c.jumlah || 0), 0);
      const pct = paguAmt > 0 ? ((doneAmt / paguAmt) * 100).toFixed(1) + "%" : "0.0%";
      const statusLabel = doneAmt === paguAmt && paguAmt > 0 ? "100% Selesai" : (doneAmt > 0 ? "Sedang Berjalan" : "Belum Berjalan");

      const r = ws3.addRow([
        std.kode_program,
        std.uraian,
        childCount,
        paguAmt,
        doneAmt,
        pct,
        statusLabel
      ]);
      r.height = 20;
      r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(2).alignment = { vertical: 'middle' };
      r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(4).numFmt = '#,##0';
      r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(5).numFmt = '#,##0';
      r.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

      r.eachCell(cell => {
        cell.border = borderThin;
        cell.font = { name: 'Calibri', size: 10 };
      });
    });

    // Generate buffer & trigger download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const dateFileStr = new Date().toISOString().slice(0, 10);
    link.download = `Verifikasi_RKAS_SMKN4_Surakarta_${dateFileStr}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);

  } catch (err) {
    console.error('Export Excel failed:', err);
    alert('Terjadi kesalahan saat membuat file Excel: ' + err.message);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}
