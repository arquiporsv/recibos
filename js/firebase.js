import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAHoBtvREojg4moDy3nOfzg_kVdFzZNngw",
  authDomain: "recibos-arquipor.firebaseapp.com",
  projectId: "recibos-arquipor",
  storageBucket: "recibos-arquipor.firebasestorage.app",
  messagingSenderId: "430281363537",
  appId: "1:430281363537:web:d30dc376ffab395a1f6870"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Utilidades compartidas
export function showAlert(titulo, mensaje, tipo = 'primary') {
    const container = document.createElement('div');
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.innerHTML = `
        <div class="toast align-items-center text-bg-${tipo} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body"><strong>${titulo}:</strong> ${mensaje}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    document.body.appendChild(container);
    const bsToast = new bootstrap.Toast(container.querySelector('.toast'), { delay: 3000 });
    bsToast.show();
    container.querySelector('.toast').addEventListener('hidden.bs.toast', () => container.remove());
}

export function showConfirm(mensaje) {
    return new Promise((resolve) => {
        document.getElementById('confirmacion-mensaje').innerHTML = mensaje;
        const modalEl = document.getElementById('modal-confirmacion');
        const modal = new bootstrap.Modal(modalEl);
        const btnConfirm = document.getElementById('btn-confirmar-accion');
        const newBtn = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
        newBtn.addEventListener('click', () => { modal.hide(); resolve(true); });
        modalEl.addEventListener('hidden.bs.modal', () => { resolve(false); }, { once: true });
        modal.show();
    });
}

// Verificador de sesión para páginas privadas
export function checkAuth(callback) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            callback(user);
        } else {
            window.location.href = 'index.html'; // Redirigir al login si no hay sesión
        }
    });
}
