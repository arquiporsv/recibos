import { db, auth, checkAuth, showAlert, showConfirm } from './firebase.js';
import { collection, getDocs, query, where, addDoc, doc, updateDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let notasCache = [];
let productosTemp = [];
let notaEditandoId = null;

checkAuth(async (user) => {
    currentUser = user;
    await cargarNotas();
    
    // Lógica para autogenerar la nota desde un Movimiento
    const urlParams = new URLSearchParams(window.location.search);
    const txId = urlParams.get('txId');
    if (txId) {
        await prepararNotaDesdeMovimiento(txId);
        // Limpiar la URL para que al recargar no vuelva a salir el modal
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

// ==========================================
// CARGA Y RENDERIZADO
// ==========================================
async function cargarNotas() {
    const acordeon = document.getElementById('acordeon-notas');
    acordeon.innerHTML = '<div class="text-center p-3">Cargando notas...</div>';

    try {
        const q = query(collection(db, "notas_entrega"), where("userId", "==", currentUser.uid));
        const snap = await getDocs(q);
        
        notasCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        notasCache.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        filtrarNotas();
    } catch (error) {
        acordeon.innerHTML = `<div class="text-center text-danger p-3">Error: ${error.message}</div>`;
    }
}

window.filtrarNotas = function() {
    const acordeon = document.getElementById('acordeon-notas');
    const buscador = document.getElementById('ne-buscador').value.toLowerCase().trim();

    const filtradas = notasCache.filter(n => 
        n.clienteNombre.toLowerCase().includes(buscador) || 
        n.numeroNota.toLowerCase().includes(buscador)
    );

    if (filtradas.length === 0) {
        acordeon.innerHTML = '<div class="text-center text-muted p-4">No se encontraron notas de entrega.</div>';
        return;
    }

    acordeon.innerHTML = '';
    filtradas.forEach((nota, index) => {
        const fechaStr = new Date(nota.fecha).toLocaleDateString();
        const collapseId = `collapse-ne-${index}`;

        let filasHTML = '';
        nota.productos.forEach((p, i) => {
            const cantFormat = Number.isInteger(p.cantidad) ? p.cantidad.toFixed(2) : p.cantidad.toFixed(2);
            filasHTML += `<tr><td class="text-center">${i+1}</td><td>${p.nombre}</td><td class="text-center">${cantFormat} C/U</td></tr>`;
        });

        acordeon.innerHTML += `
            <div class="accordion-item">
                <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                        <div class="d-flex w-100 justify-content-between align-items-center pe-3">
                            <div>
                                <span class="badge bg-primary me-2">${nota.numeroNota}</span>
                                <b>${nota.clienteNombre}</b>
                            </div>
                            <span class="text-muted small text-end">${fechaStr} <br> <b>Total: ${nota.total.toFixed(2)}</b></span>
                        </div>
                    </button>
                </h2>
                <div id="${collapseId}" class="accordion-collapse collapse">
                    <div class="accordion-body p-0">
                        <div class="p-3 bg-light border-bottom">
                            <p class="mb-1"><b>Motivo:</b> ${nota.titulo}</p>
                            ${nota.referencia ? `<p class="mb-1 small"><b>Ref:</b> ${nota.referencia}</p>` : ''}
                            ${nota.descripcionExtra ? `<p class="mb-0 small text-muted"><b>Nota:</b> ${nota.descripcionExtra}</p>` : ''}
                        </div>
                        <table class="table table-sm mb-0">
                            <thead class="table-light"><tr><th class="text-center">N°</th><th>Producto</th><th class="text-center">Cantidad</th></tr></thead>
                            <tbody>${filasHTML}</tbody>
                        </table>
                        <div class="text-end p-2 border-top">
                            <button onclick="descargarPDF('${nota.id}')" class="btn btn-sm btn-success me-2" title="Imprimir / Ver PDF">🖨️ PDF</button>
                            <button onclick="editarNota('${nota.id}')" class="btn btn-sm btn-outline-primary me-2" title="Editar">✏️</button>
                            <button onclick="eliminarNota('${nota.id}')" class="btn btn-sm btn-outline-danger" title="Eliminar">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
};

// ==========================================
// CREACIÓN DESDE MOVIMIENTOS
// ==========================================
async function prepararNotaDesdeMovimiento(txId) {
    try {
        const txDoc = await getDoc(doc(db, "transacciones", txId));
        if (!txDoc.exists()) return showAlert('Error', 'No se encontró la transacción original.', 'danger');
        
        const tx = txDoc.data();
        
        notaEditandoId = null;
        productosTemp = tx.items.map(i => ({ nombre: i.nombre + ' - ' + i.medida, cantidad: i.cantidad }));
        
        let nextNum = 1;
        if (notasCache.length > 0) {
            const nums = notasCache.map(n => parseInt(n.numeroNota.replace(/\D/g, '')) || 0);
            nextNum = Math.max(...nums) + 1;
        }
        
        document.getElementById('modal-nota-titulo').textContent = 'Generar Nota desde Movimiento';
        document.getElementById('btn-guardar-nota').textContent = 'Guardar y Generar PDF';
        document.getElementById('ne-numero').value = 'NE' + nextNum;
        document.getElementById('ne-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('ne-titulo').value = 'NOTA DE ENTREGA'; 
        document.getElementById('ne-cliente-nombre').value = 'Cliente'; 
        document.getElementById('ne-cliente-dir').value = '';
        document.getElementById('ne-cliente-tel').value = '';
        
        let refFactura = '';
        if (tx.dtes && tx.dtes.length > 0) {
            refFactura = tx.dtes[0].numero + ' / ' + tx.dtes[0].codigo;
        }
        document.getElementById('ne-referencia').value = refFactura;
        
        document.getElementById('ne-descripcion-extra').value = tx.comentario || '';
        
        document.getElementById('ne-prod-nombre').value = '';
        document.getElementById('ne-prod-cant').value = '1';

        renderizarProductosTemp();
        new bootstrap.Modal(document.getElementById('modal-nota')).show();
        
    } catch (error) {
        showAlert('Error', error.message, 'danger');
    }
}

// ==========================================
// MODAL CREAR / EDITAR (Manual)
// ==========================================
window.abrirModalNota = function() {
    notaEditandoId = null;
    productosTemp = [];
    
    let nextNum = 1;
    if (notasCache.length > 0) {
        const nums = notasCache.map(n => parseInt(n.numeroNota.replace(/\D/g, '')) || 0);
        nextNum = Math.max(...nums) + 1;
    }
    
    document.getElementById('modal-nota-titulo').textContent = 'Nueva Nota de Entrega';
    document.getElementById('btn-guardar-nota').textContent = 'Guardar Nota';
    document.getElementById('ne-numero').value = 'NE' + nextNum;
    document.getElementById('ne-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('ne-titulo').value = '';
    document.getElementById('ne-cliente-nombre').value = '';
    document.getElementById('ne-cliente-dir').value = '';
    document.getElementById('ne-cliente-tel').value = '';
    document.getElementById('ne-referencia').value = '';
    document.getElementById('ne-descripcion-extra').value = '';
    
    document.getElementById('ne-prod-nombre').value = '';
    document.getElementById('ne-prod-cant').value = '1';

    renderizarProductosTemp();
    new bootstrap.Modal(document.getElementById('modal-nota')).show();
};

window.editarNota = function(id) {
    const nota = notasCache.find(n => n.id === id);
    if (!nota) return;

    notaEditandoId = id;
    productosTemp = JSON.parse(JSON.stringify(nota.productos));

    document.getElementById('modal-nota-titulo').textContent = 'Editar Nota de Entrega';
    document.getElementById('btn-guardar-nota').textContent = 'Actualizar Nota';
    
    document.getElementById('ne-numero').value = nota.numeroNota;
    document.getElementById('ne-fecha').value = nota.fecha;
    document.getElementById('ne-titulo').value = nota.titulo;
    document.getElementById('ne-cliente-nombre').value = nota.clienteNombre;
    document.getElementById('ne-cliente-dir').value = nota.clienteDireccion || '';
    document.getElementById('ne-cliente-tel').value = nota.clienteTelefono || '';
    document.getElementById('ne-referencia').value = nota.referencia || '';
    document.getElementById('ne-descripcion-extra').value = nota.descripcionExtra || '';

    renderizarProductosTemp();
    new bootstrap.Modal(document.getElementById('modal-nota')).show();
};

// ==========================================
// LÓGICA DE PRODUCTOS
// ==========================================
window.agregarProductoNota = function() {
    const nombre = document.getElementById('ne-prod-nombre').value.trim();
    const cantidad = parseFloat(document.getElementById('ne-prod-cant').value);

    if (!nombre || isNaN(cantidad) || cantidad <= 0) {
        return showAlert('Aviso', 'Ingresa un producto y una cantidad válida.', 'warning');
    }

    productosTemp.push({ nombre, cantidad });
    document.getElementById('ne-prod-nombre').value = '';
    document.getElementById('ne-prod-cant').value = '1';
    renderizarProductosTemp();
};

function renderizarProductosTemp() {
    const tbody = document.querySelector('#tabla-ne-productos tbody');
    tbody.innerHTML = '';
    let total = 0;

    productosTemp.forEach((p, index) => {
        total += p.cantidad;
        tbody.innerHTML += `
            <tr>
                <td class="text-center">${index + 1}</td>
                <td>${p.nombre}</td>
                <td class="text-center">${Number.isInteger(p.cantidad) ? p.cantidad.toFixed(2) : p.cantidad.toFixed(2)} C/U</td>
                <td class="text-center"><button class="btn btn-sm btn-outline-danger" onclick="eliminarProductoTemp(${index})">X</button></td>
            </tr>
        `;
    });

    document.getElementById('lbl-ne-total').textContent = Number.isInteger(total) ? total.toFixed(2) : total.toFixed(2);
}

window.eliminarProductoTemp = function(index) {
    productosTemp.splice(index, 1);
    renderizarProductosTemp();
};

// ==========================================
// GUARDAR Y ELIMINAR
// ==========================================
window.guardarNota = async function() {
    const numeroNota = document.getElementById('ne-numero').value.trim();
    const fecha = document.getElementById('ne-fecha').value;
    const titulo = document.getElementById('ne-titulo').value.trim() || 'NOTA DE ENTREGA';
    const clienteNombre = document.getElementById('ne-cliente-nombre').value.trim();
    const clienteDireccion = document.getElementById('ne-cliente-dir').value.trim();
    const clienteTelefono = document.getElementById('ne-cliente-tel').value.trim();
    const referencia = document.getElementById('ne-referencia').value.trim();
    const descripcionExtra = document.getElementById('ne-descripcion-extra').value.trim();

    if (!numeroNota || !fecha || !clienteNombre) {
        return showAlert('Aviso', 'N° Nota, Fecha y Nombre del Cliente son obligatorios.', 'warning');
    }
    if (productosTemp.length === 0) {
        return showAlert('Aviso', 'Debes agregar al menos un producto.', 'warning');
    }

    const total = productosTemp.reduce((sum, p) => sum + p.cantidad, 0);

    const payload = {
        userId: currentUser.uid,
        numeroNota, fecha, titulo,
        clienteNombre, clienteDireccion, clienteTelefono,
        referencia, descripcionExtra,
        productos: productosTemp, total,
        fechaActualizacion: new Date().toISOString()
    };

    try {
        let newId = notaEditandoId;
        if (notaEditandoId) {
            await updateDoc(doc(db, "notas_entrega", notaEditandoId), payload);
            showAlert('Éxito', 'Nota actualizada.', 'success');
        } else {
            payload.fechaCreacion = new Date().toISOString();
            const docRef = await addDoc(collection(db, "notas_entrega"), payload);
            newId = docRef.id;
            showAlert('Éxito', 'Nota creada. Abriendo PDF...', 'success');
        }
        
        bootstrap.Modal.getInstance(document.getElementById('modal-nota')).hide();
        await cargarNotas();
        
        // Si se acaba de crear, abrimos el PDF automáticamente
        if (!notaEditandoId) {
            setTimeout(() => descargarPDF(newId), 500); 
        }
        
    } catch (e) {
        showAlert('Error', e.message, 'danger');
    }
};

window.eliminarNota = async function(id) {
    if (await showConfirm('¿Estás seguro de eliminar esta Nota de Entrega?')) {
        try {
            await deleteDoc(doc(db, "notas_entrega", id));
            showAlert('Eliminado', 'La nota ha sido borrada.', 'success');
            await cargarNotas();
        } catch (error) {
            showAlert('Error', error.message, 'danger');
        }
    }
};

// ==========================================
// GENERAR PDF Y ABRIR EN NUEVA PESTAÑA
// ==========================================
window.descargarPDF = async function(id) {
    const nota = notasCache.find(n => n.id === id);
    if (!nota) return;

    // 1. Llenar datos en el contenedor oculto
    document.getElementById('pdf-cliente-nombre').textContent = nota.clienteNombre;
    document.getElementById('pdf-cliente-dir').textContent = nota.clienteDireccion || 'N/A';
    document.getElementById('pdf-cliente-tel').textContent = nota.clienteTelefono || 'N/A';
    document.getElementById('pdf-numero').textContent = nota.numeroNota;
    
    const [year, month, day] = nota.fecha.split('-');
    document.getElementById('pdf-fecha').textContent = `${day}-${month}-${year}`;
    
    document.getElementById('pdf-referencia').textContent = nota.referencia || 'N/A';
    document.getElementById('pdf-titulo').textContent = nota.titulo.toUpperCase();
    document.getElementById('pdf-descripcion').textContent = nota.descripcionExtra || '';

    // 2. Llenar tabla
    const tbody = document.querySelector('#pdf-tabla-productos tbody');
    tbody.innerHTML = '';
    nota.productos.forEach((p, index) => {
        const cantStr = Number.isInteger(p.cantidad) ? p.cantidad.toFixed(2) : p.cantidad.toFixed(2);
        tbody.innerHTML += `
            <tr>
                <td class="col-num">${index + 1}</td>
                <td>${p.nombre}</td>
                <td class="col-cant">${cantStr} C/U</td>
            </tr>
        `;
    });
    
    document.getElementById('pdf-total').textContent = nota.total.toFixed(2);

    // 3. Configurar html2pdf
    const elemento = document.getElementById('pdf-container');
    const opciones = {
        margin:       0, 
        filename:     `Nota_Entrega_${nota.numeroNota}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' }
    };

    elemento.style.display = 'block';
    
    try {
        // En lugar de descargar (.save()), generamos el PDF y lo abrimos en una nueva pestaña
        const pdf = await html2pdf().set(opciones).from(elemento).toPdf().get('pdf');
        const blobUrl = pdf.output('bloburl');
        
        // Abrir en nueva pestaña para imprimir
        window.open(blobUrl, '_blank');
        
    } catch (error) {
        showAlert('Error', 'No se pudo generar el PDF: ' + error.message, 'danger');
    } finally {
        elemento.style.display = 'none';
    }
};
