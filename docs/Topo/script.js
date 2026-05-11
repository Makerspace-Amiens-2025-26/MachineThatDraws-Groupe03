const BED_W = 170; 
const BED_H = 140; 
const SERVO_UP = 33;   
const SERVO_DOWN = 0;  
const SERVO_DELAY = 0.2; 
const MOVE_SPEED = 1500; 

let gcodeData = [];
let topoPaths = []; 

let port, writer;
let isPrinting = false;
let arduinoReady = true;

// === SYSTÈME DE NAVIGATION (ZOOM SUR SOURIS + PAN) ===
let viewZoom = 1.0;
let viewOffsetX = 0;
let viewOffsetY = 0;
let baseScale = 1.0;

const ui = {
    w: document.getElementById('inpW'), h: document.getElementById('inpH'),
    seed: document.getElementById('inpSeed'), esp: document.getElementById('inpEsp'),
    hm: document.getElementById('inpHm'), offX: document.getElementById('inpOffX'), offY: document.getElementById('inpOffY'),
    
    valW: document.getElementById('valW'), valH: document.getElementById('valH'),
    valEsp: document.getElementById('valEsp'), valHm: document.getElementById('valHm'),
    valOffX: document.getElementById('valOffX'), valOffY: document.getElementById('valOffY'),
    
    regen: document.getElementById('btnRegen'), conn: document.getElementById('btnConnect'),
    home: document.getElementById('btnHome'), print: document.getElementById('btnPrint'),
    stop: document.getElementById('btnStop'), dl: document.getElementById('btnDownload'),
    resetView: document.getElementById('btnResetView'),
    
    prog: document.getElementById('progressBar'), pct: document.getElementById('progressText'), time: document.getElementById('timeText'),
    valGcode: document.getElementById('valGcodeLines'), valStatus: document.getElementById('valStatus'), cons: document.getElementById('console')
};

function logConsole(msg) {
    ui.cons.innerHTML += `<div>> ${msg}</div>`;
    ui.cons.scrollTop = ui.cons.scrollHeight;
}

function setup() {
    let container = document.getElementById('canvas-container');
    let cnv = createCanvas(container.clientWidth, container.clientHeight);
    cnv.parent('canvas-container');
    
    container.addEventListener('contextmenu', e => e.preventDefault());

    let inputs = [ui.w, ui.h, ui.esp, ui.hm, ui.offX, ui.offY];
    let vals = [ui.valW, ui.valH, ui.valEsp, ui.valHm, ui.valOffX, ui.valOffY];
    for (let i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('input', () => { vals[i].innerText = inputs[i].value; generateTopo(); });
    }

    ui.regen.addEventListener('click', () => { ui.seed.value = Math.floor(Math.random() * 10000); generateTopo(); });
    ui.seed.addEventListener('change', generateTopo);
    ui.resetView.addEventListener('click', resetViewParams);

    resetViewParams(); 
    generateTopo();
}

function windowResized() {
    let container = document.getElementById('canvas-container');
    resizeCanvas(container.clientWidth, container.clientHeight);
    resetViewParams();
}

function mouseWheel(event) {
    if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
        let zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        let mouseXRel = (mouseX - viewOffsetX) / (baseScale * viewZoom);
        let mouseYRel = (mouseY - viewOffsetY) / (baseScale * viewZoom);
        viewZoom *= zoomFactor;
        viewZoom = constrain(viewZoom, 0.2, 15); 
        viewOffsetX = mouseX - mouseXRel * (baseScale * viewZoom);
        viewOffsetY = mouseY - mouseYRel * (baseScale * viewZoom);
        return false; 
    }
}

function mouseDragged() {
    if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
        viewOffsetX += movedX;
        viewOffsetY += movedY;
    }
}

function resetViewParams() {
    let margin = 100;
    let scaleX = (width - margin) / BED_W;
    let scaleY = (height - margin) / BED_H;
    baseScale = min(scaleX, scaleY);
    viewZoom = 1.0;
    viewOffsetX = (width - BED_W * baseScale) / 2;
    viewOffsetY = (height - BED_H * baseScale) / 2;
}

