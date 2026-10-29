import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAHoBtvREojg4moDy3nOfzg_kVdFzZNngw",
  authDomain: "recibos-arquipor.firebaseapp.com",
  projectId: "recibos-arquipor",
  storageBucket: "recibos-arquipor.firebasestorage.app",
  messagingSenderId: "430281363537",
  appId: "1:430281363537:web:d30dc376ffab395a1f6870"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let productosCache = []; 
let categoriasCache = [];
let productoEditandoId = null;

// ==========================================
// UTILIDADES (MODALES BOOTSTRAP)
// ==========================================
function showAlert(titulo, mensaje, tipo = 'primary') {
    // Crear un toast de Bootstrap dinámico
    const toastHTML = `
        <div class="toast align-items-center text-bg-${tipo} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    <strong>${titulo}:</strong> ${mensaje}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    const container = document.createElement('div');
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.innerHTML = toastHTML;
    document.body.appendChild(container);
    const toastElement = container.querySelector('.toast');
    const bsToast = new bootstrap.Toast(toastElement, { delay: 3000 });
    bsToast.show();
    toastElement.addEventListener('hidden.bs.toast', () => container.remove());
}

function showConfirm(mensaje) {
    return new Promise((resolve) => {
        document.getElementById('confirmacion-mensaje').innerHTML = mensaje;
        const modalEl = document.getElementById('modal-confirmacion');
        const modal = new bootstrap.Modal(modalEl);
        
        const btnConfirm = document.getElementById('btn-confirmar-accion');
        // Clonar el botón para eliminar event listeners antiguos
        const newBtn = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
        
        newBtn.addEventListener('click', () => {
            modal.hide();
            resolve(true);
        });

        modalEl.addEventListener('hidden.bs.modal', () => {
            resolve(false);
        }, { once: true });

        modal.show();
    });
}

// ==========================================
// INICIALIZACIÓN Y FLUJO (PÚBLICO / PRIVADO)
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const isPublicView = urlParams.get('publico') === 'true';
const publicUid = urlParams.get('uid');

if (isPublicView && publicUid) {
    // MODO PÚBLICO
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('public-container').style.display = 'block';
    cargarInventarioPublico(publicUid);
} else {
    // MODO PRIVADO (AUTH)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            document.getElementById('user-email-display').textContent = user.email;
            inicializarAppPrivada();
        } else {
            document.getElementById('auth-container').style.display = 'flex';
            document.getElementById('app-container').style.display = 'none';
        }
    });
}

window.login = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (error) { showAlert('Error', error.message, 'danger'); }
};

window.register = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try { await createUserWithEmailAndPassword(auth, email, password); } 
    catch (error) { showAlert('Error', error.message, 'danger'); }
};

window.logout = function() { signOut(auth); };

// ==========================================
// VISTA PÚBLICA (SOLO LECTURA)
// ==========================================
async function cargarInventarioPublico(uid) {
    const grid = document.getElementById('public-inventario-grid');
    grid.innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-primary"></div></div>';

    const q = query(collection(db, "inventario"), where("userId", "==", uid));
    const snapshot = await getDocs(q);
    
    grid.innerHTML = '';

    if (snapshot.empty) {
        grid.innerHTML = '<div class="col-12 text-center text-muted">Catálogo vacío.</div>';
        return;
    }

    let prods = [];
    snapshot.forEach(doc => prods.push(doc.data()));
    prods.sort((a, b) => a.nombre.localeCompare(b.nombre));

    prods.forEach(prod => {
        let variantesHTML = '';
        prod.variantes.forEach(v => {
            const stockText = v.stock > 0 ? `<span class="text-success">Disponible: ${v.stock}</span>` : `<span class="text-danger">Agotado</span>`;
            variantesHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">
                ${v.medida} - $${v.precio.toFixed(2)} <small>${stockText}</small>
            </li>`;
        });

        const imgSrc = prod.fotoUrl ? prod.fotoUrl : 'https://via.placeholder.com/300x200?text=Sin+Foto';

        grid.innerHTML += `
            <div class="col-md-4 mb-4">
                <div class="card public-card h-100 shadow-sm border-0">
                    <img src="${imgSrc}" class="card-img-top public-img" onerror="this.src='https://via.placeholder.com/300x200?text=Error'">
                    <div class="card-body">
                        <span class="badge bg-secondary mb-2">${prod.categoria}</span>
                        <h5 class="card-title fw-bold">${prod.nombre}</h5>
                    </div>
                    <ul class="list-group list-group-flush">
                        ${variantesHTML}
                    </ul>
                </div>
            </div>
        `;
    });
}

