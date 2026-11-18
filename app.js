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

// In-Place DOM Update for Speed & Smooth 60fps
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

  // Visual notification
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

// Set note for all items under a sub-kegiatan
function promptSubkegiatanNote(kodeProgramPrefix, title) {
  const defaultVal = `Tgl: ${getTodayFormatted()}`;
  const note = prompt(`Masukkan catatan/tanggal untuk seluruh rincian kegiatan "${title}":`, defaultVal);
  if (note === null) return; // user cancelled

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

// Mark all items under sub-kegiatan as Terlaksana
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

// PROFESSIONAL EXCEL EXPORT (High-Quality, Formatted, 2 Sheets)
function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Library Excel belum siap. Silakan periksa koneksi internet Anda atau refresh halaman.');
    return;
  }

  const wb = XLSX.utils.book_new();
  const todayStr = getTodayFormatted();

  // --- SHEET 1: DATA VERIFIKASI KEGIATAN RKAS ---
  const sheetRows = [
    ["LEMBAR VERIFIKASI PELAKSANAAN RENCANA KEGIATAN DAN ANGGARAN SEKOLAH (RKAS)"],
    ["SMK NEGERI 4 SURAKARTA - TAHUN ANGGARAN 2026"],
    [`NPSN: 20328152 | Sumber Dana: BOSP Reguler Rp 2.204.800.000 | Tanggal Verifikasi: ${todayStr}`],
    [], // Blank separator row
    [
      "No.",
      "Tingkat (Level)",
      "Kode Rekening",
      "Kode Program",
      "Uraian / Rincian Kegiatan",
      "Volume",
      "Satuan",
      "Tarif Satuan (Rp)",
      "Jumlah Anggaran (Rp)",
      "Tahap 1 (Rp)",
      "Tahap 2 (Rp)",
      "Status Pelaksanaan",
      "Catatan / Tanggal Pelaksanaan"
    ]
  ];

  rkasData.forEach(item => {
    let uraianFmt = item.uraian || '';
    let lvlLabel = 'ITEM';

    if (item.level === 1) {
      lvlLabel = 'STANDAR';
      uraianFmt = `[STANDAR] ${item.uraian.toUpperCase()}`;
    } else if (item.level === 2) {
      lvlLabel = 'PROGRAM';
      uraianFmt = `   [PROGRAM] ${item.uraian}`;
    } else if (item.level === 3) {
      lvlLabel = 'KEGIATAN';
      uraianFmt = `      [KEGIATAN] ${item.uraian}`;
    } else {
      lvlLabel = 'ITEM';
      uraianFmt = `         ↳ ${item.uraian}`;
    }

    sheetRows.push([
      item.no,
      lvlLabel,
      item.kode_rekening || '',
      item.kode_program || '',
      uraianFmt,
      item.volume || '',
      item.satuan || '',
      item.tarif_harga || '',
      item.jumlah || 0,
      item.tahap_1 || 0,
      item.tahap_2 || 0,
      item.status || '(Belum diverifikasi)',
      item.keterangan || ''
    ]);
  });

  const wsData = XLSX.utils.aoa_to_sheet(sheetRows);

  // Set explicit column widths for clean reading
  wsData['!cols'] = [
    { wch: 6 },   // No
    { wch: 12 },  // Level
    { wch: 22 },  // Kode Rekening
    { wch: 14 },  // Kode Program
    { wch: 70 },  // Uraian Kegiatan (Wide)
    { wch: 10 },  // Vol
    { wch: 14 },  // Satuan
    { wch: 16 },  // Tarif
    { wch: 18 },  // Jumlah
    { wch: 16 },  // Tahap 1
    { wch: 16 },  // Tahap 2
    { wch: 22 },  // Status Pelaksanaan
    { wch: 35 }   // Catatan / Tanggal
  ];

  XLSX.utils.book_append_sheet(wb, wsData, "Verifikasi Kegiatan");

  // --- SHEET 2: REKAPITULASI REALISASI ANGGARAN & KEGIATAN ---
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

  const rekapRows = [
    ["REKAPITULASI HASIL VERIFIKASI KEGIATAN & REALISASI ANGGARAN"],
    ["SMK NEGERI 4 SURAKARTA - TAHUN ANGGARAN 2026"],
    [`Tanggal Rekapitulasi: ${todayStr}`],
    [],
    [
      "No.",
      "Status Pelaksanaan",
      "Jumlah Kegiatan (Item)",
      "Persentase Kegiatan (%)",
      "Total Anggaran (Rp)",
      "Persentase Anggaran (%)",
      "Keterangan Serapan"
    ],
    [
      1,
      "Terlaksana",
      cDone,
      ((cDone / totalItemCount) * 100).toFixed(1) + "%",
      sDone,
      ((sDone / totalAnggaran) * 100).toFixed(1) + "%",
      "Terealisasi"
    ],
    [
      2,
      "Tidak Terlaksana",
      cCancel,
      ((cCancel / totalItemCount) * 100).toFixed(1) + "%",
      sCancel,
      ((sCancel / totalAnggaran) * 100).toFixed(1) + "%",
      "Dibatalkan / Tidak Terserap"
    ],
    [
      3,
      "Belum Terlaksana",
      cPending,
      ((cPending / totalItemCount) * 100).toFixed(1) + "%",
      sPending,
      ((sPending / totalAnggaran) * 100).toFixed(1) + "%",
      "Menunggu Jadwal Pelaksanaan"
    ],
    [
      4,
      "Belum Diverifikasi",
      cUncheck,
      ((cUncheck / totalItemCount) * 100).toFixed(1) + "%",
      sUncheck,
      ((sUncheck / totalAnggaran) * 100).toFixed(1) + "%",
      "Belum Dilakukan Pengecekan"
    ],
    [],
    [
      "",
      "TOTAL KESELURUHAN",
      totalItemCount,
      "100.0%",
      totalAnggaran,
      "100.0%",
      "Pagu Anggaran BOSP 2026"
    ]
  ];

  const wsRekap = XLSX.utils.aoa_to_sheet(rekapRows);
  wsRekap['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 24 },
    { wch: 22 },
    { wch: 30 }
  ];

  XLSX.utils.book_append_sheet(wb, wsRekap, "Rekapitulasi Anggaran");

  // Write and trigger download
  const dateFileStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Verifikasi_RKAS_SMKN4_Surakarta_${dateFileStr}.xlsx`);
}
