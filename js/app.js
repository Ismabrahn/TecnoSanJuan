import { fetchAllPublicData } from './api.js';
import { renderAll } from './renderer.js';
import { initChatbot } from './chatbot.js';
import { $ } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  initChatbot();

  const menuToggle = $('#menuToggle');
  const mainNav = $('#mainNav');

  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', () => {
      mainNav.classList.toggle('open');
    });

    mainNav.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        mainNav.classList.remove('open');
      }
    });
  }

  try {
    const data = await fetchAllPublicData();
    renderAll(data);
  } catch (err) {
    console.error('Error cargando datos:', err);
  }
});
