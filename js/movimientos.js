import { db, auth, checkAuth, showAlert } from './firebase.js';
import { collection, getDocs, query, where, addDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let currentUser = null;
let transaccionesCache = [];
let productosCache = [];

let txItemsTemp = [];
let txPagosTemp = [];

checkAuth(async (user) => {
    currentUser = user;
    document.getElementById('user-email-display').textContent = user.email;
    await cargarProductos();
    await cargarTransacciones();
});

window.logout = function() { 
    signOut(auth).then(() => window.location.href = 'index.html'); 
};

// ==========================================
// CARGAR DATOS INICIALES
// ==========================================
async function cargarProductos() {
    const q = query(collection(db, "inventario"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    productosCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const datalist = document.getElementById('datalist-productos');
    datalist.innerHTML = productosCache.map(p => `<option value="${p.nombre}">`).join('');
}

async function cargarTransacciones() {
    const acordeon = document.getElementById('acordeon-movimientos');
    acordeon.innerHTML = '<div class="text-center p-3">Cargando historial...</div>';

    try {
        // 1. Cargar las transacciones NUEVAS
        const qTx = query(collection(db, "transacciones"), where("userId", "==", currentUser.uid));
        const snapTx = await getDocs(qTx);
        let nuevasTx = snapTx.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Cargar los movimientos ANTIGUOS (para no perder el historial)
        const qMov = query(collection(db, "movimientos_inventario"), where("userId", "==", currentUser.uid));
        const snapMov = await getDocs(qMov);
        let movimientosAntiguos = snapMov.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 3. Adaptar los movimientos antiguos al formato de "transacción" para que se vean bien
        // Los agrupamos por su loteId o, si no tienen, por la fecha exacta en que se crearon.
        const gruposAntiguos = {};
        movimientosAntiguos.forEach(mov => {
            // Si el movimiento ya pertenece a una transacción nueva, lo ignoramos para no duplicar
            if (mov.transaccionId) return; 

            const key = mov.loteId || new Date(mov.fecha).toISOString();
            if (!gruposAntiguos[key]) {
                gruposAntiguos[key] = {
                    id: key,
                    fecha: mov.fecha,
                    tipo: mov.tipo,
                    motivo: mov.tipo === 'salida' ? 'Venta (Histórico)' : 'Entrada (Histórico)',
                    codigoGeneracion: mov.codigoGeneracion || '',
                    numeroDTE: mov.numeroDTE || '',
                    comentario: mov.comentario || '',
                    estadoEntrega: 'Histórico',
                    montoEnvio: 0,
                    total: 0,
                    pagos: [],
                    items: []
                };
            }
            
            gruposAntiguos[key].items.push({
                nombre: mov.productoNombre,
                medida: mov.medida,
                cantidad: mov.cantidad,
                precio: 0, // Los movimientos antiguos no guardaban el precio, se asume 0
                subtotal: 0
            });
        });

        const txAntiguasAdaptadas = Object.values(gruposAntiguos);

        // 4. Unir ambas listas y ordenar por fecha
        transaccionesCache = [...nuevasTx, ...txAntiguasAdaptadas];
        transaccionesCache.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        filtrarMovimientos(); 
    } catch (error) {
        acordeon.innerHTML = `<div class="text-center text-danger p-3">Error: ${error.message}</div>`;
    }
}

// ==========================================
// FILTROS Y ACORDEÓN
// ==========================================
window.filtrarMovimientos = function() {
    const acordeon = document.getElementById('acordeon-movimientos');
    const buscador = document.getElementById('mov-buscador').value.toLowerCase().trim();
    const motivoFiltro = document.getElementById('mov-filtro-motivo').value;
    const fechaFiltro = document.getElementById('mov-filtro-fecha').value;

    const filtrados = transaccionesCache.filter(tx => {
        // Validaciones seguras por si los datos antiguos no tienen items
        const prodsStr = tx.items ? tx.items.map(i => i.nombre.toLowerCase()).join(' ') : '';
        
        const coincideTexto = prodsStr.includes(buscador) || 
                              (tx.comentario && tx.comentario.toLowerCase().includes(buscador)) ||
                              (tx.codigoGeneracion && tx.codigoGeneracion.toLowerCase().includes(buscador)) ||
                              (tx.numeroDTE && tx.numeroDTE.toLowerCase().includes(buscador));
        
        // Filtramos que coincida el motivo (si el filtro es "Venta", también mostrará "Venta (Histórico)")
        const coincideMotivo = motivoFiltro === "" || (tx.motivo && tx.motivo.includes(motivoFiltro));
        
        let coincideFecha = true;
        if (fechaFiltro) {
            const fechaTx = new Date(tx.fecha).toISOString().split('T')[0];
            coincideFecha = fechaTx >= fechaFiltro;
        }
        return coincideTexto && coincideMotivo && coincideFecha;
    });

    if (filtrados.length === 0) {
        acordeon.innerHTML = '<div class="text-center text-muted p-4">No se encontraron transacciones.</div>';
        return;
    }

    acordeon.innerHTML = '';
    filtrados.forEach((tx, index) => {
        const fechaObj = new Date(tx.fecha);
        const fechaStr = fechaObj.toLocaleDateString() + ' ' + fechaObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const collapseId = `collapse-tx-${index}`;

        // Generar filas de productos
        let filasHTML = '';
        let sumaTotal = 0;
        if (tx.items) {
            tx.items.forEach(item => {
                const cant = Number.isInteger(item.cantidad) ? item.cantidad : item.cantidad.toFixed(2);
                const subtotal = item.subtotal || (item.precio * item.cantidad) || 0;
                sumaTotal += subtotal;
                
                filasHTML += `
                    <tr>
                        <td>${item.nombre}</td>
                        <td>${item.medida}</td>
                        <td>${cant}</td>
                        <td>${item.precio ? '$' + item.precio.toFixed(2) : '-'}</td>
                        <td>${subtotal ? '$' + subtotal.toFixed(2) : '-'}</td>
                    </tr>
                `;
            });
        }

        // Si la transacción no tiene total guardado (es histórica), calculamos la suma
        const totalMostrar = tx.total || sumaTotal;

        // Generar filas de pagos
        let pagosHTML = '';
        if (tx.pagos && tx.pagos.length > 0) {
            tx.pagos.forEach(p => {
                pagosHTML += `<span class="badge bg-info text-dark me-1">${p.metodo}: $${p.monto.toFixed(2)} ${p.fechaAbono ? '('+p.fechaAbono+')' : ''}</span>`;
            });
        } else {
            pagosHTML = '<span class="text-muted small">No registrados</span>';
        }

        acordeon.innerHTML += `
            <div class="accordion-item">
                <h2 class="accordion-header" id="heading-${index}">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                        <div class="d-flex w-100 justify-content-between pe-3">
                            <span>
                                <span class="badge ${tx.tipo === 'entrada' ? 'bg-success' : 'bg-danger'} me-2">${tx.motivo}</span>
                                ${tx.codigoGeneracion ? `<b>DTE:</b> ${tx.codigoGeneracion}` : 'Sin DTE'} 
                                ${tx.estadoEntrega ? `| <b>Estado:</b> ${tx.estadoEntrega}` : ''}
                            </span>
                            <span class="text-muted small">${fechaStr} | <b>Total: $${totalMostrar.toFixed(2)}</b></span>
                        </div>
                    </button>
                </h2>
                <div id="${collapseId}" class="accordion-collapse collapse">
                    <div class="accordion-body p-0">
                        <div class="p-2 bg-light border-bottom">
                            <small><b>Pagos:</b> ${pagosHTML} | <b>Envío:</b> $${(tx.montoEnvio || 0).toFixed(2)}</small>
                            ${tx.comentario ? `<br><small><b>Comentario:</b> ${tx.comentario}</small>` : ''}
                        </div>
                        <table class="table table-sm mb-0">
                            <thead class="table-light">
                                <tr><th>Producto</th><th>Medida</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr>
                            </thead>
                            <tbody>${filasHTML}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    });
};

window.limpiarFiltrosMov = function() {
    document.getElementById('mov-buscador').value = '';
    document.getElementById('mov-filtro-motivo').value = '';
    document.getElementById('mov-filtro-fecha').value = '';
    filtrarMovimientos();
};

// ==========================================
// CREAR NUEVA TRANSACCIÓN (MODAL)
// ==========================================
window.abrirModalTransaccion = function() {
    txItemsTemp = [];
    txPagosTemp = [];
    document.getElementById('tx-prod-search').value = '';
    document.getElementById('tx-variante').innerHTML = '';
    document.getElementById('tx-codigo-gen').value = '';
    document.getElementById('tx-num-dte').value = '';
    document.getElementById('tx-comentario').value = '';
    document.getElementById('tx-check-envio').checked = false;
    document.getElementById('div-envio').style.display = 'none';
    document.getElementById('tx-monto-envio').value = '0';
    document.getElementById('tx-estado-entrega').value = 'Pendiente de retiro';
    document.getElementById('div-fecha-entrega').style.display = 'none';
    
    actualizarMotivos();
    renderizarItemsTx();
    renderizarPagosTx();
    calcularTotalesTransaccion();
    
    new bootstrap.Modal(document.getElementById('modal-transaccion')).show();
};

window.cancelarTransaccion = function() {
    bootstrap.Modal.getInstance(document.getElementById('modal-transaccion')).hide();
};

window.actualizarMotivos = function() {
    const tipo = document.getElementById('tx-tipo').value;
    const selectMotivo = document.getElementById('tx-motivo');
    selectMotivo.innerHTML = '';
    
    if (tipo === 'salida') {
        selectMotivo.innerHTML = `
            <option value="Venta">Venta</option>
            <option value="Dañadas">Dañadas</option>
            <option value="Muestras">Muestras</option>
        `;
    } else {
        selectMotivo.innerHTML = `
            <option value="Pedido especial">Pedido especial</option>
            <option value="Exportación">Exportación</option>
            <option value="Devolución">Devolución</option>
        `;
    }
};

window.seleccionarProductoPorNombre = function() {
    const nombre = document.getElementById('tx-prod-search').value;
    const prod = productosCache.find(p => p.nombre === nombre);
    const selectVar = document.getElementById('tx-variante');
    selectVar.innerHTML = '';

    if (!prod) {
        selectVar.innerHTML = '<option value="">-- No encontrado --</option>';
        return;
    }

    prod.variantes.forEach((v, index) => {
        const stockMostrar = Number.isInteger(v.stock) ? v.stock : v.stock.toFixed(2);
        selectVar.innerHTML += `<option value="${index}">${v.medida} (Stock: ${stockMostrar})</option>`;
    });
};

window.agregarItemTransaccion = function() {
    const nombre = document.getElementById('tx-prod-search').value;
    const varIndex = document.getElementById('tx-variante').value;
    const cantidad = parseFloat(document.getElementById('tx-cantidad').value);
    const precio = parseFloat(document.getElementById('tx-precio').value);

    if (!nombre || varIndex === "" || isNaN(cantidad) || cantidad <= 0 || isNaN(precio) || precio < 0) {
        return showAlert('Aviso', 'Complete producto, variante, cantidad y precio válido.', 'warning');
    }

    const prod = productosCache.find(p => p.nombre === nombre);
    const variante = prod.variantes[varIndex];

    if (document.getElementById('tx-tipo').value === 'salida' && cantidad > variante.stock) {
        return showAlert('Aviso', `Stock insuficiente de ${prod.nombre}. Disponible: ${variante.stock}`, 'warning');
    }

    txItemsTemp.push({
        prodId: prod.id,
        varIndex,
        nombre: prod.nombre,
        medida: variante.medida,
        cantidad,
        precio
    });

    renderizarItemsTx();
    
    document.getElementById('tx-prod-search').value = '';
    document.getElementById('tx-variante').innerHTML = '';
    document.getElementById('tx-cantidad').value = '1';
    document.getElementById('tx-precio').value = '';
};

function renderizarItemsTx() {
    const tbody = document.querySelector('#tabla-tx-items tbody');
    tbody.innerHTML = '';
    
    txItemsTemp.forEach((item, index) => {
        const subtotal = item.cantidad * item.precio;
        const cant = Number.isInteger(item.cantidad) ? item.cantidad : item.cantidad.toFixed(2);
        tbody.innerHTML += `
            <tr>
                <td>${item.nombre}</td>
                <td>${item.medida}</td>
                <td>${cant}</td>
                <td>$${item.precio.toFixed(2)}</td>
                <td>$${subtotal.toFixed(2)}</td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="eliminarItemTx(${index})">X</button></td>
            </tr>
        `;
    });
    calcularTotalesTransaccion();
}

window.eliminarItemTx = function(index) {
    txItemsTemp.splice(index, 1);
    renderizarItemsTx();
};

window.toggleEnvio = function() {
    const checked = document.getElementById('tx-check-envio').checked;
    document.getElementById('div-envio').style.display = checked ? 'block' : 'none';
    if (!checked) document.getElementById('tx-monto-envio').value = '0';
    calcularTotalesTransaccion();
};

window.calcularTotalesTransaccion = function() {
    const subtotal = txItemsTemp.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);
    const envio = parseFloat(document.getElementById('tx-monto-envio').value) || 0;
    const total = subtotal + envio;

    document.getElementById('lbl-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('lbl-envio').textContent = `$${envio.toFixed(2)}`;
    document.getElementById('lbl-total').textContent = `$${total.toFixed(2)}`;
    
    const totalPagado = txPagosTemp.reduce((sum, p) => sum + p.monto, 0);
    document.getElementById('lbl-total-pagos').textContent = `$${totalPagado.toFixed(2)}`;
    document.getElementById('lbl-total-pagos').className = (Math.abs(totalPagado - total) < 0.01 && total > 0) ? 'text-success fw-bold' : 'text-danger fw-bold';
};

window.toggleFechaAbono = function() {
    const metodo = document.getElementById('pago-metodo').value;
    document.getElementById('div-fecha-abono').style.display = (metodo === 'Efectivo' || metodo === 'Cheque') ? 'block' : 'none';
};

window.agregarPago = function() {
    const metodo = document.getElementById('pago-metodo').value;
    const monto = parseFloat(document.getElementById('pago-monto').value);
    const fechaAbono = document.getElementById('pago-fecha-abono').value;

    if (isNaN(monto) || monto <= 0) return showAlert('Aviso', 'Monto de pago inválido.', 'warning');
    if ((metodo === 'Efectivo' || metodo === 'Cheque') && !fechaAbono) {
        return showAlert('Aviso', 'Debe ingresar la fecha de abono para Efectivo/Cheque.', 'warning');
    }

    txPagosTemp.push({ metodo, monto, fechaAbono });
    renderizarPagosTx();
    
    document.getElementById('pago-monto').value = '';
    document.getElementById('pago-fecha-abono').value = '';
};

function renderizarPagosTx() {
    const tbody = document.querySelector('#tabla-pagos tbody');
    tbody.innerHTML = '';
    
    txPagosTemp.forEach((p, index) => {
        tbody.innerHTML += `
            <tr>
                <td>${p.metodo}</td>
                <td>$${p.monto.toFixed(2)}</td>
                <td>${p.fechaAbono || '-'}</td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="eliminarPago(${index})">X</button></td>
            </tr>
        `;
    });
    calcularTotalesTransaccion();
}

window.eliminarPago = function(index) {
    txPagosTemp.splice(index, 1);
    renderizarPagosTx();
};

window.toggleFechaPiloto = function() {
    const estado = document.getElementById('tx-estado-entrega').value;
    document.getElementById('div-fecha-entrega').style.display = (estado === 'Entregado por Piloto') ? 'block' : 'none';
};

window.guardarTransaccion = async function() {
    if (txItemsTemp.length === 0) return showAlert('Aviso', 'No has agregado productos.', 'warning');

    const subtotal = txItemsTemp.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);
    const envio = parseFloat(document.getElementById('tx-monto-envio').value) || 0;
    const total = subtotal + envio;
    const totalPagado = txPagosTemp.reduce((sum, p) => sum + p.monto, 0);

    if (Math.abs(totalPagado - total) > 0.01) {
        return showAlert('Aviso', `El total de pagos ($${totalPagado.toFixed(2)}) no coincide con el total de la transacción ($${total.toFixed(2)}).`, 'warning');
    }

    const codGen = document.getElementById('tx-codigo-gen').value.trim();
    const numDte = document.getElementById('tx-num-dte').value.trim();
    const tipo = document.getElementById('tx-tipo').value;
    const motivo = document.getElementById('tx-motivo').value;
    const estadoEntrega = document.getElementById('tx-estado-entrega').value;
    const fechaEntrega = document.getElementById('tx-fecha-entrega').value;
    const comentario = document.getElementById('tx-comentario').value.trim();
    const loteId = 'TX-' + Date.now();

    const btnGuardar = document.getElementById('btn-guardar-tx');
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Procesando...';

    try {
        const txRef = await addDoc(collection(db, "transacciones"), {
            userId: currentUser.uid, tipo, motivo,
            codigoGeneracion: codGen, numeroDTE: numDte,
            subtotal, montoEnvio: envio, total, pagos: txPagosTemp,
            estadoEntrega, fechaEntrega: estadoEntrega === 'Entregado por Piloto' ? fechaEntrega : '',
            comentario, items: txItemsTemp, loteId,
            fecha: new Date().toISOString()
        });

        for (const item of txItemsTemp) {
            const prod = productosCache.find(p => p.id === item.prodId);
            if (prod) {
                prod.variantes[item.varIndex].stock += (tipo === 'entrada' ? item.cantidad : -item.cantidad);
                await updateDoc(doc(db, "inventario", item.prodId), { variantes: prod.variantes });
            }

            await addDoc(collection(db, "movimientos_inventario"), {
                userId: currentUser.uid, transaccionId: txRef.id,
                productoId: item.prodId, productoNombre: item.nombre,
                medida: item.medida, tipo, cantidad: item.cantidad,
                precioUnitario: item.precio, subtotal: item.cantidad * item.precio,
                loteId, fecha: new Date().toISOString()
            });
        }

        showAlert('Éxito', 'Transacción registrada correctamente.', 'success');
        cancelarTransaccion();
        await cargarProductos(); 
        await cargarTransacciones(); 
    } catch (error) {
        showAlert('Error', error.message, 'danger');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = 'Guardar Transacción';
    }
};
