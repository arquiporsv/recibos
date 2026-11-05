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
        // Ordenar cronológicamente
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
// CÁLCULO DEL STOCK INICIAL (LA CLAVE)
// ==========================================
function calcularStockInicial(prodFiltro, medFiltro) {
    // Si no hay un producto seleccionado, el saldo inicial es 0 (es un kardex global)
    if (!prodFiltro) return 0;

    let currentStock = 0;
    
    // Obtenemos el stock actual del producto/medida
    if (prodFiltro && medFiltro) {
        const p = productosCache.find(x => x.id === prodFiltro);
        if (p) {
            const v = p.variantes.find(x => x.medida === medFiltro);
            if (v) currentStock = v.stock;
        }
    } else if (prodFiltro) {
        // Si es todo el producto, sumamos el stock de todas sus variantes
        const p = productosCache.find(x => x.id === prodFiltro);
        if (p) {
            currentStock = p.variantes.reduce((sum, v) => sum + v.stock, 0);
        }
    }

    // Calculamos el total histórico de entradas y salidas de ese producto/medida específico
    const movsHistoricos = todosLosMovimientos.filter(m => {
        const mProd = prodFiltro === "" || m.productoId === prodFiltro;
        const mMed = medFiltro === "" || m.medida === medFiltro;
        return mProd && mMed;
    });

    const totalIn = movsHistoricos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + parseFloat(m.cantidad), 0);
    const totalOut = movsHistoricos.filter(m => m.tipo === 'salida').reduce((s, m) => s + parseFloat(m.cantidad), 0);

    // Fórmula: Stock Inicial = Stock Actual - Entradas + Salidas
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

    // 1. Filtrar movimientos por los parámetros de la vista
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

    // 2. Calcular el saldo inicial real basado en la selección
    const stockInicial = calcularStockInicial(prodFiltro, medFiltro);

    // 3. Renderizar pasando el stock inicial
    renderizarKardex(movimientosFiltrados, stockInicial);
};

function renderizarKardex(movimientos, stockInicial) {
    const tbody = document.getElementById('kdx-tabla-body');
    tbody.innerHTML = '';

    const resumen = document.getElementById('kdx-resumen');
    const titulo = document.getElementById('kdx-titulo');

    if (movimientos.length === 0 && stockInicial === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay movimientos que coincidan con los filtros.</td></tr>';
        resumen.classList.add('d-none');
        titulo.textContent = 'Historial de Movimientos';
        return;
    }

    // EL SALDO ACUMULADO INICIA CON EL STOCK INICIAL CALCULADO
    let saldoAcumulado = stockInicial; 
    let totalEntradas = 0;
    let totalSalidas = 0;

    // Opcional: Mostrar una fila virtual del "Stock Inicial" si el saldo es mayor a 0
    if (stockInicial !== 0 && movimientos.length > 0) {
        tbody.innerHTML += `
            <tr class="table-light">
                <td colspan="7" class="text-end fw-bold text-muted">Saldo Inicial (Stock de apertura):</td>
                <td class="text-end fw-bold">${Number.isInteger(stockInicial) ? stockInicial : stockInicial.toFixed(2)}</td>
            </tr>
        `;
    }

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

    resumen.classList.remove('d-none');
    // Nota: Las entradas y salidas en el resumen solo suman los MOVIMIENTOS, no el stock inicial.
    document.getElementById('kdx-total-ent').textContent = Number.isInteger(totalEntradas) ? totalEntradas : totalEntradas.toFixed(2);
    document.getElementById('kdx-total-sal').textContent = Number.isInteger(totalSalidas) ? totalSalidas : totalSalidas.toFixed(2);
    
    // El saldo final sí incluye todo
    document.getElementById('kdx-saldo-fin').textContent = Number.isInteger(saldoAcumulado) ? saldoAcumulado : saldoAcumulado.toFixed(2);
    
    if (movimientos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay movimientos registrados, pero el saldo inicial es: ' + stockInicial + '</td></tr>';
    }
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
