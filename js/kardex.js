import { db, auth, checkAuth, showAlert } from './firebase.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let productosCache = [];
let todosLosMovimientos = []; 

checkAuth(async (user) => {
    currentUser = user;
    await cargarDatosIniciales();
});

// ==========================================
// CARGA DE DATOS
// ==========================================
async function cargarDatosIniciales() {
    try {
        // 1. Cargar productos
        const qProd = query(collection(db, "inventario"), where("userId", "==", currentUser.uid));
        const snapProd = await getDocs(qProd);
        productosCache = snapProd.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        productosCache.sort((a, b) => a.nombre.localeCompare(b.nombre));

        const selectProd = document.getElementById('kdx-producto');
        selectProd.innerHTML = '<option value="">Todos los productos</option>';
        productosCache.forEach(p => {
            selectProd.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
        });

        // 2. Cargar TODOS los movimientos
        const qMov = query(collection(db, "movimientos_inventario"), where("userId", "==", currentUser.uid));
        const snapMov = await getDocs(qMov);
        
        todosLosMovimientos = snapMov.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Ordenar cronológicamente de más antiguo a más reciente
        todosLosMovimientos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        aplicarFiltrosKardex();

    } catch (error) {
        showAlert('Error', 'No se pudieron cargar los datos: ' + error.message, 'danger');
        document.getElementById('kdx-tabla-body').innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Error al cargar.</td></tr>`;
    }
}

window.cargarVariantesKardex = function() {
    const prodId = document.getElementById('kdx-producto').value;
    const selectVar = document.getElementById('kdx-variante');
    
    if (!prodId) {
        selectVar.innerHTML = '<option value="">Todas las medidas</option>';
        return;
    }

    const prod = productosCache.find(p => p.id === prodId);
    selectVar.innerHTML = '<option value="">Todas las medidas</option>';
    if (prod) {
        prod.variantes.forEach(v => {
            selectVar.innerHTML += `<option value="${v.medida}">${v.medida}</option>`;
        });
    }
};

// ==========================================
// CÁLCULO DEL STOCK DE APERTURA
// ==========================================
// Solo se calcula si hay un producto Y una medida seleccionada.
// Si no, devuelve 0 para que el saldo fluya desde los movimientos.
function calcularStockInicial(prodFiltro, medFiltro) {
    if (!prodFiltro || !medFiltro) return 0;

    const p = productosCache.find(x => x.id === prodFiltro);
    if (!p) return 0;
    
    const v = p.variantes.find(x => x.medida === medFiltro);
    if (!v) return 0;
    
    const currentStock = v.stock;

    // Calculamos el total histórico de entradas y salidas de esta medida específica
    const movsHistoricos = todosLosMovimientos.filter(m => m.productoId === prodFiltro && m.medida === medFiltro);
    const totalIn = movsHistoricos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + parseFloat(m.cantidad), 0);
    const totalOut = movsHistoricos.filter(m => m.tipo === 'salida').reduce((s, m) => s + parseFloat(m.cantidad), 0);

    // Stock Inicial = Stock Actual - Entradas + Salidas
    return currentStock - totalIn + totalOut;
}

// ==========================================
// FILTRADO Y RENDERIZADO
// ==========================================
window.aplicarFiltrosKardex = function() {
    const buscador = document.getElementById('kdx-buscador').value.toLowerCase().trim();
    const tipoFiltro = document.getElementById('kdx-filtro-tipo').value;
    const prodFiltro = document.getElementById('kdx-producto').value;
    const medFiltro = document.getElementById('kdx-variante').value;
    const fDesde = document.getElementById('kdx-fecha-desde').value;
    const fHasta = document.getElementById('kdx-fecha-hasta').value;

    // 1. Filtrar movimientos
    const movimientosFiltrados = todosLosMovimientos.filter(mov => {
        const coincideTexto = mov.productoNombre.toLowerCase().includes(buscador) || 
                              mov.medida.toLowerCase().includes(buscador) ||
                              (mov.loteId && mov.loteId.toLowerCase().includes(buscador));
        
        const coincideTipo = tipoFiltro === "" || mov.tipo === tipoFiltro;
        const coincideProd = prodFiltro === "" || mov.productoId === prodFiltro;
        const coincideMed = medFiltro === "" || mov.medida === medFiltro;
        
        let coincideFecha = true;
        if (fDesde) coincideFecha = coincideFecha && (mov.fecha >= `${fDesde}T00:00:00.000Z`);
        if (fHasta) coincideFecha = coincideFecha && (mov.fecha <= `${fHasta}T23:59:59.999Z`);

        return coincideTexto && coincideTipo && coincideProd && coincideMed && coincideFecha;
    });

    // 2. Calcular stock inicial (solo si hay producto y medida)
    const stockInicial = calcularStockInicial(prodFiltro, medFiltro);

    // 3. Renderizar
    renderizarKardex(movimientosFiltrados, stockInicial, prodFiltro, medFiltro);
};

function renderizarKardex(movimientos, stockInicial, prodFiltro, medFiltro) {
    const tbody = document.getElementById('kdx-tabla-body');
    tbody.innerHTML = '';

    const resumen = document.getElementById('kdx-resumen');
    const titulo = document.getElementById('kdx-titulo');

    // Validar si hay datos para mostrar
    if (movimientos.length === 0 && stockInicial === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay movimientos que coincidan con los filtros.</td></tr>';
        resumen.classList.add('d-none');
        titulo.textContent = 'Historial de Movimientos';
        return;
    }

    // El saldo acumulado SIEMPRE inicia con el stock inicial (0 si no hay filtro específico)
    let saldoAcumulado = stockInicial; 
    let totalEntradas = 0;
    let totalSalidas = 0;

    // Si hay un producto y medida específicos, mostrar la fila de Stock de Apertura
    if (prodFiltro && medFiltro) {
        tbody.innerHTML += `
            <tr class="table-light">
                <td class="text-nowrap">-</td>
                <td colspan="3" class="text-end fw-bold text-muted">Stock de Apertura (Saldo Inicial):</td>
                <td class="text-end">-</td>
                <td class="text-end">-</td>
                <td class="text-end">-</td>
                <td class="text-end fw-bold text-primary">${Number.isInteger(stockInicial) ? stockInicial : stockInicial.toFixed(2)}</td>
            </tr>
        `;
    }

    movimientos.forEach(mov => {
        const cant = parseFloat(mov.cantidad);
        
        // LÓGICA CLAVE: Sumar entrada, restar salida
        if (mov.tipo === 'entrada') {
            saldoAcumulado += cant;
            totalEntradas += cant;
        } else {
            saldoAcumulado -= cant;
            totalSalidas += cant;
        }

        const fechaObj = new Date(mov.fecha);
        const fechaStr = fechaObj.toLocaleDateString();
        
        const cantMostrar = Number.isInteger(cant) ? cant : cant.toFixed(2);
        const saldoMostrar = Number.isInteger(saldoAcumulado) ? saldoAcumulado : saldoAcumulado.toFixed(2);
        const colorSaldo = saldoAcumulado < 0 ? 'text-danger fw-bold' : 'text-dark fw-bold';

        const motivoBadge = mov.tipo === 'entrada' 
            ? '<span class="badge bg-success">Entrada</span>' 
            : '<span class="badge bg-danger">Salida</span>';

        tbody.innerHTML += `
            <tr>
                <td class="text-nowrap">${fechaStr}</td>
                <td>${mov.productoNombre}</td>
                <td>${mov.medida}</td>
                <td>${motivoBadge}</td>
                <td class="text-end text-success">${mov.tipo === 'entrada' ? cantMostrar : '-'}</td>
                <td class="text-end text-danger">${mov.tipo === 'salida' ? cantMostrar : '-'}</td>
                <td class="text-end">${mov.precioUnitario ? '$' + mov.precioUnitario.toFixed(2) : '-'}</td>
                <td class="text-end ${colorSaldo}">${saldoMostrar}</td>
            </tr>
        `;
    });

    // Mostrar panel de resumen
    resumen.classList.remove('d-none');
    document.getElementById('kdx-total-ent').textContent = Number.isInteger(totalEntradas) ? totalEntradas : totalEntradas.toFixed(2);
    document.getElementById('kdx-total-sal').textContent = Number.isInteger(totalSalidas) ? totalSalidas : totalSalidas.toFixed(2);
    document.getElementById('kdx-saldo-fin').textContent = Number.isInteger(saldoAcumulado) ? saldoAcumulado : saldoAcumulado.toFixed(2);
}

window.limpiarFiltrosKardex = function() {
    document.getElementById('kdx-buscador').value = '';
    document.getElementById('kdx-filtro-tipo').value = '';
    document.getElementById('kdx-producto').value = '';
    document.getElementById('kdx-variante').innerHTML = '<option value="">Todas las medidas</option>';
    document.getElementById('kdx-fecha-desde').value = '';
    document.getElementById('kdx-fecha-hasta').value = '';
    aplicarFiltrosKardex();
};
