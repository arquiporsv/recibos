import { db, auth, checkAuth, showAlert, showConfirm } from './firebase.js';
import { collection, getDocs, query, where, addDoc, doc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let currentUser = null;
let transaccionesCache = [];
let productosCache = [];

let txItemsTemp = [];
let txPagosTemp = [];
let transaccionEditandoId = null; 

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
// CARGA DE DATOS
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
        // 1. Cargar Transacciones Nuevas
        const qTx = query(collection(db, "transacciones"), where("userId", "==", currentUser.uid));
        const snapTx = await getDocs(qTx);
        let nuevasTx = snapTx.docs.map(doc => ({ id: doc.id, isNew: true, ...doc.data() }));

        // 2. Cargar Movimientos Históricos
        const qMov = query(collection(db, "movimientos_inventario"), where("userId", "==", currentUser.uid));
        const snapMov = await getDocs(qMov);
        let movimientosAntiguos = snapMov.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 3. Agrupar históricos (evitando los que ya son parte de una transacción nueva)
        const gruposAntiguos = {};
        movimientosAntiguos.forEach(mov => {
            if (mov.transaccionId) return; 

            const key = mov.loteId || new Date(mov.fecha).toISOString();
            if (!gruposAntiguos[key]) {
                gruposAntiguos[key] = {
                    id: key, 
                    isNew: false, 
                    fecha: mov.fecha, 
                    tipo: mov.tipo,
                    motivo: mov.tipo === 'salida' ? 'Venta (Histórico)' : 'Entrada (Histórico)',
                    codigoGeneracion: mov.codigoGeneracion || '', 
                    numeroDTE: mov.numeroDTE || '',
                    comentario: mov.comentario || '', 
                    estadoEntrega: 'Histórico',
                    montoEnvio: 0, total: 0, pagos: [], items: [],
                    docIds: [] // Guardamos los IDs de los documentos para poder borrarlos si se edita
                };
            }

            // Buscar el índice de la variante en el producto actual para que se pueda editar
            const prod = productosCache.find(p => p.id === mov.productoId);
            let varIndex = -1;
            if (prod) {
                varIndex = prod.variantes.findIndex(v => v.medida === mov.medida);
            }

            gruposAntiguos[key].items.push({
                docId: mov.id, 
                prodId: mov.productoId, 
                varIndex: varIndex,
                nombre: mov.productoNombre, 
                medida: mov.medida, 
                cantidad: mov.cantidad, 
                precio: mov.precioUnitario || 0, 
                subtotal: mov.subtotal || 0
            });
            
            gruposAntiguos[key].docIds.push(mov.id);
        });

        transaccionesCache = [...nuevasTx, ...Object.values(gruposAntiguos)];
        transaccionesCache.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        filtrarMovimientos(); 
    } catch (error) {
        acordeon.innerHTML = `<div class="text-center text-danger p-3">Error: ${error.message}</div>`;
    }
}

