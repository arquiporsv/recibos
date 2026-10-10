// ==========================================
// IMPORTACIONES DE FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================
// CONFIGURACIÓN DE FIREBASE
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

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let currentUser = null;
let receiverSignature, payerSignature;
let productosGlobal = [];
let nombresGlobal = [];
let itemsFactura = [];
let abonosFactura = [];
let facturaEditandoId = null;
let recibosGeneradosGlobal = [];

const fmt5 = (n) => '$' + (parseFloat(n) || 0).toFixed(5);

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
// NAVEGACIÓN
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
// INICIALIZACIÓN
// ==========================================
async function inicializarApp() {
    receiverSignature = new SmoothSignature(document.querySelector("#signature-receiver"));
    payerSignature = new SmoothSignature(document.querySelector("#signature-payer"));
    await cargarCorrelativo();
    await cargarPersonasFrecuentes();
    await cargarProductos();
    await cargarNombres();
    await cargarCorrelativoFactura();
}

// ==========================================
// RECIBOS - CORRELATIVO
// ==========================================
async function cargarCorrelativo() {
    const docRef = doc(db, "configuracion", "correlativo");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        document.getElementById('receipt-number-value').textContent = docSnap.data().valor;
    } else {
        await setDoc(docRef, { valor: 47 });
        document.getElementById('receipt-number-value').textContent = 47;
    }
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

// ==========================================
// RECIBOS - PERSONAS FRECUENTES
// ==========================================
window.guardarPersonaFrecuente = async function() {
    const nombre = document.getElementById('nombre').value.trim();
    const dui = document.getElementById('dui').value.trim();
    if (!nombre || !dui) return alert("Ingrese Nombre y DUI.");
    await addDoc(collection(db, "personas"), { nombre, dui, userId: currentUser.uid });
    alert("Guardado.");
    await cargarPersonasFrecuentes();
};

