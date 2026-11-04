import { db, auth, checkAuth } from './firebase.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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
    const tbody = document.getElementById('tabla-movimientos');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando historial...</td></tr>';

    try {
        // Buscar todos los movimientos del usuario, ordenados por fecha descendente
        const q = query(
            collection(db, "movimientos_inventario"), 
            where("userId", "==", currentUser.uid)
        );
        const snapshot = await getDocs(q);
        
        movimientosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Ordenar manualmente por fecha (más reciente primero)
        movimientosCache.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        filtrarMovimientos(); // Dibujar la tabla
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error al cargar: ${error.message}</td></tr>`;
    }
}

window.filtrarMovimientos = function() {
    const tbody = document.getElementById('tabla-movimientos');
    const buscador = document.getElementById('mov-buscador').value.toLowerCase().trim();
    const tipoFiltro = document.getElementById('mov-filtro-tipo').value;
    const fechaFiltro = document.getElementById('mov-filtro-fecha').value;

    const filtrados = movimientosCache.filter(mov => {
        // Filtro de texto (busca en nombre de producto o comentario)
        const coincideTexto = mov.productoNombre.toLowerCase().includes(buscador) || 
                              (mov.comentario && mov.comentario.toLowerCase().includes(buscador));
        
        // Filtro de tipo (entrada/salida)
        const coincideTipo = tipoFiltro === "" || mov.tipo === tipoFiltro;

        // Filtro de fecha (si se selecciona una fecha, busca movimientos desde ese día en adelante)
        let coincideFecha = true;
        if (fechaFiltro) {
            const fechaMov = new Date(mov.fecha).toISOString().split('T')[0];
            coincideFecha = fechaMov >= fechaFiltro;
        }

        return coincideTexto && coincideTipo && coincideFecha;
    });

    tbody.innerHTML = '';

    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No se encontraron movimientos.</td></tr>';
        return;
    }

    filtrados.forEach(mov => {
        const fechaObj = new Date(mov.fecha);
        const fechaStr = fechaObj.toLocaleDateString() + ' ' + fechaObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const badgeTipo = mov.tipo === 'entrada' 
            ? '<span class="badge bg-success">Entrada</span>' 
            : '<span class="badge bg-danger">Salida</span>';
            
        const cantMostrar = Number.isInteger(mov.cantidad) ? mov.cantidad : mov.cantidad.toFixed(2);

        tbody.innerHTML += `
            <tr>
                <td><span class="text-muted small">${fechaStr}</span></td>
                <td class="fw-bold">${mov.productoNombre}</td>
                <td>${mov.medida}</td>
                <td>${badgeTipo}</td>
                <td class="fw-bold ${mov.tipo === 'entrada' ? 'text-success' : 'text-danger'}">
                    ${mov.tipo === 'entrada' ? '+' : '-'}${cantMostrar}
                </td>
                <td><span class="text-muted small">${mov.comentario || '-'}</span></td>
            </tr>
        `;
    });
};

window.limpiarFiltrosMov = function() {
    document.getElementById('mov-buscador').value = '';
    document.getElementById('mov-filtro-tipo').value = '';
    document.getElementById('mov-filtro-fecha').value = '';
    filtrarMovimientos();
};