// ==========================================
// RENDERIZADO Y FILTROS
// ==========================================
window.filtrarMovimientos = function() {
    const acordeon = document.getElementById('acordeon-movimientos');
    const buscador = document.getElementById('mov-buscador').value.toLowerCase().trim();
    const motivoFiltro = document.getElementById('mov-filtro-motivo').value;
    const fechaFiltro = document.getElementById('mov-filtro-fecha').value;

    const filtrados = transaccionesCache.filter(tx => {
        const prodsStr = tx.items ? tx.items.map(i => i.nombre.toLowerCase()).join(' ') : '';
        const coincideTexto = prodsStr.includes(buscador) || 
                              (tx.comentario && tx.comentario.toLowerCase().includes(buscador)) ||
                              (tx.codigoGeneracion && tx.codigoGeneracion.toLowerCase().includes(buscador));
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

        let filasHTML = '';
        let sumaTotal = 0;
        if (tx.items) {
            tx.items.forEach(item => {
                const cant = Number.isInteger(item.cantidad) ? item.cantidad : item.cantidad.toFixed(2);
                const subtotal = item.subtotal || (item.precio * item.cantidad) || 0;
                sumaTotal += subtotal;
                filasHTML += `<tr><td>${item.nombre}</td><td>${item.medida}</td><td>${cant}</td><td>${item.precio ? '$' + item.precio.toFixed(2) : '-'}</td><td>${subtotal ? '$' + subtotal.toFixed(2) : '-'}</td></tr>`;
            });
        }
        const totalMostrar = tx.total || sumaTotal;

        let pagosHTML = tx.pagos && tx.pagos.length > 0 
            ? tx.pagos.map(p => `<span class="badge bg-info text-dark me-1">${p.metodo}: $${p.monto.toFixed(2)}</span>`).join('')
            : '<span class="text-muted small">No registrados</span>';

        // AHORA SIEMPRE MOSTRAMOS LOS BOTONES (Para nuevos e históricos)
        const botonesAccion = `
            <div class="mt-2 text-end border-top pt-2">
                <button onclick="editarTransaccion('${tx.id}')" class="btn btn-sm btn-outline-primary me-2">✏️ Editar / Completar</button>
                <button onclick="eliminarTransaccion('${tx.id}')" class="btn btn-sm btn-outline-danger">🗑️ Eliminar</button>
            </div>
        `;

        acordeon.innerHTML += `
            <div class="accordion-item">
                <h2 class="accordion-header" id="heading-${index}">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                        <div class="d-flex w-100 justify-content-between pe-3">
                            <span>
                                <span class="badge ${tx.tipo === 'entrada' ? 'bg-success' : 'bg-danger'} me-2">${tx.motivo}</span>
                                ${tx.codigoGeneracion ? `<b>DTE:</b> ${tx.codigoGeneracion}` : 'Sin DTE'} 
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
                            <thead class="table-light"><tr><th>Producto</th><th>Medida</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
                            <tbody>${filasHTML}</tbody>
                        </table>
                        ${botonesAccion}
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
// MODAL: CREAR / EDITAR
// ==========================================
window.abrirModalTransaccion = function() {
    transaccionEditandoId = null;
    txItemsTemp = [];
    txPagosTemp = [];
    document.getElementById('modal-tx-titulo').textContent = 'Registrar Nueva Transacción';
    document.getElementById('btn-guardar-tx').textContent = 'Guardar Transacción';
    
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
    document.getElementById('tx-tipo').value = 'salida';
    
    actualizarMotivos();
    renderizarItemsTx();
    renderizarPagosTx();
    calcularTotalesTransaccion();
    
    new bootstrap.Modal(document.getElementById('modal-transaccion')).show();
};

window.editarTransaccion = function(id) {
    const tx = transaccionesCache.find(t => t.id === id);
    if (!tx) return;

    transaccionEditandoId = id;
    // Copia profunda para no mutar la caché original mientras se edita
    txItemsTemp = JSON.parse(JSON.stringify(tx.items || []));
    txPagosTemp = JSON.parse(JSON.stringify(tx.pagos || []));

    // Si es histórico y algún producto no tiene varIndex (porque se guardó diferente antes), lo buscamos
    txItemsTemp.forEach(item => {
        if (item.varIndex === undefined || item.varIndex === -1) {
            const prod = productosCache.find(p => p.id === item.prodId);
            if (prod) {
                item.varIndex = prod.variantes.findIndex(v => v.medida === item.medida);
            }
        }
    });
    
    document.getElementById('modal-tx-titulo').textContent = tx.isNew ? 'Editar Transacción' : 'Completar Datos Históricos';
    document.getElementById('btn-guardar-tx').textContent = tx.isNew ? 'Actualizar Transacción' : 'Guardar y Convertir';

    document.getElementById('tx-tipo').value = tx.tipo;
    actualizarMotivos();
    document.getElementById('tx-motivo').value = tx.motivo.includes('Histórico') ? (tx.tipo === 'salida' ? 'Venta' : 'Pedido especial') : tx.motivo;
    document.getElementById('tx-codigo-gen').value = tx.codigoGeneracion || '';
    document.getElementById('tx-num-dte').value = tx.numeroDTE || '';
    document.getElementById('tx-comentario').value = tx.comentario || '';
    
    document.getElementById('tx-check-envio').checked = tx.montoEnvio > 0;
    toggleEnvio();
    document.getElementById('tx-monto-envio').value = tx.montoEnvio || 0;
    
    document.getElementById('tx-estado-entrega').value = (tx.estadoEntrega === 'Histórico') ? 'Entregado en tienda' : tx.estadoEntrega;
    toggleFechaPiloto();
    document.getElementById('tx-fecha-entrega').value = tx.fechaEntrega || '';

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
    selectMotivo.innerHTML = tipo === 'salida' 
        ? `<option value="Venta">Venta</option><option value="Dañadas">Dañadas</option><option value="Muestras">Muestras</option>`
        : `<option value="Pedido especial">Pedido especial</option><option value="Exportación">Exportación</option><option value="Devolución">Devolución</option>`;
};

window.seleccionarProductoPorNombre = function() {
    const nombre = document.getElementById('tx-prod-search').value;
    const prod = productosCache.find(p => p.nombre === nombre);
    const selectVar = document.getElementById('tx-variante');
    selectVar.innerHTML = '';
    if (!prod) { selectVar.innerHTML = '<option value="">-- No encontrado --</option>'; return; }
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

    txItemsTemp.push({ prodId: prod.id, varIndex: parseInt(varIndex), nombre: prod.nombre, medida: variante.medida, cantidad, precio });
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
            <tr><td>${item.nombre}</td><td>${item.medida}</td><td>${cant}</td><td>$${item.precio.toFixed(2)}</td><td>$${subtotal.toFixed(2)}</td>
            <td><button class="btn btn-sm btn-outline-danger" onclick="eliminarItemTx(${index})">X</button></td></tr>`;
    });
    calcularTotalesTransaccion();
}

