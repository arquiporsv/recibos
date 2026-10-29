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
let productoEditandoId = null;

// ==========================================
// AUTENTICACIÓN
// ==========================================
window.login = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (error) { document.getElementById('auth-message').textContent = "Error: " + error.message; }
};

window.register = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try { await createUserWithEmailAndPassword(auth, email, password); } 
    catch (error) { document.getElementById('auth-message').textContent = "Error: " + error.message; }
};

window.logout = function() { signOut(auth); };

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        document.getElementById('user-email-display').textContent = user.email;
        inicializarApp();
    } else {
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
});

// ==========================================
// VISTA PREVIA DE LA FOTO POR URL
// ==========================================
window.actualizarPreviewFoto = function() {
    const url = document.getElementById('prod-foto-url').value.trim();
    const container = document.getElementById('preview-foto-container');
    const img = document.getElementById('preview-foto');

    if (url) {
        img.src = url;
        container.style.display = 'block';
        
        // Si la imagen falla (link roto), ocultar
        img.onerror = () => {
            container.style.display = 'none';
        };
    } else {
        container.style.display = 'none';
    }
};

// ==========================================
// INVENTARIO
// ==========================================
async function inicializarApp() {
    await cargarProductos();
}

async function cargarProductos() {
    const tbody = document.getElementById('tabla-inventario');
    tbody.innerHTML = '<tr><td colspan="6">Cargando inventario...</td></tr>';
    
    const q = query(collection(db, "inventario"), where("userId", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    
    productosCache = [];
    tbody.innerHTML = '';

    if(snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay productos registrados.</td></tr>';
        return;
    }

    snapshot.forEach(doc => {
        productosCache.push({ id: doc.id, ...doc.data() });
    });

    productosCache.sort((a, b) => a.nombre.localeCompare(b.nombre));

    productosCache.forEach(prod => {
        let stockTotal = 0;
        let variantesHTML = '';

        prod.variantes.forEach(v => {
            stockTotal += v.stock;
            const colorStock = v.stock <= 0 ? 'stock-out' : 'stock-in';
            variantesHTML += `<span class="badge">${v.medida}: $${v.precio.toFixed(2)} | <span class="${colorStock}">${v.stock} uds</span></span>`;
        });

        // Si no hay foto o el link está roto, usamos un placeholder
        const imgSrc = prod.fotoUrl ? prod.fotoUrl : 'https://via.placeholder.com/40?text=Sin+Foto';

        tbody.innerHTML += `
            <tr>
                <td><img src="${imgSrc}" class="img-thumb" onerror="this.src='https://via.placeholder.com/40?text=Error'"></td>
                <td><b>${prod.nombre}</b></td>
                <td>${prod.categoria}</td>
                <td>${variantesHTML}</td>
                <td><b>${stockTotal}</b></td>
                <td>
                    <button onclick="editarProducto('${prod.id}')" class="btn-draft btn-sm">✏️ Editar</button>
                    <button onclick="eliminarProducto('${prod.id}')" class="btn-clear btn-sm">🗑️</button>
                </td>
            </tr>
        `;
    });
}

// ==========================================
// MODAL PRODUCTO
// ==========================================
window.abrirModalProducto = function() {
    productoEditandoId = null;
    document.getElementById('modal-prod-titulo').textContent = 'Nuevo Producto';
    document.getElementById('prod-nombre').value = '';
    document.getElementById('prod-categoria').value = '';
    document.getElementById('prod-foto-url').value = '';
    document.getElementById('preview-foto-container').style.display = 'none';
    document.getElementById('contenedor-variantes').innerHTML = '';
    
    agregarFilaVariante();
    document.getElementById('modal-producto').style.display = 'block';
};

window.cerrarModalProducto = () => document.getElementById('modal-producto').style.display = 'none';

window.agregarFilaVariante = function(medida = '', precio = '', stock = '') {
    const container = document.getElementById('contenedor-variantes');
    const div = document.createElement('div');
    div.className = 'variante-row';
    div.innerHTML = `
        <input type="text" placeholder="Medida (Ej. S, M, Grande)" value="${medida}" class="var-medida">
        <input type="number" placeholder="Precio $" step="0.01" value="${precio}" class="var-precio">
        <input type="number" placeholder="Stock inicial" value="${stock}" class="var-stock">
        <button class="btn-remove-row" onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(div);
};

window.guardarProducto = async function() {
    const nombre = document.getElementById('prod-nombre').value.trim();
    const categoria = document.getElementById('prod-categoria').value.trim();
    const fotoUrl = document.getElementById('prod-foto-url').value.trim();
    
    if (!nombre || !categoria) return alert("Nombre y Categoría son obligatorios.");

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

    if (variantes.length === 0) return alert("Debes agregar al menos una variante con medida y precio válido.");

    const payload = {
        userId: currentUser.uid,
        nombre,
        categoria,
        fotoUrl, // Guardamos el enlace de texto, no la imagen
        variantes,
        fechaActualizacion: new Date().toISOString()
    };

    try {
        if (productoEditandoId) {
            await updateDoc(doc(db, "inventario", productoEditandoId), payload);
            alert("Producto actualizado correctamente.");
        } else {
            payload.fechaCreacion = new Date().toISOString();
            await addDoc(collection(db, "inventario"), payload);
            alert("Producto creado correctamente.");
        }
        cerrarModalProducto();
        await cargarProductos();
    } catch (e) {
        alert("Error al guardar: " + e.message);
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

    document.getElementById('modal-producto').style.display = 'block';
};

window.eliminarProducto = async function(id) {
    if(confirm("¿Estás seguro de eliminar este producto del inventario?")) {
        await deleteDoc(doc(db, "inventario", id));
        await cargarProductos();
    }
};

// ==========================================
// MOVIMIENTO DE STOCK
// ==========================================
window.abrirModalMovimiento = function() {
    const select = document.getElementById('mov-producto');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    productosCache.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
    });
    
    document.getElementById('mov-variante').innerHTML = '<option value="">-- Seleccione producto primero --</option>';
    document.getElementById('mov-cantidad').value = '1';
    document.getElementById('modal-movimiento').style.display = 'block';
};

window.cerrarModalMovimiento = () => document.getElementById('modal-movimiento').style.display = 'none';

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
        selectVar.innerHTML += `<option value="${index}">${v.medida} (Stock actual: ${v.stock})</option>`;
    });
};

window.registrarMovimiento = async function() {
    const prodId = document.getElementById('mov-producto').value;
    const varIndex = document.getElementById('mov-variante').value;
    const tipo = document.getElementById('mov-tipo').value;
    const cantidad = parseInt(document.getElementById('mov-cantidad').value);

    if (!prodId || varIndex === "" || isNaN(cantidad) || cantidad <= 0) {
        return alert("Complete todos los campos correctamente.");
    }

    const prod = productosCache.find(p => p.id === prodId);
    let stockActual = prod.variantes[varIndex].stock;

    let nuevoStock = stockActual;
    if (tipo === 'entrada') {
        nuevoStock += cantidad;
    } else {
        if (cantidad > stockActual) return alert("No hay suficiente stock para realizar esta salida.");
        nuevoStock -= cantidad;
    }

    prod.variantes[varIndex].stock = nuevoStock;
    
    try {
        await updateDoc(doc(db, "inventario", prodId), {
            variantes: prod.variantes
        });
        alert("Movimiento registrado exitosamente.");
        cerrarModalMovimiento();
        await cargarProductos();
    } catch (e) {
        alert("Error al registrar movimiento: " + e.message);
    }
};
