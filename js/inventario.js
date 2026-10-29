import { db, auth, showAlert, showConfirm, checkAuth } from './firebase.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let currentUser = null;
let productosCache = []; 
let categoriasCache = [];
let productoEditandoId = null;

// Validar sesión al cargar
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

// --- CATEGORÍAS ---
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

// --- PRODUCTOS ---
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
        let stockTotal = 0;
        let variantesHTML = '';
        prod.variantes.forEach(v => {
            stockTotal += v.stock;
            const colorStock = v.stock <= 0 ? 'stock-out' : 'stock-in';
            variantesHTML += `<span class="badge-stock">${v.medida}: $${v.precio.toFixed(2)} | <span class="${colorStock}">${v.stock} uds</span></span>`;
        });

        tbody.innerHTML += `
            <tr>
                <td><img src="${prod.fotoUrl || 'https://via.placeholder.com/50?text=No'}" class="img-thumb"></td>
                <td><div class="fw-bold">${prod.nombre}</div><div class="text-muted small">${prod.descripcion || ''}</div></td>
                <td><span class="badge bg-secondary">${prod.categoria}</span></td>
                <td>${variantesHTML}</td>
                <td><b>${stockTotal}</b></td>
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
    document.getElementById('modal-prod-titulo').textContent = 'Nuevo Producto';
    document.getElementById('prod-nombre').value = '';
    document.getElementById('prod-categoria').value = '';
    document.getElementById('prod-descripcion').value = '';
    document.getElementById('prod-foto-url').value = '';
    document.getElementById('preview-foto-container').style.display = 'none';
    document.getElementById('contenedor-variantes').innerHTML = '';
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

window.agregarFilaVariante = function(medida = '', precio = '', stock = '') {
    const container = document.getElementById('contenedor-variantes');
    const div = document.createElement('div');
    div.className = 'variante-row';
    div.innerHTML = `
        <input type="text" class="form-control form-control-sm var-medida" placeholder="Medida" value="${medida}">
        <input type="number" class="form-control form-control-sm var-precio" placeholder="Precio $" step="0.01" value="${precio}">
        <input type="number" class="form-control form-control-sm var-stock" placeholder="Stock" value="${stock}">
        <button class="btn-remove-row" onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(div);
};

window.guardarProducto = async function() {
    const nombre = document.getElementById('prod-nombre').value.trim();
    const categoria = document.getElementById('prod-categoria').value;
    const descripcion = document.getElementById('prod-descripcion').value.trim();
    const fotoUrl = document.getElementById('prod-foto-url').value.trim();
    
    if (!nombre || !categoria) return showAlert('Aviso', 'Nombre y Categoría son obligatorios.', 'warning');

    const variantes = [];
    document.querySelectorAll('.variante-row').forEach(fila => {
        const medida = fila.querySelector('.var-medida').value.trim();
        const precio = parseFloat(fila.querySelector('.var-precio').value);
        const stock = parseInt(fila.querySelector('.var-stock').value) || 0;
        if (medida && !isNaN(precio)) variantes.push({ medida, precio, stock });
    });

    if (variantes.length === 0) return showAlert('Aviso', 'Agrega al menos una variante.', 'warning');

    const payload = { userId: currentUser.uid, nombre, categoria, descripcion, fotoUrl, variantes, fechaActualizacion: new Date().toISOString() };

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
    document.getElementById('modal-prod-titulo').textContent = 'Editar Producto';
    document.getElementById('prod-nombre').value = prod.nombre;
    document.getElementById('prod-categoria').value = prod.categoria;
    document.getElementById('prod-descripcion').value = prod.descripcion || '';
    document.getElementById('prod-foto-url').value = prod.fotoUrl || '';
    actualizarPreviewFoto();
    document.getElementById('contenedor-variantes').innerHTML = '';
    prod.variantes.forEach(v => agregarFilaVariante(v.medida, v.precio, v.stock));
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
    document.getElementById('mov-cantidad').value = '1';
    document.getElementById('mov-comentario').value = '';
    document.getElementById('mov-codigo-gen').value = '';
    document.getElementById('mov-num-dte').value = '';
    new bootstrap.Modal(document.getElementById('modal-movimiento')).show();
};

window.cargarVariantesMovimiento = function() {
    const prodId = document.getElementById('mov-producto').value;
    const selectVar = document.getElementById('mov-variante');
    selectVar.innerHTML = '';
    if (!prodId) {
        selectVar.innerHTML = '<option value="">-- Seleccione producto --</option>';
        return;
    }
    const prod = productosCache.find(p => p.id === prodId);
    prod.variantes.forEach((v, index) => {
        selectVar.innerHTML += `<option value="${index}">${v.medida} (Stock: ${v.stock})</option>`;
    });
};

window.registrarMovimiento = async function() {
    const prodId = document.getElementById('mov-producto').value;
    const varIndex = document.getElementById('mov-variante').value;
    const tipo = document.getElementById('mov-tipo').value;
    const cantidad = parseInt(document.getElementById('mov-cantidad').value);
    const comentario = document.getElementById('mov-comentario').value.trim();
    const codGen = document.getElementById('mov-codigo-gen').value.trim();
    const numDte = document.getElementById('mov-num-dte').value.trim();

    if (!prodId || varIndex === "" || isNaN(cantidad) || cantidad <= 0) {
        return showAlert('Aviso', 'Complete los campos requeridos.', 'warning');
    }

    const prod = productosCache.find(p => p.id === prodId);
    let stockActual = prod.variantes[varIndex].stock;

    if (tipo === 'salida' && cantidad > stockActual) return showAlert('Aviso', 'Stock insuficiente.', 'warning');

    prod.variantes[varIndex].stock += (tipo === 'entrada' ? cantidad : -cantidad);
    
    try {
        await updateDoc(doc(db, "inventario", prodId), { variantes: prod.variantes });
        await addDoc(collection(db, "movimientos_inventario"), {
            userId: currentUser.uid, productoId: prodId, productoNombre: prod.nombre,
            medida: prod.variantes[varIndex].medida, tipo, cantidad,
            comentario, codigoGeneracion: codGen, numeroDTE: numDte, fecha: new Date().toISOString()
        });
        showAlert('Éxito', 'Movimiento registrado.', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modal-movimiento')).hide();
        await cargarProductos();
    } catch (e) { showAlert('Error', e.message, 'danger'); }
};

window.copiarEnlacePublico = function() {
    // Ahora el enlace apunta a catalogo.html
    const baseUrl = window.location.origin + window.location.pathname.replace('inventario.html', '');
    const publicUrl = `${baseUrl}catalogo.html?uid=${currentUser.uid}`;
    navigator.clipboard.writeText(publicUrl).then(() => {
        showAlert('Éxito', 'Enlace del catálogo copiado.', 'success');
    });
};
