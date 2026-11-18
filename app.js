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
      rkasData = JSON.parse(saved);
      // Ensure all initial items are present
      if (!Array.isArray(rkasData) || rkasData.length === 0) {
        rkasData = JSON.parse(JSON.stringify(INITIAL_RKAS_DATA));
      }
    } catch (e) {
      console.error('Failed to parse localStorage, resetting to default', e);
      rkasData = JSON.parse(JSON.stringify(INITIAL_RKAS_DATA));
    }
  } else {
    rkasData = JSON.parse(JSON.stringify(INITIAL_RKAS_DATA));
  }
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
      filteredData.forEach(item => selectedIndices.add(item.no));
    } else {
      selectedIndices.clear();
    }
    updateSelectionUI();
    renderTable();
  });

  document.getElementById('btnSelectAllVisible').addEventListener('click', () => {
    filteredData.forEach(item => selectedIndices.add(item.no));
    updateSelectionUI();
    renderTable();
  });

  document.getElementById('btnDeselectAll').addEventListener('click', () => {
    selectedIndices.clear();
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

    // Status filter
    if (sts === 'UNCHECKED' && item.status) return false;
    if (sts !== 'ALL' && sts !== 'UNCHECKED' && item.status !== sts) return false;

    return true;
  });

  document.getElementById('visibleCount').textContent = filteredData.length;
  renderTable();
}

