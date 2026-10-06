// ==========================================
// CONFIGURACIÓN INICIAL
// ==========================================
const CORRELATIVO_INICIAL = 47;

// Variables globales para las firmas
let receiverSignature;
let payerSignature;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializar Correlativo
    let correlativoActual = localStorage.getItem('correlativoRecibo');
    if (correlativoActual === null) {
        correlativoActual = CORRELATIVO_INICIAL;
        localStorage.setItem('correlativoRecibo', correlativoActual);
    }
    document.getElementById('receipt-number-value').textContent = correlativoActual;

    // 2. Inicializar Firmas
    const receiverCanvas = document.querySelector("#signature-receiver");
    receiverSignature = new SmoothSignature(receiverCanvas);

    // Lógica para la firma de quien paga (por defecto una imagen)
    const payerImg = document.getElementById('signature-payer-img');
    const payerCanvas = document.getElementById('signature-payer');
    
    // Si la imagen existe en assets, la mostramos. Si no, mostramos el canvas para firmar.
    payerImg.onerror = () => {
        payerImg.style.display = 'none';
        payerCanvas.style.display = 'block';
        payerSignature = new SmoothSignature(payerCanvas);
    };
    payerImg.onload = () => {
        payerImg.style.display = 'block';
    };

    // 3. Cargar Personas Frecuentes
    cargarPersonasFrecuentes();
});

// ==========================================
// LÓGICA DE PERSONAS FRECUENTES
// ==========================================
function cargarPersonasFrecuentes() {
    const personas = JSON.parse(localStorage.getItem('personasFrecuentes')) || [];
    const select = document.getElementById('personas-frecuentes');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    
    personas.forEach((p, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${p.nombre} (${p.dui})`;
        select.appendChild(option);
    });

    select.onchange = (e) => {
        const index = e.target.value;
        if (index !== "") {
            const p = personas[index];
            document.getElementById('nombre').value = p.nombre;
            document.getElementById('dui').value = p.dui;
        }
    };
}

function guardarPersonaFrecuente() {
    const nombre = document.getElementById('nombre').value.trim();
    const dui = document.getElementById('dui').value.trim();
    
    if (!nombre || !dui) {
        alert("Ingrese Nombre y DUI para guardar como persona frecuente.");
        return;
    }

    let personas = JSON.parse(localStorage.getItem('personasFrecuentes')) || [];
    
    // Evitar duplicados
    const existe = personas.some(p => p.dui === dui);
    if (existe) {
        alert("Esta persona ya está guardada.");
        return;
    }

    personas.push({ nombre, dui });
    localStorage.setItem('personasFrecuentes', JSON.stringify(personas));
    cargarPersonasFrecuentes();
    alert("Persona guardada exitosamente.");
}

// ==========================================
// LÓGICA DE BORRADORES
// ==========================================
function guardarBorrador() {
    const borrador = {
        fecha: document.getElementById('fecha').value,
        nombre: document.getElementById('nombre').value,
        dui: document.getElementById('dui').value,
        concepto: document.getElementById('concepto').value,
        monto: document.getElementById('monto').value,
        firmaRecibe: receiverSignature.toDataURL() // Guardamos la firma como imagen
    };
    localStorage.setItem('borradorRecibo', JSON.stringify(borrador));
    alert("Borrador guardado correctamente.");
}

function cargarBorrador() {
    const borrador = JSON.parse(localStorage.getItem('borradorRecibo'));
    if (!borrador) {
        alert("No hay ningún borrador guardado.");
        return;
    }
    
    document.getElementById('fecha').value = borrador.fecha || '';
    document.getElementById('nombre').value = borrador.nombre || '';
    document.getElementById('dui').value = borrador.dui || '';
    document.getElementById('concepto').value = borrador.concepto || '';
    document.getElementById('monto').value = borrador.monto || '';
    
    if (borrador.firmaRecibe) {
        receiverSignature.clear();
        // Cargar la imagen en el canvas de la firma
        const img = new Image();
        img.onload = () => {
            const ctx = document.getElementById('signature-receiver').getContext('2d');
            ctx.drawImage(img, 0, 0);
        };
        img.src = borrador.firmaRecibe;
    }
    alert("Borrador cargado.");
}

// ==========================================
// LIMPIAR FORMULARIO
// ==========================================
function limpiarFormulario() {
    if (!confirm("¿Está seguro de limpiar el formulario? Se perderán los datos no guardados.")) return;
    
    document.getElementById('fecha').value = '';
    document.getElementById('nombre').value = '';
    document.getElementById('dui').value = '';
    document.getElementById('concepto').value = '';
    document.getElementById('monto').value = '';
    receiverSignature.clear();
    
    if (payerSignature) payerSignature.clear();
}

function clearReceiverSignature() {
    receiverSignature.clear();
}

// ==========================================
// GENERAR PDF Y AVANZAR CORRELATIVO
// ==========================================
function descargarPDF() {
    // Validar campos mínimos
    const nombre = document.getElementById('nombre').value.trim();
    const monto = document.getElementById('monto').value.trim();
    
    if (!nombre || !monto) {
        alert("Por favor, complete al menos el Nombre y el Monto antes de generar el PDF.");
        return;
    }

    const elemento = document.getElementById('receipt-container');
    const correlativo = document.getElementById('receipt-number-value').textContent;
    
    // Opciones del PDF
    const opciones = {
        margin:       0,
        filename:     `Recibo_${correlativo}_${nombre.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' }
    };

    // Ocultar botones de "Borrar Firma" temporalmente para el PDF
    const botonesBorrar = document.querySelectorAll('.clear-sig');
    botonesBorrar.forEach(btn => btn.style.display = 'none');

    // Generar PDF
    html2pdf().set(opciones).from(elemento).save().then(() => {
        // Restaurar botones
        botonesBorrar.forEach(btn => btn.style.display = 'block');
        
        // Incrementar Correlativo
        let nuevoCorrelativo = parseInt(correlativo) + 1;
        localStorage.setItem('correlativoRecibo', nuevoCorrelativo);
        document.getElementById('receipt-number-value').textContent = nuevoCorrelativo;
        
        // Limpiar formulario automáticamente después de guardar
        limpiarFormulario();
        localStorage.removeItem('borradorRecibo'); // Eliminar borrador al guardar definitivo
        
        alert(`PDF generado exitosamente. El próximo recibo será el #${nuevoCorrelativo}`);
    });
}
