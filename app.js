// ==========================================
// 1. IMPORTACIONES DE FIREBASE (v10 Módulos)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================
// 2. TU CONFIGURACIÓN DE FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAHoBtvREojg4moDy3nOfzg_kVdFzZNngw",
  authDomain: "recibos-arquipor.firebaseapp.com",
  projectId: "recibos-arquipor",
  storageBucket: "recibos-arquipor.firebasestorage.app",
  messagingSenderId: "430281363537",
  appId: "1:430281363537:web:d30dc376ffab395a1f6870"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Variables Globales
let receiverSignature;
let payerSignature;
let currentUser = null;

// ==========================================
// 3. AUTENTICACIÓN (LOGIN / REGISTRO)
// ==========================================
window.login = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        document.getElementById('auth-message').textContent = "Error: " + error.message;
    }
};

window.register = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
        document.getElementById('auth-message').textContent = "Error: " + error.message;
    }
};

window.logout = function() {
    signOut(auth);
};

// Escuchar cambios de estado de sesión (cuando entras o sales)
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
// 4. INICIALIZACIÓN DE LA APP
// ==========================================
async function inicializarApp() {
    // Inicializar canvas de firmas (Ambas se dibujan)
    receiverSignature = new SmoothSignature(document.querySelector("#signature-receiver"));
    payerSignature = new SmoothSignature(document.querySelector("#signature-payer"));

    // Cargar correlativo desde Firestore
    await cargarCorrelativo();
    
    // Cargar personas frecuentes
    await cargarPersonasFrecuentes();
}

// ==========================================
// 5. LÓGICA DE CORRELATIVO EN LA NUBE
// ==========================================
async function cargarCorrelativo() {
    const docRef = doc(db, "configuracion", "correlativo");
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
        document.getElementById('receipt-number-value').textContent = docSnap.data().valor;
    } else {
        // Si no existe, iniciar en 47
        await setDoc(docRef, { valor: 47 });
        document.getElementById('receipt-number-value').textContent = 47;
    }
}

async function incrementarCorrelativo() {
    const docRef = doc(db, "configuracion", "correlativo");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const nuevoValor = docSnap.data().valor + 1;
        await setDoc(docRef, { valor: nuevoValor });
        document.getElementById('receipt-number-value').textContent = nuevoValor;
    }
}

// ==========================================
// 6. LÓGICA DE PERSONAS FRECUENTES (NUBE)
// ==========================================
window.guardarPersonaFrecuente = async function() {
    const nombre = document.getElementById('nombre').value.trim();
    const dui = document.getElementById('dui').value.trim();
    
    if (!nombre || !dui) {
        alert("Ingrese Nombre y DUI para guardar como persona frecuente.");
        return;
    }

    try {
        await addDoc(collection(db, "personas"), { nombre, dui, userId: currentUser.uid });
        alert("Persona guardada exitosamente.");
        await cargarPersonasFrecuentes();
    } catch (e) {
        alert("Error al guardar: " + e.message);
    }
};

async function cargarPersonasFrecuentes() {
    const select = document.getElementById('personas-frecuentes');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    
    const q = query(collection(db, "personas"), where("userId", "==", currentUser.uid));
    const querySnapshot = await getDocs(q);
    
    querySnapshot.forEach((doc) => {
        const p = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = `${p.nombre} (${p.dui})`;
        select.appendChild(option);
    });

    select.onchange = (e) => {
        const id = e.target.value;
        if (id) {
            querySnapshot.forEach((doc) => {
                if (doc.id === id) {
                    document.getElementById('nombre').value = doc.data().nombre;
                    document.getElementById('dui').value = doc.data().dui;
                }
            });
        }
    };
}

// ==========================================
// 7. LÓGICA DE BORRADORES (NUBE)
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

    try {
        await addDoc(collection(db, "borradores"), borrador);
        alert("Borrador guardado en la nube. Puedes acceder a él desde cualquier dispositivo.");
    } catch (e) {
        alert("Error al guardar borrador: " + e.message);
    }
};

