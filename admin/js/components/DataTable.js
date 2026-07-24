export class DataTable {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.data = [];
    this.onEdit = null;
    this.onDelete = null;
    this.searchTerm = '';
  }

  setData(data) {
    this.data = data || [];
    this.render();
  }

  setSearch(term) {
    this.searchTerm = term;
  }

  getFilteredData() {
    if (!this.searchTerm) return this.data;
    const q = this.searchTerm.toLowerCase();
    return this.data.filter(item =>
      Object.values(item).some(val =>
        String(val || '').toLowerCase().includes(q)
      )
    );
  }

  render() {
    const filtered = this.getFilteredData();
    const fields = this.config.fields || [];
    const displayFields = fields.filter(f => f.key !== 'is_active' && f.key !== 'created_at' && f.key !== 'updated_at');

    if (filtered.length === 0) {
      this.container.innerHTML = `<div class="empty-state">No hay registros. Hacé clic en "Agregar" para crear uno.</div>`;
      return;
    }

    let html = '<div class="table-container"><table><thead><tr>';

    for (const field of displayFields) {
      html += `<th>${field.label || field.key}</th>`;
    }

    html += '<th>Acciones</th></tr></thead><tbody>';

    for (const item of filtered) {
      html += '<tr>';
      for (const field of displayFields) {
        const value = item[field.key];
        html += `<td>${this.formatValue(value, field)}</td>`;
      }
      html += `<td class="actions">
        <button class="btn btn-warning btn-sm" data-action="edit" data-id="${item.id}">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${item.id}">Eliminar</button>
      </td></tr>`;
    }

    html += '</tbody></table></div>';
    this.container.innerHTML = html;

    this.container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.onEdit) {
          const item = this.data.find(d => d.id === Number(btn.dataset.id));
          this.onEdit(item);
        }
      });
    });

    this.container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.onDelete) {
          this.onDelete(Number(btn.dataset.id));
        }
      });
    });
  }

  formatValue(value, field) {
    if (value === null || value === undefined) return '-';
    if (field.type === 'checkbox' || field.key === 'is_active' || field.key === 'is_closed') {
      return value ? '✓' : '✗';
    }
    if (field.type === 'color') {
      return `<span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${value};border:1px solid #ddd;vertical-align:middle"></span> ${value}`;
    }
    if (field.type === 'select' && field.reference) {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (field.key === 'price' || field.key === 'amount' || field.key === 'price_per_gram' || field.key === 'discount_value') {
      return `$${Number(value).toLocaleString('es-AR')}`;
    }
    return String(value).substring(0, 100);
  }
}