window.copiarEnlacePublico = function() {
    const baseUrl = window.location.origin + window.location.pathname;
    const publicUrl = `${baseUrl}?publico=true&uid=${currentUser.uid}`;
    
    navigator.clipboard.writeText(publicUrl).then(() => {
        showAlert('Éxito', 'Enlace copiado al portapapeles. Compártelo con tus clientes.', 'success');
    }).catch(err => {
        showAlert('Enlace de tu catálogo', publicUrl, 'info'); // Fallback
    });
};

// ==========================================
// MODO PRIVADO (GESTIÓN)
// ==========================================
async function inicializarAppPrivada() {
    await cargarCategorias();
    await cargarProductos();
}

// --- CATEGORÍAS ---
async function cargarCategorias() {
    const q = query(collection(db, "categorias"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    categoriasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Llenar el select del producto
    const select = document.getElementById('prod-categoria');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    categoriasCache.forEach(c => {
        select.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`;
    });

    // Llenar la lista del modal de categorías
    const lista = document.getElementById('lista-categorias');
    lista.innerHTML = '';
    categoriasCache.forEach(c => {
        lista.innerHTML += `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${c.nombre}
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarCategoria('${c.id}')">🗑️</button>
            </li>
        `;
    });
}

window.abrirModalCategoria = () => new bootstrap.Modal(document.getElementById('modal-categoria')).show();

window.guardarCategoria = async function() {
    const nombre = document.getElementById('nueva-categoria-nombre').value.trim();
    if (!nombre) return showAlert('Aviso', 'Escribe un nombre de categoría', 'warning');
    
    const existe = categoriasCache.some(c => c.nombre.toLowerCase() === nombre.toLowerCase());
    if (existe) return showAlert('Aviso', 'Esa categoría ya existe.', 'warning');

    await addDoc(collection(db, "categorias"), { userId: currentUser.uid, nombre });
    document.getElementById('nueva-categoria-nombre').value = '';
    await cargarCategorias();
};

window.eliminarCategoria = async function(id) {
    const confirmado = await showConfirm('¿Seguro que deseas eliminar esta categoría? Los productos que la usen no se borrarán, pero perderán la etiqueta.');
    if (confirmado) {
        await deleteDoc(doc(db, "categorias", id));
        await cargarCategorias();
    }
};

// --- PRODUCTOS ---
async function cargarProductos() {
    const tbody = document.getElementById('tabla-inventario');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando inventario...</td></tr>';
    
    const q = query(collection(db, "inventario"), where("userId", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    
    productosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    productosCache.sort((a, b) => a.nombre.localeCompare(b.nombre));

    tbody.innerHTML = '';

    if(productosCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay productos registrados.</td></tr>';
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

        const imgSrc = prod.fotoUrl ? prod.fotoUrl : 'https://via.placeholder.com/45?text=No';

        tbody.innerHTML += `
            <tr>
                <td><img src="${imgSrc}" class="img-thumb" onerror="this.src='https://via.placeholder.com/45?text=Err'"></td>
                <td class="fw-bold">${prod.nombre}</td>
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
    } else {
        container.style.display = 'none';
    }
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
    const fotoUrl = document.getElementById('prod-foto-url').value.trim();
    
    if (!nombre || !categoria) return showAlert('Aviso', 'Nombre y Categoría son obligatorios.', 'warning');

    const filas = document.querySelectorAll('.variante-row');
    const variantes = [];
    
    filas.forEach(fila => {
        const medida = fila.querySelector('.var-medida').value.trim();
        const precio = parseFloat(fila.querySelector('.var-precio').value);
        const stock = parseInt(fila.querySelector('.var-stock').value) || 0;
        
        if (medida && !isNaN(precio)) {
            variantes.push({ medida, precio, stock });
        }
    });

    if (variantes.length === 0) return showAlert('Aviso', 'Agrega al menos una variante válida.', 'warning');

    const payload = {
        userId: currentUser.uid, nombre, categoria, fotoUrl, variantes,
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
    } catch (e) {
        showAlert('Error', e.message, 'danger');
    }
};

window.editarProducto = function(id) {
    const prod = productosCache.find(p => p.id === id);
    if (!prod) return;

    productoEditandoId = id;
    document.getElementById('modal-prod-titulo').textContent = 'Editar Producto';
    document.getElementById('prod-nombre').value = prod.nombre;
    document.getElementById('prod-categoria').value = prod.categoria;
    document.getElementById('prod-foto-url').value = prod.fotoUrl || '';
    
    actualizarPreviewFoto();

    document.getElementById('contenedor-variantes').innerHTML = '';
    prod.variantes.forEach(v => agregarFilaVariante(v.medida, v.precio, v.stock));

    new bootstrap.Modal(document.getElementById('modal-producto')).show();
};

window.eliminarProducto = async function(id) {
    const confirmado = await showConfirm('¿Estás seguro de eliminar este producto del inventario?');
    if (confirmado) {
        await deleteDoc(doc(db, "inventario", id));
        await cargarProductos();
        showAlert('Eliminado', 'El producto ha sido borrado.', 'success');
    }
};

// --- MOVIMIENTO DE STOCK ---
window.abrirModalMovimiento = function() {
    const select = document.getElementById('mov-producto');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    productosCache.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
    });
    
    document.getElementById('mov-variante').innerHTML = '<option value="">-- Seleccione producto primero --</option>';
    document.getElementById('mov-cantidad').value = '1';
    document.getElementById('mov-codigo-gen').value = '';
    document.getElementById('mov-num-dte').value = '';
    new bootstrap.Modal(document.getElementById('modal-movimiento')).show();
};

window.cargarVariantesMovimiento = function() {
    const prodId = document.getElementById('mov-producto').value;
    const selectVar = document.getElementById('mov-variante');
    selectVar.innerHTML = '';

    if (!prodId) {
        selectVar.innerHTML = '<option value="">-- Seleccione producto primero --</option>';
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
    const codGen = document.getElementById('mov-codigo-gen').value.trim();
    const numDte = document.getElementById('mov-num-dte').value.trim();

    if (!prodId || varIndex === "" || isNaN(cantidad) || cantidad <= 0) {
        return showAlert('Aviso', 'Complete todos los campos requeridos.', 'warning');
    }

    const prod = productosCache.find(p => p.id === prodId);
    let stockActual = prod.variantes[varIndex].stock;

    let nuevoStock = stockActual;
    if (tipo === 'entrada') {
        nuevoStock += cantidad;
    } else {
        if (cantidad > stockActual) return showAlert('Aviso', 'No hay suficiente stock para esta salida.', 'warning');
        nuevoStock -= cantidad;
    }

    prod.variantes[varIndex].stock = nuevoStock;
    
    try {
        // Actualizar stock del producto
        await updateDoc(doc(db, "inventario", prodId), {
            variantes: prod.variantes
        });

        // Guardar log del movimiento (opcional pero útil)
        await addDoc(collection(db, "movimientos_inventario"), {
            userId: currentUser.uid,
            productoId: prodId,
            productoNombre: prod.nombre,
            medida: prod.variantes[varIndex].medida,
            tipo: tipo,
            cantidad: cantidad,
            codigoGeneracion: codGen,
            numeroDTE: numDte,
            fecha: new Date().toISOString()
        });

        showAlert('Éxito', 'Movimiento registrado exitosamente.', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modal-movimiento')).hide();
        await cargarProductos();
    } catch (e) {
        showAlert('Error', e.message, 'danger');
    }
};
