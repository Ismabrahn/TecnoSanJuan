import { getSession, clearSession } from './auth.js';

const API_BASE = 'https://tecno-san-juan-production.cuatrinismaelabrahan.workers.dev';

function getToken() {
  const session = getSession();
  return session?.access_token || null;
}

async function sendInstruction(instruction) {
  const token = getToken();
  if (!token) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesion no valida');
  }

  const res = await fetch(`${API_BASE}/api/admin/ai-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ instruction }),
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesion expirada');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error de conexion' }));
    throw new Error(err.error || `Error ${res.status}`);
  }

  return res.json();
}

export function renderAiAssistant(container) {
  container.innerHTML = `
    <style>
      .ai-chat { display: flex; flex-direction: column; height: 65vh; max-width: 800px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .ai-header { background: #2563eb; color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; }
      .ai-header h3 { font-size: 1rem; margin: 0; }
      .ai-header p { font-size: 0.75rem; opacity: 0.85; margin: 2px 0 0; }
      .ai-messages { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
      .ai-msg { padding: 10px 14px; border-radius: 12px; max-width: 85%; word-wrap: break-word; line-height: 1.5; font-size: 14px; }
      .ai-msg.user { background: #2563eb; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
      .ai-msg.bot { background: #f1f5f9; color: #1e293b; align-self: flex-start; border-bottom-left-radius: 4px; }
      .ai-msg.error { background: #fef2f2; color: #991b1b; align-self: flex-start; border-left: 3px solid #dc2626; border-radius: 4px; }
      .ai-msg.success { background: #f0fdf4; color: #166534; align-self: flex-start; border-left: 3px solid #16a34a; border-radius: 4px; }
      .ai-input { display: flex; border-top: 1px solid #e2e8f0; padding: 12px; gap: 8px; }
      .ai-input input { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 0.9rem; outline: none; }
      .ai-input input:focus { border-color: #2563eb; }
      .ai-input button { background: #2563eb; color: white; border: none; border-radius: 8px; padding: 10px 20px; cursor: pointer; font-weight: 600; }
      .ai-input button:hover { background: #1e40af; }
      .ai-input button:disabled { opacity: 0.5; cursor: not-allowed; }
      .ai-thinking { display: flex; gap: 4px; padding: 10px 14px; background: #f1f5f9; border-radius: 12px; border-bottom-left-radius: 4px; width: fit-content; margin-bottom: 4px; }
      .ai-thinking span { width: 8px; height: 8px; border-radius: 50%; background: #64748b; animation: ai-bounce 1.4s infinite ease-in-out; }
      .ai-thinking span:nth-child(2) { animation-delay: 0.2s; }
      .ai-thinking span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes ai-bounce { 0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); } 30% { opacity: 1; transform: scale(1); } }
      .ai-details { margin-top: 6px; font-size: 12px; }
      .ai-details summary { cursor: pointer; font-weight: 500; color: #2563eb; }
      .ai-details pre { margin: 6px 0 0; font-size: 11px; max-height: 150px; overflow-y: auto; white-space: pre-wrap; background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0; }
      .ai-empty { text-align: center; padding: 60px 20px; color: #94a3b8; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .ai-empty p { margin: 6px 0; }
      .ai-empty .big-icon { font-size: 48px; margin-bottom: 12px; }
      .ai-ejemplos { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 8px; }
      .ai-ejemplos button { background: #e8f0fe; border: 1px solid #c5d8f7; padding: 4px 12px; border-radius: 14px; font-size: 12px; cursor: pointer; color: #1a56db; }
      .ai-ejemplos button:hover { background: #d0e1fd; }
      @media (max-width: 600px) { .ai-chat { height: 70vh; max-width: 100%; } }
    </style>

    <div class="ai-chat">
      <div class="ai-header">
        <div>
          <h3>Asistente IA</h3>
          <p>Escribi en lenguaje natural lo que quieras hacer</p>
        </div>
      </div>

      <div class="ai-messages" id="aiMessages">
        <div class="ai-empty" id="aiEmpty">
          <div class="big-icon">&#x1F916;</div>
          <p><strong>Asistente IA de Administracion</strong></p>
          <p>Ej: &quot;aumentar todos los precios de productos un 15%&quot;</p>
          <div class="ai-ejemplos">
            <button data-ejemplo="Aumentar todos los precios de productos un 15%">+15% productos</button>
            <button data-ejemplo="Cambiar el precio del Monitor 4K a 175000">Cambiar precio monitor</button>
            <button data-ejemplo="Agregar un nuevo producto: Teclado inalambrico, 25000">Agregar producto</button>
            <button data-ejemplo="Desactivar todos los productos con precio menor a 10000">Desactivar baratos</button>
          </div>
        </div>
      </div>

      <div class="ai-input">
        <input id="aiInput" placeholder="Ej: aumentá todos los precios de servicios un 15%..." />
        <button id="aiSendBtn">Enviar</button>
      </div>
    </div>
  `;

  const messagesEl = document.getElementById('aiMessages');
  const emptyEl = document.getElementById('aiEmpty');
  const inputEl = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSendBtn');

  function addMsg(type, html, extra) {
    emptyEl.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'ai-msg ' + type;
    div.innerHTML = html;
    if (extra) div.insertAdjacentHTML('beforeend', extra);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showThinking() {
    emptyEl.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'ai-thinking';
    div.id = 'aiThink';
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    sendBtn.disabled = true;
    inputEl.disabled = true;
  }

  function hideThinking() {
    const el = document.getElementById('aiThink');
    if (el) el.remove();
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text) return;

    addMsg('user', escapeHtml(text));
    inputEl.value = '';
    showThinking();

    try {
      const result = await sendInstruction(text);
      hideThinking();

      const msg = result.explanation || result.summary || result.response || JSON.stringify(result);
      const type = result.success !== false ? 'bot' : 'error';
      let html = msg.replace(/\n/g, '<br>');

      if (result.changes && result.changes.length > 0) {
        const json = JSON.stringify(result.changes, null, 2);
        html += '<div class="ai-details"><details><summary>Ver cambios (' + result.changes.length + ' accion(es))</summary><pre>' + escapeHtml(json) + '</pre></details></div>';
      }

      addMsg(type, html);
    } catch (err) {
      hideThinking();
      addMsg('error', '<strong>Error:</strong> ' + escapeHtml(err.message));
    }
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  messagesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ejemplo]');
    if (btn) {
      inputEl.value = btn.dataset.ejemplo;
      handleSend();
    }
  });
}