window.eliminarItemTx = function(index) { txItemsTemp.splice(index, 1); renderizarItemsTx(); };
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
    const totalPagado = txPagosTemp.reduce((sum, p) => sum + p.monto, 0);

    document.getElementById('lbl-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('lbl-envio').textContent = `$${envio.toFixed(2)}`;
    document.getElementById('lbl-total').textContent = `$${total.toFixed(2)}`;
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

    if (isNaN(monto) || monto <= 0) return showAlert('Aviso', 'Monto inválido.', 'warning');
    if ((metodo === 'Efectivo' || metodo === 'Cheque') && !fechaAbono) return showAlert('Aviso', 'Falta fecha de abono.', 'warning');

    txPagosTemp.push({ metodo, monto, fechaAbono });
    renderizarPagosTx();
    document.getElementById('pago-monto').value = '';
    document.getElementById('pago-fecha-abono').value = '';
};

function renderizarPagosTx() {
    const tbody = document.querySelector('#tabla-pagos tbody');
    tbody.innerHTML = '';
    txPagosTemp.forEach((p, index) => {
        tbody.innerHTML += `<tr><td>${p.metodo}</td><td>$${p.monto.toFixed(2)}</td><td>${p.fechaAbono || '-'}</td><td><button class="btn btn-sm btn-outline-danger" onclick="eliminarPago(${index})">X</button></td></tr>`;
    });
    calcularTotalesTransaccion();
}
window.eliminarPago = function(index) { txPagosTemp.splice(index, 1); renderizarPagosTx(); };

window.toggleFechaPiloto = function() {
    document.getElementById('div-fecha-entrega').style.display = (document.getElementById('tx-estado-entrega').value === 'Entregado por Piloto') ? 'block' : 'none';
};

