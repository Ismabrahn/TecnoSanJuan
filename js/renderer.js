import { $, $$, createElement, formatPrice } from './utils.js';

export function renderBusinessInfo(info) {
  if (!info) return;
  document.title = info.name;
  const logoLink = document.getElementById('logo-link');
  if (info.logo_url && logoLink) {
    logoLink.innerHTML = '<img src="' + info.logo_url + '" alt="' + info.name + '" style="height:40px">';
  } else {
    document.getElementById('logo-text').textContent = info.name;
  }
  document.getElementById('hero-title').textContent = info.name;
  document.getElementById('hero-slogan').textContent = info.slogan || '';
  document.getElementById('hero-description').textContent = info.description || '';
  document.getElementById('footerName').textContent = info.name;
  if (info.primary_color) document.documentElement.style.setProperty('--primary', info.primary_color);
  if (info.secondary_color) document.documentElement.style.setProperty('--primary-dark', info.secondary_color);
}

export function renderFeaturedMessages(messages) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!messages || messages.length === 0) return;
  messages.forEach(msg => {
    const banner = document.createElement('div');
    banner.className = 'message-banner ' + (msg.type || 'info');
    banner.textContent = msg.message;
    container.appendChild(banner);
  });
}

export function renderCategories(categories, services) {
  const container = document.getElementById('categoriesContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!categories || categories.length === 0) {
    container.innerHTML = '<p class="empty">No hay servicios disponibles.</p>';
    return;
  }
  categories.forEach(cat => {
    const catServices = (services || []).filter(s => s.category_id === cat.id);
    const card = document.createElement('div');
    card.className = 'category-card';
    if (cat.image_url) {
      const img = document.createElement('img');
      img.src = cat.image_url;
      img.alt = cat.name;
      img.style.cssText = 'width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:8px';
      card.appendChild(img);
    }
    const h3 = document.createElement('h3');
    h3.textContent = cat.name;
    card.appendChild(h3);
    if (cat.description) {
      const p = document.createElement('p');
      p.textContent = cat.description;
      card.appendChild(p);
    }
    const list = document.createElement('div');
    list.className = 'services-list';
    catServices.forEach(s => {
      const item = document.createElement('div');
      item.className = 'service-item';
      if (s.image_url) {
        const img = document.createElement('img');
        img.src = s.image_url;
        img.alt = s.name;
        img.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:4px;margin-right:8px;vertical-align:middle';
        item.appendChild(img);
      }
      const span = document.createElement('span');
      span.textContent = s.name;
      item.appendChild(span);
      if (s.price) {
        const price = document.createElement('span');
        price.className = 'service-price';
        price.textContent = '$' + Number(s.price).toLocaleString('es-AR');
        item.appendChild(price);
      }
      list.appendChild(item);
    });
    card.appendChild(list);
    container.appendChild(card);
  });
}

export function renderPromotions(promotions) {
  const container = document.getElementById('promotionsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!promotions || promotions.length === 0) {
    container.innerHTML = '<p class="empty">No hay promociones activas.</p>';
    return;
  }
  promotions.forEach(promo => {
    const card = document.createElement('div');
    card.className = 'promo-card';
    if (promo.image_url) {
      const img = document.createElement('img');
      img.src = promo.image_url;
      img.alt = promo.title;
      img.style.cssText = 'width:100%;max-height:180px;object-fit:cover;border-radius:8px 8px 0 0;margin-bottom:8px';
      card.appendChild(img);
    }
    const h3 = document.createElement('h3');
    h3.textContent = promo.title;
    card.appendChild(h3);
    if (promo.description) {
      const p = document.createElement('p');
      p.textContent = promo.description;
      card.appendChild(p);
    }
    const badge = document.createElement('span');
    badge.className = 'promo-badge';
    badge.textContent = promo.discount_type === 'percentage' ? promo.discount_value + '% OFF' : '$' + Number(promo.discount_value).toLocaleString('es-AR') + ' OFF';
    card.appendChild(badge);
    container.appendChild(card);
  });
}

