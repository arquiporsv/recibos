import { db, auth, showAlert, showConfirm, checkAuth } from './firebase.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let currentUser = null;
let productosCache = []; 
let categoriasCache = [];
let productoEditandoId = null;
let danadasTemporales = []; // Almacena las dañadas antes de guardar el producto

checkAuth((user) => {
    currentUser = user;
    document.getElementById('user-email-display').textContent = user.email;
    inicializarAppPrivada();
});

window.logout = function() { 
    signOut(auth).then(() => window.location.href = 'index.html'); 
};

async function inicializarAppPrivada() {
    await cargarCategorias();
    await cargarProductos();
}

// --- LÓGICA DE FORMULARIO (CHECKBOXES) ---
window.togglePosNegInputs = function() {
    const hasPosNeg = document.getElementById('prod-check-pos-neg').checked;
    document.querySelectorAll('.variante-row').forEach(row => {
        if (hasPosNeg) {
            row.classList.add('con-negativo');
            // Si no existe el input de stock negativo, lo creamos
            if (!row.querySelector('.var-stock-neg')) {
                const inputStockNeg = document.createElement('input');
                inputStockNeg.type = 'number';
                inputStockNeg.className = 'form-control form-control-sm var-stock-neg';
                inputStockNeg.placeholder = 'Stock Negativo';
                inputStockNeg.value = '0';
                row.insertBefore(inputStockNeg, row.querySelector('.btn-remove-row'));
            }
        } else {
            row.classList.remove('con-negativo');
            const inputStockNeg = row.querySelector('.var-stock-neg');
            if (inputStockNeg) inputStockNeg.remove();
        }
    });
    actualizarOpcionesDanadas(); // Actualiza el select de dañadas
};

window.toggleDanadasSection = function() {
    const hasDanadas = document.getElementById('prod-check-danadas').checked;
    document.getElementById('seccion-danadas').style.display = hasDanadas ? 'block' : 'none';
    if (hasDanadas) actualizarOpcionesDanadas();
};

// Actualiza el select de dañadas basándose en las medidas escritas
window.actualizarOpcionesDanadas = function() {
    const select = document.getElementById('danadas-medida');
    const medidasIngresadas = new Set();
    
    document.querySelectorAll('.variante-row').forEach(row => {
        const medida = row.querySelector('.var-medida').value.trim();
        if (medida) medidasIngresadas.add(medida);
    });

    const valorActual = select.value;
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    
    medidasIngresadas.forEach(m => {
        select.innerHTML += `<option value="${m}">${m}</option>`;
    });
    // Opciones fijas solicitadas
    select.innerHTML += `<option value="Dañadas">Dañadas</option>`;
    select.innerHTML += `<option value="Amarillas">Amarillas</option>`;
    
    if (valorActual && [...select.options].some(o => o.value === valorActual)) {
        select.value = valorActual;
    }
};

window.agregarItemDanado = function() {
    const medida = document.getElementById('danadas-medida').value;
    const cantidad = parseInt(document.getElementById('danadas-cantidad').value);
    
    if (!medida || isNaN(cantidad) || cantidad <= 0) return showAlert('Aviso', 'Seleccione medida y cantidad válida.', 'warning');
    
    danadasTemporales.push({ tipo: medida, cantidad });
    renderizarListaDanadas();
    document.getElementById('danadas-cantidad').value = '1';
};

function renderizarListaDanadas() {
    const lista = document.getElementById('lista-danadas');
    lista.innerHTML = '';
    danadasTemporales.forEach((d, index) => {
        lista.innerHTML += `
            <li class="list-group-item d-flex justify-content-between align-items-center py-1">
                <span>${d.tipo} <span class="badge bg-danger ms-2">${d.cantidad} uds</span></span>
                <button class="btn btn-sm btn-outline-danger border-0" onclick="eliminarDanadaTemp(${index})">X</button>
            </li>
        `;
    });
}

window.eliminarDanadaTemp = function(index) {
    danadasTemporales.splice(index, 1);
    renderizarListaDanadas();
};

