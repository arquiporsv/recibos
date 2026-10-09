// ==========================================
// 1. IMPORTACIONES DE FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================
// 2. CONFIGURACIÓN DE FIREBASE
// ==========================================
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

// Variables Globales
let currentUser = null;
let receiverSignature, payerSignature;
let productosGlobal = [];
let itemsFactura = [];
let abonosFactura = [];
let facturaEditandoId = null;

// ==========================================
// 3. AUTENTICACIÓN
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
        document.getElementById('app-container').style.display = 'block';
        document.getElementById('user-email-display').textContent = user.email;
        inicializarApp();
    } else {
        currentUser = null;
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
});

// ==========================================
// 4. NAVEGACIÓN
// ==========================================
window.switchTab = function(tab) {
    document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    if (tab === 'recibos') {
        document.getElementById('view-recibos').style.display = 'block';
        document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
    } else {
        document.getElementById('view-facturas').style.display = 'block';
        document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
        cargarListaFacturas();
    }
};

// ==========================================
// 5. INICIALIZACIÓN DE LA APP
// ==========================================
async function inicializarApp() {
    receiverSignature = new SmoothSignature(document.querySelector("#signature-receiver"));
    payerSignature = new SmoothSignature(document.querySelector("#signature-payer"));
    await cargarCorrelativo();
    await cargarPersonasFrecuentes();
    await cargarProductos();
    await cargarCorrelativoFactura();
}

