import { adminGetAll, updateStatus } from '../../api.js';

const STATUS_FLOW = ['pending', 'printing', 'completed', 'cancelled'];

export default async function renderPrintOrders(container) {
  container.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div class="search-box" style="flex:1;min-width:200px">
        <input type="text" id="printSearch" placeholder="Buscar orden..." />
      </div>
      <select id="printStatusFilter" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem">
        <option value="">Todos los estados</option>
        <option value="pending">Pendiente</option>
        <option value="printing">Imprimiendo</option>
        <option value="completed">Completado</option>
        <option value="cancelled">Cancelado</option>
      </select>
    </div>
    <div id="printOrdersTable"><p class="text-muted">Cargando órdenes de impresión...</p></div>
    <style>
      .print-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
      .print-table th { text-align:left; padding:10px 12px; border-bottom:2px solid #e2e8f0; font-weight:600; color:#64748b; font-size:0.7rem; text-transform:uppercase; }
      .print-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; }
      .print-table tr:hover { background:#f8fafc; }
      .status-badge { display:inline-block; padding:2px 10px; border-radius:10px; font-size:0.7rem; font-weight:600; }
      .status-badge.pending { background:#fef3c7; color:#92400e; }
      .status-badge.printing { background:#e0e7ff; color:#3730a3; }
      .status-badge.completed { background:#dcfce7; color:#166534; }
      .status-badge.cancelled { background:#fee2e2; color:#991b1b; }
      .status-select { padding:4px 8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.75rem; cursor:pointer; }
      .text-muted { color:#94a3b8; }
    </style>
  `;

  let data = [];

  async function loadData() {
    try {
      data = await adminGetAll('print-orders');
      renderTable();
    } catch (err) {
      document.getElementById('printOrdersTable').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  function renderTable() {
    const search = (document.getElementById('printSearch').value || '').toLowerCase();
    const statusFilter = document.getElementById('printStatusFilter').value;

    let filtered = data.filter(item => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (search && !((item.description || '') + (item.material || '') + (item.id || '')).toLowerCase().includes(search)) return false;
      return true;
    });

    const table = document.getElementById('printOrdersTable');

    if (filtered.length === 0) {
      table.innerHTML = '<div class="empty-state">No hay órdenes de impresión registradas</div>';
      return;
    }

    table.innerHTML = `
      <div class="table-container"><table class="print-table">
        <thead><tr>
          <th>Descripción</th>
          <th>Material</th>
          <th>Cantidad</th>
          <th>Estado</th>
          <th>Fecha</th>
          <th>Acciones</th>
        </tr></thead>
        <tbody>${filtered.map(item => `
          <tr>
            <td><strong>${esc(item.description || '').substring(0, 50)}</strong></td>
            <td>${esc(item.material)}</td>
            <td>${item.quantity || 1}</td>
            <td><span class="status-badge ${item.status}">${item.status}</span></td>
            <td>${item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR') : '-'}</td>
            <td>
              <select class="status-select" data-id="${item.id}" data-current="${item.status}">
                ${['pending', 'printing', 'completed', 'cancelled'].map(s =>
                  `<option value="${s}" ${s === item.status ? 'selected' : ''}>${s}</option>`
                ).join('')}
              </select>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;

    table.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        const newStatus = sel.value;
        try {
          await updateStatus('print-orders', id, newStatus);
          sel.dataset.current = newStatus;
        } catch (err) {
          alert('Error al actualizar estado: ' + err.message);
          sel.value = sel.dataset.current;
        }
      });
    });
  }

  document.getElementById('printSearch').addEventListener('input', renderTable);
  document.getElementById('printStatusFilter').addEventListener('change', renderTable);

  await loadData();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