// --- CATEGORÍAS Y PRODUCTOS ---
async function cargarCategorias() {
    const q = query(collection(db, "categorias"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    categoriasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const select = document.getElementById('prod-categoria');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    categoriasCache.forEach(c => { select.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`; });

    const lista = document.getElementById('lista-categorias');
    lista.innerHTML = '';
    categoriasCache.forEach(c => {
        lista.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">${c.nombre}<button class="btn btn-sm btn-outline-danger" onclick="eliminarCategoria('${c.id}')">🗑️</button></li>`;
    });
}

window.abrirModalCategoria = () => new bootstrap.Modal(document.getElementById('modal-categoria')).show();

window.guardarCategoria = async function() {
    const nombre = document.getElementById('nueva-categoria-nombre').value.trim();
    if (!nombre) return showAlert('Aviso', 'Escribe un nombre.', 'warning');
    if (categoriasCache.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) return showAlert('Aviso', 'Ya existe.', 'warning');
    await addDoc(collection(db, "categorias"), { userId: currentUser.uid, nombre });
    document.getElementById('nueva-categoria-nombre').value = '';
    await cargarCategorias();
};

window.eliminarCategoria = async function(id) {
    if (await showConfirm('¿Eliminar categoría?')) {
        await deleteDoc(doc(db, "categorias", id));
        await cargarCategorias();
    }
};

async function cargarProductos() {
    const tbody = document.getElementById('tabla-inventario');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando...</td></tr>';
    
    const q = query(collection(db, "inventario"), where("userId", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    productosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    productosCache.sort((a, b) => a.nombre.localeCompare(b.nombre));
    tbody.innerHTML = '';

    if(productosCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Sin productos.</td></tr>';
        return;
    }

    productosCache.forEach(prod => {
        let variantesHTML = '';
        prod.variantes.forEach(v => {
            if (prod.tienePositivoNegativo) {
                const colorP = v.stockPositivo <= 0 ? 'stock-out' : 'stock-in';
                const colorN = v.stockNegativo <= 0 ? 'stock-out' : 'stock-in';
                variantesHTML += `<div class="mb-1 border-bottom pb-1"><b>${v.medida}</b>: $${v.precio.toFixed(2)} <br>
                    <span class="small">Pos: <span class="${colorP}">${v.stockPositivo}</span> | Neg: <span class="${colorN}">${v.stockNegativo}</span></span>
                </div>`;
            } else {
                const colorStock = v.stockPositivo <= 0 ? 'stock-out' : 'stock-in';
                variantesHTML += `<div class="mb-1"><b>${v.medida}</b>: $${v.precio.toFixed(2)} | <span class="${colorStock}">${v.stockPositivo} uds</span></div>`;
            }
        });

        let danadasHTML = '-';
        if (prod.tieneDanadas && prod.danadas && prod.danadas.length > 0) {
            danadasHTML = prod.danadas.map(d => `<span class="badge ${d.tipo === 'Amarillas' ? 'bg-amarillo' : 'bg-danger'} mb-1">${d.tipo}: ${d.cantidad}</span>`).join('<br>');
        }

        tbody.innerHTML += `
            <tr>
                <td><img src="${prod.fotoUrl || 'https://via.placeholder.com/50?text=No'}" class="img-thumb"></td>
                <td><div class="fw-bold">${prod.nombre}</div><div class="text-muted small">${prod.descripcion || ''}</div></td>
                <td><span class="badge bg-secondary">${prod.categoria}</span></td>
                <td>${variantesHTML}</td>
                <td>${danadasHTML}</td>
                <td>
                    <button onclick="editarProducto('${prod.id}')" class="btn btn-sm btn-outline-primary">✏️</button>
                    <button onclick="eliminarProducto('${prod.id}')" class="btn btn-sm btn-outline-danger">🗑️</button>
                </td>
            </tr>
        `;
    });
}

window.abrirModalProducto = function() {
    productoEditandoId = null;
    danadasTemporales = [];
    document.getElementById('modal-prod-titulo').textContent = 'Nuevo Producto';
    document.getElementById('prod-nombre').value = '';
    document.getElementById('prod-categoria').value = '';
    document.getElementById('prod-descripcion').value = '';
    document.getElementById('prod-foto-url').value = '';
    document.getElementById('prod-check-pos-neg').checked = false;
    document.getElementById('prod-check-danadas').checked = false;
    document.getElementById('seccion-danadas').style.display = 'none';
    document.getElementById('preview-foto-container').style.display = 'none';
    document.getElementById('contenedor-variantes').innerHTML = '';
    renderizarListaDanadas();
    
    agregarFilaVariante();
    new bootstrap.Modal(document.getElementById('modal-producto')).show();
};

window.actualizarPreviewFoto = function() {
    const url = document.getElementById('prod-foto-url').value.trim();
    const container = document.getElementById('preview-foto-container');
    const img = document.getElementById('preview-foto');
    if (url) {
        img.src = url;
        container.style.display = 'block';
        img.onerror = () => { container.style.display = 'none'; };
    } else { container.style.display = 'none'; }
};

window.agregarFilaVariante = function(medida = '', precio = '', stockPos = '', stockNeg = '') {
    const container = document.getElementById('contenedor-variantes');
    const hasPosNeg = document.getElementById('prod-check-pos-neg').checked;
    const div = document.createElement('div');
    div.className = `variante-row ${hasPosNeg ? 'con-negativo' : ''}`;
    
    div.innerHTML = `
        <input type="text" class="form-control form-control-sm var-medida" placeholder="Medida" value="${medida}" oninput="actualizarOpcionesDanadas()">
        <input type="number" class="form-control form-control-sm var-precio" placeholder="Precio $" step="0.01" value="${precio}">
        <input type="number" class="form-control form-control-sm var-stock" placeholder="Stock Pos." value="${stockPos}">
        ${hasPosNeg ? `<input type="number" class="form-control form-control-sm var-stock-neg" placeholder="Stock Neg." value="${stockNeg}">` : ''}
        <button class="btn-remove-row" onclick="this.parentElement.remove(); actualizarOpcionesDanadas();">X</button>
    `;
    container.appendChild(div);
    actualizarOpcionesDanadas();
};

window.guardarProducto = async function() {
    const nombre = document.getElementById('prod-nombre').value.trim();
    const categoria = document.getElementById('prod-categoria').value;
    const descripcion = document.getElementById('prod-descripcion').value.trim();
    const fotoUrl = document.getElementById('prod-foto-url').value.trim();
    const tienePositivoNegativo = document.getElementById('prod-check-pos-neg').checked;
    const tieneDanadas = document.getElementById('prod-check-danadas').checked;
    
    if (!nombre || !categoria) return showAlert('Aviso', 'Nombre y Categoría son obligatorios.', 'warning');

    const variantes = [];
    document.querySelectorAll('.variante-row').forEach(fila => {
        const medida = fila.querySelector('.var-medida').value.trim();
        const precio = parseFloat(fila.querySelector('.var-precio').value);
        const stockPositivo = parseInt(fila.querySelector('.var-stock').value) || 0;
        const stockNegativo = tienePositivoNegativo ? (parseInt(fila.querySelector('.var-stock-neg')?.value) || 0) : 0;
        
        if (medida && !isNaN(precio)) {
            variantes.push({ medida, precio, stockPositivo, stockNegativo });
        }
    });

    if (variantes.length === 0) return showAlert('Aviso', 'Agrega al menos una variante.', 'warning');

    const payload = { 
        userId: currentUser.uid, 
        nombre, 
        categoria, 
        descripcion, 
        fotoUrl, 
        tienePositivoNegativo,
        tieneDanadas,
        danadas: tieneDanadas ? danadasTemporales : [],
        variantes, 
        fechaActualizacion: new Date().toISOString() 
    };

    try {
        if (productoEditandoId) {
            await updateDoc(doc(db, "inventario", productoEditandoId), payload);
            showAlert('Éxito', 'Producto actualizado.', 'success');
        } else {
            payload.fechaCreacion = new Date().toISOString();
            await addDoc(collection(db, "inventario"), payload);
            showAlert('Éxito', 'Producto creado.', 'success');
        }
        bootstrap.Modal.getInstance(document.getElementById('modal-producto')).hide();
        await cargarProductos();
    } catch (e) { showAlert('Error', e.message, 'danger'); }
};

window.editarProducto = function(id) {
    const prod = productosCache.find(p => p.id === id);
    if (!prod) return;
    
    productoEditandoId = id;
    danadasTemporales = prod.danadas || [];
    
    document.getElementById('modal-prod-titulo').textContent = 'Editar Producto';
    document.getElementById('prod-nombre').value = prod.nombre;
    document.getElementById('prod-categoria').value = prod.categoria;
    document.getElementById('prod-descripcion').value = prod.descripcion || '';
    document.getElementById('prod-foto-url').value = prod.fotoUrl || '';
    document.getElementById('prod-check-pos-neg').checked = prod.tienePositivoNegativo || false;
    document.getElementById('prod-check-danadas').checked = prod.tieneDanadas || false;
    document.getElementById('seccion-danadas').style.display = prod.tieneDanadas ? 'block' : 'none';
    
    actualizarPreviewFoto();
    renderizarListaDanadas();

    document.getElementById('contenedor-variantes').innerHTML = '';
    prod.variantes.forEach(v => agregarFilaVariante(v.medida, v.precio, v.stockPositivo, v.stockNegativo));

    new bootstrap.Modal(document.getElementById('modal-producto')).show();
};

window.eliminarProducto = async function(id) {
    if (await showConfirm('¿Estás seguro de eliminar este producto?')) {
        await deleteDoc(doc(db, "inventario", id));
        await cargarProductos();
        showAlert('Eliminado', 'El producto ha sido borrado.', 'success');
    }
};

// --- MOVIMIENTOS ---
window.abrirModalMovimiento = function() {
    const select = document.getElementById('mov-producto');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    productosCache.forEach(p => { select.innerHTML += `<option value="${p.id}">${p.nombre}</option>`; });
    
    document.getElementById('mov-variante').innerHTML = '<option value="">-- Seleccione producto --</option>';
    document.getElementById('mov-tipo-stock-container').style.display = 'none';
    document.getElementById('mov-cantidad').value = '1';
    document.getElementById('mov-comentario').value = '';
    new bootstrap.Modal(document.getElementById('modal-movimiento')).show();
};

window.cargarVariantesMovimiento = function() {
    const prodId = document.getElementById('mov-producto').value;
    const selectVar = document.getElementById('mov-variante');
    const containerTipoStock = document.getElementById('mov-tipo-stock-container');
    selectVar.innerHTML = '';
    containerTipoStock.style.display = 'none';

    if (!prodId) {
        selectVar.innerHTML = '<option value="">-- Seleccione producto --</option>';
        return;
    }

    const prod = productosCache.find(p => p.id === prodId);
    
    // Si el producto tiene Positivo y Negativo, mostrar el selector
    if (prod.tienePositivoNegativo) {
        containerTipoStock.style.display = 'block';
    }

    prod.variantes.forEach((v, index) => {
        let label = v.medida;
        if (prod.tienePositivoNegativo) {
            label += ` (Pos: ${v.stockPositivo} | Neg: ${v.stockNegativo})`;
        } else {
            label += ` (Stock: ${v.stockPositivo})`;
        }
        selectVar.innerHTML += `<option value="${index}">${label}</option>`;
    });
};

window.registrarMovimiento = async function() {
    const prodId = document.getElementById('mov-producto').value;
    const varIndex = document.getElementById('mov-variante').value;
    const tipo = document.getElementById('mov-tipo').value;
    const cantidad = parseInt(document.getElementById('mov-cantidad').value);
    const comentario = document.getElementById('mov-comentario').value.trim();
    const tipoStock = document.getElementById('mov-tipo-stock').value; // positivo o negativo

    if (!prodId || varIndex === "" || isNaN(cantidad) || cantidad <= 0) {
        return showAlert('Aviso', 'Complete los campos requeridos.', 'warning');
    }

    const prod = productosCache.find(p => p.id === prodId);
    const variante = prod.variantes[varIndex];

    // Lógica de actualización de stock
    if (tipo === 'entrada') {
        if (tipoStock === 'positivo') variante.stockPositivo += cantidad;
        if (tipoStock === 'negativo') variante.stockNegativo += cantidad;
    } else {
        if (tipoStock === 'positivo' && cantidad > variante.stockPositivo) return showAlert('Aviso', 'Stock Positivo insuficiente.', 'warning');
        if (tipoStock === 'negativo' && cantidad > variante.stockNegativo) return showAlert('Aviso', 'Stock Negativo insuficiente.', 'warning');
        
        if (tipoStock === 'positivo') variante.stockPositivo -= cantidad;
        if (tipoStock === 'negativo') variante.stockNegativo -= cantidad;
    }
    
    try {
        await updateDoc(doc(db, "inventario", prodId), { variantes: prod.variantes });
        await addDoc(collection(db, "movimientos_inventario"), {
            userId: currentUser.uid, 
            productoId: prodId, 
            productoNombre: prod.nombre,
            medida: variante.medida, 
            tipoStock: prod.tienePositivoNegativo ? tipoStock : 'unico',
            tipo, 
            cantidad,
            comentario, 
            fecha: new Date().toISOString()
        });
        showAlert('Éxito', 'Movimiento registrado.', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modal-movimiento')).hide();
        await cargarProductos();
    } catch (e) { showAlert('Error', e.message, 'danger'); }
};

window.copiarEnlacePublico = function() {
    const baseUrl = window.location.origin + window.location.pathname.replace('inventario.html', '');
    const publicUrl = `${baseUrl}catalogo.html?uid=${currentUser.uid}`;
    navigator.clipboard.writeText(publicUrl).then(() => {
        showAlert('Éxito', 'Enlace del catálogo copiado.', 'success');
    });
};