// ==========================================
// 6. MÓDULO DE RECIBOS
// ==========================================
async function cargarCorrelativo() {
    const docRef = doc(db, "configuracion", "correlativo");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) document.getElementById('receipt-number-value').textContent = docSnap.data().valor;
    else { await setDoc(docRef, { valor: 47 }); document.getElementById('receipt-number-value').textContent = 47; }
}
async function incrementarCorrelativo() {
    const docRef = doc(db, "configuracion", "correlativo");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const nuevo = docSnap.data().valor + 1;
        await setDoc(docRef, { valor: nuevo });
        document.getElementById('receipt-number-value').textContent = nuevo;
    }
}
window.guardarPersonaFrecuente = async function() {
    const nombre = document.getElementById('nombre').value.trim();
    const dui = document.getElementById('dui').value.trim();
    if (!nombre || !dui) return alert("Ingrese Nombre y DUI.");
    await addDoc(collection(db, "personas"), { nombre, dui, userId: currentUser.uid });
    alert("Guardado."); await cargarPersonasFrecuentes();
};
async function cargarPersonasFrecuentes() {
    const select = document.getElementById('personas-frecuentes');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    const q = query(collection(db, "personas"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    snap.forEach(doc => {
        const p = doc.data();
        select.innerHTML += `<option value="${doc.id}">${p.nombre} (${p.dui})</option>`;
    });
    select.onchange = (e) => {
        const id = e.target.value;
        if (id) {
            const p = snap.docs.find(d => d.id === id).data();
            document.getElementById('nombre').value = p.nombre;
            document.getElementById('dui').value = p.dui;
        }
    };
}
window.guardarBorrador = async function() {
    const borrador = {
        userId: currentUser.uid, fecha: document.getElementById('fecha').value,
        nombre: document.getElementById('nombre').value, dui: document.getElementById('dui').value,
        concepto: document.getElementById('concepto').value, monto: document.getElementById('monto').value,
        firmaRecibe: receiverSignature.toDataURL(), firmaPaga: payerSignature.toDataURL(),
        fechaGuardado: new Date().toISOString()
    };
    await addDoc(collection(db, "borradores"), borrador);
    alert("Borrador guardado.");
};
window.abrirModalBorradores = async function() {
    const modal = document.getElementById('modal-borradores');
    const lista = document.getElementById('lista-borradores');
    lista.innerHTML = 'Cargando...'; modal.style.display = 'block';
    const q = query(collection(db, "borradores"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    lista.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        lista.innerHTML += `<div class="borrador-item"><span><b>${d.nombre || 'Sin nombre'}</b> - $${d.monto || '0'}</span><div><button onclick="cargarBorrador('${doc.id}')" class="btn-pdf">Cargar</button><button onclick="eliminarBorrador('${doc.id}')" class="btn-clear">Eliminar</button></div></div>`;
    });
};
window.cerrarModalBorradores = () => document.getElementById('modal-borradores').style.display = 'none';
window.cargarBorrador = async function(id) {
    const docSnap = await getDoc(doc(db, "borradores", id));
    if (docSnap.exists()) {
        const d = docSnap.data();
        document.getElementById('fecha').value = d.fecha || '';
        document.getElementById('nombre').value = d.nombre || '';
        document.getElementById('dui').value = d.dui || '';
        document.getElementById('concepto').value = d.concepto || '';
        document.getElementById('monto').value = d.monto || '';
        receiverSignature.clear(); payerSignature.clear();
        if (d.firmaRecibe) { const img = new Image(); img.onload = () => document.getElementById('signature-receiver').getContext('2d').drawImage(img,0,0); img.src = d.firmaRecibe; }
        if (d.firmaPaga) { const img = new Image(); img.onload = () => document.getElementById('signature-payer').getContext('2d').drawImage(img,0,0); img.src = d.firmaPaga; }
        cerrarModalBorradores();
    }
};
window.eliminarBorrador = async (id) => { if(confirm("¿Eliminar?")) { await deleteDoc(doc(db, "borradores", id)); abrirModalBorradores(); } };
window.limpiarFormulario = function() {
    if (!confirm("¿Limpiar?")) return;
    ['fecha','nombre','dui','concepto','monto'].forEach(id => document.getElementById(id).value = '');
    receiverSignature.clear(); payerSignature.clear();
};
window.clearSignature = (t) => { if(t==='receiver') receiverSignature.clear(); if(t==='payer') payerSignature.clear(); };

window.descargarPDF = async function() {
    const nombre = document.getElementById('nombre').value.trim();
    const monto = document.getElementById('monto').value.trim();
    if (!nombre || !monto) return alert("Complete Nombre y Monto.");
    
    const elemento = document.getElementById('receipt-container');
    const correlativo = document.getElementById('receipt-number-value').textContent;
    const opciones = { margin: 0, filename: `Recibo_${correlativo}_${nombre.replace(/\s+/g, '_')}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' } };

    document.querySelectorAll('.clear-sig').forEach(b => b.style.display = 'none');

    try {
        const pdfWorker = html2pdf().set(opciones).from(elemento);
        const pdfDataUri = await pdfWorker.toPdf().get('pdf').then(pdf => pdf.output('datauristring'));
        await pdfWorker.save();

        await addDoc(collection(db, "recibos_pdfs"), {
            userId: currentUser.uid, correlativo: correlativo, nombre: nombre, monto: monto,
            fecha: document.getElementById('fecha').value || new Date().toISOString().split('T')[0],
            pdfBase64: pdfDataUri
        });

        await incrementarCorrelativo();
        limpiarFormulario();
        alert("PDF generado, descargado y guardado en la nube exitosamente.");
    } catch (e) { alert("Error: " + e.message); } 
    finally { document.querySelectorAll('.clear-sig').forEach(b => b.style.display = 'block'); }
};

// ==========================================
// 7. MÓDULO DE FACTURAS (SIMULADOR)
// ==========================================

// --- 7.1 Productos (Solo Nombres) ---
async function cargarProductos() {
    const q = query(collection(db, "productos"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    productosGlobal = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    actualizarSelectProductos();
    renderizarTablaProductos();
}

function actualizarSelectProductos() {
    const select = document.getElementById('select-producto');
    select.innerHTML = '<option value="">-- Seleccionar Producto --</option>';
    productosGlobal.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
    });
}

function renderizarTablaProductos() {
    const tbody = document.getElementById('cuerpo-productos');
    tbody.innerHTML = '';
    productosGlobal.forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td>${p.nombre}</td>
                <td><button onclick="eliminarProducto('${p.id}')" class="btn-clear">Eliminar</button></td>
            </tr>`;
    });
}

window.abrirModalProductos = () => { document.getElementById('modal-productos').style.display = 'block'; cargarProductos(); };
window.cerrarModalProductos = () => document.getElementById('modal-productos').style.display = 'none';

window.importarExcel = function() {
    const fileInput = document.getElementById('excel-file');
    const file = fileInput.files[0];
    if (!file) return alert("Seleccione un archivo Excel.");

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        let importados = 0;
        for (const row of jsonData) {
            // Buscamos cualquier columna que se llame Nombre, nombre, Producto, etc.
            const nombre = row.Nombre || row.nombre || row.NOMBRE || row.Producto || row.producto || row.PRODUCTO;
            if (nombre) {
                await addDoc(collection(db, "productos"), { userId: currentUser.uid, nombre });
                importados++;
            }
        }
        alert(`Se importaron ${importados} productos.`);
        fileInput.value = '';
        await cargarProductos();
    };
    reader.readAsArrayBuffer(file);
};

