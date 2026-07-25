const LOG_PREFIX = '[WHATSAPP]';

function log(step, data) {
  console.log(`${LOG_PREFIX} ${step}: ${typeof data === 'object' ? JSON.stringify(data) : data}`);
}

function dispatchEvent(name, detail) {
  const event = new CustomEvent(name, { detail, bubbles: true });
  document.dispatchEvent(event);
}

export function validatePhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) {
    log('ERROR', 'Número vacío');
    return null;
  }
  if (clean.length < 8) {
    log('ERROR', `Número demasiado corto: ${clean.length} dígitos`);
    return null;
  }
  log('VALIDATED', `${clean.length} dígitos`);
  return clean;
}

export function buildWhatsAppUrl(phone, message) {
  const validPhone = validatePhone(phone);
  if (!validPhone) return null;

  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/${validPhone}?text=${encoded}`;
  log('URL_GENERATED', url.substring(0, 80) + '...');
  return url;
}

export function openWhatsApp(url) {
  if (!url) {
    log('ERROR', 'URL inválida, no se puede abrir WhatsApp');
    return false;
  }

  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      log('POPUP_BLOCKED', 'El navegador bloqueó la ventana emergente');
      dispatchEvent('whatsapp:blocked', { url });
      return false;
    }
    log('OPENED', 'window.open ejecutado');
    dispatchEvent('whatsapp:opened', { url });
    return true;
  } catch (err) {
    log('ERROR', `Error al abrir WhatsApp: ${err.message}`);
    dispatchEvent('whatsapp:error', { url, error: err.message });
    return false;
  }
}

export function createWhatsAppButton(phone, summary, onClick) {
  const url = buildWhatsAppUrl(phone, summary);
  if (!url) {
    log('ERROR', 'No se puede crear el botón: falta número o resumen');
    dispatchEvent('whatsapp:error', { reason: 'missing_data', phone, summary: !!summary });
    return null;
  }

  const btn = document.createElement('a');
  btn.className = 'whatsapp-quote-btn';
  btn.textContent = 'Enviar por WhatsApp';
  btn.href = url;
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer';

  btn.addEventListener('click', (e) => {
    log('CLICK', 'Click detectado en botón WhatsApp');
    dispatchEvent('whatsapp:click', { url });
    const opened = openWhatsApp(url);
    if (!opened) {
      e.preventDefault();
      log('POPUP_BLOCKED', 'Popup bloqueado — mostrando enlace manual');
      btn.textContent = 'Abrir WhatsApp manualmente';
      btn.style.opacity = '0.8';
      btn.href = url;
    }
  });

  log('BUTTON_RENDERED', 'Botón WhatsApp renderizado');
  dispatchEvent('whatsapp:rendered', { phone, summary: !!summary });
  return btn;
}
