import { $, createElement } from './utils.js';
import { fetchChat } from './api.js';

let initialized = false;

export function initChatbot() {
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

  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.classList.toggle('hidden', !isOpen);
    toggle.style.display = isOpen ? 'none' : 'flex';
    if (isOpen) input.focus();
  });

  close.addEventListener('click', () => {
    isOpen = false;
    panel.classList.add('hidden');
    toggle.style.display = 'flex';
  });

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || text.length > 2000) return;

    input.value = '';
    send.disabled = true;

    addMessage(text, 'user');

    const typing = addTypingIndicator();

    try {
      const data = await fetchChat(text);
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

  addMessage('¡Hola! Soy el asistente virtual de Tecno San Juan. Consultame sobre servicios, precios, horarios y más.', 'bot');
}
