import { auth } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

window.login = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try { 
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = 'inventario.html'; // Redirigir al inventario
    } catch (error) { 
        document.getElementById('auth-message').textContent = "Error: " + error.message; 
    }
};

window.register = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try { 
        await createUserWithEmailAndPassword(auth, email, password);
        window.location.href = 'inventario.html';
    } catch (error) { 
        document.getElementById('auth-message').textContent = "Error: " + error.message; 
    }
};import { auth } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

window.login = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try { 
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = 'inventario.html'; // Redirigir al inventario
    } catch (error) { 
        document.getElementById('auth-message').textContent = "Error: " + error.message; 
    }
};

window.register = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try { 
        await createUserWithEmailAndPassword(auth, email, password);
        window.location.href = 'inventario.html';
    } catch (error) { 
        document.getElementById('auth-message').textContent = "Error: " + error.message; 
    }
};
