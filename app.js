import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================
// CONFIGURACIÓN
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAHoBtvREojg4moDy3nOfzg_kVdFzZNngw",
  authDomain: "recibos-arquipor.firebaseapp.com",
  projectId: "recibos-arquipor",
  storageBucket: "recibos-arquipor.firebasestorage.app",
  messagingSenderId: "430281363537",
  appId: "1:430281363537:web:d30dc376ffab395a1f6870"
};

// ID de Google Cloud
const GOOGLE_CLIENT_ID = "148923041820-euc2h5fpfjnvtb9qhq3kcqcir7fcj8f1.apps.googleusercontent.com"; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let tokenClient;
let gapiInited = false;
let gisInited = false;

// Variables Globales
let receiverSignature, payerSignature;
let currentBorradorId = null; 
let currentReceiptId = null; 
let gastosTemp = [];

// ==========================================
// AUTENTICACIÓN FIREBASE
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
// NAVEGACIÓN
// ==========================================
window.switchTab = function(tab, btnElement) {
    document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`view-${tab}`).style.display = 'block';
    if(btnElement) btnElement.classList.add('active');

    if (tab === 'dte') cargarHistorialDTE();
    if (tab === 'arqueo') initArqueo();
    if (tab === 'liquidaciones') cargarHistorialLiquidaciones();
};

// ==========================================
// GOOGLE DRIVE INTEGRATION
// ==========================================
window.gapiLoaded = function() {
    gapi.load('client', initializeGapiClient);
};

async function initializeGapiClient() {
    await gapi.client.init({
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
    gapiInited = true;
    maybeEnableButtons();
}

window.gisLoaded = function() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                document.getElementById('google-status').style.display = 'block';
                document.getElementById('btn-google-auth').style.display = 'none';
            }
        },
    });
    gisInited = true;
    maybeEnableButtons();
};

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        const btn = document.getElementById('btn-google-auth');
        if(btn) btn.disabled = false;
    }
}

window.autorizarGoogleDrive = function() {
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
};

