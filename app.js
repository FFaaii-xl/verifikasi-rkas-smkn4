// State
const STORAGE_KEY = 'RKAS_VERIFIKASI_DATA_2026';
let rkasData = [];
let filteredData = [];
let selectedIndices = new Set();
let activeRowIndex = -1;

// Init
window.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
  renderAll();
});

// Load Data from LocalStorage or Default
function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge with initial data to preserve levels
        rkasData = INITIAL_RKAS_DATA.map(initItem => {
          const found = parsed.find(p => p.no === initItem.no);
          return {
            ...initItem,
            status: found ? found.status : '',
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

// Auto Save
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rkasData));
  } catch (e) {
    console.error('LocalStorage save failed', e);
  }
  updateStats();
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
}

function toggleKeyboardModal(show) {
  const modal = document.getElementById('modalKeyboard');
  if (show) modal.classList.remove('hidden');
  else modal.classList.add('hidden');
}

// Filter Logic
function applyFilters() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const std = document.getElementById('filterStandar').value;
  const thp = document.getElementById('filterTahap').value;
  const sts = document.getElementById('filterStatus').value;

  filteredData = rkasData.filter(item => {
    // Search query
    if (q) {
      const matchText = (item.uraian || '') + ' ' + (item.kode_rekening || '') + ' ' + (item.kode_program || '') + ' ' + (item.no || '');
      if (!matchText.toLowerCase().includes(q)) return false;
    }

    // Standar filter
    if (std !== 'ALL') {
      const prog = item.kode_program || '';
      if (!prog.startsWith(std)) return false;
    }

    // Tahap filter
    if (thp === 'T1' && (!item.tahap_1 || item.tahap_1 <= 0)) return false;
    if (thp === 'T2' && (!item.tahap_2 || item.tahap_2 <= 0)) return false;

    // Status filter (only applies strictly to level 4 items, but keep parent headers if any child matches)
    if (sts === 'UNCHECKED' && item.status) return false;
    if (sts !== 'ALL' && sts !== 'UNCHECKED' && item.status !== sts) return false;

    return true;
  });

  document.getElementById('visibleCount').textContent = filteredData.length;
  renderTable();
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

// Set Status for 1 Item
function setItemStatus(no, status, autoNext = false) {
  const target = rkasData.find(x => x.no === no);
  if (!target) return;
  target.status = status;
  saveData();

  const fIdx = filteredData.findIndex(x => x.no === no);
  if (fIdx !== -1) {
    filteredData[fIdx].status = status;
  }

  renderTable();

  if (autoNext && fIdx !== -1) {
    // Jump to next level 4 item
    for (let i = fIdx + 1; i < filteredData.length; i++) {
      if (filteredData[i].level === 4) {
        setActiveRow(i);
        break;
      }
    }
  }
}

// Helper: Mark all level 4 items under a sub-kegiatan as Terlaksana
function markSubkegiatanStatus(kodeProgramPrefix, status) {
  let count = 0;
  rkasData.forEach(item => {
    if (item.level === 4 && item.kode_program.startsWith(kodeProgramPrefix)) {
      item.status = status;
      count++;
    }
  });
  saveData();
  applyFilters();
}

