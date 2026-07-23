import { $, $$, createElement, formatPrice } from './utils.js';

export function renderBusinessInfo(info) {
  if (!info) return;
  document.title = info.name;
  $('#logo-text').textContent = info.name;
  $('#hero-title').textContent = info.name;
  $('#hero-slogan').textContent = info.slogan || '';
  $('#hero-description').textContent = info.description || '';
  $('#footerName').textContent = info.name;

  if (info.primary_color) {
    document.documentElement.style.setProperty('--primary', info.primary_color);
  }
  if (info.secondary_color) {
    document.documentElement.style.setProperty('--primary-dark', info.secondary_color);
  }
}

export function renderFeaturedMessages(messages) {
  const container = $('#messagesContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!messages || messages.length === 0) return;

  messages.forEach(msg => {
    const banner = createElement('div', {
      className: `message-banner ${msg.type || 'info'}`,
      textContent: msg.message,
    });
    container.appendChild(banner);
  });
}

export function renderCategories(categories, services) {
  const container = $('#categoriesContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!categories || categories.length === 0) {
    container.innerHTML = '<p class="empty">No hay servicios disponibles.</p>';
    return;
  }

  categories.forEach(cat => {
    const catServices = (services || []).filter(s => s.category_id === cat.id);
    const children = [
      cat.image_url && createElement('img', {
        className: 'category-image',
        src: cat.image_url,
        alt: cat.name,
        style: 'width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:8px',
      }),
      createElement('h3', { textContent: cat.name }),
      cat.description && createElement('p', { textContent: cat.description }),
      createElement('div', { className: 'services-list' },
        catServices.map(s => {
          const itemChildren = [
            s.image_url && createElement('img', {
              src: s.image_url, alt: s.name,
              style: 'width:40px;height:40px;object-fit:cover;border-radius:4px;margin-right:8px;vertical-align:middle',
            }),
            createElement('span', { textContent: s.name }),
            s.price && createElement('span', {
              className: 'service-price',
              textContent: formatPrice(s.price),
            }),
          ].filter(Boolean);
          return createElement('div', { className: 'service-item' }, itemChildren);
        })
      ),
    ].filter(Boolean);
    const card = createElement('div', { className: 'category-card' }, children);
    container.appendChild(card);
  });
}

export function renderPromotions(promotions) {
  const container = $('#promotionsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!promotions || promotions.length === 0) {
    container.innerHTML = '<p class="empty">No hay promociones activas.</p>';
    return;
  }

  promotions.forEach(promo => {
    const badgeText = promo.discount_type === 'percentage'
      ? `${promo.discount_value}% OFF`
      : `$${formatPrice(promo.discount_value)} OFF`;

    const children = [
      promo.image_url && createElement('img', {
        src: promo.image_url, alt: promo.title,
        style: 'width:100%;max-height:180px;object-fit:cover;border-radius:8px 8px 0 0;margin-bottom:8px',
      }),
      createElement('h3', { textContent: promo.title }),
      createElement('p', { textContent: promo.description }),
      createElement('span', { className: 'promo-badge', textContent: badgeText }),
    ].filter(Boolean);

    const card = createElement('div', { className: 'promo-card' }, children);
    container.appendChild(card);
  });
}

export function renderPrint3d(printData) {
  const container = $('#print3dContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!printData || printData.length === 0) {
    container.innerHTML = '<p class="empty">No hay servicios de impresión 3D disponibles.</p>';
    return;
  }

  printData.forEach(item => {
    const children = [
      item.image_url && createElement('img', {
        src: item.image_url, alt: item.material,
        style: 'width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:8px',
      }),
      createElement('h3', { textContent: item.material }),
      item.description && createElement('p', { textContent: item.description }),
      item.price_per_gram && createElement('p', {
        textContent: `$${item.price_per_gram}/g`,
      }),
      item.colors && createElement('p', {
        textContent: `Colores: ${item.colors}`,
      }),
      item.max_dimensions && createElement('p', {
        textContent: `Dimensiones máximas: ${item.max_dimensions}`,
      }),
      item.lead_time && createElement('p', {
        textContent: `Tiempo de entrega: ${item.lead_time}`,
      }),
    ].filter(Boolean);
    const card = createElement('div', { className: 'print3d-card' }, children);
    container.appendChild(card);
  });
}

export function renderFaqs(faqs) {
  const container = $('#faqsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!faqs || faqs.length === 0) {
    container.innerHTML = '<p class="empty">No hay preguntas frecuentes.</p>';
    return;
  }

  faqs.forEach(faq => {
    const item = createElement('div', { className: 'faq-item' }, [
      createElement('div', {
        className: 'faq-question',
        textContent: faq.question,
      }),
      createElement('div', {
        className: 'faq-answer',
        textContent: faq.answer,
      }),
    ]);

    item.addEventListener('click', () => {
      item.classList.toggle('open');
    });

    container.appendChild(item);
  });
}

export function renderContact(phones, socialMedia) {
  const phonesContainer = $('#contactPhones');
  if (phonesContainer && phones && phones.length > 0) {
    phonesContainer.innerHTML = '<h3>Teléfonos</h3>' +
      phones.map(p =>
        `<p><a href="https://wa.me/${p.number.replace(/[^0-9]/g, '')}" target="_blank">${p.label ? `${p.label}: ` : ''}${p.number}</a></p>`
      ).join('');
  }

  const socialContainer = $('#socialMedia');
  if (socialContainer && socialMedia && socialMedia.length > 0) {
    socialContainer.innerHTML = '<h3>Redes Sociales</h3><div class="social-links">' +
      socialMedia.map(s =>
        `<a href="${s.url}" class="social-link" target="_blank" rel="noopener">${s.platform}</a>`
      ).join('') + '</div>';
  }
}

export function renderHours(hours) {
  const container = $('#footerHours');
  if (!container || !hours || hours.length === 0) return;

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  container.innerHTML = '<h3>Horarios</h3>';
  hours.sort((a, b) => a.day_of_week - b.day_of_week).forEach(h => {
    const time = h.is_closed
      ? 'Cerrado'
      : `${h.open_time?.slice(0, 5) || '--'} - ${h.close_time?.slice(0, 5) || '--'}`;
    container.innerHTML += `<div class="hour-row ${h.is_closed ? 'closed' : ''}">
      <span>${h.day_name || dayNames[h.day_of_week]}</span>
      <span>${time}</span>
    </div>`;
  });

  const footerInfo = $('#footerInfo');
  if (footerInfo) {
    footerInfo.innerHTML = '<h3>Ubicación</h3>';
  }
}

export function renderAddress(address) {
  const container = $('#contactInfo');
  if (!container || !address) return;

  container.innerHTML = '<h3>Dirección</h3>';
  container.innerHTML += `<p>${address.street} ${address.number || ''}, ${address.city}, ${address.province}</p>`;
  if (address.notes) {
    container.innerHTML += `<p>${address.notes}</p>`;
  }

  const footerInfo = $('#footerInfo');
  if (footerInfo) {
    footerInfo.innerHTML += `<p>${address.street} ${address.number || ''}, ${address.city}</p>`;
  }
}

export function renderProducts(products) {
  const container = $('#productsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!products || products.length === 0) {
    container.innerHTML = '<p class="empty">No hay productos disponibles.</p>';
    return;
  }

  products.forEach(product => {
    const children = [
      product.image_url && createElement('img', {
        src: product.image_url, alt: product.name,
        style: 'width:100%;max-height:200px;object-fit:cover;border-radius:8px 8px 0 0;margin-bottom:12px',
      }),
      createElement('h3', { textContent: product.name }),
      product.category && createElement('span', {
        className: 'product-category',
        textContent: product.category,
      }),
      product.price && createElement('p', {
        className: 'product-price',
        textContent: formatPrice(product.price),
      }),
    ].filter(Boolean);

    const card = createElement('div', { className: 'product-card' }, children);
    card.addEventListener('click', () => showProductDetail(product));
    container.appendChild(card);
  });
}

let scrollPos = 0;

export function showProductDetail(product) {
  const grid = $('#productsContainer');
  const detail = $('#productDetailContainer');
  if (!detail || !grid) return;

  scrollPos = window.scrollY;
  grid.style.display = 'none';
  detail.style.display = 'block';

  const featuresList = product.features
    ? product.features.split('\n').filter(f => f.trim()).map(f => `<li>${f.trim()}</li>`).join('')
    : '';

  detail.innerHTML = `
    <button class="btn btn-outline" id="productBackBtn">← Volver a Productos</button>
    <div class="product-detail">
      ${product.image_url ? `<div class="product-detail-image"><img src="${product.image_url}" alt="${product.name}"></div>` : ''}
      <div class="product-detail-info">
        <h2>${product.name}</h2>
        ${product.category ? `<span class="product-category">${product.category}</span>` : ''}
        ${product.price ? `<p class="product-price-large">${formatPrice(product.price)}</p>` : ''}
        ${product.description ? `<p class="product-detail-desc">${product.description}</p>` : ''}
        ${featuresList ? `<h3>Características</h3><ul class="product-features">${featuresList}</ul>` : ''}
      </div>
    </div>
  `;

  $('#productBackBtn').addEventListener('click', () => {
    detail.style.display = 'none';
    grid.style.display = '';
    window.scrollTo(0, scrollPos);
  });
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
  renderProducts(data.products);
}