// Funciones de Drive
async function obtenerOCrearCarpeta(nombre, parentId = null) {
    let query = `name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) query += ` and '${parentId}' in parents`;
    
    const response = await gapi.client.drive.files.list({ q: query, spaces: 'drive', fields: 'files(id, name)' });
    
    if (response.result.files.length > 0) {
        return response.result.files[0].id;
    } else {
        const fileMetadata = { name: nombre, mimeType: 'application/vnd.google-apps.folder' };
        if (parentId) fileMetadata.parents = [parentId];
        const folder = await gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' });
        return folder.result.id;
    }
}

async function subirArchivoDrive(file, folderId) {
    const metadata = { name: file.name, parents: [folderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }),
        body: form
    });
    return response.json();
}

// ==========================================
// MÓDULO RECIBOS (Básico)
// ==========================================
async function setNextCorrelativo() {
    try {
        const q = query(collection(db, "recibos_pdfs"), where("userId", "==", currentUser.uid));
        const snap = await getDocs(q);
        let maxCorrelativo = 46;
        snap.forEach(doc => {
            const num = parseInt(doc.data().correlativo);
            if (!isNaN(num) && num > maxCorrelativo) maxCorrelativo = num;
        });
        document.getElementById('receipt-number-value').value = maxCorrelativo + 1;
        await setDoc(doc(db, "configuracion", "correlativo"), { valor: maxCorrelativo + 1 });
    } catch (e) { console.error(e); }
}

window.clearSignature = function(t) {
    if (t === 'receiver') receiverSignature.clear();
    if (t === 'payer') payerSignature.clear();
};

window.limpiarFormulario = async function(skipConfirm = false) {
    if (!skipConfirm && !confirm("¿Limpiar formulario?")) return;
    ['fecha','nombre','dui','concepto','monto'].forEach(id => document.getElementById(id).value = '');
    receiverSignature.clear(); payerSignature.clear();
    currentBorradorId = null; currentReceiptId = null;
    document.getElementById('btn-generar-pdf').textContent = 'Generar PDF';
    await setNextCorrelativo();
};

window.guardarBorrador = async function() {
    const borrador = {
        userId: currentUser.uid, fecha: document.getElementById('fecha').value,
        nombre: document.getElementById('nombre').value, dui: document.getElementById('dui').value,
        concepto: document.getElementById('concepto').value, monto: document.getElementById('monto').value,
        correlativo: document.getElementById('receipt-number-value').value,
        firmaRecibe: receiverSignature.toDataURL(), firmaPaga: payerSignature.toDataURL(),
        fechaGuardado: new Date().toISOString()
    };
    if (currentBorradorId) {
        await updateDoc(doc(db, "borradores", currentBorradorId), borrador);
        alert("Borrador actualizado.");
    } else {
        const ref = await addDoc(collection(db, "borradores"), borrador);
        currentBorradorId = ref.id;
        alert("Borrador guardado.");
    }
};

window.abrirModalBorradores = async function() {
    const modal = document.getElementById('modal-borradores');
    const lista = document.getElementById('lista-borradores');
    lista.innerHTML = 'Cargando...'; modal.style.display = 'block';
    const q = query(collection(db, "borradores"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    lista.innerHTML = '';
    snap.forEach(d => {
        const data = d.data();
        lista.innerHTML += `<div class="borrador-item"><span>${data.nombre || 'Sin nombre'} - $${data.monto || '0'}</span><div><button onclick="cargarBorrador('${d.id}')" class="btn-pdf btn-sm">Cargar</button><button onclick="eliminarBorrador('${d.id}')" class="btn-clear btn-sm">Eliminar</button></div></div>`;
    });
};

window.cerrarModalBorradores = () => document.getElementById('modal-borradores').style.display = 'none';

window.cargarBorrador = async function(id) {
    const docSnap = await getDoc(doc(db, "borradores", id));
    if (docSnap.exists()) {
        const d = docSnap.data();
        currentBorradorId = id; currentReceiptId = null;
        document.getElementById('btn-generar-pdf').textContent = 'Generar PDF';
        document.getElementById('fecha').value = d.fecha || ''; document.getElementById('nombre').value = d.nombre || '';
        document.getElementById('dui').value = d.dui || ''; document.getElementById('concepto').value = d.concepto || '';
        document.getElementById('monto').value = d.monto || ''; document.getElementById('receipt-number-value').value = d.correlativo || '';
        receiverSignature.clear(); payerSignature.clear();
        if(d.firmaRecibe) { const img = new Image(); img.onload = () => document.getElementById('signature-receiver').getContext('2d').drawImage(img,0,0); img.src = d.firmaRecibe; }
        if(d.firmaPaga) { const img = new Image(); img.onload = () => document.getElementById('signature-payer').getContext('2d').drawImage(img,0,0); img.src = d.firmaPaga; }
        cerrarModalBorradores();
    }
};

window.eliminarBorrador = async (id) => {
    if (confirm("¿Eliminar borrador?")) { await deleteDoc(doc(db, "borradores", id)); abrirModalBorradores(); }
};

window.descargarPDF = async function() {
    const nombre = document.getElementById('nombre').value.trim();
    const monto = document.getElementById('monto').value.trim();
    const correlativo = document.getElementById('receipt-number-value').value.trim();
    if (!nombre || !monto || !correlativo) return alert("Complete Nombre, Monto y Correlativo.");

    const elemento = document.getElementById('receipt-container');
    const opciones = { margin: 0, filename: `Recibo_${correlativo}_${nombre}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' } };

    document.querySelectorAll('.clear-sig').forEach(b => b.style.display = 'none');
    const inputCorr = document.getElementById('receipt-number-value');
    inputCorr.style.border = 'none';

    try {
        const pdfWorker = html2pdf().set(opciones).from(elemento);
        const pdfDataUri = await pdfWorker.toPdf().get('pdf').then(pdf => pdf.output('datauristring'));
        await pdfWorker.save();

        const payload = {
            userId: currentUser.uid, correlativo, nombre, monto,
            fecha: document.getElementById('fecha').value, dui: document.getElementById('dui').value,
            concepto: document.getElementById('concepto').value,
            firmaRecibe: receiverSignature.toDataURL(), firmaPaga: payerSignature.toDataURL(),
            pdfBase64: pdfDataUri, fechaActualizacion: new Date().toISOString()
        };

        if (currentReceiptId) {
            await updateDoc(doc(db, "recibos_pdfs", currentReceiptId), payload);
        } else {
            await addDoc(collection(db, "recibos_pdfs"), payload);
        }
        if (currentBorradorId) { await deleteDoc(doc(db, "borradores", currentBorradorId)); currentBorradorId = null; }
        await limpiarFormulario(true);
        alert("PDF generado y guardado.");
    } catch (e) { alert("Error: " + e.message); } 
    finally { document.querySelectorAll('.clear-sig').forEach(b => b.style.display = 'block'); inputCorr.style.border = '1px solid #ccc'; }
};

