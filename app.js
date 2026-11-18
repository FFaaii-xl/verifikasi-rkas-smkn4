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
  if (show) modal.classList.add('open');
  else modal.classList.remove('open');
}

// Filter Logic
function applyFilters() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const std = document.getElementById('filterStandar').value;
  const thp = document.getElementById('filterTahap').value;
  const sts = document.getElementById('filterStatus').value;

  filteredData = rkasData.filter(item => {
    if (q) {
      const matchText = (item.uraian || '') + ' ' + (item.kode_rekening || '') + ' ' + (item.kode_program || '') + ' ' + (item.no || '');
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

// High-Performance In-Place DOM Update
function setItemStatus(no, status, autoNext = false) {
  const target = rkasData.find(x => x.no === no);
  if (!target) return;
  target.status = status;
  saveData();

  const fIdx = filteredData.findIndex(x => x.no === no);
  if (fIdx !== -1) {
    filteredData[fIdx].status = status;
  }

  // Fast In-Place DOM update without rebuilding 473 rows!
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

// Helper: Mark all level 4 items under a sub-kegiatan as Terlaksana
function markSubkegiatanStatus(kodeProgramPrefix, status) {
  rkasData.forEach(item => {
    if (item.level === 4 && item.kode_program.startsWith(kodeProgramPrefix)) {
      item.status = status;
    }
  });
  saveData();
  applyFilters();
}

// Render Table matching Exact 6 Columns
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
      tr.className = 'row-l1';
      tr.innerHTML = `
        <td class="col-check" style="opacity: 0.5;">•</td>
        <td class="col-no" style="font-family: monospace; opacity: 0.7;">${item.no}</td>
        <td class="col-desc">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: var(--accent); color: white; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px;">STANDAR</span>
            <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; color: #fde047;">${escapeHtml(item.uraian)}</span>
          </div>
        </td>
        <td class="col-amt" style="font-family: monospace; font-weight: 700; font-size: 12px; color: #e2e8f0;">
          ${formatRp(item.jumlah)}
        </td>
        <td class="col-btn" style="opacity: 0.7; font-size: 10px;">Pagu Standar</td>
        <td class="col-note" style="font-size: 10px; opacity: 0.6; font-style: italic;">
          T1: ${formatRp(item.tahap_1)} | T2: ${formatRp(item.tahap_2)}
        </td>
      `;
      fragment.appendChild(tr);
      return;
    }

    if (lvl === 2) {
      // LEVEL 2: PROGRAM (Soft Emerald)
      tr.className = 'row-l2';
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
        <td class="col-btn" style="font-size: 10px; color: #047857;">Pagu Program</td>
        <td class="col-note" style="font-size: 10px; color: #059669;">
          T1: ${formatRp(item.tahap_1)} | T2: ${formatRp(item.tahap_2)}
        </td>
      `;
      fragment.appendChild(tr);
      return;
    }

    if (lvl === 3) {
      // LEVEL 3: KEGIATAN (Soft Amber)
      tr.className = 'row-l3';
      tr.innerHTML = `
        <td class="col-check"></td>
        <td class="col-no" style="font-family: monospace; opacity: 0.7;">${item.no}</td>
        <td class="col-desc">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-left: 20px;">
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
              <span style="background: #fde68a; color: #92400e; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; flex-shrink: 0;">KEGIATAN</span>
              <span style="font-size: 11px; color: #78350f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.uraian)}</span>
            </div>
            <button onclick="markSubkegiatanStatus('${item.kode_program}', 'Terlaksana')" 
              style="background: #fef3c7; border: 1px solid #fde68a; color: #92400e; font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; cursor: pointer; flex-shrink: 0;"
              title="Tandai semua item rincian di bawah sub-kegiatan ini">
              ⚡ Semua Terlaksana
            </button>
          </div>
        </td>
        <td class="col-amt" style="font-family: monospace; font-weight: 600; font-size: 11px; color: #92400e;">
          ${formatRp(item.jumlah)}
        </td>
        <td class="col-btn" style="font-size: 10px; color: #b45309;">Sub-Total</td>
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
        <input type="text" value="${escapeHtml(item.keterangan || '')}" placeholder="Catatan..."
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