function draw() {
    background(50); // Fond gris foncé à l'extérieur du plateau comme sur l'original !
    
    push();
    translate(viewOffsetX, viewOffsetY);
    scale(baseScale * viewZoom);

    // --- PLATEAU (BLANC) ---
    fill(255); 
    stroke(200); // Bordure fine grise
    strokeWeight(1 / (baseScale * viewZoom));
    rect(0, 0, BED_W, BED_H);
    
    // --- GRILLE (GRIS CLAIR) ---
    stroke(220); 
    strokeWeight(0.5 / (baseScale * viewZoom));
    for (let x = 0; x <= BED_W; x += 10) line(x, 0, x, BED_H);
    for (let y = 0; y <= BED_H; y += 10) line(0, y, BED_W, y);

    // --- TRACÉ (ROUGE) ---
    if (topoPaths.length > 0) {
        // Dessin des traits rouges
        stroke(255, 0, 0); 
        strokeWeight(1.5 / (baseScale * viewZoom)); 
        noFill();
        for (let path of topoPaths) {
            beginShape();
            for (let pt of path) { vertex(pt.x, BED_H - pt.y); }
            endShape();
        }

        // Dessin des points rouges sur chaque sommet
        strokeWeight(3 / (baseScale * viewZoom));
        beginShape(POINTS);
        for (let path of topoPaths) {
            for (let pt of path) { vertex(pt.x, BED_H - pt.y); }
        }
        endShape();
    }

    // Point d'origine (Gros point rouge)
    fill(255, 0, 0); noStroke(); 
    circle(0, BED_H, 5 / (baseScale * viewZoom));
    
    pop();
}

function generateTopo() {
    let seed = parseInt(ui.seed.value);
    let widthMM = parseFloat(ui.w.value); 
    let heightMM = parseFloat(ui.h.value);
    let spacing = parseFloat(ui.esp.value); 
    let amplitude = parseFloat(ui.hm.value);
    let offsetX = parseFloat(ui.offX.value); 
    let offsetY = parseFloat(ui.offY.value);

    noiseSeed(seed); 
    topoPaths = [];
    let startY = -amplitude; 
    let reverseDirection = false;

    for (let y = startY; y <= heightMM; y += spacing) {
        let currentLine = []; 
        let isLineVisible = false;
        for (let x = 0; x <= widthMM; x += 1) {
            let n = noise(x * 0.02, y * 0.02) * amplitude;
            let rawX = x + offsetX; 
            let rawY = y + n + offsetY; 
            let mX = Math.max(0, Math.min(BED_W, rawX)); 
            let mY = Math.max(0, Math.min(BED_H, rawY));
            if (mY > 0.1) isLineVisible = true;
            currentLine.push({ x: mX, y: mY });
        }
        if (isLineVisible) {
            let optimizedLine = []; 
            let lastPt = null;
            for (let pt of currentLine) {
                if (!lastPt || dist(lastPt.x, lastPt.y, pt.x, pt.y) > 0.5) { 
                    optimizedLine.push(pt); 
                    lastPt = pt; 
                }
            }
            if (optimizedLine.length > 1) {
                if (reverseDirection) optimizedLine.reverse();
                topoPaths.push(optimizedLine);
                reverseDirection = !reverseDirection;
            }
        }
    }
    generateGCode();
}

function generateGCode() {
    gcodeData = ["$X", "G92 X0 Y0", "G21", "G90", `M3 S${SERVO_UP}`, "G4 P0.5"];            
    let distT = 0; let lastX = 0, lastY = 0;
    if (topoPaths.length > 0) {
        for (let path of topoPaths) {
            let mX_start = path[0].x; let mY_start = path[0].y; 
            distT += dist(lastX, lastY, mX_start, mY_start);
            lastX = mX_start; lastY = mY_start;
            gcodeData.push(`M3 S${SERVO_UP}`, `G4 P${SERVO_DELAY}`, `G0 X${mX_start.toFixed(2)} Y${mY_start.toFixed(2)}`, `M3 S${SERVO_DOWN}`, `G4 P${SERVO_DELAY}`);
            for (let i = 1; i < path.length; i++) {
                let mX = path[i].x; let mY = path[i].y; 
                distT += dist(lastX, lastY, mX, mY); lastX = mX; lastY = mY;
                gcodeData.push(`G1 X${mX.toFixed(2)} Y${mY.toFixed(2)} F${MOVE_SPEED}`);
            }
        }
    }
    gcodeData.push(`M3 S${SERVO_UP}`, "G4 P0.5", "G0 X0 Y0");        
    let estSeconds = (distT / (MOVE_SPEED / 60)) + (topoPaths.length * SERVO_DELAY * 2);
    let min = Math.floor(estSeconds / 60); let sec = Math.floor(estSeconds % 60);
    ui.valGcode.innerText = gcodeData.length;
    ui.time.innerText = `Temps Est: ${min < 10 ? '0' : ''}${min}:${sec < 10 ? '0' : ''}${sec}`;
}

