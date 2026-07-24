import { $, createElement } from './utils.js';
import { fetchChat, fetchPublic } from './api.js';

let initialized = false;
let currentContext = '';
let chatbotApi = null;

export function getChatbot() {
  return chatbotApi;
}

export async function initChatbot() {
  if (initialized) return;
  initialized = true;

  const toggle = $('#chatbotToggle');
  const panel = $('#chatbotPanel');
  const close = $('#chatbotClose');
  const input = $('#chatbotInput');
  const send = $('#chatbotSend');
  const messages = $('#chatbotMessages');

  if (!toggle || !panel) return;

  let isOpen = false;

  function togglePanel(open) {
    isOpen = open;
    panel.classList.toggle('hidden', !isOpen);
    toggle.style.display = isOpen ? 'none' : 'flex';
    document.getElementById('chatbot').classList.toggle('chatbot-panel-open', isOpen);
    if (!open) currentContext = '';
    if (isOpen) input.focus();
  }

  toggle.addEventListener('click', () => togglePanel(true));
  close.addEventListener('click', () => togglePanel(false));

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || text.length > 2000) return;

    input.value = '';
    send.disabled = true;

    addMessage(text, 'user');

    const typing = addTypingIndicator();

    try {
      const data = await fetchChat(text, currentContext);
      typing.remove();
      addMessage(data.response, 'bot', data.source);
    } catch (err) {
      typing.remove();
      addMessage(err.message || 'Error de conexión', 'bot');
    } finally {
      send.disabled = false;
      input.focus();
    }
  }

  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  function addMessage(text, type, source) {
    const msg = createElement('div', { className: `message ${type}` });
    msg.textContent = text;
    if (source) {
      const tag = createElement('span', {
        className: 'message-source',
        textContent: source === 'database' ? 'BD' : 'IA',
      });
      msg.appendChild(tag);
    }
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  function addTypingIndicator() {
    const indicator = createElement('div', { className: 'typing-indicator' });
    for (let i = 0; i < 3; i++) {
      indicator.appendChild(createElement('span'));
    }
    messages.appendChild(indicator);
    messages.scrollTop = messages.scrollHeight;
    return indicator;
  }

  try {
    const config = await fetchPublic('chatbot-config');
    const welcome = config?.welcome_message || '¡Hola! Soy el asistente virtual de Tecno San Juan. Consultame sobre servicios, precios, horarios y más.';
    addMessage(welcome, 'bot');
  } catch {
    addMessage('¡Hola! Soy el asistente virtual de Tecno San Juan. Consultame sobre servicios, precios, horarios y más.', 'bot');
  }

  chatbotApi = {
    async startChat(context) {
      currentContext = context;
      messages.innerHTML = '';
      togglePanel(true);

      addMessage('Decime que necesitas y te ayudo con todo.', 'bot');
      send.disabled = false;
      input.focus();
    },
  };
}
