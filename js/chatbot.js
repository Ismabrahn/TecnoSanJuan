import { $, createElement } from './utils.js';
import { fetchChat, fetchPublic } from './api.js';

let initialized = false;
let currentContext = '';
let interviewState = null;
let phoneNumber = '';
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
    if (!open) { currentContext = ''; interviewState = null; input.disabled = false; }
    if (isOpen) input.focus();
  }

  toggle.addEventListener('click', () => togglePanel(true));
  close.addEventListener('click', () => togglePanel(false));

  function addQuoteWhatsApp(summary, phone) {
    const msg = encodeURIComponent('Hola, quiero solicitar el siguiente presupuesto:\n\n' + summary);
    const waUrl = `https://wa.me/${phone}?text=${msg}`;
    const btn = createElement('a', { className: 'whatsapp-quote-btn', href: waUrl, target: '_blank', textContent: 'Enviar por WhatsApp' });
    messages.appendChild(btn);
    messages.scrollTop = messages.scrollHeight;
    input.disabled = true;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || text.length > 2000) return;

    input.value = '';
    send.disabled = true;

    addMessage(text, 'user');

    const typing = addTypingIndicator();

    try {
      const data = await fetchChat(text, currentContext, interviewState);
      typing.remove();
      if (data.interview) {
        interviewState = data.interview;
        addMessage(data.response, 'bot', 'ai');
        if (data.interview.complete) {
          const summary = buildSummaryText(data.interview.state);
          if (data.phone) phoneNumber = data.phone;
          addQuoteWhatsApp(summary, data.phone || phoneNumber);
        }
      } else {
        addMessage(data.response, 'bot', data.source);
      }
    } catch (err) {
      typing.remove();
      addMessage(err.message || 'Error de conexión', 'bot');
    } finally {
      send.disabled = false;
      if (!input.disabled) input.focus();
    }
  }

  function buildSummaryText(state) {
    const labels = {
      pieza: 'Pieza', archivo: 'Tiene archivo', requiere_diseno: 'Requiere diseño',
      medidas: 'Medidas', cantidad: 'Cantidad', material: 'Material',
      color: 'Color', uso: 'Uso previsto', fecha_limite: 'Fecha límite',
      observaciones: 'Observaciones',
    };
    return Object.entries(state)
      .filter(([k, v]) => k !== 'finalizada' && v !== null && v !== '---')
      .map(([k, v]) => `${labels[k] || k}: ${v}`)
      .join('\n');
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
    const [config, biz] = await Promise.all([
      fetchPublic('chatbot-config'),
      fetchPublic('business-info').catch(() => null),
    ]);
    const welcome = config?.welcome_message || '¡Hola! Soy el asistente virtual de Tecno San Juan. Consultame sobre servicios, precios, horarios y más.';
    addMessage(welcome, 'bot');
    if (biz?.phone) phoneNumber = biz.phone.replace(/[^0-9]/g, '');
  } catch {
    addMessage('¡Hola! Soy el asistente virtual de Tecno San Juan. Consultame sobre servicios, precios, horarios y más.', 'bot');
  }

  chatbotApi = {
    async startChat(context) {
      currentContext = context;
      interviewState = null;
      messages.innerHTML = '';
      togglePanel(true);

      if (context === '3d_quote') {
        input.value = '.';
        send.disabled = false;
        await sendMessage();
      } else {
        addMessage('Decime que necesitas y te ayudo con todo.', 'bot');
        send.disabled = false;
        input.focus();
      }
    },
  };
}