// ==========================================
// GUARDAR TRANSACCIÓN (NUEVA O EDITADA)
// ==========================================
window.guardarTransaccion = async function() {
    if (txItemsTemp.length === 0) return showAlert('Aviso', 'No has agregado productos.', 'warning');

    const subtotal = txItemsTemp.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);
    const envio = parseFloat(document.getElementById('tx-monto-envio').value) || 0;
    const total = subtotal + envio;
    const totalPagado = txPagosTemp.reduce((sum, p) => sum + p.monto, 0);

    if (Math.abs(totalPagado - total) > 0.01) {
        return showAlert('Aviso', `Pagos ($${totalPagado.toFixed(2)}) no coinciden con Total ($${total.toFixed(2)}).`, 'warning');
    }

    const tipo = document.getElementById('tx-tipo').value;
    const loteId = 'TX-' + Date.now();
    
    const btnGuardar = document.getElementById('btn-guardar-tx');
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Procesando...';

    try {
        if (transaccionEditandoId) {
            const oldTx = transaccionesCache.find(t => t.id === transaccionEditandoId);
            
            // 1. Revertir stock anterior
            for (const item of oldTx.items) {
                const prod = productosCache.find(p => p.id === item.prodId);
                if (prod && prod.variantes[item.varIndex]) {
                    prod.variantes[item.varIndex].stock += (oldTx.tipo === 'entrada' ? -item.cantidad : item.cantidad);
                    await updateDoc(doc(db, "inventario", item.prodId), { variantes: prod.variantes });
                }
            }

            // 2. Borrar el registro anterior de Firestore
            const batch = writeBatch(db);
            if (oldTx.isNew) {
                batch.delete(doc(db, "transacciones", transaccionEditandoId));
                const qMovs = query(collection(db, "movimientos_inventario"), where("transaccionId", "==", transaccionEditandoId));
                const snapMovs = await getDocs(qMovs);
                snapMovs.forEach(m => batch.delete(m.ref));
            } else {
                // Si es histórico, borramos sus documentos individuales
                oldTx.docIds.forEach(docId => {
                    batch.delete(doc(db, "movimientos_inventario", docId));
                });
            }
            await batch.commit();
        }

        // 3. Crear la nueva transacción (o la editada)
        const txData = {
            userId: currentUser.uid, tipo, motivo: document.getElementById('tx-motivo').value,
            codigoGeneracion: document.getElementById('tx-codigo-gen').value.trim(), 
            numeroDTE: document.getElementById('tx-num-dte').value.trim(),
            subtotal, montoEnvio: envio, total, pagos: txPagosTemp,
            estadoEntrega: document.getElementById('tx-estado-entrega').value, 
            fechaEntrega: document.getElementById('tx-fecha-entrega').value,
            comentario: document.getElementById('tx-comentario').value.trim(), 
            items: txItemsTemp, loteId, fecha: new Date().toISOString()
        };

        const txRef = await addDoc(collection(db, "transacciones"), txData);

        // 4. Aplicar el NUEVO stock y guardar movimientos detallados
        for (const item of txItemsTemp) {
            const prod = productosCache.find(p => p.id === item.prodId);
            if (prod && prod.variantes[item.varIndex]) {
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

        showAlert('Éxito', transaccionEditandoId ? 'Transacción guardada.' : 'Transacción registrada.', 'success');
        cancelarTransaccion();
        await cargarProductos(); 
        await cargarTransacciones(); 
    } catch (error) {
        showAlert('Error', error.message, 'danger');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = transaccionEditandoId ? 'Actualizar Transacción' : 'Guardar Transacción';
    }
};

// ==========================================
// ELIMINAR TRANSACCIÓN
// ==========================================
window.eliminarTransaccion = async function(id) {
    const confirmado = await showConfirm('¿Estás seguro de eliminar esta transacción? El stock de los productos será devuelto al inventario.');
    if (!confirmado) return;

    try {
        const tx = transaccionesCache.find(t => t.id === id);
        
        // 1. Revertir stock
        for (const item of tx.items) {
            const prod = productosCache.find(p => p.id === item.prodId);
            if (prod && prod.variantes[item.varIndex]) {
                prod.variantes[item.varIndex].stock += (tx.tipo === 'entrada' ? -item.cantidad : item.cantidad);
                await updateDoc(doc(db, "inventario", item.prodId), { variantes: prod.variantes });
            }
        }

        // 2. Eliminar registros
        const batch = writeBatch(db);
        if (tx.isNew) {
            batch.delete(doc(db, "transacciones", id));
            const qMovs = query(collection(db, "movimientos_inventario"), where("transaccionId", "==", id));
            const snapMovs = await getDocs(qMovs);
            snapMovs.forEach(m => batch.delete(m.ref));
        } else {
            tx.docIds.forEach(docId => {
                batch.delete(doc(db, "movimientos_inventario", docId));
            });
        }
        await batch.commit();

        showAlert('Eliminado', 'Transacción eliminada y stock restaurado.', 'success');
        await cargarProductos();
        await cargarTransacciones();
    } catch (error) {
        showAlert('Error', error.message, 'danger');
    }
};