ui.dl.addEventListener('click', () => {
    if (gcodeData.length < 10) return;
    let blob = new Blob([gcodeData.join('\n')], {type: "text/plain"});
    let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = "topographie.gcode"; a.click();
});

ui.conn.addEventListener('click', async () => {
    if (!navigator.serial) return alert("Chrome/Edge requis.");
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 }); 
        const enc = new TextEncoderStream(); enc.readable.pipeTo(port.writable);
        writer = enc.writable.getWriter();
        ui.valStatus.innerText = "Connecté"; ui.valStatus.style.color = "#ff4d4d";
        ui.print.disabled = false;
        logConsole("Machine connectée !");
        const dec = new TextDecoderStream(); port.readable.pipeTo(dec.writable);
        const reader = dec.readable.getReader();
        let serialBuffer = "";
        (async () => { 
            while(true) { 
                const {value, done} = await reader.read(); 
                if(done) break; 
                if(value) {
                    serialBuffer += value; let lines = serialBuffer.split('\n');
                    serialBuffer = lines.pop(); 
                    for (let line of lines) {
                        line = line.trim().toLowerCase();
                        if(line === "ok" || line.startsWith("error") || line.includes("grbl")) arduinoReady = true; 
                    }
                } 
            } 
        })();
    } catch (e) { logConsole("Erreur USB : " + e); }
});

async function sendLine(line) { if (!writer) return; await writer.write(line + "\n"); logConsole(line); }

ui.home.addEventListener('click', async () => {
    if (!writer) return;
    logConsole("Homing ($H)..."); ui.valStatus.innerText = "Homing...";
    await sendLine("$X"); setTimeout(async () => { await sendLine("$H"); ui.valStatus.innerText = "Prêt"; }, 100);
});

ui.stop.addEventListener('click', async () => {
    isPrinting = false; arduinoReady = true;
    ui.valStatus.innerText = "STOPPÉ"; ui.valStatus.style.color = "#ff003c";
    if (writer) { await writer.write("\x18\n"); setTimeout(async () => { await sendLine(`M3 S${SERVO_UP}\nG0 X0 Y0`); }, 500); }
});

ui.print.addEventListener('click', async () => {
    if (!port || !gcodeData.length) return;
    isPrinting = true; ui.print.disabled = true;
    await writer.write("\r\n"); logConsole("DÉBUT DESSIN...");
    ui.valStatus.innerText = "Impression..."; 
    let startTime = Date.now();
    for (let i = 0; i < gcodeData.length; i++) {
        if (!isPrinting) break;
        arduinoReady = false; await writer.write(gcodeData[i] + "\n");
        while(!arduinoReady && isPrinting) await new Promise(r => setTimeout(r, 2)); 
        if (i % 10 === 0 || i === gcodeData.length - 1) {
            let pct = Math.floor(((i+1) / gcodeData.length) * 100);
            ui.prog.style.width = pct + "%"; ui.pct.innerText = pct + "%";
            let elapsed = (Date.now() - startTime) / 1000;
            let remSec = Math.floor((elapsed / (i+1)) * (gcodeData.length - (i+1)));
            ui.time.innerText = `Reste: ${Math.floor(remSec/60)}m ${remSec%60 < 10 ? '0' : ''}${remSec%60}s`;
        }
    }
    if (isPrinting) { ui.prog.style.width = "100%"; ui.pct.innerText = "100%"; ui.valStatus.innerText = "Terminé ✅"; }
    isPrinting = false; ui.print.disabled = false;
});