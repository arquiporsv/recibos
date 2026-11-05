import { db, auth, checkAuth, showAlert } from './firebase.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let currentUser = null;
let productosCache = [];
let movimientosKardex = [];

checkAuth(async (user) => {
    currentUser = user;
    // La línea que actualizaba el email ha sido eliminada porque layout.js lo maneja
    await cargarProductosKardex();
});

// El resto del código de kardex.js es el mismo que te proporcioné antes
async function cargarProductosKardex() {
    try {
        const q = query(collection(db, "inventario"), where("userId", "==", currentUser.uid));
        const snap = await getDocs(q);
        productosCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        productosCache.sort((a, b) => a.nombre.localeCompare(b.nombre));

        const select = document.getElementById('kdx-producto');
        select.innerHTML = '<option value="">-- Seleccione un producto --</option>';
        productosCache.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
        });
    } catch (error) {
        showAlert('Error', 'No se pudieron cargar los productos.', 'danger');
    }
}

window.cargarVariantesKardex = function() {
    const prodId = document.getElementById('kdx-producto').value;
    const selectVar = document.getElementById('kdx-variante');
    selectVar.innerHTML = '';

    if (!prodId) {
        selectVar.innerHTML = '<option value="">-- Seleccione medida --</option>';
        document.getElementById('kdx-tabla-body').innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay datos para mostrar.</td></tr>';
        document.getElementById('kdx-resumen').classList.add('d-none');
        document.getElementById('kdx-titulo').textContent = 'Seleccione un producto para ver el historial';
        return;
    }

    const prod = productosCache.find(p => p.id === prodId);
    selectVar.innerHTML = '<option value="">-- Seleccione medida --</option>';
    prod.variantes.forEach(v => {
        selectVar.innerHTML += `<option value="${v.medida}">${v.medida} (Stock actual: ${v.stock})</option>`;
    });
};

window.generarKardex = async function() {
    const prodId = document.getElementById('kdx-producto').value;
    const medida = document.getElementById('kdx-variante').value;
    const fechaDesde = document.getElementById('kdx-fecha-desde').value;
    const fechaHasta = document.getElementById('kdx-fecha-hasta').value;

    if (!prodId || !medida) {
        return showAlert('Aviso', 'Debes seleccionar un producto y una medida.', 'warning');
    }

    const btn = document.getElementById('btn-generar-kdx');
    btn.disabled = true;
    btn.textContent = '...';

    const tbody = document.getElementById('kdx-tabla-body');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>';

    const prod = productosCache.find(p => p.id === prodId);
    document.getElementById('kdx-titulo').textContent = `Kardex: ${prod.nombre} - ${medida}`;

    try {
        const q = query(
            collection(db, "movimientos_inventario"),
            where("userId", "==", currentUser.uid),
            where("productoId", "==", prodId),
            where("medida", "==", medida),
            orderBy("fecha", "asc")
        );
        
        const snap = await getDocs(q);
        movimientosKardex = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let movimientosFiltrados = movimientosKardex;
        if (fechaDesde) {
            movimientosFiltrados = movimientosFiltrados.filter(m => m.fecha >= `${fechaDesde}T00:00:00.000Z`);
        }
        if (fechaHasta) {
            movimientosFiltrados = movimientosFiltrados.filter(m => m.fecha <= `${fechaHasta}T23:59:59.999Z`);
        }

        renderizarKardex(movimientosFiltrados);

    } catch (error) {
        showAlert('Error', error.message, 'danger');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Error al cargar datos.</td></tr>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍';
    }
};

function renderizarKardex(movimientos) {
    const tbody = document.getElementById('kdx-tabla-body');
    tbody.innerHTML = '';

    if (movimientos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay movimientos en este rango de fechas.</td></tr>';
        document.getElementById('kdx-resumen').classList.add('d-none');
        return;
    }

    let saldoAcumulado = 0;
    let totalEntradas = 0;
    let totalSalidas = 0;

    movimientos.forEach(mov => {
        const cant = parseFloat(mov.cantidad);
        if (mov.tipo === 'entrada') {
            saldoAcumulado += cant;
            totalEntradas += cant;
        } else {
            saldoAcumulado -= cant;
            totalSalidas += cant;
        }

        const fechaObj = new Date(mov.fecha);
        const fechaStr = fechaObj.toLocaleDateString();

        let referencia = mov.loteId ? mov.loteId.substring(0, 10) : 'N/A';
        if (mov.transaccionId) referencia = `TX: ${mov.transaccionId.substring(0, 8)}`;
        
        const cantMostrar = Number.isInteger(cant) ? cant : cant.toFixed(2);
        const saldoMostrar = Number.isInteger(saldoAcumulado) ? saldoAcumulado : saldoAcumulado.toFixed(2);
        const colorSaldo = saldoAcumulado < 0 ? 'text-danger fw-bold' : 'text-dark fw-bold';

        const motivoBadge = mov.tipo === 'entrada' 
            ? '<span class="badge bg-success">Entrada</span>' 
            : '<span class="badge bg-danger">Salida</span>';

        tbody.innerHTML += `
            <tr>
                <td class="text-nowrap">${fechaStr}</td>
                <td><small class="text-muted">${referencia}</small></td>
                <td>${motivoBadge}</td>
                <td class="text-end text-success">${mov.tipo === 'entrada' ? cantMostrar : '-'}</td>
                <td class="text-end text-danger">${mov.tipo === 'salida' ? cantMostrar : '-'}</td>
                <td class="text-end">${mov.precioUnitario ? '$' + mov.precioUnitario.toFixed(2) : '-'}</td>
                <td class="text-end ${colorSaldo}">${saldoMostrar}</td>
            </tr>
        `;
    });

    document.getElementById('kdx-resumen').classList.remove('d-none');
    document.getElementById('kdx-total-ent').textContent = Number.isInteger(totalEntradas) ? totalEntradas : totalEntradas.toFixed(2);
    document.getElementById('kdx-total-sal').textContent = Number.isInteger(totalSalidas) ? totalSalidas : totalSalidas.toFixed(2);
    document.getElementById('kdx-saldo-fin').textContent = Number.isInteger(saldoAcumulado) ? saldoAcumulado : saldoAcumulado.toFixed(2);
}