// Render Table matching 6 Fixed Columns
function renderTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  if (filteredData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="p-8 text-center text-slate-400">
          <i class="ph-bold ph-files text-3xl mb-1 block"></i>
          Tidak ada data kegiatan yang cocok dengan filter pencarian.
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

    // --- LEVEL STYLING ---
    const lvl = item.level || (item.is_header ? 1 : 4);

    if (lvl === 1) {
      // LEVEL 1: STANDAR (Bold Navy Bar)
      tr.className = `bg-indigo-950 text-white font-bold border-t-2 border-indigo-700`;
      tr.innerHTML = `
        <td class="p-2 text-center" style="width: 4%;">
          <span class="text-indigo-400 text-xs font-mono">•</span>
        </td>
        <td class="p-2 text-center text-indigo-300 font-mono text-xs" style="width: 5%;">${item.no}</td>
        <td class="p-2" style="width: 45%;">
          <div class="flex items-center gap-2">
            <span class="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider shrink-0">STANDAR</span>
            <span class="text-xs uppercase tracking-wide text-yellow-300">${escapeHtml(item.uraian)}</span>
          </div>
        </td>
        <td class="p-2 text-right font-mono text-indigo-200 text-xs font-bold" style="width: 17%;">
          ${formatRp(item.jumlah)}
        </td>
        <td class="p-2 text-center text-indigo-300 text-[11px]" style="width: 14%;">
          <span class="bg-indigo-900/80 px-2 py-0.5 rounded text-[10px]">Alokasi Standar</span>
        </td>
        <td class="p-2 text-indigo-400 text-[10px] italic" style="width: 15%;">
          T1: ${formatRp(item.tahap_1)} | T2: ${formatRp(item.tahap_2)}
        </td>
      `;
      fragment.appendChild(tr);
      return;
    }

    if (lvl === 2) {
      // LEVEL 2: PROGRAM (Soft Emerald Bar)
      tr.className = `bg-emerald-50/90 text-emerald-950 font-bold border-l-4 border-emerald-600 border-t border-emerald-200`;
      tr.innerHTML = `
        <td class="p-2 text-center" style="width: 4%;"></td>
        <td class="p-2 text-center text-emerald-700 font-mono text-xs" style="width: 5%;">${item.no}</td>
        <td class="p-2" style="width: 45%;">
          <div class="flex items-center gap-2 pl-3">
            <span class="bg-emerald-200 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">PROGRAM</span>
            <span class="text-xs text-emerald-900">${escapeHtml(item.uraian)}</span>
          </div>
        </td>
        <td class="p-2 text-right font-mono text-emerald-800 text-xs font-semibold" style="width: 17%;">
          ${formatRp(item.jumlah)}
        </td>
        <td class="p-2 text-center text-emerald-700 text-[11px]" style="width: 14%;">
          <span class="bg-emerald-100/80 px-2 py-0.5 rounded text-[10px]">Alokasi Program</span>
        </td>
        <td class="p-2 text-emerald-600 text-[10px]" style="width: 15%;">
          T1: ${formatRp(item.tahap_1)} | T2: ${formatRp(item.tahap_2)}
        </td>
      `;
      fragment.appendChild(tr);
      return;
    }

    if (lvl === 3) {
      // LEVEL 3: KEGIATAN / SUB-KEGIATAN (Soft Amber Bar)
      tr.className = `bg-amber-50/80 text-amber-950 font-semibold border-l-4 border-amber-400 border-t border-amber-200`;
      tr.innerHTML = `
        <td class="p-2 text-center" style="width: 4%;"></td>
        <td class="p-2 text-center text-amber-700 font-mono text-xs" style="width: 5%;">${item.no}</td>
        <td class="p-2" style="width: 45%;">
          <div class="flex items-center justify-between gap-2 pl-6">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="bg-amber-200 text-amber-900 text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">KEGIATAN</span>
              <span class="text-xs text-amber-950 truncate">${escapeHtml(item.uraian)}</span>
            </div>
            <button onclick="markSubkegiatanStatus('${item.kode_program}', 'Terlaksana')" 
              class="shrink-0 text-[10px] bg-amber-200/80 hover:bg-emerald-200 text-amber-900 hover:text-emerald-900 px-1.5 py-0.5 rounded transition font-medium"
              title="Tandai semua item rincian di bawah sub-kegiatan ini menjadi Terlaksana">
              ⚡ Semua Terlaksana
            </button>
          </div>
        </td>
        <td class="p-2 text-right font-mono text-amber-900 text-xs font-semibold" style="width: 17%;">
          ${formatRp(item.jumlah)}
        </td>
        <td class="p-2 text-center text-amber-800 text-[11px]" style="width: 14%;">
          <span class="bg-amber-100 px-2 py-0.5 rounded text-[10px]">Sub-Total Kegiatan</span>
        </td>
        <td class="p-2 text-amber-700 text-[10px]" style="width: 15%;">
          T1: ${formatRp(item.tahap_1)} | T2: ${formatRp(item.tahap_2)}
        </td>
      `;
      fragment.appendChild(tr);
      return;
    }

    // LEVEL 4: ITEM BELANJA / RINCIAN KEGIATAN (The Verifiable Item)
    let rowBg = 'hover:bg-slate-50 transition-colors bg-white';
    if (item.status === 'Terlaksana') {
      rowBg = 'bg-emerald-50/40 hover:bg-emerald-50';
    } else if (item.status === 'Tidak Terlaksana') {
      rowBg = 'bg-rose-50/40 hover:bg-rose-50';
    } else if (item.status === 'Belum Terlaksana') {
      rowBg = 'bg-amber-50/40 hover:bg-amber-50';
    }

    if (isActive) rowBg += ' active-row';
    tr.className = `${rowBg} cursor-pointer border-b border-slate-100`;

    tr.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      setActiveRow(fIdx);
    });

    // Col 1: Checkbox (4%)
    const tdCheck = document.createElement('td');
    tdCheck.className = 'p-2 text-center';
    tdCheck.style.width = '4%';
    tdCheck.innerHTML = `<input type="checkbox" ${isSelected ? 'checked' : ''} class="rounded text-indigo-600 cursor-pointer" onclick="event.stopPropagation(); toggleSelect(${item.no})">`;
    tr.appendChild(tdCheck);

    // Col 2: No (5%)
    const tdNo = document.createElement('td');
    tdNo.className = 'p-2 text-center font-mono text-slate-400 text-xs';
    tdNo.style.width = '5%';
    tdNo.textContent = item.no;
    tr.appendChild(tdNo);

    // Col 3: Hirarki & Uraian Kegiatan (45%)
    const tdUraian = document.createElement('td');
    tdUraian.className = 'p-2';
    tdUraian.style.width = '45%';

    const volTarifStr = item.volume ? `${formatNum(item.volume)} ${item.satuan} @ Rp ${formatNum(item.tarif_harga)}` : '';
    const rekStr = item.kode_rekening ? `Rek: ${item.kode_rekening}` : '';

    tdUraian.innerHTML = `
      <div class="pl-8 flex items-start gap-1.5">
        <span class="text-slate-400 font-mono text-xs select-none shrink-0 mt-0.5">↳</span>
        <div class="min-w-0 flex-1">
          <div class="text-xs font-medium text-slate-800 leading-snug break-words">${escapeHtml(item.uraian)}</div>
          <div class="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-mono flex-wrap">
            ${rekStr ? `<span class="bg-slate-100 px-1 py-0.2 rounded border border-slate-200">${rekStr}</span>` : ''}
            ${volTarifStr ? `<span>${volTarifStr}</span>` : ''}
          </div>
        </div>
      </div>
    `;
    tr.appendChild(tdUraian);

    // Col 4: Anggaran Total & Tahap (17%)
    const tdAnggaran = document.createElement('td');
    tdAnggaran.className = 'p-2 text-right font-mono';
    tdAnggaran.style.width = '17%';
    tdAnggaran.innerHTML = `
      <div class="text-xs font-bold text-slate-800">${formatRp(item.jumlah)}</div>
      <div class="flex items-center justify-end gap-1 mt-0.5 text-[10px]">
        ${item.tahap_1 > 0 ? `<span class="bg-indigo-50 text-indigo-700 px-1 rounded border border-indigo-200">T1: ${formatRp(item.tahap_1)}</span>` : ''}
        ${item.tahap_2 > 0 ? `<span class="bg-purple-50 text-purple-700 px-1 rounded border border-purple-200">T2: ${formatRp(item.tahap_2)}</span>` : ''}
      </div>
    `;
    tr.appendChild(tdAnggaran);

    // Col 5: SINGLE SWITCH BUTTON (14%)
    const tdStatus = document.createElement('td');
    tdStatus.className = 'p-2 text-center whitespace-nowrap';
    tdStatus.style.width = '14%';

    let switchBtnHtml = '';
    if (item.status === 'Terlaksana') {
      switchBtnHtml = `
        <button onclick="event.stopPropagation(); cycleStatus(${item.no})" 
          class="w-full py-1 px-2 rounded-md text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center justify-between gap-1 transition active:scale-95"
          title="Klik untuk beralih status">
          <span class="flex items-center gap-1 truncate">
            <span class="w-2 h-2 rounded-full bg-white shrink-0"></span>
            Terlaksana
          </span>
          <span class="text-[9px] bg-emerald-700/80 px-1 py-0.2 rounded font-mono text-emerald-100 shrink-0">
            Switch ⇄
          </span>
        </button>
      `;
    } else if (item.status === 'Tidak Terlaksana') {
      switchBtnHtml = `
        <button onclick="event.stopPropagation(); cycleStatus(${item.no})" 
          class="w-full py-1 px-2 rounded-md text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs flex items-center justify-between gap-1 transition active:scale-95"
          title="Klik untuk beralih status">
          <span class="flex items-center gap-1 truncate">
            <span class="w-2 h-2 rounded-full bg-white shrink-0"></span>
            Tidak
          </span>
          <span class="text-[9px] bg-rose-700/80 px-1 py-0.2 rounded font-mono text-rose-100 shrink-0">
            Switch ⇄
          </span>
        </button>
      `;
    } else if (item.status === 'Belum Terlaksana') {
      switchBtnHtml = `
        <button onclick="event.stopPropagation(); cycleStatus(${item.no})" 
          class="w-full py-1 px-2 rounded-md text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs flex items-center justify-between gap-1 transition active:scale-95"
          title="Klik untuk beralih status">
          <span class="flex items-center gap-1 truncate">
            <span class="w-2 h-2 rounded-full bg-white shrink-0"></span>
            Belum
          </span>
          <span class="text-[9px] bg-amber-600/80 px-1 py-0.2 rounded font-mono text-amber-100 shrink-0">
            Switch ⇄
          </span>
        </button>
      `;
    } else {
      switchBtnHtml = `
        <button onclick="event.stopPropagation(); cycleStatus(${item.no})" 
          class="w-full py-1 px-2 rounded-md text-[11px] font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-300 shadow-2xs flex items-center justify-between gap-1 transition active:scale-95"
          title="Klik untuk tandai Terlaksana">
          <span class="text-slate-400 truncate">Pilih Status</span>
          <span class="text-[9px] bg-slate-200 px-1 py-0.2 rounded font-mono text-slate-600 shrink-0">
            Switch ⇄
          </span>
        </button>
      `;
    }
    tdStatus.innerHTML = switchBtnHtml;
    tr.appendChild(tdStatus);

    // Col 6: Catatan / Keterangan (15%)
    const tdKet = document.createElement('td');
    tdKet.className = 'p-2';
    tdKet.style.width = '15%';
    tdKet.innerHTML = `
      <input type="text" value="${escapeHtml(item.keterangan || '')}" placeholder="Catatan..."
        class="w-full text-[11px] px-2 py-0.5 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent hover:bg-white truncate"
        onchange="updateItemKeterangan(${item.no}, this.value)"
        onclick="event.stopPropagation()">
    `;
    tr.appendChild(tdKet);

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
      tr.classList.add('active-row');
      tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      tr.classList.remove('active-row');
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

  // Navigation Arrow Down / Up
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
    if (selectedIndices.has(item.no)) {
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
  document.getElementById('statProgressDetail').textContent = `(${checkedCount}/${totalItems} item)`;
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

// Export to Excel with SheetJS
function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Library Excel belum siap. Silakan periksa koneksi internet Anda atau refresh halaman.');
    return;
  }

  const headers = [
    "No.", "Level", "Kode Rekening", "Kode Program", "Uraian Kegiatan",
    "Volume", "Satuan", "Tarif Harga (Rp)", "Jumlah (Rp)",
    "Tahap 1 (Rp)", "Tahap 2 (Rp)", "Status Pelaksanaan", "Keterangan"
  ];

  const rows = [headers];

  rkasData.forEach(item => {
    rows.push([
      item.no,
      item.level_name || '',
      item.kode_rekening || '',
      item.kode_program || '',
      item.uraian || '',
      item.volume || '',
      item.satuan || '',
      item.tarif_harga || '',
      item.jumlah || 0,
      item.tahap_1 || 0,
      item.tahap_2 || 0,
      item.status || '',
      item.keterangan || ''
    ]);
  });

  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.aoa_to_sheet(rows);

  wsData['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 20 },
    { wch: 14 },
    { wch: 65 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 22 },
    { wch: 35 }
  ];

  XLSX.utils.book_append_sheet(wb, wsData, "Verifikasi Kegiatan");

  const items = rkasData.filter(x => x.level === 4);
  const calcSum = (status) => items.filter(x => x.status === status).reduce((acc, x) => acc + (x.jumlah || 0), 0);
  const calcCount = (status) => items.filter(x => x.status === status).length;

  const rekapRows = [
    ["REKAPITULASI HASIL VERIFIKASI KEGIATAN RKAS 2026"],
    ["SMK NEGERI 4 SURAKARTA"],
    [],
    ["Status Pelaksanaan", "Jumlah Item", "Total Anggaran (Rp)", "Persentase Item (%)"],
    ["Terlaksana", calcCount("Terlaksana"), calcSum("Terlaksana"), ((calcCount("Terlaksana") / items.length) * 100).toFixed(1) + "%"],
    ["Tidak Terlaksana", calcCount("Tidak Terlaksana"), calcSum("Tidak Terlaksana"), ((calcCount("Tidak Terlaksana") / items.length) * 100).toFixed(1) + "%"],
    ["Belum Terlaksana", calcCount("Belum Terlaksana"), calcSum("Belum Terlaksana"), ((calcCount("Belum Terlaksana") / items.length) * 100).toFixed(1) + "%"],
    ["Belum Diverifikasi", calcCount(""), calcSum(""), ((calcCount("") / items.length) * 100).toFixed(1) + "%"],
    [],
    ["TOTAL ITEM KEGIATAN", items.length, items.reduce((acc, x) => acc + (x.jumlah || 0), 0), "100.0%"]
  ];

  const wsRekap = XLSX.utils.aoa_to_sheet(rekapRows);
  wsRekap['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 22 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsRekap, "Rekapitulasi");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Hasil_Verifikasi_RKAS_SMKN4_Surakarta_${today}.xlsx`);
}