export function renderPrint3d(printData) {
  const container = document.getElementById('print3dContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!printData || printData.length === 0) {
    container.innerHTML = '<p class="empty">No hay servicios de impresion 3D disponibles.</p>';
    return;
  }
  printData.forEach(item => {
    const card = document.createElement('div');
    card.className = 'print3d-card';
    if (item.image_url) {
      const img = document.createElement('img');
      img.src = item.image_url;
      img.alt = item.material;
      img.style.cssText = 'width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:8px';
      card.appendChild(img);
    }
    const h3 = document.createElement('h3');
    h3.textContent = item.material;
    card.appendChild(h3);
    if (item.description) { const p = document.createElement('p'); p.textContent = item.description; card.appendChild(p); }
    if (item.price_per_gram) { const p = document.createElement('p'); p.textContent = '$' + item.price_per_gram + '/g'; card.appendChild(p); }
    if (item.colors) { const p = document.createElement('p'); p.textContent = 'Colores: ' + item.colors; card.appendChild(p); }
    if (item.max_dimensions) { const p = document.createElement('p'); p.textContent = 'Dimensiones maximas: ' + item.max_dimensions; card.appendChild(p); }
    if (item.lead_time) { const p = document.createElement('p'); p.textContent = 'Tiempo de entrega: ' + item.lead_time; card.appendChild(p); }
    container.appendChild(card);
  });
}

export function renderFaqs(faqs) {
  const container = document.getElementById('faqsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!faqs || faqs.length === 0) {
    container.innerHTML = '<p class="empty">No hay preguntas frecuentes.</p>';
    return;
  }
  faqs.forEach(faq => {
    const item = document.createElement('div');
    item.className = 'faq-item';
    const q = document.createElement('div');
    q.className = 'faq-question';
    q.textContent = faq.question;
    item.appendChild(q);
    const a = document.createElement('div');
    a.className = 'faq-answer';
    a.textContent = faq.answer;
    item.appendChild(a);
    item.addEventListener('click', () => item.classList.toggle('open'));
    container.appendChild(item);
  });
}

export function renderContact(phones, socialMedia) {
  const phonesContainer = document.getElementById('contactPhones');
  if (phonesContainer && phones && phones.length > 0) {
    let html = '<h3>Telefonos</h3>';
    phones.forEach(p => {
      const num = p.number.replace(/[^0-9]/g, '');
      html += '<p><a href="https://wa.me/' + num + '" target="_blank">' + (p.label ? p.label + ': ' : '') + p.number + '</a></p>';
    });
    phonesContainer.innerHTML = html;
  }
  const socialContainer = document.getElementById('socialMedia');
  if (socialContainer && socialMedia && socialMedia.length > 0) {
    let html = '<h3>Redes Sociales</h3><div class="social-links">';
    socialMedia.forEach(s => {
      html += '<a href="' + s.url + '" class="social-link" target="_blank" rel="noopener">' + s.platform + '</a>';
    });
    html += '</div>';
    socialContainer.innerHTML = html;
  }
}

export function renderHours(hours) {
  const container = document.getElementById('footerHours');
  if (!container || !hours || hours.length === 0) return;
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  let html = '<h3>Horarios</h3>';
  hours.sort((a, b) => a.day_of_week - b.day_of_week).forEach(h => {
    const time = h.is_closed ? 'Cerrado' : (h.open_time ? h.open_time.slice(0, 5) : '--') + ' - ' + (h.close_time ? h.close_time.slice(0, 5) : '--');
    html += '<div class="hour-row' + (h.is_closed ? ' closed' : '') + '"><span>' + (h.day_name || dayNames[h.day_of_week]) + '</span><span>' + time + '</span></div>';
  });
  container.innerHTML = html;
  const footerInfo = document.getElementById('footerInfo');
  if (footerInfo) footerInfo.innerHTML = '<h3>Ubicacion</h3>';
}

export function renderAddress(address) {
  const container = document.getElementById('contactInfo');
  if (!container || !address) return;
  let html = '<h3>Direccion</h3>';
  html += '<p>' + address.street + ' ' + (address.number || '') + ', ' + address.city + ', ' + address.province + '</p>';
  if (address.notes) html += '<p>' + address.notes + '</p>';
  container.innerHTML = html;
  const footerInfo = document.getElementById('footerInfo');
  if (footerInfo) footerInfo.innerHTML += '<p>' + address.street + ' ' + (address.number || '') + ', ' + address.city + '</p>';
}

export function renderAll(data) {
  renderBusinessInfo(data['business-info']);
  renderFeaturedMessages(data['featured-messages']);
  renderCategories(data.categories, data.services);
  renderPromotions(data.promotions);
  renderPrint3d(data['print3d']);
  renderFaqs(data.faqs);
  renderContact(data.phones, data['social-media']);
  renderHours(data.hours);
  renderAddress(data.address);
}
