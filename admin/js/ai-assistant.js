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
    throw new Error('SesiÃ³n no vÃ¡lida');
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
    throw new Error('SesiÃ³n expirada');
  }

  return res.json();
}

export function renderAiAssistant(container) {
  container.innerHTML = `
    <style>
      .ai-chat {
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-width: 800px;
      }
      .ai-chat-input {
        display: flex;
        gap: 8px;
      }
      .ai-chat-input textarea {
        flex: 1;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 14px;
        resize: vertical;
        min-height: 60px;
      }
      .ai-chat-input button {
        align-self: flex-end;
        padding: 12px 24px;
      }
      .ai-message {
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.5;
      }
      .ai-message.user {
        background: #e8f0fe;
        align-self: flex-end;
      }
      .ai-message.assistant {
        background: #f5f5f5;
        border-left: 3px solid #2563eb;
      }
      .ai-message.error {
        background: #fef2f2;
        border-left: 3px solid #dc2626;
        color: #991b1b;
      }
      .ai-message.success {
        background: #f0fdf4;
        border-left: 3px solid #16a34a;
      }
      .ai-messages {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 60vh;
        overflow-y: auto;
      }
      .ai-thinking {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        color: #666;
        font-style: italic;
      }
      .ai-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #ddd;
        border-top-color: #2563eb;
        border-radius: 50%;
        animation: ai-spin 0.6s linear infinite;
      }
      @keyframes ai-spin {
        to { transform: rotate(360deg); }
      }
      .ai-changes {
        margin-top: 8px;
        padding: 8px;
        background: #fff;
        border-radius: 6px;
        font-size: 13px;
      }
      .ai-changes summary {
        cursor: pointer;
        font-weight: 500;
        color: #2563eb;
      }
      .ai-changes pre {
        margin: 8px 0 0;
        font-size: 12px;
        max-height: 200px;
        overflow-y: auto;
        white-space: pre-wrap;
      }
      .ai-empty {
        text-align: center;
        padding: 40px 20px;
        color: #888;
      }
      .ai-empty p {
        margin: 8px 0;
      }
      .ai-examples {
        margin-top: 4px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .ai-examples button {
        background: #e8f0fe;
        border: 1px solid #c5d8f7;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        cursor: pointer;
        color: #1a56db;
      }
      .ai-examples button:hover {
        background: #d0e1fd;
      }
    </style>

    <div class="ai-chat">
      <div class="ai-messages" id="aiMessages">
        <div class="ai-empty" id="aiEmpty">
          <p>ðŸ¤– <strong>Asistente IA de AdministraciÃ³n</strong></p>
          <p>EscribÃ­ en lenguaje natural lo que querÃ©s hacer:</p>
          <p style="font-size:13px;color:#999">Ej: "aumentar todos los precios de productos un 10%"</p>
          <div class="ai-examples">
            <button data-example="Aumentar todos los precios de productos un 15%">+15% productos</button>
            <button data-example="Cambiar el precio del Monitor 4K a $175000">Cambiar precio monitor</button>
            <button data-example="Agregar un nuevo producto: Teclado inalÃ¡mbrico, $25000">Agregar producto</button>
            <button data-example="Desactivar todos los productos con precio menor a $10000">Desactivar baratos</button>
          </div>
        </div>
      </div>

      <div class="ai-chat-input">
        <textarea id="aiInstruction" placeholder="Ej: aumentÃ¡ todos los precios de servicios un 15%..." rows="2"></textarea>
        <button class="btn btn-primary" id="aiSendBtn">Enviar</button>
      </div>
    </div>
  `;

  const messagesEl = document.getElementById('aiMessages');
  const emptyEl = document.getElementById('aiEmpty');
  const inputEl = document.getElementById('aiInstruction');
  const sendBtn = document.getElementById('aiSendBtn');

  function addMessage(type, contentHtml, extraHtml) {
    emptyEl.style.display = 'none';
    const div = document.createElement('div');
    div.className = `ai-message ${type}`;
    div.innerHTML = contentHtml;
    if (extraHtml) div.insertAdjacentHTML('beforeend', extraHtml);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addThinking() {
    emptyEl.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'ai-thinking';
    div.id = 'aiThinking';
    div.innerHTML = '<div class="ai-spinner"></div> Procesando instrucciÃ³n...';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeThinking() {
    const el = document.getElementById('aiThinking');
    if (el) el.remove();
  }

  async function handleSend() {
    const instruction = inputEl.value.trim();
    if (!instruction) return;

    addMessage('user', `<strong>TÃº:</strong> ${instruction}`);
    inputEl.value = '';
    addThinking();

    try {
      const result = await sendInstruction(instruction);
      removeThinking();

      if (result.success) {
        let html = `<strong>ðŸ¤– Asistente:</strong> ${result.explanation || result.summary}`;
        if (result.changes) {
          const changesJson = JSON.stringify(result.changes, null, 2);
          html += `<div class="ai-changes"><details><summary>Ver cambios detallados (${result.changes.length} acciÃ³n(es))</summary><pre>${changesJson}</pre></details></div>`;
        }
        addMessage('success', html);
      } else {
        addMessage('error', `<strong>Error:</strong> ${result.error || result.response || 'Error desconocido'}`);
      }
    } catch (err) {
      removeThinking();
      addMessage('error', `<strong>Error:</strong> ${err.message}`);
    }
  }

  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  messagesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-example]');
    if (btn) {
      inputEl.value = btn.dataset.example;
      handleSend();
    }
  });
}
