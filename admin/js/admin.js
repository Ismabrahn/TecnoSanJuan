import { isAuthenticated, getSession, clearSession } from './auth.js';
import { adminGetAll, adminCreate, adminUpdate, adminDelete } from './api.js';
import { Modal } from './components/Modal.js';
import { DataTable } from './components/DataTable.js';
import { FormBuilder } from './components/FormBuilder.js';
import { MODULES } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  if (!isAuthenticated()) {
    window.location.href = 'login.html';
    return;
  }

  const session = getSession();
  const currentUser = document.getElementById('currentUser');
  if (currentUser && session?.user?.email) {
    currentUser.textContent = session.user.email;
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearSession();
      window.location.href = 'login.html';
    });
  }

  const sidebarNav = document.getElementById('sidebarNav');
  const pageTitle = document.getElementById('pageTitle');
  const contentArea = document.getElementById('contentArea');
  const toolbar = document.getElementById('toolbar');

  let currentModule = null;
  let dataTable = null;
  let modal = new Modal();
  let currentData = [];
  let formBuilder = null;

  function buildSidebar() {
    sidebarNav.innerHTML = MODULES.map(m =>
      `<a href="#" data-module="${m.id}" class="${m.id === 'business-info' ? 'active' : ''}">${m.icon || ''} ${m.label}</a>`
    ).join('');

    sidebarNav.addEventListener('click', (e) => {
      const link = e.target.closest('[data-module]');
      if (link) {
        e.preventDefault();
        sidebarNav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
        loadModule(link.dataset.module);
      }
    });
  }

  async function loadModule(moduleId) {
    const mod = MODULES.find(m => m.id === moduleId);
    if (!mod) return;

    currentModule = mod;
    pageTitle.textContent = mod.label;

    if (mod.custom && mod.render) {
      toolbar.innerHTML = '';
      contentArea.innerHTML = '<div class="empty-state">Cargando módulo...</div>';
      try {
        await mod.render(contentArea);
      } catch (err) {
        contentArea.innerHTML = `<div class="empty-state">Error al cargar: ${err.message}</div>`;
      }
    } else if (mod.single) {
      await loadSingleModule(mod);
    } else {
      await loadListModule(mod);
    }
  }

  async function loadListModule(mod) {
    toolbar.innerHTML = `
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Buscar..." />
        <button class="btn btn-primary btn-sm" id="searchBtn">Buscar</button>
      </div>
      <button class="btn btn-success" id="addBtn">+ Agregar</button>
    `;

    dataTable = new DataTable(contentArea, mod);
    dataTable.onEdit = handleEdit;
    dataTable.onDelete = handleDelete;

    document.getElementById('addBtn').addEventListener('click', () => handleAdd());
    document.getElementById('searchBtn').addEventListener('click', () => {
      const term = document.getElementById('searchInput').value.trim();
      dataTable.setSearch(term);
      dataTable.render();
    });
    document.getElementById('searchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('searchBtn').click();
    });

    try {
      currentData = await adminGetAll(mod.id);
      dataTable.setData(currentData);
    } catch (err) {
      contentArea.innerHTML = `<div class="empty-state">Error al cargar datos: ${err.message}</div>`;
    }
  }

  async function loadSingleModule(mod) {
    toolbar.innerHTML = '';

    try {
      const data = await adminGetAll(mod.id);
      const item = Array.isArray(data) ? data[0] : data;

      contentArea.innerHTML = '<div class="card"><div id="singleFormContainer"></div><div style="margin-top:16px;text-align:right"><button class="btn btn-primary" id="saveSingleBtn">Guardar</button></div></div>';

      const formContainer = document.getElementById('singleFormContainer');
      formBuilder = new FormBuilder(formContainer, mod);

      if (mod.fields.some(f => f.reference)) {
        const refs = new Set(mod.fields.filter(f => f.reference).map(f => f.reference));
        for (const ref of refs) {
          try {
            formBuilder.setReferenceData(ref, await adminGetAll(ref));
          } catch (err) {
            console.warn(err);
          }
        }
      }

      formBuilder.build(item || {});

      document.getElementById('saveSingleBtn').addEventListener('click', async () => {
        try {
          const formData = formBuilder.getData();
          const btn = document.getElementById('saveSingleBtn');
          btn.disabled = true;
          btn.textContent = 'Guardando...';

          if (formData.id) {
            await adminUpdate(mod.id, formData.id, formData);
          } else {
            await adminCreate(mod.id, formData);
          }

          btn.textContent = '✓ Guardado';
          setTimeout(() => { btn.disabled = false; btn.textContent = 'Guardar'; }, 2000);
        } catch (err) {
          alert(`Error: ${err.message}`);
          document.getElementById('saveSingleBtn').disabled = false;
          document.getElementById('saveSingleBtn').textContent = 'Guardar';
        }
      });
    } catch (err) {
      contentArea.innerHTML = `<div class="empty-state">Error al cargar datos: ${err.message}</div>`;
    }
  }

  async function loadReferenceData(targetFormBuilder) {
    const refs = new Set();
    for (const field of currentModule.fields || []) {
      if (field.reference) refs.add(field.reference);
    }
    for (const ref of refs) {
      try {
        const data = await adminGetAll(ref);
        if (targetFormBuilder) targetFormBuilder.setReferenceData(ref, data);
      } catch (err) {
        console.warn(`Error loading reference ${ref}:`, err);
      }
    }
  }

  function handleAdd() {
    showFormModal(null);
  }

  function handleEdit(item) {
    showFormModal(item);
  }

  async function showFormModal(item) {
    const isEdit = !!item;

    modal.show({
      title: isEdit ? `Editar ${currentModule.label}` : `Agregar ${currentModule.label}`,
      body: '<div id="formContainer"></div>',
      footer: `
        <button class="btn btn-outline" id="cancelBtn">Cancelar</button>
        <button class="btn btn-primary" id="saveBtn">Guardar</button>
      `,
    });

    const overlay = document.querySelector('.modal-overlay');
    const formContainer = overlay.querySelector('#formContainer');

    formBuilder = new FormBuilder(formContainer, currentModule);

    if (currentModule.fields.some(f => f.reference)) {
      await loadReferenceData(formBuilder);
    }

    formBuilder.build(item || {});

    overlay.querySelector('#cancelBtn').addEventListener('click', () => modal.hide());
    overlay.querySelector('#saveBtn').addEventListener('click', async () => {
      await saveForm(item);
    });
  }

  async function saveForm(item) {
    try {
      const data = formBuilder.getData();
      const saveBtn = document.querySelector('#saveBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';

      if (item) {
        await adminUpdate(currentModule.id, item.id, data);
      } else {
        await adminCreate(currentModule.id, data);
      }

      modal.hide();
      currentData = await adminGetAll(currentModule.id);
      dataTable.setData(currentData);
    } catch (err) {
      alert(`Error al guardar: ${err.message}`);
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Estás seguro de eliminar este registro?')) return;

    try {
      await adminDelete(currentModule.id, id);
      currentData = await adminGetAll(currentModule.id);
      dataTable.setData(currentData);
    } catch (err) {
      alert(`Error al eliminar: ${err.message}`);
    }
  }

  buildSidebar();
  loadModule('business-info');
});
