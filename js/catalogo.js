import { db } from './firebase.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let publicProductosCache = [];

// Obtenemos el UID de la URL
const urlParams = new URLSearchParams(window.location.search);
const publicUid = urlParams.get('uid');

if (!publicUid) {
    document.getElementById('public-inventario-grid').innerHTML = '<div class="col-12 text-center text-danger"><h4>Enlace inválido o falta el ID del catálogo.</h4></div>';
} else {
    cargarInventarioPublico(publicUid);
}

async function cargarInventarioPublico(uid) {
    const grid = document.getElementById('public-inventario-grid');
    grid.innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-primary"></div></div>';

    const q = query(collection(db, "inventario"), where("userId", "==", uid));
    const snapshot = await getDocs(q);
    
    publicProductosCache = snapshot.docs.map(doc => doc.data());
    publicProductosCache.sort((a, b) => a.nombre.localeCompare(b.nombre));

    const categoriasUnicas = [...new Set(publicProductosCache.map(p => p.categoria))].filter(Boolean);
    const filtroSelect = document.getElementById('public-filtro-categoria');
    filtroSelect.innerHTML = '<option value="">Todas las categorías</option>';
    categoriasUnicas.forEach(cat => { filtroSelect.innerHTML += `<option value="${cat}">${cat}</option>`; });

    renderizarCatalogoPublico();
}

window.renderizarCatalogoPublico = function() {
    const grid = document.getElementById('public-inventario-grid');
    const contador = document.getElementById('public-contador');
    const buscador = document.getElementById('public-buscador').value.toLowerCase().trim();
    const categoriaFiltro = document.getElementById('public-filtro-categoria').value;

    const productosFiltrados = publicProductosCache.filter(prod => {
        const coincideNombre = prod.nombre.toLowerCase().includes(buscador);
        const coincideCategoria = categoriaFiltro === "" || prod.categoria === categoriaFiltro;
        return coincideNombre && coincideCategoria;
    });

    grid.innerHTML = '';
    contador.textContent = `${productosFiltrados.length} Ítems`;

    if (productosFiltrados.length === 0) {
        grid.innerHTML = '<div class="col-12 text-center text-muted py-5"><h4>No se encontraron productos</h4></div>';
        return;
    }

    productosFiltrados.forEach(prod => {
        // 1. GENERAR LISTA DE VARIANTES CON LA NUEVA LÓGICA
        let variantesHTML = '';
        prod.variantes.forEach(v => {
            let stockHTML = '';
            
            if (prod.tienePositivoNegativo) {
                const posText = v.stockPositivo > 0 ? `Pos: ${v.stockPositivo}` : 'Pos: Agotado';
                const negText = v.stockNegativo > 0 ? `Neg: ${v.stockNegativo}` : 'Neg: Agotado';
                const colorClass = (v.stockPositivo <= 0 && v.stockNegativo <= 0) ? 'text-danger' : 'text-success';
                stockHTML = `<span class="small fw-bold ${colorClass}">${posText} | ${negText}</span>`;
            } else {
                const colorClass = v.stockPositivo <= 0 ? 'text-danger' : 'text-success';
                const texto = v.stockPositivo > 0 ? `Stock: ${v.stockPositivo}` : 'Agotado';
                stockHTML = `<span class="small fw-bold ${colorClass}">${texto}</span>`;
            }

            variantesHTML += `<li class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
                <span class="fw-semibold">${v.medida}</span> 
                <span class="text-muted">$${v.precio.toFixed(2)}</span>
                ${stockHTML}
            </li>`;
        });

        // 2. GENERAR BADGES DE DAÑADAS/AMARILLAS
        let danadasHTML = '';
        if (prod.tieneDanadas && prod.danadas && prod.danadas.length > 0) {
            danadasHTML = `<div class="mt-2 pt-2 border-top">
                <span class="text-muted small d-block mb-1">Ofertas / Detalles:</span>
                <div class="d-flex flex-wrap gap-1">`;
            
            prod.danadas.forEach(d => {
                const colorBadge = d.tipo === 'Amarillas' ? 'bg-warning text-dark' : 'bg-danger';
                danadasHTML += `<span class="badge ${colorBadge}">${d.tipo}: ${d.cantidad}</span>`;
            });
            
            danadasHTML += `</div></div>`;
        }

        const imgSrc = prod.fotoUrl ? prod.fotoUrl : 'https://via.placeholder.com/300x250?text=Sin+Foto';
        const desc = prod.descripcion ? `<p class="text-muted small mb-0 mt-2">${prod.descripcion}</p>` : '';

        grid.innerHTML += `
            <div class="col-md-4 col-sm-6 mb-4">
                <div class="card public-card h-100 shadow-sm border-0">
                    <img src="${imgSrc}" class="card-img-top public-img" onerror="this.src='https://via.placeholder.com/300x250?text=Error'">
                    <div class="card-body pb-2">
                        <span class="badge bg-secondary mb-2">${prod.categoria}</span>
                        <h5 class="card-title fw-bold mb-1">${prod.nombre}</h5>
                        ${desc}
                        ${danadasHTML} <!-- Se insertan las dañadas aquí -->
                    </div>
                    <ul class="list-group list-group-flush mt-auto">${variantesHTML}</ul>
                </div>
            </div>
        `;
    });
};