async function cargarPersonasFrecuentes() {
    const select = document.getElementById('personas-frecuentes');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    const q = query(collection(db, "personas"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    snap.forEach(d => {
        const p = d.data();
        select.innerHTML += `<option value="${d.id}">${p.nombre} (${p.dui})</option>`;
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

// ==========================================
// RECIBOS - BORRADORES
// ==========================================
window.guardarBorrador = async function() {
    const borrador = {
        userId: currentUser.uid,
        fecha: document.getElementById('fecha').value,
        nombre: document.getElementById('nombre').value,
        dui: document.getElementById('dui').value,
        concepto: document.getElementById('concepto').value,
        monto: document.getElementById('monto').value,
        firmaRecibe: receiverSignature.toDataURL(),
        firmaPaga: payerSignature.toDataURL(),
        fechaGuardado: new Date().toISOString()
    };
    await addDoc(collection(db, "borradores"), borrador);
    alert("Borrador guardado.");
};

window.abrirModalBorradores = async function() {
    const modal = document.getElementById('modal-borradores');
    const lista = document.getElementById('lista-borradores');
    lista.innerHTML = 'Cargando...';
    modal.style.display = 'block';
    const q = query(collection(db, "borradores"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    lista.innerHTML = '';
    if (snap.empty) {
        lista.innerHTML = '<p style="text-align:center;color:#999;">No hay borradores guardados.</p>';
        return;
    }
    snap.forEach(d => {
        const data = d.data();
        lista.innerHTML += `<div class="borrador-item"><span><b>${data.nombre || 'Sin nombre'}</b> - $${data.monto || '0'}</span><div><button onclick="cargarBorrador('${d.id}')" class="btn-pdf">Cargar</button><button onclick="eliminarBorrador('${d.id}')" class="btn-clear">Eliminar</button></div></div>`;
    });
};

window.cerrarModalBorradores = function() {
    document.getElementById('modal-borradores').style.display = 'none';
};

window.cargarBorrador = async function(id) {
    const docSnap = await getDoc(doc(db, "borradores", id));
    if (docSnap.exists()) {
        const d = docSnap.data();
        document.getElementById('fecha').value = d.fecha || '';
        document.getElementById('nombre').value = d.nombre || '';
        document.getElementById('dui').value = d.dui || '';
        document.getElementById('concepto').value = d.concepto || '';
        document.getElementById('monto').value = d.monto || '';
        receiverSignature.clear();
        payerSignature.clear();
        if (d.firmaRecibe) {
            const img = new Image();
            img.onload = () => document.getElementById('signature-receiver').getContext('2d').drawImage(img, 0, 0);
            img.src = d.firmaRecibe;
        }
        if (d.firmaPaga) {
            const img = new Image();
            img.onload = () => document.getElementById('signature-payer').getContext('2d').drawImage(img, 0, 0);
            img.src = d.firmaPaga;
        }
        cerrarModalBorradores();
    }
};

window.eliminarBorrador = async function(id) {
    if (confirm("¿Eliminar?")) {
        await deleteDoc(doc(db, "borradores", id));
        abrirModalBorradores();
    }
};

// ==========================================
// RECIBOS - LIMPIAR Y FIRMAS
// ==========================================
window.limpiarFormulario = function() {
    if (!confirm("¿Limpiar?")) return;
    ['fecha','nombre','dui','concepto','monto'].forEach(id => document.getElementById(id).value = '');
    receiverSignature.clear();
    payerSignature.clear();
};

window.clearSignature = function(t) {
    if (t === 'receiver') receiverSignature.clear();
    if (t === 'payer') payerSignature.clear();
};

// ==========================================
// RECIBOS - GENERAR Y GUARDAR PDF
// ==========================================
window.descargarPDF = async function() {
    const nombre = document.getElementById('nombre').value.trim();
    const monto = document.getElementById('monto').value.trim();
    if (!nombre || !monto) return alert("Complete Nombre y Monto.");
    const elemento = document.getElementById('receipt-container');
    const correlativo = document.getElementById('receipt-number-value').textContent;
    const opciones = {
        margin: 0,
        filename: `Recibo_${correlativo}_${nombre.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' }
    };
    document.querySelectorAll('.clear-sig').forEach(b => b.style.display = 'none');
    try {
        const pdfWorker = html2pdf().set(opciones).from(elemento);
        const pdfDataUri = await pdfWorker.toPdf().get('pdf').then(pdf => pdf.output('datauristring'));
        await pdfWorker.save();
        await addDoc(collection(db, "recibos_pdfs"), {
            userId: currentUser.uid,
            correlativo: correlativo,
            nombre: nombre,
            monto: monto,
            fecha: document.getElementById('fecha').value || new Date().toISOString().split('T')[0],
            pdfBase64: pdfDataUri
        });
        await incrementarCorrelativo();
        limpiarFormulario();
        alert("PDF generado, descargado y guardado en la nube exitosamente.");
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        document.querySelectorAll('.clear-sig').forEach(b => b.style.display = 'block');
    }
};

// ==========================================
// VISOR DE RECIBOS GENERADOS
// ==========================================
window.abrirModalRecibosGenerados = async function() {
    const modal = document.getElementById('modal-recibos-generados');
    const lista = document.getElementById('lista-recibos-generados');
    lista.innerHTML = '<p style="text-align:center; color:#666;">Cargando...</p>';
    modal.style.display = 'block';
    document.getElementById('buscar-recibo-generado').value = '';

    try {
        const q = query(collection(db, "recibos_pdfs"), where("userId", "==", currentUser.uid));
        const snap = await getDocs(q);
        recibosGeneradosGlobal = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        recibosGeneradosGlobal.sort((a, b) => (parseInt(b.correlativo) || 0) - (parseInt(a.correlativo) || 0));
        renderizarRecibosGenerados(recibosGeneradosGlobal);
    } catch (e) {
        lista.innerHTML = '<p style="color:red;">Error al cargar: ' + e.message + '</p>';
    }
};

window.cerrarModalRecibosGenerados = function() {
    document.getElementById('modal-recibos-generados').style.display = 'none';
};

window.filtrarRecibosGenerados = function() {
    const filtro = document.getElementById('buscar-recibo-generado').value.trim().toLowerCase();
    if (!filtro) {
        renderizarRecibosGenerados(recibosGeneradosGlobal);
        return;
    }
    const filtrados = recibosGeneradosGlobal.filter(r =>
        (r.nombre || '').toLowerCase().includes(filtro) ||
        (r.correlativo || '').toString().includes(filtro) ||
        (r.monto || '').toString().includes(filtro)
    );
    renderizarRecibosGenerados(filtrados);
};

function renderizarRecibosGenerados(lista) {
    const contenedor = document.getElementById('lista-recibos-generados');
    if (!lista || lista.length === 0) {
        contenedor.innerHTML = '<p style="text-align:center; color:#999;">No hay recibos generados que mostrar.</p>';
        return;
    }
    contenedor.innerHTML = lista.map(r => `
        <div class="recibo-generado-item">
            <div class="recibo-generado-info">
                <span class="rg-titulo">Recibo #${r.correlativo || '?'} — ${r.nombre || 'Sin nombre'}</span>
                <span class="rg-detalle">💰 Monto: $${parseFloat(r.monto || 0).toFixed(2)}  |  📅 Fecha: ${r.fecha || 'N/A'}</span>
            </div>
            <div class="recibo-generado-acciones">
                <button onclick="descargarReciboGuardado('${r.id}')" class="btn-pdf">⬇️ Descargar</button>
                <button onclick="eliminarReciboGuardado('${r.id}')" class="btn-clear">🗑️ Eliminar</button>
            </div>
        </div>
    `).join('');
}

window.descargarReciboGuardado = function(id) {
    const recibo = recibosGeneradosGlobal.find(r => r.id === id);
    if (!recibo || !recibo.pdfBase64) return alert("No se encontró el PDF de este recibo.");
    const link = document.createElement('a');
    link.href = recibo.pdfBase64;
    link.download = `Recibo_${recibo.correlativo || 'X'}_${(recibo.nombre || 'cliente').replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.eliminarReciboGuardado = async function(id) {
    if (!confirm("¿Eliminar este recibo definitivamente? Esta acción no se puede deshacer.")) return;
    try {
        await deleteDoc(doc(db, "recibos_pdfs", id));
        recibosGeneradosGlobal = recibosGeneradosGlobal.filter(r => r.id !== id);
        filtrarRecibosGenerados();
    } catch (e) {
        alert("Error al eliminar: " + e.message);
    }
};

// ==========================================
// PRODUCTOS
// ==========================================
async function cargarProductos() {
    const q = query(collection(db, "productos"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    productosGlobal = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    productosGlobal.sort((a, b) => a.nombre.localeCompare(b.nombre));
    actualizarDatalistProductos();
    renderizarTablaProductos();
}

function actualizarDatalistProductos() {
    document.getElementById('lista-productos').innerHTML = productosGlobal.map(p => `<option value="${p.nombre}"></option>`).join('');
}

function renderizarTablaProductos() {
    const tbody = document.getElementById('cuerpo-productos');
    tbody.innerHTML = '';
    productosGlobal.forEach(p => {
        tbody.innerHTML += `<tr><td>${p.nombre}</td><td><button onclick="eliminarProducto('${p.id}')" class="btn-clear">Eliminar</button></td></tr>`;
    });
}

window.abrirModalProductos = function() {
    document.getElementById('modal-productos').style.display = 'block';
    cargarProductos();
};

window.cerrarModalProductos = function() {
    document.getElementById('modal-productos').style.display = 'none';
};

window.limpiarDuplicados = async function() {
    if (!confirm("¿Eliminar todos los productos duplicados? Se conservará el primer registro.")) return;
    const vistos = new Set();
    let eliminados = 0;
    for (const p of productosGlobal) {
        const clave = p.nombre.trim().toLowerCase();
        if (vistos.has(clave)) {
            await deleteDoc(doc(db, "productos", p.id));
            eliminados++;
        } else {
            vistos.add(clave);
        }
    }
    alert(`Se eliminaron ${eliminados} productos duplicados.`);
    await cargarProductos();
};

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
        const existentes = new Set(productosGlobal.map(p => p.nombre.trim().toLowerCase()));
        const procesadosEnEsteExcel = new Set();
        let importados = 0, omitidos = 0;
        for (const row of jsonData) {
            const nombreRaw = row.Nombre || row.nombre || row.NOMBRE || row.Producto || row.producto || row.PRODUCTO;
            if (nombreRaw) {
                const nombre = String(nombreRaw).trim();
                const clave = nombre.toLowerCase();
                if (existentes.has(clave) || procesadosEnEsteExcel.has(clave)) {
                    omitidos++;
                    continue;
                }
                await addDoc(collection(db, "productos"), { userId: currentUser.uid, nombre });
                procesadosEnEsteExcel.add(clave);
                importados++;
            }
        }
        alert(`Se importaron ${importados} productos.\n${omitidos} omitidos por duplicados.`);
        fileInput.value = '';
        await cargarProductos();
    };
    reader.readAsArrayBuffer(file);
};

window.agregarProductoManual = async function() {
    const nombre = document.getElementById('prod-nombre').value.trim();
    if (!nombre) return alert("Ingrese el nombre del producto.");
    const existe = productosGlobal.some(p => p.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (existe) return alert("Este producto ya existe.");
    await addDoc(collection(db, "productos"), { userId: currentUser.uid, nombre });
    document.getElementById('prod-nombre').value = '';
    await cargarProductos();
};

window.eliminarProducto = async function(id) {
    if (confirm("¿Eliminar producto?")) {
        await deleteDoc(doc(db, "productos", id));
        await cargarProductos();
    }
};

// ==========================================
// NOMBRES (Vendedor / Depositante)
// ==========================================
async function cargarNombres() {
    const q = query(collection(db, "nombres"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    nombresGlobal = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    nombresGlobal.sort((a, b) => a.nombre.localeCompare(b.nombre));
    actualizarDatalistNombres();
    renderizarTablaNombres();
}

function actualizarDatalistNombres() {
    document.getElementById('lista-nombres').innerHTML = nombresGlobal.map(n => `<option value="${n.nombre}"></option>`).join('');
}

function renderizarTablaNombres() {
    const tbody = document.getElementById('cuerpo-nombres');
    if (!tbody) return;
    tbody.innerHTML = '';
    nombresGlobal.forEach(n => {
        tbody.innerHTML += `<tr><td>${n.nombre}</td><td><button onclick="eliminarNombre('${n.id}')" class="btn-clear">Eliminar</button></td></tr>`;
    });
}

window.abrirModalNombres = function() {
    document.getElementById('modal-nombres').style.display = 'block';
    cargarNombres();
};

window.cerrarModalNombres = function() {
    document.getElementById('modal-nombres').style.display = 'none';
};

window.agregarNombreManual = async function() {
    const nombre = document.getElementById('nombres-nombre').value.trim();
    if (!nombre) return alert("Ingrese un nombre.");
    const existe = nombresGlobal.some(n => n.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (existe) return alert("Este nombre ya existe.");
    await addDoc(collection(db, "nombres"), { userId: currentUser.uid, nombre });
    document.getElementById('nombres-nombre').value = '';
    await cargarNombres();
};

window.eliminarNombre = async function(id) {
    if (confirm("¿Eliminar nombre?")) {
        await deleteDoc(doc(db, "nombres", id));
        await cargarNombres();
    }
};

// ==========================================
// FACTURAS - CORRELATIVO
// ==========================================
async function cargarCorrelativoFactura() {
    const docRef = doc(db, "configuracion", "correlativoFactura");
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        await setDoc(docRef, { valor: 1 });
    }
}

// ==========================================
// FACTURAS - TOGGLE MÚLTIPLES DTES
// ==========================================
window.toggleMultipleDTE = function() {
    const checked = document.getElementById('factura-multiple-dte').checked;
    document.getElementById('campos-dte-header').style.display = checked ? 'none' : 'flex';
    document.getElementById('th-dte-abono').style.display = checked ? '' : 'none';
    if (!checked) {
        abonosFactura.forEach(a => {
            a.codigoGeneracion = '';
            a.numeroControl = '';
        });
    }
    renderizarAbonosFactura();
};

// ==========================================
// FACTURAS - NUEVA
// ==========================================
window.nuevaFactura = function() {
    facturaEditandoId = null;
    itemsFactura = [];
    abonosFactura = [];
    document.getElementById('factura-tipo').value = 'Consumidor Final';
    document.getElementById('factura-vendedor').value = '';
    document.getElementById('factura-cliente-nombre').value = '';
    document.getElementById('factura-cliente-nit').value = '';
    document.getElementById('factura-cliente-nrc').value = '';
    document.getElementById('factura-cliente-dui').value = '';
    document.getElementById('factura-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('factura-multiple-dte').checked = false;
    document.getElementById('factura-codigo-generacion').value = '';
    document.getElementById('factura-numero-control').value = '';
    document.getElementById('campos-dte-header').style.display = 'flex';
    document.getElementById('th-dte-abono').style.display = 'none';
    document.getElementById('buscar-producto').value = '';
    document.getElementById('modo-edicion-badge').style.display = 'none';
    document.getElementById('formulario-factura').style.display = 'block';
    document.getElementById('lista-facturas-container').style.display = 'none';
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
    document.getElementById('fila-retencion').style.display = (tipo === 'Gran Contribuyente') ? 'flex' : 'none';
    calcularTotalesFactura();
}

// ==========================================
// FACTURAS - ITEMS
// ==========================================
window.agregarItemFactura = function() {
    const nombreProd = document.getElementById('buscar-producto').value.trim();
    const cantidad = parseFloat(document.getElementById('cantidad-producto').value);
    const precioConIva = parseFloat(document.getElementById('precio-con-iva-item').value);

    if (!nombreProd) return alert("Escriba o seleccione un producto.");
    if (isNaN(cantidad) || cantidad <= 0) return alert("Cantidad inválida.");
    if (isNaN(precioConIva) || precioConIva <= 0) return alert("Precio con IVA inválido.");

    const prod = productosGlobal.find(p => p.nombre.trim().toLowerCase() === nombreProd.toLowerCase());
    if (!prod) return alert("Producto no encontrado en la lista. Verifique el nombre o agréguelo en 'Gestionar Productos'.");

    const precioSinIva = precioConIva / 1.13;
    const totalSinIva = precioSinIva * cantidad;

    itemsFactura.push({
        nombre: prod.nombre,
        cantidad: cantidad,
        precioConIva: precioConIva,
        precioSinIva: precioSinIva,
        totalSinIva: totalSinIva
    });

    document.getElementById('buscar-producto').value = '';
    document.getElementById('cantidad-producto').value = '1';
    document.getElementById('precio-con-iva-item').value = '';
    renderizarItemsFactura();
};

function renderizarItemsFactura() {
    const tbody = document.getElementById('cuerpo-items');
    tbody.innerHTML = '';
    itemsFactura.forEach((item, index) => {
        const cantMostrar = Number.isInteger(item.cantidad) ? item.cantidad : item.cantidad.toFixed(2);
        tbody.innerHTML += `
            <tr>
                <td>${cantMostrar}</td>
                <td>${item.nombre}</td>
                <td>${fmt5(item.precioConIva)}</td>
                <td>${fmt5(item.precioSinIva)}</td>
                <td>${fmt5(item.totalSinIva)}</td>
                <td class="no-print"><button onclick="eliminarItemFactura(${index})" class="btn-clear" style="padding:2px 6px; font-size:12px;">X</button></td>
            </tr>`;
    });
    calcularTotalesFactura();
}

window.eliminarItemFactura = function(index) {
    itemsFactura.splice(index, 1);
    renderizarItemsFactura();
};

// ==========================================
// FACTURAS - CÁLCULOS
// ==========================================
function calcularTotalesFactura() {
    const subtotal = itemsFactura.reduce((sum, item) => sum + item.totalSinIva, 0);
    const iva = subtotal * 0.13;
    const totalConIva = subtotal + iva;
    const tipo = document.getElementById('factura-tipo').value;
    const retencion = tipo === 'Gran Contribuyente' ? subtotal * 0.01 : 0;
    const totalPagar = totalConIva - retencion;

    document.getElementById('factura-subtotal').textContent = fmt5(subtotal);
    document.getElementById('factura-iva').textContent = fmt5(iva);
    document.getElementById('factura-total-con-iva').textContent = fmt5(totalConIva);
    document.getElementById('factura-retencion').textContent = fmt5(retencion);
    document.getElementById('factura-total-pagar').textContent = '$' + totalPagar.toFixed(2);

    renderizarAbonosFactura();
}

// ==========================================
// FACTURAS - ABONOS
// ==========================================
window.agregarAbono = function() {
    const metodo = document.getElementById('abono-metodo').value;
    const fecha = document.getElementById('abono-fecha').value || new Date().toISOString().split('T')[0];
    const monto = parseFloat(document.getElementById('abono-monto').value);
    if (isNaN(monto) || monto <= 0) return alert("Ingrese un monto de abono válido.");

    abonosFactura.push({
        metodo: metodo,
        fecha: fecha,
        monto: monto,
        fechaDeposito: '',
        nombreDeposito: '',
        codigoGeneracion: '',
        numeroControl: ''
    });
    document.getElementById('abono-monto').value = '';
    renderizarAbonosFactura();
};

window.guardarDepositoAbono = function(index, campo, valor) {
    if (!abonosFactura[index]) return;
    if (campo === 'fecha') abonosFactura[index].fechaDeposito = valor;
    if (campo === 'nombre') abonosFactura[index].nombreDeposito = valor;
};

window.guardarDTEAbono = function(index, campo, valor) {
    if (!abonosFactura[index]) return;
    abonosFactura[index][campo] = valor;
};

function renderizarAbonosFactura() {
    const tbody = document.getElementById('cuerpo-abonos');
    tbody.innerHTML = '';
    const totalPagar = parseFloat(document.getElementById('factura-total-pagar').textContent.replace('$', '')) || 0;
    const multipleDTE = document.getElementById('factura-multiple-dte').checked;

    let totalAbonado = 0;
    abonosFactura.forEach((abono, index) => {
        totalAbonado += abono.monto;
        const porcentaje = totalPagar > 0 ? (abono.monto / totalPagar) * 100 : 0;
        const saldo = totalPagar - totalAbonado;

        let celdaDeposito = '-';
        if (abono.metodo === 'Efectivo' || abono.metodo === 'Cheque') {
            celdaDeposito = `
                <div class="deposito-cell">
                    <label>Fecha depósito:</label>
                    <input type="date" value="${abono.fechaDeposito || ''}" onchange="guardarDepositoAbono(${index}, 'fecha', this.value)">
                    <label>Quién depositó:</label>
                    <input list="lista-nombres" value="${abono.nombreDeposito || ''}" placeholder="Nombre..." onchange="guardarDepositoAbono(${index}, 'nombre', this.value)">
                </div>`;
        }

        let celdaDTE = '';
        if (multipleDTE) {
            celdaDTE = `
                <td>
                    <div class="deposito-cell">
                        <label>Cód. Generación:</label>
                        <input type="text" value="${abono.codigoGeneracion || ''}" placeholder="ABC-..." onchange="guardarDTEAbono(${index}, 'codigoGeneracion', this.value)">
                        <label>N° Control:</label>
                        <input type="text" value="${abono.numeroControl || ''}" placeholder="0001-..." onchange="guardarDTEAbono(${index}, 'numeroControl', this.value)">
                    </div>
                </td>`;
        }

        tbody.innerHTML += `
            <tr>
                <td>${abono.fecha}</td>
                <td>${abono.metodo}</td>
                <td>${fmt5(abono.monto)}</td>
                <td>${porcentaje.toFixed(2)}%</td>
                <td>${fmt5(saldo)}</td>
                <td>${celdaDeposito}</td>
                ${celdaDTE}
                <td class="no-print"><button onclick="eliminarAbono(${index})" class="btn-clear" style="padding:2px 6px; font-size:12px;">X</button></td>
            </tr>`;
    });

    if (abonosFactura.length === 0) {
        const cols = multipleDTE ? 8 : 7;
        tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center; color:#999;">No hay abonos registrados</td></tr>`;
    }
}

window.eliminarAbono = function(index) {
    abonosFactura.splice(index, 1);
    renderizarAbonosFactura();
};

// ==========================================
// FACTURAS - GUARDAR
// ==========================================
window.guardarFactura = async function() {
    const tipo = document.getElementById('factura-tipo').value;
    const cliente = document.getElementById('factura-cliente-nombre').value.trim();
    const vendedor = document.getElementById('factura-vendedor').value.trim();
    const multipleDTE = document.getElementById('factura-multiple-dte').checked;

    let codigoGeneracion = '';
    let numeroControl = '';
    if (!multipleDTE) {
        codigoGeneracion = document.getElementById('factura-codigo-generacion').value.trim();
        numeroControl = document.getElementById('factura-numero-control').value.trim();
    } else {
        if (abonosFactura.length === 0) return alert("Con Múltiples DTEs activado, debe registrar al menos un abono con su Código de Generación y N° de Control.");
        for (let i = 0; i < abonosFactura.length; i++) {
            const a = abonosFactura[i];
            if (!a.codigoGeneracion || !a.numeroControl) {
                return alert(`El abono #${i + 1} no tiene asignado Código de Generación y/o N° de Control.`);
            }
        }
    }

    if (!cliente) return alert("Ingrese el nombre del cliente.");
    if (!vendedor) return alert("Ingrese de quién es la venta (Vendedor).");
    if (itemsFactura.length === 0) return alert("Agregue al menos un producto.");

    const subtotal = itemsFactura.reduce((sum, item) => sum + item.totalSinIva, 0);
    const iva = subtotal * 0.13;
    const totalConIva = subtotal + iva;
    const retencion = tipo === 'Gran Contribuyente' ? subtotal * 0.01 : 0;
    const totalPagar = totalConIva - retencion;
    const totalAbonado = abonosFactura.reduce((sum, a) => sum + a.monto, 0);
    const saldo = totalPagar - totalAbonado;
    const estado = saldo <= 0.00001 ? 'Cancelada' : 'Pendiente';

    const facturaData = {
        userId: currentUser.uid,
        tipo: tipo,
        cliente: cliente,
        vendedor: vendedor,
        multipleDTE: multipleDTE,
        codigoGeneracion: codigoGeneracion,
        numeroControl: numeroControl,
        nit: document.getElementById('factura-cliente-nit').value,
        nrc: document.getElementById('factura-cliente-nrc').value,
        dui: document.getElementById('factura-cliente-dui').value,
        fecha: document.getElementById('factura-fecha').value,
        items: itemsFactura,
        abonos: abonosFactura,
        subtotal: subtotal,
        iva: iva,
        totalConIva: totalConIva,
        retencion: retencion,
        totalPagar: totalPagar,
        totalAbonado: totalAbonado,
        saldo: saldo,
        estado: estado,
        fechaGuardado: new Date().toISOString()
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
        alert(`Simulación guardada con correlativo interno #${correlativo}.`);
    }
    cancelarEdicion();
};

// ==========================================
// FACTURAS - LISTAR
// ==========================================
async function cargarListaFacturas() {
    const tbody = document.getElementById('cuerpo-tabla-facturas');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Cargando...</td></tr>';
    const q = query(collection(db, "facturas"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    tbody.innerHTML = '';
    if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No hay simulaciones guardadas.</td></tr>';
        return;
    }

    snap.forEach(d => {
        const f = d.data();
        const badgeClass = f.estado === 'Cancelada' ? 'badge-success' : 'badge-warning';
        let celdaCod = f.codigoGeneracion || '-';
        let celdaNum = f.numeroControl || '-';
        if (f.multipleDTE) {
            celdaCod = `<i style="color:#856404;">Múltiples (${(f.abonos || []).length})</i>`;
            celdaNum = `<i style="color:#856404;">Por abono</i>`;
        }
        tbody.innerHTML += `
            <tr>
                <td style="font-size:12px;">${celdaCod}</td>
                <td style="font-size:12px;">${celdaNum}</td>
                <td>${f.cliente}</td>
                <td>${f.vendedor || '-'}</td>
                <td>${f.tipo}</td>
                <td>${fmt5(f.totalPagar)}</td>
                <td>${fmt5(f.saldo)}</td>
                <td><span class="badge ${badgeClass}">${f.estado}</span></td>
                <td>
                    <button onclick="verFactura('${d.id}')" class="btn-pdf" style="padding:4px 8px; font-size:12px;">Ver</button>
                    <button onclick="editarFactura('${d.id}')" class="btn-draft" style="padding:4px 8px; font-size:12px;">Editar</button>
                    <button onclick="eliminarFactura('${d.id}')" class="btn-clear" style="padding:4px 8px; font-size:12px;">Eliminar</button>
                </td>
            </tr>`;
    });
}

// ==========================================
// FACTURAS - VER
// ==========================================
window.verFactura = async function(id) {
    const docSnap = await getDoc(doc(db, "facturas", id));
    if (!docSnap.exists()) return;
    const d = docSnap.data();
    facturaEditandoId = id;
    itemsFactura = d.items || [];
    abonosFactura = d.abonos || [];

    document.getElementById('factura-tipo').value = d.tipo;
    document.getElementById('factura-vendedor').value = d.vendedor || '';
    document.getElementById('factura-cliente-nombre').value = d.cliente;
    document.getElementById('factura-cliente-nit').value = d.nit || '';
    document.getElementById('factura-cliente-nrc').value = d.nrc || '';
    document.getElementById('factura-cliente-dui').value = d.dui || '';
    document.getElementById('factura-fecha').value = d.fecha;
    document.getElementById('factura-multiple-dte').checked = !!d.multipleDTE;
    document.getElementById('factura-codigo-generacion').value = d.codigoGeneracion || '';
    document.getElementById('factura-numero-control').value = d.numeroControl || '';
    document.getElementById('campos-dte-header').style.display = d.multipleDTE ? 'none' : 'flex';
    document.getElementById('th-dte-abono').style.display = d.multipleDTE ? '' : 'none';

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

// ==========================================
// FACTURAS - EDITAR
// ==========================================
window.editarFactura = async function(id) {
    const docSnap = await getDoc(doc(db, "facturas", id));
    if (!docSnap.exists()) return;
    const d = docSnap.data();
    facturaEditandoId = id;
    itemsFactura = d.items || [];
    abonosFactura = d.abonos || [];

    document.getElementById('factura-tipo').value = d.tipo;
    document.getElementById('factura-vendedor').value = d.vendedor || '';
    document.getElementById('factura-cliente-nombre').value = d.cliente;
    document.getElementById('factura-cliente-nit').value = d.nit || '';
    document.getElementById('factura-cliente-nrc').value = d.nrc || '';
    document.getElementById('factura-cliente-dui').value = d.dui || '';
    document.getElementById('factura-fecha').value = d.fecha;
    document.getElementById('factura-multiple-dte').checked = !!d.multipleDTE;
    document.getElementById('factura-codigo-generacion').value = d.codigoGeneracion || '';
    document.getElementById('factura-numero-control').value = d.numeroControl || '';
    document.getElementById('campos-dte-header').style.display = d.multipleDTE ? 'none' : 'flex';
    document.getElementById('th-dte-abono').style.display = d.multipleDTE ? '' : 'none';

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

// ==========================================
// FACTURAS - ELIMINAR
// ==========================================
window.eliminarFactura = async function(id) {
    if (confirm("¿Eliminar esta simulación de factura permanentemente?")) {
        await deleteDoc(doc(db, "facturas", id));
        cargarListaFacturas();
    }
};

// ==========================================
// INICIALIZAR FECHA DE ABONO
// ==========================================
document.getElementById('abono-fecha').value = new Date().toISOString().split('T')[0];
