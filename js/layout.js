import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const modulos = [
    { nombre: 'Inventario', icono: '📦', url: 'inventario.html' },
    { nombre: 'Movimientos', icono: '📊', url: 'movimientos.html' },
    { nombre: 'Kardex', icono: '📋', url: 'kardex.html' },
    { nombre: 'Notas de Entrega', icono: '📝', url: 'notas_entrega.html' } 
];

function renderizarSidebar() {
    const container = document.getElementById('sidebar-container');
    if (!container) return;

    // Detectar en qué página estamos (ej. 'inventario.html')
    const paginaActual = window.location.pathname.split('/').pop() || 'inventario.html';

    // Generar los enlaces HTML dinámicamente
    let menuHTML = '';
    modulos.forEach(mod => {
        const claseActiva = paginaActual === mod.url ? 'active' : '';
        menuHTML += `<a href="${mod.url}" class="nav-link ${claseActiva}">${mod.icono} ${mod.nombre}</a>`;
    });

    // Inyectar el HTML en el contenedor
    container.innerHTML = `
        <div class="brand">Mi ERP</div>
        <nav class="nav-menu">
            ${menuHTML}
        </nav>
        <div class="user-info mt-auto">
            <span id="layout-user-email" class="d-block text-truncate small">Cargando...</span>
            <button id="layout-btn-logout" class="btn btn-danger btn-sm w-100 mt-2">Salir</button>
        </div>
    `;

    // Configurar el botón de Salir
    document.getElementById('layout-btn-logout').addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = 'index.html');
    });

    // Mostrar el correo del usuario conectado
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const emailEl = document.getElementById('layout-user-email');
            if (emailEl) emailEl.textContent = user.email;
        }
    });
}

// Ejecutar cuando el HTML esté listo
document.addEventListener('DOMContentLoaded', renderizarSidebar);