window.abrirModalRecibosGenerados = async function() {
    const modal = document.getElementById('modal-recibos-generados');
    const lista = document.getElementById('lista-recibos-generados');
    lista.innerHTML = 'Cargando...'; modal.style.display = 'block';
    const q = query(collection(db, "recibos_pdfs"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    lista.innerHTML = '';
    snap.forEach(d => {
        const data = d.data();
        lista.innerHTML += `<div class="borrador-item"><span>#${data.correlativo} - ${data.nombre} - $${data.monto}</span><div><button onclick="descargarReciboGuardado('${data.pdfBase64}', '${data.correlativo}')" class="btn-pdf btn-sm">Descargar</button></div></div>`;
    });
};

window.cerrarModalRecibosGenerados = () => document.getElementById('modal-recibos-generados').style.display = 'none';
window.descargarReciboGuardado = function(base64, corr) {
    const link = document.createElement('a');
    link.href = base64;
    link.download = `Recibo_${corr}.pdf`;
    link.click();
};

// ==========================================
// MÓDULO DTE
// ==========================================
window.procesarDTE = async function() {
    const jsonFile = document.getElementById('dte-json').files[0];
    const pdfFile = document.getElementById('dte-pdf').files[0];
    if (!jsonFile) return alert("Selecciona el archivo JSON del DTE.");
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const dteData = JSON.parse(e.target.result);
            const identificacion = dteData.identificacion;
            const receptor = dteData.receptor;
            const resumen = dteData.resumen;
            
            const codGen = identificacion.codigoGeneracion;
            const numControl = identificacion.numeroControl;
            const fecha = identificacion.fecEmi; 
            const tipoDte = identificacion.tipoDte; 
            const total = resumen.totalPagar;
            
            let tipoNombre = tipoDte === '01' ? 'CONSUMIDOR FINAL' : (tipoDte === '03' ? 'CREDITO FISCAL' : 'OTRO');

            await addDoc(collection(db, "reportes_dte"), {
                userId: currentUser.uid, codigoGeneracion: codGen, numeroControl: numControl,
                fecha: fecha, tipoDte: tipoDte, tipoNombre: tipoNombre,
                cliente: receptor.nombre, total: total, jsonOriginal: dteData
            });

            const token = gapi.client.getToken();
            if (token) {
                const [year, month] = fecha.split('-');
                const rootId = await obtenerOCrearCarpeta('FACTURAS ARQUIPOR EL SALVADOR');
                const yearId = await obtenerOCrearCarpeta(year, rootId);
                const monthId = await obtenerOCrearCarpeta(month, yearId);
                const tipoId = await obtenerOCrearCarpeta(tipoNombre, monthId);
                
                await subirArchivoDrive(jsonFile, tipoId);
                if (pdfFile) await subirArchivoDrive(pdfFile, tipoId);
                alert("DTE procesado y subido a Google Drive.");
            } else {
                alert("DTE guardado en BD (No conectado a Drive).");
            }
            cargarHistorialDTE();
        } catch (error) { alert("Error al procesar JSON: " + error.message); }
    };
    reader.readAsText(jsonFile);
};

async function cargarHistorialDTE() {
    const tbody = document.getElementById('cuerpo-dtes');
    tbody.innerHTML = 'Cargando...';
    const q = query(collection(db, "reportes_dte"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    tbody.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        tbody.innerHTML += `<tr><td>${d.fecha}</td><td>${d.tipoNombre}</td><td>${d.numeroControl}</td><td>${d.cliente}</td><td>$${parseFloat(d.total).toFixed(2)}</td></tr>`;
    });
}

