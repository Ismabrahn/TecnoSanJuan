import { adminGetAll, updateStatus, adminDelete } from '../../api.js';
import { Modal } from '../../components/Modal.js';

const STATUS_FLOW = ['received', 'diagnosing', 'repairing', 'completed'];

export default async function renderRepairs(container) {
  container.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div class="search-box" style="flex:1;min-width:200px">
        <input type="text" id="repairSearch" placeholder="Buscar reparación..." />
      </div>
      <select id="repairStatusFilter" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem">
        <option value="">Todos los estados</option>
        <option value="received">Recibido</option>
        <option value="diagnosing">Diagnosticando</option>
        <option value="repairing">En reparación</option>
        <option value="completed">Completado</option>
        <option value="cancelled">Cancelado</option>
      </select>
    </div>
    <div id="repairsTable"><p class="text-muted">Cargando reparaciones...</p></div>
    <style>
      .repair-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
      .repair-table th { text-align:left; padding:10px 12px; border-bottom:2px solid #e2e8f0; font-weight:600; color:#64748b; font-size:0.7rem; text-transform:uppercase; }
      .repair-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; }
      .repair-table tr:hover { background:#f8fafc; }
      .status-badge { display:inline-block; padding:2px 10px; border-radius:10px; font-size:0.7rem; font-weight:600; }
      .status-badge.received { background:#fef3c7; color:#92400e; }
      .status-badge.diagnosing { background:#dbeafe; color:#1e40af; }
      .status-badge.repairing { background:#e0e7ff; color:#3730a3; }
      .status-badge.completed { background:#dcfce7; color:#166534; }
      .status-badge.cancelled { background:#fee2e2; color:#991b1b; }
      .status-select { padding:4px 8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.75rem; cursor:pointer; }
      .text-muted { color:#94a3b8; }
    </style>
  `;

  let data = [];

  async function loadData() {
    try {
      data = await adminGetAll('repairs');
      renderTable();
    } catch (err) {
      document.getElementById('repairsTable').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  function renderTable() {
    const search = (document.getElementById('repairSearch').value || '').toLowerCase();
    const statusFilter = document.getElementById('repairStatusFilter').value;

    let filtered = data.filter(item => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (search && !((item.device || '') + (item.problem || '') + (item.id || '')).toLowerCase().includes(search)) return false;
      return true;
    });

    const table = document.getElementById('repairsTable');

    if (filtered.length === 0) {
      table.innerHTML = '<div class="empty-state">No hay reparaciones registradas</div>';
      return;
    }

    table.innerHTML = `
      <div class="table-container"><table class="repair-table">
        <thead><tr>
          <th>Dispositivo</th>
          <th>Problema</th>
          <th>Urgencia</th>
          <th>Estado</th>
          <th>Fecha</th>
          <th>Acciones</th>
        </tr></thead>
        <tbody>${filtered.map(item => `
          <tr>
            <td><strong>${esc(item.device)}</strong></td>
            <td>${esc(item.problem || '').substring(0, 60)}</td>
            <td>${esc(item.urgency || 'normal')}</td>
            <td><span class="status-badge ${item.status}">${item.status}</span></td>
            <td>${item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR') : '-'}</td>
            <td>
              <select class="status-select" data-id="${item.id}" data-current="${item.status}">
                ${['received', 'diagnosing', 'repairing', 'completed', 'cancelled'].map(s =>
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
          await updateStatus('repairs', id, newStatus);
          sel.dataset.current = newStatus;
        } catch (err) {
          alert('Error al actualizar estado: ' + err.message);
          sel.value = sel.dataset.current;
        }
      });
    });
  }

  document.getElementById('repairSearch').addEventListener('input', renderTable);
  document.getElementById('repairStatusFilter').addEventListener('change', renderTable);

  await loadData();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
