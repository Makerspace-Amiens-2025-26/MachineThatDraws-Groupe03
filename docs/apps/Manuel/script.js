const CONFIG = {
    feedRate: 1500,       
    travelSpeed: 2000,    
    penUpCmd: "G53 G0 Z0",        
    penDownCmd: "G53 G0 Z-1",  
    penDelay: 0.2,        
    bedW: 170.0,          
    bedH: 140.0           
};

let port, writer;
let isConnected = false;
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
        sendGcode(CONFIG.penUpCmd);
    } catch (e) {
        alert("Erreur de connexion USB : " + e);
    }
});

async function sendGcode(command) {
    if (!isConnected || !writer) return;
    try {
        await writer.write(command + "\n");
    } catch (e) {
        console.error("Erreur d'envoi:", e);
    }
}

async function jogMachine(axis, direction) {
    let distance = parseFloat(ui.stepDistance.value) || 10;
    let speed = parseInt(ui.jogSpeed.value) || 1000;
    let moveValue = (direction * distance).toFixed(2); 
    await sendGcode("G91"); 
    await sendGcode(`G1 ${axis}${moveValue} F${speed}`); 
    await sendGcode("G90"); 
}

function togglePen() {
    isPenDown = !isPenDown;
    let cmd = isPenDown ? CONFIG.penDownCmd : CONFIG.penUpCmd;
    sendGcode(cmd);
    if (isPenDown) {
        ui.btnPen.innerText = "🖍️ Stylo : BAISSÉ (Espace)";
        ui.btnPen.classList.add("down");
    } else {
        ui.btnPen.innerText = "🖊️ Stylo : LEVÉ (Espace)";
        ui.btnPen.classList.remove("down");
    }
}

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
        case ' ': 
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