// ==========================================
// MÓDULO ARQUEO
// ==========================================
const billetes = [100, 50, 20, 10, 5, 2, 1];
const monedas = [1, 0.5, 0.25, 0.1, 0.05, 0.01];

function initArqueo() {
    document.getElementById('arqueo-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('arqueo-billetes').innerHTML = billetes.map(b => `<tr><td>$${b.toFixed(2)}</td><td><input type="number" class="arqueo-cant" data-val="${b}" value="0" min="0" oninput="calcularArqueo()"></td><td class="subtotal-billete">$0.00</td></tr>`).join('');
    document.getElementById('arqueo-monedas').innerHTML = monedas.map(m => `<tr><td>$${m.toFixed(2)}</td><td><input type="number" class="arqueo-cant" data-val="${m}" value="0" min="0" oninput="calcularArqueo()"></td><td class="subtotal-moneda">$0.00</td></tr>`).join('');
    document.getElementById('arqueo-esperado').addEventListener('input', calcularArqueo);
}

window.calcularArqueo = function() {
    let totalB = 0, totalM = 0;
    document.querySelectorAll('#arqueo-billetes .arqueo-cant').forEach((input, i) => {
        const sub = parseFloat(input.getAttribute('data-val')) * (parseInt(input.value) || 0);
        document.querySelectorAll('.subtotal-billete')[i].textContent = `$${sub.toFixed(2)}`;
        totalB += sub;
    });
    document.querySelectorAll('#arqueo-monedas .arqueo-cant').forEach((input, i) => {
        const sub = parseFloat(input.getAttribute('data-val')) * (parseInt(input.value) || 0);
        document.querySelectorAll('.subtotal-moneda')[i].textContent = `$${sub.toFixed(2)}`;
        totalM += sub;
    });
    const totalEfectivo = totalB + totalM;
    const esperado = parseFloat(document.getElementById('arqueo-esperado').value) || 0;
    const diferencia = totalEfectivo - esperado;
    document.getElementById('total-efectivo').textContent = `$${totalEfectivo.toFixed(2)}`;
    document.getElementById('arqueo-diferencia').textContent = `$${diferencia.toFixed(2)}`;
    document.getElementById('arqueo-diferencia').style.color = diferencia === 0 ? 'green' : 'red';
};

window.generarArqueoPDF = async function() {
    const fecha = document.getElementById('arqueo-fecha').value;
    if (!fecha) return alert("Selecciona una fecha.");
    const elemento = document.getElementById('arqueo-container');
    const nombreArchivo = `${fecha.split('-').reverse().join('-')}.pdf`;
    const opciones = { margin: 10, filename: nombreArchivo, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' } };

    try {
        const pdfWorker = html2pdf().set(opciones).from(elemento);
        const pdfBlob = await pdfWorker.outputPdf('blob');
        await addDoc(collection(db, "arqueos"), {
            userId: currentUser.uid, fecha: fecha,
            totalEfectivo: document.getElementById('total-efectivo').textContent,
            diferencia: document.getElementById('arqueo-diferencia').textContent
        });

        const token = gapi.client.getToken();
        if (token) {
            const [year, month] = fecha.split('-');
            const rootId = await obtenerOCrearCarpeta('ARQUEOS DE CAJA');
            const yearId = await obtenerOCrearCarpeta(year, rootId);
            const monthId = await obtenerOCrearCarpeta(month, yearId);
            const file = new File([pdfBlob], nombreArchivo, { type: 'application/pdf' });
            await subirArchivoDrive(file, monthId);
            alert("Arqueo guardado y subido a Drive.");
        } else { await pdfWorker.save(); alert("Arqueo descargado localmente."); }
    } catch(e) { alert("Error: " + e.message); }
};

// ==========================================
// MÓDULO LIQUIDACIONES
// ==========================================
window.crearNuevaLiquidacion = function() {
    const totalRecibido = parseFloat(document.getElementById('liq-total-recibido').value);
    const fechaRecibido = document.getElementById('liq-fecha-recibido').value;
    if (isNaN(totalRecibido) || !fechaRecibido) return alert("Ingresa el total y la fecha recibida.");
    gastosTemp = [];
    document.getElementById('liq-total-recibido-view').textContent = `$${totalRecibido.toFixed(2)}`;
    document.getElementById('liq-fechas').value = `Recibido el: ${fechaRecibido}`;
    document.getElementById('panel-nueva-liquidacion').style.display = 'none';
    document.getElementById('liquidacion-container').style.display = 'block';
    document.getElementById('cuerpo-gastos').innerHTML = '';
    agregarFilaGasto();
    calcularLiquidacion();
};

window.agregarFilaGasto = function() {
    const index = gastosTemp.length;
    gastosTemp.push({ detalle: '', doc: '', fecha: '', monto: 0 });
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${index + 1}</td><td><input type="text" oninput="actualizarGasto(${index}, 'detalle', this.value)"></td><td><input type="text" oninput="actualizarGasto(${index}, 'doc', this.value)"></td><td><input type="date" onchange="actualizarGasto(${index}, 'fecha', this.value)"></td><td><input type="number" step="0.01" oninput="actualizarGasto(${index}, 'monto', this.value)"></td><td class="no-print"><button onclick="eliminarFilaGasto(this, ${index})" class="btn-clear btn-sm">X</button></td>`;
    document.getElementById('cuerpo-gastos').appendChild(tr);
};

window.actualizarGasto = function(index, campo, valor) {
    if (campo === 'monto') valor = parseFloat(valor) || 0;
    gastosTemp[index][campo] = valor;
    calcularLiquidacion();
};

window.eliminarFilaGasto = function(btn, index) {
    btn.closest('tr').remove();
    gastosTemp.splice(index, 1);
    document.querySelectorAll('#cuerpo-gastos tr').forEach((tr, i) => {
        tr.cells[0].textContent = i + 1;
        tr.cells[5].innerHTML = `<button onclick="eliminarFilaGasto(this, ${i})" class="btn-clear btn-sm">X</button>`;
    });
    calcularLiquidacion();
};

function calcularLiquidacion() {
    const totalGastos = gastosTemp.reduce((sum, g) => sum + (g.monto || 0), 0);
    const totalRecibido = parseFloat(document.getElementById('liq-total-recibido').value) || 0;
    const disponible = totalRecibido - totalGastos;
    document.getElementById('liq-total-gastos').textContent = `$${totalGastos.toFixed(2)}`;
    document.getElementById('liq-disponible').textContent = `$${disponible.toFixed(2)}`;
    document.getElementById('liq-disponible').style.color = disponible >= 0 ? 'black' : 'red';
}

window.guardarLiquidacion = async function() {
    const totalRecibido = parseFloat(document.getElementById('liq-total-recibido').value);
    const totalGastos = gastosTemp.reduce((sum, g) => sum + (g.monto || 0), 0);
    await addDoc(collection(db, "liquidaciones"), {
        userId: currentUser.uid, fechaRecibido: document.getElementById('liq-fecha-recibido').value,
        totalRecibido: totalRecibido, totalGastos: totalGastos,
        disponible: totalRecibido - totalGastos, gastos: gastosTemp, fechaGuardado: new Date().toISOString()
    });
    alert("Liquidación guardada.");
    document.getElementById('panel-nueva-liquidacion').style.display = 'block';
    document.getElementById('liquidacion-container').style.display = 'none';
    cargarHistorialLiquidaciones();
};

async function cargarHistorialLiquidaciones() {
    const tbody = document.getElementById('cuerpo-liquidaciones');
    tbody.innerHTML = 'Cargando...';
    const q = query(collection(db, "liquidaciones"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    tbody.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        tbody.innerHTML += `<tr><td>${d.fechaRecibido}</td><td>$${d.totalRecibido.toFixed(2)}</td><td>$${d.totalGastos.toFixed(2)}</td><td style="color:${d.disponible < 0 ? 'red':'green'}; font-weight:bold;">$${d.disponible.toFixed(2)}</td></tr>`;
    });
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
function inicializarApp() {
    document.getElementById('btn-google-auth').disabled = true;
    document.getElementById('liq-fecha-recibido').value = new Date().toISOString().split('T')[0];
    
    // Inicializar firmas de recibos
    receiverSignature = new SmoothSignature(document.querySelector("#signature-receiver"));
    payerSignature = new SmoothSignature(document.querySelector("#signature-payer"));
    setNextCorrelativo();
}