window.agregarProductoManual = async function() {
    const nombre = document.getElementById('prod-nombre').value.trim();
    if (!nombre) return alert("Ingrese el nombre del producto.");
    
    await addDoc(collection(db, "productos"), { userId: currentUser.uid, nombre });
    document.getElementById('prod-nombre').value = '';
    await cargarProductos();
};

window.eliminarProducto = async function(id) {
    if (confirm("¿Eliminar producto?")) { await deleteDoc(doc(db, "productos", id)); await cargarProductos(); }
};

// --- 7.2 Facturas ---
async function cargarCorrelativoFactura() {
    const docRef = doc(db, "configuracion", "correlativoFactura");
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) { await setDoc(docRef, { valor: 1 }); }
}

window.nuevaFactura = function() {
    facturaEditandoId = null;
    itemsFactura = []; abonosFactura = [];
    document.getElementById('factura-tipo').value = 'Consumidor Final';
    document.getElementById('factura-cliente-nombre').value = '';
    document.getElementById('factura-cliente-nit').value = '';
    document.getElementById('factura-cliente-nrc').value = '';
    document.getElementById('factura-cliente-dui').value = '';
    document.getElementById('factura-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('modo-edicion-badge').style.display = 'none';
    document.getElementById('formulario-factura').style.display = 'block';
    document.getElementById('lista-facturas-container').style.display = 'none';
    document.getElementById('factura-correlativo').textContent = 'NUEVA';
    toggleRetencion();
    renderizarItemsFactura();
    renderizarAbonosFactura();
};

window.cancelarEdicion = function() {
    document.getElementById('formulario-factura').style.display = 'none';
    document.getElementById('lista-facturas-container').style.display = 'block';
    cargarListaFacturas();
};

function toggleRetencion() {
    const tipo = document.getElementById('factura-tipo').value;
    const filaRetencion = document.getElementById('fila-retencion');
    if (tipo === 'Gran Contribuyente') filaRetencion.style.display = 'flex';
    else filaRetencion.style.display = 'none';
    calcularTotalesFactura();
}

window.agregarItemFactura = function() {
    const prodId = document.getElementById('select-producto').value;
    const cantidad = parseInt(document.getElementById('cantidad-producto').value);
    const precioConIva = parseFloat(document.getElementById('precio-con-iva-item').value);

    if (!prodId || cantidad < 1 || isNaN(precioConIva)) return alert("Seleccione producto, cantidad y escriba el precio con IVA.");

    const prod = productosGlobal.find(p => p.id === prodId);
    if (!prod) return;

    // Cálculo inverso para El Salvador (IVA 13%)
    const precioSinIva = precioConIva / 1.13;
    const totalSinIva = precioSinIva * cantidad;

    itemsFactura.push({
        nombre: prod.nombre,
        cantidad: cantidad,
        precioConIva: precioConIva,
        precioSinIva: precioSinIva,
        totalSinIva: totalSinIva
    });

    document.getElementById('select-producto').value = '';
    document.getElementById('cantidad-producto').value = '1';
    document.getElementById('precio-con-iva-item').value = '';
    renderizarItemsFactura();
};

function renderizarItemsFactura() {
    const tbody = document.getElementById('cuerpo-items');
    tbody.innerHTML = '';
    itemsFactura.forEach((item, index) => {
        tbody.innerHTML += `
            <tr>
                <td>${item.cantidad}</td>
                <td>${item.nombre}</td>
                <td>$${item.precioConIva.toFixed(2)}</td>
                <td>$${item.precioSinIva.toFixed(2)}</td>
                <td>$${item.totalSinIva.toFixed(2)}</td>
                <td class="no-print"><button onclick="eliminarItemFactura(${index})" class="btn-clear" style="padding:2px 6px; font-size:12px;">X</button></td>
            </tr>`;
    });
    calcularTotalesFactura();
}

window.eliminarItemFactura = function(index) {
    itemsFactura.splice(index, 1);
    renderizarItemsFactura();
};

function calcularTotalesFactura() {
    const subtotal = itemsFactura.reduce((sum, item) => sum + item.totalSinIva, 0);
    const iva = subtotal * 0.13;
    const totalConIva = subtotal + iva;
    
    const tipo = document.getElementById('factura-tipo').value;
    const retencion = tipo === 'Gran Contribuyente' ? subtotal * 0.01 : 0;
    const totalPagar = totalConIva - retencion;

    document.getElementById('factura-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('factura-iva').textContent = `$${iva.toFixed(2)}`;
    document.getElementById('factura-total-con-iva').textContent = `$${totalConIva.toFixed(2)}`;
    document.getElementById('factura-retencion').textContent = `$${retencion.toFixed(2)}`;
    document.getElementById('factura-total-pagar').textContent = `$${totalPagar.toFixed(2)}`;

    renderizarAbonosFactura();
}

// --- 7.3 Abonos ---
window.agregarAbono = function() {
    const metodo = document.getElementById('abono-metodo').value;
    const fecha = document.getElementById('abono-fecha').value || new Date().toISOString().split('T')[0];
    const monto = parseFloat(document.getElementById('abono-monto').value);

    if (isNaN(monto) || monto <= 0) return alert("Ingrese un monto de abono válido.");

    abonosFactura.push({ metodo, fecha, monto });
    document.getElementById('abono-monto').value = '';
    renderizarAbonosFactura();
};

function renderizarAbonosFactura() {
    const tbody = document.getElementById('cuerpo-abonos');
    tbody.innerHTML = '';
    
    const totalPagar = parseFloat(document.getElementById('factura-total-pagar').textContent.replace('$', ''));
    
    let totalAbonado = 0;
    abonosFactura.forEach((abono, index) => {
        totalAbonado += abono.monto;
        const porcentaje = totalPagar > 0 ? (abono.monto / totalPagar) * 100 : 0;
        const saldo = totalPagar - totalAbonado;

        tbody.innerHTML += `
            <tr>
                <td>${abono.fecha}</td>
                <td>${abono.metodo}</td>
                <td>$${abono.monto.toFixed(2)}</td>
                <td>${porcentaje.toFixed(2)}%</td>
                <td>$${saldo.toFixed(2)}</td>
                <td class="no-print"><button onclick="eliminarAbono(${index})" class="btn-clear" style="padding:2px 6px; font-size:12px;">X</button></td>
            </tr>`;
    });

    if (abonosFactura.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#999;">No hay abonos registrados</td></tr>';
    }
}

window.eliminarAbono = function(index) {
    abonosFactura.splice(index, 1);
    renderizarAbonosFactura();
};

// --- 7.4 Guardar y Listar Facturas ---
window.guardarFactura = async function() {
    const tipo = document.getElementById('factura-tipo').value;
    const cliente = document.getElementById('factura-cliente-nombre').value.trim();
    if (!cliente) return alert("Ingrese el nombre del cliente.");
    if (itemsFactura.length === 0) return alert("Agregue al menos un producto.");

    const subtotal = itemsFactura.reduce((sum, item) => sum + item.totalSinIva, 0);
    const iva = subtotal * 0.13;
    const totalConIva = subtotal + iva;
    const retencion = tipo === 'Gran Contribuyente' ? subtotal * 0.01 : 0;
    const totalPagar = totalConIva - retencion;
    const totalAbonado = abonosFactura.reduce((sum, a) => sum + a.monto, 0);
    const saldo = totalPagar - totalAbonado;
    const estado = saldo <= 0 ? 'Cancelada' : 'Pendiente';

    const facturaData = {
        userId: currentUser.uid, tipo, cliente,
        nit: document.getElementById('factura-cliente-nit').value,
        nrc: document.getElementById('factura-cliente-nrc').value,
        dui: document.getElementById('factura-cliente-dui').value,
        fecha: document.getElementById('factura-fecha').value,
        items: itemsFactura, abonos: abonosFactura,
        subtotal, iva, totalConIva, retencion, totalPagar,
        totalAbonado, saldo, estado, fechaGuardado: new Date().toISOString()
    };

    if (facturaEditandoId) {
        await updateDoc(doc(db, "facturas", facturaEditandoId), facturaData);
        alert("Simulación actualizada.");
    } else {
        const docRef = doc(db, "configuracion", "correlativoFactura");
        const docSnap = await getDoc(docRef);
        const correlativo = docSnap.data().valor;
        facturaData.correlativo = correlativo;
        await addDoc(collection(db, "facturas"), facturaData);
        await setDoc(docRef, { valor: correlativo + 1 });
        alert(`Simulación guardada con correlativo #${correlativo}.`);
    }
    cancelarEdicion();
};

async function cargarListaFacturas() {
    const tbody = document.getElementById('cuerpo-tabla-facturas');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando...</td></tr>';
    
    const q = query(collection(db, "facturas"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    tbody.innerHTML = '';

    if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay simulaciones guardadas.</td></tr>';
        return;
    }

    snap.forEach(doc => {
        const d = doc.data();
        const badgeClass = d.estado === 'Cancelada' ? 'badge-success' : 'badge-warning';
        tbody.innerHTML += `
            <tr>
                <td>#${d.correlativo}</td>
                <td>${d.cliente}</td>
                <td>${d.tipo}</td>
                <td>$${d.totalPagar.toFixed(2)}</td>
                <td>$${d.totalAbonado.toFixed(2)}</td>
                <td>$${d.saldo.toFixed(2)}</td>
                <td><span class="badge ${badgeClass}">${d.estado}</span></td>
                <td>
                    <button onclick="verFactura('${doc.id}')" class="btn-pdf" style="padding:4px 8px; font-size:12px;">Ver</button>
                    <button onclick="editarFactura('${doc.id}')" class="btn-draft" style="padding:4px 8px; font-size:12px;">Editar</button>
                    <button onclick="eliminarFactura('${doc.id}')" class="btn-clear" style="padding:4px 8px; font-size:12px;">Eliminar</button>
                </td>
            </tr>`;
    });
}

window.verFactura = async function(id) {
    const docSnap = await getDoc(doc(db, "facturas", id));
    if (!docSnap.exists()) return;
    const d = docSnap.data();

    facturaEditandoId = id;
    itemsFactura = d.items || [];
    abonosFactura = d.abonos || [];

    document.getElementById('factura-tipo').value = d.tipo;
    document.getElementById('factura-cliente-nombre').value = d.cliente;
    document.getElementById('factura-cliente-nit').value = d.nit || '';
    document.getElementById('factura-cliente-nrc').value = d.nrc || '';
    document.getElementById('factura-cliente-dui').value = d.dui || '';
    document.getElementById('factura-fecha').value = d.fecha;
    document.getElementById('factura-correlativo').textContent = d.correlativo;
    
    document.getElementById('formulario-factura').style.display = 'block';
    document.getElementById('lista-facturas-container').style.display = 'none';
    document.getElementById('modo-edicion-badge').textContent = 'Modo Solo Lectura';
    document.getElementById('modo-edicion-badge').className = 'badge badge-danger';
    document.getElementById('modo-edicion-badge').style.display = 'inline-block';
    
    document.querySelectorAll('#formulario-factura input, #formulario-factura select, #formulario-factura button:not(.btn-clear)').forEach(el => el.disabled = true);

    toggleRetencion();
    renderizarItemsFactura();
    renderizarAbonosFactura();
};

window.editarFactura = async function(id) {
    const docSnap = await getDoc(doc(db, "facturas", id));
    if (!docSnap.exists()) return;
    const d = docSnap.data();

    facturaEditandoId = id;
    itemsFactura = d.items || [];
    abonosFactura = d.abonos || [];

    document.getElementById('factura-tipo').value = d.tipo;
    document.getElementById('factura-cliente-nombre').value = d.cliente;
    document.getElementById('factura-cliente-nit').value = d.nit || '';
    document.getElementById('factura-cliente-nrc').value = d.nrc || '';
    document.getElementById('factura-cliente-dui').value = d.dui || '';
    document.getElementById('factura-fecha').value = d.fecha;
    document.getElementById('factura-correlativo').textContent = d.correlativo;
    
    document.getElementById('formulario-factura').style.display = 'block';
    document.getElementById('lista-facturas-container').style.display = 'none';
    document.getElementById('modo-edicion-badge').textContent = 'Modo Edición';
    document.getElementById('modo-edicion-badge').className = 'badge badge-warning';
    document.getElementById('modo-edicion-badge').style.display = 'inline-block';
    
    document.querySelectorAll('#formulario-factura input, #formulario-factura select, #formulario-factura button:not(.btn-clear)').forEach(el => el.disabled = false);

    toggleRetencion();
    renderizarItemsFactura();
    renderizarAbonosFactura();
};

window.eliminarFactura = async function(id) {
    if (confirm("¿Eliminar esta simulación de factura permanentemente?")) {
        await deleteDoc(doc(db, "facturas", id));
        cargarListaFacturas();
    }
};

// Inicializar fecha de abono por defecto
document.getElementById('abono-fecha').value = new Date().toISOString().split('T')[0];