// Render Table
function renderTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  if (filteredData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="p-8 text-center text-slate-400">
          <i class="ph-bold ph-files text-3xl mb-1 block"></i>
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

    let rowBg = 'hover:bg-slate-50 transition-colors';
    if (item.is_header) {
      rowBg = 'bg-slate-100 font-semibold text-slate-800';
    } else if (item.status === 'Terlaksana') {
      rowBg = 'bg-emerald-50/50 hover:bg-emerald-50';
    } else if (item.status === 'Tidak Terlaksana') {
      rowBg = 'bg-rose-50/50 hover:bg-rose-50';
    } else if (item.status === 'Belum Terlaksana') {
      rowBg = 'bg-amber-50/50 hover:bg-amber-50';
    } else if (item.status === 'Terlaksana Sebagian') {
      rowBg = 'bg-blue-50/50 hover:bg-blue-50';
    }

    if (isActive) rowBg += ' active-row';

    tr.className = `${rowBg} cursor-pointer`;

    // Click row to activate
    tr.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      setActiveRow(fIdx);
    });

    // Checkbox
    const tdCheck = document.createElement('td');
    tdCheck.className = 'p-2 text-center';
    tdCheck.innerHTML = `<input type="checkbox" ${isSelected ? 'checked' : ''} class="rounded text-indigo-600 cursor-pointer" onclick="event.stopPropagation(); toggleSelect(${item.no})">`;
    tr.appendChild(tdCheck);

    // No
    const tdNo = document.createElement('td');
    tdNo.className = 'p-2 text-center font-mono text-slate-500 font-medium';
    tdNo.textContent = item.no;
    tr.appendChild(tdNo);

    // Kode Rekening
    const tdRek = document.createElement('td');
    tdRek.className = 'p-2 font-mono text-[11px] text-slate-600';
    tdRek.textContent = item.kode_rekening || '-';
    tr.appendChild(tdRek);

    // Kode Program
    const tdProg = document.createElement('td');
    tdProg.className = 'p-2 font-mono text-[11px] text-slate-600 font-medium';
    tdProg.textContent = item.kode_program || '-';
    tr.appendChild(tdProg);

    // Uraian
    const tdUraian = document.createElement('td');
    tdUraian.className = 'p-2 text-slate-800 leading-snug';
    tdUraian.innerHTML = item.is_header 
      ? `<span class="text-indigo-900 font-bold">${escapeHtml(item.uraian)}</span>`
      : escapeHtml(item.uraian);
    tr.appendChild(tdUraian);

    // Volume / Satuan
    const tdVolSat = document.createElement('td');
    tdVolSat.className = 'p-2 text-center text-slate-600 whitespace-nowrap';
    tdVolSat.textContent = item.volume ? `${item.volume} ${item.satuan}` : '-';
    tr.appendChild(tdVolSat);

    // Tarif
    const tdTarif = document.createElement('td');
    tdTarif.className = 'p-2 text-right font-mono text-slate-600';
    tdTarif.textContent = item.tarif_harga ? formatNum(item.tarif_harga) : '-';
    tr.appendChild(tdTarif);

    // Jumlah
    const tdJumlah = document.createElement('td');
    tdJumlah.className = 'p-2 text-right font-mono font-semibold text-slate-800';
    tdJumlah.textContent = formatNum(item.jumlah);
    tr.appendChild(tdJumlah);

    // Tahap 1
    const tdT1 = document.createElement('td');
    tdT1.className = `p-2 text-right font-mono ${item.tahap_1 > 0 ? 'text-indigo-700 font-medium' : 'text-slate-400'}`;
    tdT1.textContent = formatNum(item.tahap_1);
    tr.appendChild(tdT1);

    // Tahap 2
    const tdT2 = document.createElement('td');
    tdT2.className = `p-2 text-right font-mono ${item.tahap_2 > 0 ? 'text-indigo-700 font-medium' : 'text-slate-400'}`;
    tdT2.textContent = formatNum(item.tahap_2);
    tr.appendChild(tdT2);

    // Quick Verification Buttons
    const tdStatus = document.createElement('td');
    tdStatus.className = 'p-2 text-center whitespace-nowrap bg-slate-50/50';
    tdStatus.innerHTML = `
      <div class="inline-flex items-center gap-1">
        <button onclick="event.stopPropagation(); setItemStatus(${item.no}, 'Terlaksana')" 
          class="px-2 py-1 rounded text-[11px] font-semibold transition ${item.status === 'Terlaksana' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50'}" title="Pintasan keyboard: 1">
          🟢 Terlaksana
        </button>
        <button onclick="event.stopPropagation(); setItemStatus(${item.no}, 'Tidak Terlaksana')" 
          class="px-2 py-1 rounded text-[11px] font-semibold transition ${item.status === 'Tidak Terlaksana' ? 'bg-rose-600 text-white shadow-xs' : 'bg-white border border-rose-300 text-rose-700 hover:bg-rose-50'}" title="Pintasan keyboard: 2">
          🔴 Tidak
        </button>
        <button onclick="event.stopPropagation(); setItemStatus(${item.no}, 'Belum Terlaksana')" 
          class="px-2 py-1 rounded text-[11px] font-semibold transition ${item.status === 'Belum Terlaksana' ? 'bg-amber-500 text-white shadow-xs' : 'bg-white border border-amber-300 text-amber-700 hover:bg-amber-50'}" title="Pintasan keyboard: 3">
          🟡 Belum
        </button>
        <button onclick="event.stopPropagation(); setItemStatus(${item.no}, 'Terlaksana Sebagian')" 
          class="px-2 py-1 rounded text-[11px] font-semibold transition ${item.status === 'Terlaksana Sebagian' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50'}" title="Pintasan keyboard: 4">
          🔵
        </button>
        ${item.status ? `
          <button onclick="event.stopPropagation(); setItemStatus(${item.no}, '')" class="text-slate-400 hover:text-slate-600 px-1 text-xs" title="Reset Status">
            ✕
          </button>
        ` : ''}
      </div>
    `;
    tr.appendChild(tdStatus);

    // Keterangan
    const tdKet = document.createElement('td');
    tdKet.className = 'p-2';
    tdKet.innerHTML = `
      <input type="text" value="${escapeHtml(item.keterangan || '')}" placeholder="Catatan verifikasi..."
        class="w-full text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent hover:bg-white"
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

// Set Status for 1 Item
function setItemStatus(no, status, autoNext = false) {
  const target = rkasData.find(x => x.no === no);
  if (!target) return;
  target.status = status;
  saveData();

  // Re-render specific row or update styles
  const fIdx = filteredData.findIndex(x => x.no === no);
  if (fIdx !== -1) {
    filteredData[fIdx].status = status;
  }

  renderTable();

  if (autoNext && fIdx !== -1 && fIdx < filteredData.length - 1) {
    setActiveRow(fIdx + 1);
  }
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

  // Highlight row
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
  // Ignore if user is typing in search or note input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if (activeRowIndex === -1 && filteredData.length > 0) {
    if (e.key === 'ArrowDown' || e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
      setActiveRow(0);
      return;
    }
  }

  if (activeRowIndex < 0 || activeRowIndex >= filteredData.length) return;
  const currentItem = filteredData[activeRowIndex];

  if (e.key === '1') {
    e.preventDefault();
    setItemStatus(currentItem.no, 'Terlaksana', true);
  } else if (e.key === '2') {
    e.preventDefault();
    setItemStatus(currentItem.no, 'Tidak Terlaksana', true);
  } else if (e.key === '3') {
    e.preventDefault();
    setItemStatus(currentItem.no, 'Belum Terlaksana', true);
  } else if (e.key === '4') {
    e.preventDefault();
    setItemStatus(currentItem.no, 'Terlaksana Sebagian', true);
  } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
    e.preventDefault();
    setActiveRow(activeRowIndex + 1);
  } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
    e.preventDefault();
    setActiveRow(activeRowIndex - 1);
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
  const btnDeselect = document.getElementById('btnDeselectAll');
  if (count > 0) btnDeselect.classList.remove('hidden');
  else btnDeselect.classList.add('hidden');

  const headerCb = document.getElementById('headerCheckbox');
  if (filteredData.length > 0 && selectedIndices.size === filteredData.length) {
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
  // Only count item-level rows (non-headers) for pure statistics
  const items = rkasData.filter(x => !x.is_header);
  const totalItems = items.length;
  const totalBudget = items.reduce((acc, x) => acc + (x.jumlah || 0), 0);

  let cDone = 0, sumDone = 0;
  let cCancel = 0, sumCancel = 0;
  let cPending = 0, sumPending = 0;
  let cPartial = 0, sumPartial = 0;
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
    } else if (x.status === 'Terlaksana Sebagian') {
      cPartial++;
      sumPartial += amt;
    } else {
      cUnchecked++;
      sumUnchecked += amt;
    }
  });

  const pct = (c) => totalItems > 0 ? ((c / totalItems) * 100).toFixed(1) + '%' : '0%';

  document.getElementById('statTotalItems').textContent = totalItems;
  document.getElementById('statTotalBudget').textContent = formatRp(totalBudget);

  document.getElementById('statCountDone').textContent = cDone;
  document.getElementById('statSumDone').textContent = formatRp(sumDone);
  document.getElementById('statPctDone').textContent = pct(cDone);

  document.getElementById('statCountCancel').textContent = cCancel;
  document.getElementById('statSumCancel').textContent = formatRp(sumCancel);
  document.getElementById('statPctCancel').textContent = pct(cCancel);

  document.getElementById('statCountPending').textContent = cPending;
  document.getElementById('statSumPending').textContent = formatRp(sumPending);
  document.getElementById('statPctPending').textContent = pct(cPending);

  document.getElementById('statCountPartial').textContent = cPartial;
  document.getElementById('statSumPartial').textContent = formatRp(sumPartial);
  document.getElementById('statPctPartial').textContent = pct(cPartial);

  document.getElementById('statCountUnchecked').textContent = cUnchecked;
  document.getElementById('statSumUnchecked').textContent = formatRp(sumUnchecked);
  document.getElementById('statPctUnchecked').textContent = pct(cUnchecked);

  // Progress Bar
  const pDone = totalItems > 0 ? (cDone / totalItems) * 100 : 0;
  const pPartial = totalItems > 0 ? (cPartial / totalItems) * 100 : 0;
  const pPending = totalItems > 0 ? (cPending / totalItems) * 100 : 0;
  const pCancel = totalItems > 0 ? (cCancel / totalItems) * 100 : 0;
  const pTotalChecked = pDone + pPartial + pPending + pCancel;

  document.getElementById('barDone').style.width = pDone + '%';
  document.getElementById('barPartial').style.width = pPartial + '%';
  document.getElementById('barPending').style.width = pPending + '%';
  document.getElementById('barCancel').style.width = pCancel + '%';
  document.getElementById('overallProgressText').textContent = `${pTotalChecked.toFixed(1)}% Selesai Diverifikasi (${cDone + cCancel + cPending + cPartial}/${totalItems})`;
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

  // Sheet 1: Data Verifikasi
  const headers = [
    "No.", "Kode Rekening", "Kode Program", "Uraian Kegiatan",
    "Volume", "Satuan", "Tarif Harga (Rp)", "Jumlah (Rp)",
    "Tahap 1 (Rp)", "Tahap 2 (Rp)", "Status Pelaksanaan", "Keterangan"
  ];

  const rows = [headers];

  rkasData.forEach(item => {
    rows.push([
      item.no,
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

  // Column widths
  wsData['!cols'] = [
    { wch: 6 },
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

  // Sheet 2: Rekapitulasi
  const items = rkasData.filter(x => !x.is_header);
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
    ["Terlaksana Sebagian", calcCount("Terlaksana Sebagian"), calcSum("Terlaksana Sebagian"), ((calcCount("Terlaksana Sebagian") / items.length) * 100).toFixed(1) + "%"],
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
