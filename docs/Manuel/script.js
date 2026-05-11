let port, writer;
let isConnected = false;

// --- CONFIGURATION DU STYLO ---
const PEN_UP_VAL = 33;   
const PEN_DOWN_VAL = 0;  
let isPenDown = false;   

const ui = {
    btnConnect: document.getElementById('btnConnect'),
    status: document.getElementById('status'),
    stepDistance: document.getElementById('stepDistance'),
    jogSpeed: document.getElementById('jogSpeed'),
    btnUp: document.getElementById('btnUp'),
    btnDown: document.getElementById('btnDown'),
    btnLeft: document.getElementById('btnLeft'),
    btnRight: document.getElementById('btnRight'),
    btnHome: document.getElementById('btnHome'),
    btnPen: document.getElementById('btnPen')
};

// --- CONNEXION USB ---
ui.btnConnect.addEventListener('click', async () => {
    if (!navigator.serial) return alert("Google Chrome ou Edge est requis pour le Web Serial.");
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 }); 
        
        ui.status.innerText = "Connecté ✅";
        ui.status.style.color = "#00ffcc";
        ui.btnConnect.style.display = "none";
        isConnected = true;
        
        const enc = new TextEncoderStream();
        enc.readable.pipeTo(port.writable);
        writer = enc.writable.getWriter();
        
        // Initialiser la machine avec le stylo levé
        sendGcode(`M3 S${PEN_UP_VAL}`);
        
    } catch (e) {
        alert("Erreur de connexion USB : " + e);
    }
});

// --- FONCTION D'ENVOI GCODE ---
async function sendGcode(command) {
    if (!isConnected || !writer) return;
    try {
        await writer.write(command + "\n");
    } catch (e) {
        console.error("Erreur d'envoi:", e);
    }
}

// --- FONCTION DE DEPLACEMENT UNIVERSELLE ---
async function jogMachine(axis, direction) {
    let distance = parseFloat(ui.stepDistance.value) || 10;
    let speed = parseInt(ui.jogSpeed.value) || 1000; // Vitesse par défaut à 1000
    
    let moveValue = (direction * distance).toFixed(2); 
    
    // Remplacement de la commande $J par une séquence G-Code classique
    await sendGcode("G91"); // Passage en mode relatif (déplacement depuis la position actuelle)
    await sendGcode(`G1 ${axis}${moveValue} F${speed}`); // Déplacement
    await sendGcode("G90"); // Retour en mode absolu pour ne pas perturber la suite
}

// --- FONCTION LEVER/BAISSER LE STYLO ---
function togglePen() {
    isPenDown = !isPenDown;
    let pwmValue = isPenDown ? PEN_DOWN_VAL : PEN_UP_VAL;
    
    sendGcode(`M3 S${pwmValue}`);
    
    if (isPenDown) {
        ui.btnPen.innerText = "🖍️ Stylo : BAISSÉ (Espace)";
        ui.btnPen.classList.add("down");
    } else {
        ui.btnPen.innerText = "🖊️ Stylo : LEVÉ (Espace)";
        ui.btnPen.classList.remove("down");
    }
}

// --- ÉVÈNEMENTS BOUTONS ---
ui.btnUp.addEventListener('click', () => jogMachine('Y', 1));
ui.btnDown.addEventListener('click', () => jogMachine('Y', -1));
ui.btnRight.addEventListener('click', () => jogMachine('X', 1));
ui.btnLeft.addEventListener('click', () => jogMachine('X', -1));

ui.btnHome.addEventListener('click', () => {
    sendGcode("$X"); 
    setTimeout(() => sendGcode("$H"), 100);
});

ui.btnPen.addEventListener('click', (e) => {
    e.target.blur(); 
    togglePen();
});

// --- CONTRÔLE CLAVIER (FLÈCHES + ESPACE) ---
let isKeyPressed = false;

window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (isKeyPressed) return; 

    let handled = true;
    switch(e.key) {
        case 'ArrowUp': 
            jogMachine('Y', 1); 
            ui.btnUp.style.background = "#ff003c"; ui.btnUp.style.color = "#000";
            break;
        case 'ArrowDown': 
            jogMachine('Y', -1); 
            ui.btnDown.style.background = "#ff003c"; ui.btnDown.style.color = "#000";
            break;
        case 'ArrowRight': 
            jogMachine('X', 1); 
            ui.btnRight.style.background = "#ff003c"; ui.btnRight.style.color = "#000";
            break;
        case 'ArrowLeft': 
            jogMachine('X', -1); 
            ui.btnLeft.style.background = "#ff003c"; ui.btnLeft.style.color = "#000";
            break;
        case ' ': // Touche Espace
        case 'Spacebar':
            togglePen();
            break;
        default: 
            handled = false;
    }

    if (handled) {
        isKeyPressed = true;
        e.preventDefault(); 
    }
});

window.addEventListener('keyup', (e) => {
    isKeyPressed = false;
    ui.btnUp.style.background = ""; ui.btnUp.style.color = "";
    ui.btnDown.style.background = ""; ui.btnDown.style.color = "";
    ui.btnLeft.style.background = ""; ui.btnLeft.style.color = "";
    ui.btnRight.style.background = ""; ui.btnRight.style.color = "";
});