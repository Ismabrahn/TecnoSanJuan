import { adminGetAll, adminGetOne, adminUpdate } from '../../api.js';
import { Modal } from '../../components/Modal.js';

export default async function renderClients(container) {
  container.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div class="search-box" style="flex:1;min-width:200px">
        <input type="text" id="clientSearch" placeholder="Buscar cliente..." />
      </div>
    </div>
    <div id="clientsTable"><p class="text-muted">Cargando clientes...</p></div>
    <style>
      .client-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
      .client-table th { text-align:left; padding:10px 12px; border-bottom:2px solid #e2e8f0; font-weight:600; color:#64748b; font-size:0.7rem; text-transform:uppercase; }
      .client-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; }
      .client-table tr:hover { background:#f8fafc; cursor:pointer; }
      .text-muted { color:#94a3b8; }

      .modal-section { margin:16px 0; }
      .modal-section h4 { font-size:0.85rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin:0 0 8px; padding-bottom:4px; border-bottom:1px solid #e2e8f0; }
      .history-table { width:100%; border-collapse:collapse; font-size:0.8rem; }
      .history-table th { text-align:left; padding:6px 8px; border-bottom:1px solid #e2e8f0; font-weight:600; color:#64748b; font-size:0.65rem; text-transform:uppercase; }
      .history-table td { padding:6px 8px; border-bottom:1px solid #f1f5f9; }
      .status-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:600; }
      .status-badge.received,.status-badge.pending { background:#fef3c7; color:#92400e; }
      .status-badge.diagnosing { background:#dbeafe; color:#1e40af; }
      .status-badge.repairing,.status-badge.printing { background:#e0e7ff; color:#3730a3; }
      .status-badge.completed,.status-badge.approved { background:#dcfce7; color:#166534; }
      .status-badge.cancelled,.status-badge.rejected { background:#fee2e2; color:#991b1b; }
      .client-field { margin:4px 0; font-size:0.9rem; }
      .client-field strong { display:inline-block; min-width:100px; color:#64748b; }
    </style>
  `;

  let data = [];
  let modal = new Modal();

  async function loadData() {
    try {
      data = await adminGetAll('clients');
      renderTable();
    } catch (err) {
      document.getElementById('clientsTable').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  function renderTable() {
    const search = (document.getElementById('clientSearch').value || '').toLowerCase();
    let filtered = data.filter(item => {
      if (!search) return true;
      return ((item.name || '') + (item.phone || '') + (item.email || '')).toLowerCase().includes(search);
    });

    const el = document.getElementById('clientsTable');
    if (filtered.length === 0) {
      el.innerHTML = '<div class="empty-state">No hay clientes registrados</div>';
      return;
    }

    el.innerHTML = `
      <div class="table-container"><table class="client-table">
        <thead><tr>
          <th>Nombre</th>
          <th>Teléfono</th>
          <th>Email</th>
          <th>Notas</th>
          <th>Registro</th>
        </tr></thead>
        <tbody>${filtered.map(item => `
          <tr data-id="${item.id}">
            <td><strong>${esc(item.name)}</strong></td>
            <td>${esc(item.phone)}</td>
            <td>${esc(item.email || '-')}</td>
            <td>${esc((item.notes || '').substring(0, 40))}</td>
            <td>${item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR') : '-'}</td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;

    el.querySelectorAll('tbody tr').forEach(row => {
      row.addEventListener('click', () => showClientDetail(row.dataset.id));
    });
  }

  async function showClientDetail(id) {
    modal.show({
      title: 'Cargando...',
      body: '<p>Cargando datos del cliente...</p>',
      footer: '<button class="btn btn-outline" id="closeClientDetail">Cerrar</button>',
    });

    try {
      const client = await adminGetOne('clients', id);

      const repairs = client.history?.repairs || [];
      const budgets = client.history?.budgets || [];
      const printOrders = client.history?.printOrders || [];

      modal.show({
        title: esc(client.name),
        body: `
          <div class="client-field"><strong>Nombre:</strong> ${esc(client.name)}</div>
          <div class="client-field"><strong>Teléfono:</strong> ${esc(client.phone)}</div>
          <div class="client-field"><strong>Email:</strong> ${esc(client.email || '-')}</div>
          <div class="client-field"><strong>Notas:</strong> ${esc(client.notes || '-')}</div>
          <div class="client-field"><strong>Registro:</strong> ${client.created_at ? new Date(client.created_at).toLocaleDateString('es-AR') : '-'}</div>

          <div class="modal-section">
            <h4>Reparaciones (${repairs.length})</h4>
            ${repairs.length === 0 ? '<p class="text-muted">Sin reparaciones</p>' : `
              <table class="history-table">
                <thead><tr><th>Dispositivo</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>${repairs.map(r => `
                  <tr>
                    <td>${esc(r.device || '')}</td>
                    <td><span class="status-badge ${r.status}">${r.status}</span></td>
                    <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('es-AR') : '-'}</td>
                  </tr>
                `).join('')}</tbody>
              </table>
            `}
          </div>

          <div class="modal-section">
            <h4>Presupuestos (${budgets.length})</h4>
            ${budgets.length === 0 ? '<p class="text-muted">Sin presupuestos</p>' : `
              <table class="history-table">
                <thead><tr><th>Servicio</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>${budgets.map(b => `
                  <tr>
                    <td>${esc(b.service_type || '')}</td>
                    <td><span class="status-badge ${b.status}">${b.status}</span></td>
                    <td>${b.created_at ? new Date(b.created_at).toLocaleDateString('es-AR') : '-'}</td>
                  </tr>
                `).join('')}</tbody>
              </table>
            `}
          </div>

          <div class="modal-section">
            <h4>Pedidos 3D (${printOrders.length})</h4>
            ${printOrders.length === 0 ? '<p class="text-muted">Sin pedidos 3D</p>' : `
              <table class="history-table">
                <thead><tr><th>Descripción</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>${printOrders.map(p => `
                  <tr>
                    <td>${esc((p.description || '').substring(0, 40))}</td>
                    <td><span class="status-badge ${p.status}">${p.status}</span></td>
                    <td>${p.created_at ? new Date(p.created_at).toLocaleDateString('es-AR') : '-'}</td>
                  </tr>
                `).join('')}</tbody>
              </table>
            `}
          </div>
        `,
        footer: '<button class="btn btn-outline" id="closeClientDetail">Cerrar</button>',
      });
    } catch (err) {
      modal.show({
        title: 'Error',
        body: `<p>Error al cargar cliente: ${err.message}</p>`,
        footer: '<button class="btn btn-outline" id="closeClientDetail">Cerrar</button>',
      });
    }

    setTimeout(() => {
      const btn = document.getElementById('closeClientDetail');
      if (btn) btn.addEventListener('click', () => modal.hide());
    }, 50);
  }

  document.getElementById('clientSearch').addEventListener('input', renderTable);
  await loadData();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