window.abrirModalBorradores = async function() {
    const modal = document.getElementById('modal-borradores');
    const lista = document.getElementById('lista-borradores');
    lista.innerHTML = 'Cargando...';
    modal.style.display = 'block';

    try {
        const q = query(collection(db, "borradores"), where("userId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        lista.innerHTML = '';
        
        if (querySnapshot.empty) {
            lista.innerHTML = '<p>No hay borradores guardados.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const d = doc.data();
            const div = document.createElement('div');
            div.className = 'borrador-item';
            div.innerHTML = `
                <span><b>${d.nombre || 'Sin nombre'}</b> - $${d.monto || '0.00'}</span>
                <div>
                    <button onclick="cargarBorrador('${doc.id}')" class="btn-pdf">Cargar</button>
                    <button onclick="eliminarBorrador('${doc.id}')" class="btn-clear">Eliminar</button>
                </div>
            `;
            lista.appendChild(div);
        });
    } catch (e) {
        lista.innerHTML = 'Error al cargar borradores.';
    }
};

window.cerrarModalBorradores = function() {
    document.getElementById('modal-borradores').style.display = 'none';
};

window.cargarBorrador = async function(id) {
    const docRef = doc(db, "borradores", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
        const d = docSnap.data();
        document.getElementById('fecha').value = d.fecha || '';
        document.getElementById('nombre').value = d.nombre || '';
        document.getElementById('dui').value = d.dui || '';
        document.getElementById('concepto').value = d.concepto || '';
        document.getElementById('monto').value = d.monto || '';
        
        // Restaurar firmas
        receiverSignature.clear();
        payerSignature.clear();
        
        if (d.firmaRecibe) {
            const img1 = new Image();
            img1.onload = () => { document.getElementById('signature-receiver').getContext('2d').drawImage(img1, 0, 0); };
            img1.src = d.firmaRecibe;
        }
        if (d.firmaPaga) {
            const img2 = new Image();
            img2.onload = () => { document.getElementById('signature-payer').getContext('2d').drawImage(img2, 0, 0); };
            img2.src = d.firmaPaga;
        }
        
        cerrarModalBorradores();
        alert("Borrador cargado exitosamente.");
    }
};

window.eliminarBorrador = async function(id) {
    if (confirm("¿Eliminar este borrador definitivamente?")) {
        await deleteDoc(doc(db, "borradores", id));
        abrirModalBorradores(); // Recargar lista
    }
};

// ==========================================
// 8. LIMPIAR Y GENERAR PDF
// ==========================================
window.limpiarFormulario = function() {
    if (!confirm("¿Limpiar formulario actual? Se perderán los datos no guardados.")) return;
    document.getElementById('fecha').value = '';
    document.getElementById('nombre').value = '';
    document.getElementById('dui').value = '';
    document.getElementById('concepto').value = '';
    document.getElementById('monto').value = '';
    receiverSignature.clear();
    payerSignature.clear();
};

window.clearSignature = function(type) {
    if (type === 'receiver') receiverSignature.clear();
    if (type === 'payer') payerSignature.clear();
};

window.descargarPDF = async function() {
    const nombre = document.getElementById('nombre').value.trim();
    const monto = document.getElementById('monto').value.trim();
    
    if (!nombre || !monto) {
        alert("Complete al menos el Nombre y el Monto antes de generar el PDF.");
        return;
    }

    const elemento = document.getElementById('receipt-container');
    const correlativo = document.getElementById('receipt-number-value').textContent;
    
    const opciones = {
        margin:       0,
        filename:     `Recibo_${correlativo}_${nombre.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' }
    };

    // Ocultar botones de borrar firma para que no salgan en el PDF
    const botonesBorrar = document.querySelectorAll('.clear-sig');
    botonesBorrar.forEach(btn => btn.style.display = 'none');

    try {
        // Generar y descargar PDF
        await html2pdf().set(opciones).from(elemento).save();
        
        // Incrementar correlativo en la nube
        await incrementarCorrelativo();
        
        // Limpiar formulario
        limpiarFormulario();
        alert("PDF generado exitosamente. El correlativo ha avanzado en la nube.");
    } catch (e) {
        alert("Error al generar PDF: " + e.message);
    } finally {
        // Volver a mostrar los botones
        botonesBorrar.forEach(btn => btn.style.display = 'block');
    }
};
