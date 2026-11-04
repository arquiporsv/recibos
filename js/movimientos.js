import { db, auth, checkAuth } from './firebase.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let currentUser = null;
let movimientosCache = [];

checkAuth((user) => {
    currentUser = user;
    document.getElementById('user-email-display').textContent = user.email;
    cargarMovimientos();
});

window.logout = function() { 
    signOut(auth).then(() => window.location.href = 'index.html'); 
};

async function cargarMovimientos() {
    const acordeon = document.getElementById('acordeon-movimientos');
    acordeon.innerHTML = '<div class="text-center p-3">Cargando historial...</div>';

    try {
        const q = query(collection(db, "movimientos_inventario"), where("userId", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        
        movimientosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        movimientosCache.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        filtrarMovimientos(); 
    } catch (error) {
        acordeon.innerHTML = `<div class="text-center text-danger p-3">Error al cargar: ${error.message}</div>`;
    }
}

window.filtrarMovimientos = function() {
    const acordeon = document.getElementById('acordeon-movimientos');
    const buscador = document.getElementById('mov-buscador').value.toLowerCase().trim();
    const tipoFiltro = document.getElementById('mov-filtro-tipo').value;
    const fechaFiltro = document.getElementById('mov-filtro-fecha').value;

    const filtrados = movimientosCache.filter(mov => {
        const coincideTexto = mov.productoNombre.toLowerCase().includes(buscador) || 
                              (mov.comentario && mov.comentario.toLowerCase().includes(buscador)) ||
                              (mov.numeroDTE && mov.numeroDTE.toLowerCase().includes(buscador)) ||
                              (mov.codigoGeneracion && mov.codigoGeneracion.toLowerCase().includes(buscador));
        const coincideTipo = tipoFiltro === "" || mov.tipo === tipoFiltro;
        
        let coincideFecha = true;
        if (fechaFiltro) {
            const fechaMov = new Date(mov.fecha).toISOString().split('T')[0];
            coincideFecha = fechaMov >= fechaFiltro;
        }
        return coincideTexto && coincideTipo && coincideFecha;
    });

    if (filtrados.length === 0) {
        acordeon.innerHTML = '<div class="text-center text-muted p-4">No se encontraron movimientos.</div>';
        return;
    }

    const grupos = {};
    filtrados.forEach(mov => {
        // Agrupar por código de generación, si no tiene por loteId, si no (antiguos) por la fecha exacta
        const key = mov.codigoGeneracion || mov.loteId || new Date(mov.fecha).toISOString();
        if (!grupos[key]) {
            grupos[key] = {
                codigo: mov.codigoGeneracion || 'Sin Código',
                dte: mov.numeroDTE || '',
                fecha: mov.fecha,
                items: []
            };
        }
        grupos[key].items.push(mov);
    });

    acordeon.innerHTML = '';
    let index = 0;
    
    for (const key in grupos) {
        const g = grupos[key];
        const fechaObj = new Date(g.fecha);
        const fechaStr = fechaObj.toLocaleDateString() + ' ' + fechaObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const collapseId = `collapse-${index}`;

        let filasHTML = '';
        g.items.forEach(item => {
            const badgeTipo = item.tipo === 'entrada' ? '<span class="badge bg-success">Entrada</span>' : '<span class="badge bg-danger">Salida</span>';
            const cant = Number.isInteger(item.cantidad) ? item.cantidad : item.cantidad.toFixed(2);
            filasHTML += `
                <tr>
                    <td>${item.productoNombre}</td>
                    <td>${item.medida}</td>
                    <td>${badgeTipo}</td>
                    <td class="fw-bold ${item.tipo === 'entrada' ? 'text-success' : 'text-danger'}">${item.tipo === 'entrada' ? '+' : '-'}${cant}</td>
                    <td>${item.comentario || '-'}</td>
                </tr>
            `;
        });

        acordeon.innerHTML += `
            <div class="accordion-item">
                <h2 class="accordion-header" id="heading-${index}">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                        <div class="d-flex w-100 justify-content-between pe-3">
                            <span><b>Lote:</b> ${g.codigo} ${g.dte ? `| <b>DTE:</b> ${g.dte}` : ''}</span>
                            <span class="text-muted small">${fechaStr} | ${g.items.length} ítem(s)</span>
                        </div>
                    </button>
                </h2>
                <div id="${collapseId}" class="accordion-collapse collapse" aria-labelledby="heading-${index}" data-bs-parent="#acordeon-movimientos">
                    <div class="accordion-body p-0">
                        <table class="table table-sm mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Producto</th>
                                    <th>Medida</th>
                                    <th>Tipo</th>
                                    <th>Cantidad</th>
                                    <th>Comentario</th>
                                </tr>
                            </thead>
                            <tbody>${filasHTML}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        index++;
    }
};

window.limpiarFiltrosMov = function() {
    document.getElementById('mov-buscador').value = '';
    document.getElementById('mov-filtro-tipo').value = '';
    document.getElementById('mov-filtro-fecha').value = '';
    filtrarMovimientos();
};
