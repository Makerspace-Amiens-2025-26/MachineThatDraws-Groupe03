// ==========================================
// VARIABLES GLOBALES
// ==========================================
let gcodeData = [];
let previewPaths = [];
let port, reader;
let isPrinting = false;
let arduinoReady = false;
let serialBuffer = "";

let rawImageData = null;
let imgWidth = 0;
let imgHeight = 0;
let p5ImageObj = null;
let imageRatio = 1;

// Paramètres de la machine
const PAPER_W_MM = 170;
const PAPER_H_MM = 140;

// Mouvement Stylo (M3 = Monter / M5 = Baisser)
const CMD_PEN_UP = "M3 S33";
const CMD_PEN_DOWN = "M5";
const MOVE_SPEED = 1500;

// Paramètres de tracé (Algorithme Squiggle)
const ESP_MM = 1.2;       
const AMP_MAX = 0.55;     
const FREQ_BASE = 0.5;    
const FREQ_DETAIL = 6.0;  

// === SYSTÈME DE NAVIGATION (ZOOM & PAN) ===
let viewZoom = 1.0;
let viewOffsetX = 0;
let viewOffsetY = 0;
let baseScale = 1.0;

let isTraceMode = false;

// ==========================================
// INTERFACE UTILISATEUR (UI)
// ==========================================
const ui = {
    connect: document.getElementById('btnConnect'),
    home: document.getElementById('btnHome'),
    generate: document.getElementById('btnGenerate'),
    clear: document.getElementById('btnClear'),
    print: document.getElementById('btnPrint'),
    stop: document.getElementById('btnStop'),
    dl: document.getElementById('btnDownload'),
    prog: document.getElementById('progressBar'),
    pct: document.getElementById('progressText'),
    time: document.getElementById('timeText'),
    console: document.getElementById('console'),
    resetView: document.getElementById('btnResetView'),
    
    imgUpload: document.getElementById('imgUpload'),
    w: document.getElementById('inpW'),
    h: document.getElementById('inpH'),
    valW: document.getElementById('valW'),
    valH: document.getElementById('valH'),
    
    keepRatio: document.getElementById('chkKeepRatio'),
    offX: document.getElementById('inpOffX'),
    offY: document.getElementById('inpOffY'),
    
    showBackground: document.getElementById('chkShowBackground'),
    continuousLines: document.getElementById('chkContinuousLines')
};

function addLog(msg) {
    if(!ui.console) return;
    ui.console.innerHTML += `<div>> ${msg}</div>`;
    ui.console.scrollTop = ui.console.scrollHeight;
}

// Repasse en mode aperçu (affiche juste l'image, supprime le tracé)
function switchToPreviewMode() {
    isTraceMode = false;
    previewPaths = [];
    gcodeData = [];
    ui.time.innerText = "Mode Aperçu - Cliquez sur Générer";
    ui.time.style.color = "#aaa";
    redraw();
}

function bindEvents() {
    ui.w.oninput = () => { 
        if (ui.keepRatio.checked && rawImageData) {
            let newH = Math.round(ui.w.value / imageRatio);
            ui.h.value = newH;
            document.getElementById('valH').innerText = newH;
        }
        document.getElementById('valW').innerText = ui.w.value; 
        switchToPreviewMode(); 
    };

    ui.h.oninput = () => { 
        if (ui.keepRatio.checked && rawImageData) {
            let newW = Math.round(ui.h.value * imageRatio);
            ui.w.value = newW;
            document.getElementById('valW').innerText = newW;
        }
        document.getElementById('valH').innerText = ui.h.value; 
        switchToPreviewMode(); 
    };

    ui.keepRatio.onchange = () => {
        if (ui.keepRatio.checked && rawImageData) {
            let newH = Math.round(ui.w.value / imageRatio);
            ui.h.value = newH;
            document.getElementById('valH').innerText = newH;
            switchToPreviewMode();
        }
    };

    ui.offX.oninput = () => { document.getElementById('valOffX').innerText = ui.offX.value; switchToPreviewMode(); };
    ui.offY.oninput = () => { document.getElementById('valOffY').innerText = ui.offY.value; switchToPreviewMode(); };
    
    ui.showBackground.onchange = () => { redraw(); };
    ui.continuousLines.onchange = () => { switchToPreviewMode(); };

    ui.generate.onclick = () => { generateArt(); };
    ui.clear.onclick = () => { switchToPreviewMode(); };

    ui.imgUpload.addEventListener('change', function(e) {
        const file = e.target.files[0]; 
        if (!file) return;

        addLog(`Chargement de "${file.name}"...`);
        const reader = new FileReader();
        reader.onload = function(event) {
            let img = new Image();
            img.onload = function() {
                let cvs = document.createElement('canvas');
                cvs.width = img.width;
                cvs.height = img.height;
                let ctx = cvs.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                rawImageData = ctx.getImageData(0, 0, img.width, img.height).data;
                imgWidth = img.width;
                imgHeight = img.height;
                imageRatio = imgWidth / imgHeight; 
                
                loadImage(event.target.result, (p5img) => {
                    p5ImageObj = p5img;
                    addLog(`✅ Image prête : ${imgWidth}x${imgHeight}px`);
                    
                    let newH = Math.round(ui.w.value / imageRatio);
                    ui.h.value = newH;
                    document.getElementById('valH').innerText = newH;
                    
                    switchToPreviewMode();
                });
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = ''; 
    });
    
    ui.resetView.addEventListener('click', resetViewParams);
}

// ==========================================
// P5.JS SETUP & RENDER LOOP
// ==========================================
function setup() {
    let container = document.getElementById('canvas-container');
    let cnv = createCanvas(container.clientWidth, container.clientHeight);
    cnv.parent('canvas-container');
    
    container.addEventListener('contextmenu', e => e.preventDefault());
    noLoop(); 
    bindEvents();
    resetViewParams();
}

function windowResized() {
    let container = document.getElementById('canvas-container');
    resizeCanvas(container.clientWidth, container.clientHeight);
    resetViewParams();
    redraw();
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
        
        redraw();
        return false; 
    }
}

function mouseDragged() {
    if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
        viewOffsetX += movedX;
        viewOffsetY += movedY;
        redraw();
    }
}

function resetViewParams() {
    let margin = 100;
    let scaleX = (width - margin) / PAPER_W_MM;
    let scaleY = (height - margin) / PAPER_H_MM;
    baseScale = min(scaleX, scaleY);
    viewZoom = 1.0;
    viewOffsetX = (width - PAPER_W_MM * baseScale) / 2;
    viewOffsetY = (height - PAPER_H_MM * baseScale) / 2;
    redraw();
}

function draw() {
    background(50); // Fond gris foncé hors plateau
    
    push();
    translate(viewOffsetX, viewOffsetY);
    scale(baseScale * viewZoom);

    // --- PLATEAU (BLANC) ---
    fill(255); 
    stroke(200); 
    strokeWeight(1 / (baseScale * viewZoom));
    rect(0, 0, PAPER_W_MM, PAPER_H_MM);
    
    // --- GRILLE (GRIS CLAIR) ---
    stroke(220); 
    strokeWeight(0.5 / (baseScale * viewZoom));
    for (let x = 0; x <= PAPER_W_MM; x += 10) line(x, 0, x, PAPER_H_MM);
    for (let y = 0; y <= PAPER_H_MM; y += 10) line(0, y, PAPER_W_MM, y);

    // --- IMAGE DE FOND (En direct) ---
    if (p5ImageObj && ui.showBackground.checked) {
        push();
        tint(255, 80); // Opacité à 30%
        let W_mm = parseInt(ui.w.value) || 100;
        let H_mm = parseInt(ui.h.value) || 100;
        let offX = parseInt(ui.offX.value) || 0;
        let offY = parseInt(ui.offY.value) || 0;
        // P5 origin is top-left, CNC is bottom-left
        image(p5ImageObj, offX, PAPER_H_MM - (offY + H_mm), W_mm, H_mm);
        pop();
    }

    // --- TRACÉ (ROUGE) ---
    if (isTraceMode && previewPaths.length > 0) {
        stroke(255, 0, 0); 
        strokeWeight(1.5 / (baseScale * viewZoom)); 
        noFill();
        for (let path of previewPaths) {
            beginShape();
            for (let pt of path) { vertex(pt.x, PAPER_H_MM - pt.y); } // Inversion Y pour l'affichage p5
            endShape();
        }

        strokeWeight(3 / (baseScale * viewZoom));
        beginShape(POINTS);
        for (let path of previewPaths) {
            for (let pt of path) { vertex(pt.x, PAPER_H_MM - pt.y); }
        }
        endShape();
    }

    // Point d'origine (Gros point rouge)
    fill(255, 0, 0); noStroke(); 
    circle(0, PAPER_H_MM, 5 / (baseScale * viewZoom));

    pop();
}

function getDarkness(x_mm, y_mm, W_mm, H_mm) {
    let px = Math.floor(map(x_mm, 0, W_mm, 0, imgWidth - 1));
    let py = Math.floor(map(y_mm, 0, H_mm, 0, imgHeight - 1));
    
    px = constrain(px, 0, imgWidth - 1);
    py = constrain(py, 0, imgHeight - 1);
    let index = (py * imgWidth + px) * 4;
    
    let r = rawImageData[index];
    let g = rawImageData[index + 1];
    let b = rawImageData[index + 2];
    let a = rawImageData[index + 3];
    
    if (a < 128) return 0.0; 
    let brightness = (0.299 * r + 0.587 * g + 0.114 * b); 
    return 1.0 - (brightness / 255.0);
}

// ==========================================
// GÉNÉRATION DU TRACÉ ET DU G-CODE
// ==========================================
function generateArt() {
    if (!rawImageData) return;
    isTraceMode = true;
    
    let W_mm = parseInt(ui.w.value) || 100;
    let H_mm = parseInt(ui.h.value) || 100;
    let offsetX_mm = parseInt(ui.offX.value) || 0; 
    let offsetY_mm = parseInt(ui.offY.value) || 0; 
    
    if (W_mm + offsetX_mm > PAPER_W_MM) W_mm = PAPER_W_MM - offsetX_mm;
    if (H_mm + offsetY_mm > PAPER_H_MM) H_mm = PAPER_H_MM - offsetY_mm;
    
    previewPaths = [];

    // Algorithme Squiggle
    for (let y_mm = 0; y_mm <= H_mm; y_mm += ESP_MM) {
        let active = false;
        let currentPolyline = [];
        let phase = 0;

        for (let x_mm = 0; x_mm <= W_mm; x_mm += 0.25) {
            let darkness = getDarkness(x_mm, (H_mm - y_mm), W_mm, H_mm); // Lecture inverse pour CNC
            
            let skip = (darkness < 0.05) && !ui.continuousLines.checked;

            let amp_factor = Math.pow(darkness, 1.2);
            let current_amp = amp_factor * AMP_MAX;
            let freq_factor = constrain(map(darkness, 0.20, 0.65, 0, 1), 0, 1);
            let current_freq = FREQ_BASE + (freq_factor * (FREQ_DETAIL - FREQ_BASE));
            
            phase += current_freq * 0.25;
            let final_y_mm = y_mm + Math.sin(phase) * current_amp;
            
            let cx = x_mm + offsetX_mm; 
            let cy = final_y_mm + offsetY_mm; 
            
            if (!skip && final_y_mm >= 0 && final_y_mm <= H_mm) {
                if (!active) {
                    currentPolyline = [];
                    active = true;
                }
                currentPolyline.push({x: cx, y: cy});
            } else if (active) {
                if (currentPolyline.length > 1) previewPaths.push(currentPolyline);
                active = false;
            }
        }
        if (active && currentPolyline.length > 1) {
            previewPaths.push(currentPolyline);
        }
    }

    // OPTIMISATION ET GCODE
    gcodeData = ["G21", "G90", CMD_PEN_UP, `G1 F${MOVE_SPEED}`];
    let currentX = 0; let currentY = 0; 
    let pathsCopy = [...previewPaths];

    while (pathsCopy.length > 0) {
        let bestDist = Infinity;
        let bestIndex = -1;
        let reverseBest = false;

        for (let i = 0; i < pathsCopy.length; i++) {
            let pl = pathsCopy[i];
            let start = pl[0];
            let end = pl[pl.length - 1];

            let dStart = dist(currentX, currentY, start.x, start.y);
            let dEnd = dist(currentX, currentY, end.x, end.y);

            if (dStart < bestDist) { bestDist = dStart; bestIndex = i; reverseBest = false; }
            if (dEnd < bestDist) { bestDist = dEnd; bestIndex = i; reverseBest = true; }
        }

        let bestPl = pathsCopy.splice(bestIndex, 1)[0];
        if (reverseBest) bestPl.reverse();

        let firstPt = bestPl[0];
        
        gcodeData.push(CMD_PEN_UP);
        gcodeData.push(`G0 X${firstPt.x.toFixed(3)} Y${firstPt.y.toFixed(3)}`);
        gcodeData.push(CMD_PEN_DOWN);

        for (let pt of bestPl) {
            gcodeData.push(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)}`);
        }

        currentX = bestPl[bestPl.length - 1].x;
        currentY = bestPl[bestPl.length - 1].y;
    }
    
    gcodeData.push(CMD_PEN_UP);

    gcodeData.push("; --- CADRE ---");
    gcodeData.push(
        CMD_PEN_UP, 
        `G0 X${offsetX_mm.toFixed(3)} Y${offsetY_mm.toFixed(3)}`, 
        CMD_PEN_DOWN, 
        `G1 X${(offsetX_mm + W_mm).toFixed(3)} Y${offsetY_mm.toFixed(3)}`, 
        `G1 X${(offsetX_mm + W_mm).toFixed(3)} Y${(offsetY_mm + H_mm).toFixed(3)}`, 
        `G1 X${offsetX_mm.toFixed(3)} Y${(offsetY_mm + H_mm).toFixed(3)}`, 
        `G1 X${offsetX_mm.toFixed(3)} Y${offsetY_mm.toFixed(3)}`, 
        CMD_PEN_UP, 
        "G0 X0 Y0", 
        "M30"
    );
    
    ui.time.innerText = `Tracé généré ! (${gcodeData.length} lignes)`;
    ui.time.style.color = "#28a745";
    redraw();
}

ui.dl.addEventListener('click', () => {
    if (gcodeData.length < 10) return;
    let blob = new Blob([gcodeData.join('\n')], {type: "text/plain"});
    let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = "visage_squiggle.gcode"; a.click();
});

// ==========================================
// COMMUNICATION MACHINE CNC (WEB SERIAL API)
// ==========================================
ui.connect.onclick = async () => {
    if (!navigator.serial) return alert("Chrome/Edge requis.");
    try { 
        port = await navigator.serial.requestPort(); 
        await port.open({ baudRate: 115200 }); 
        ui.connect.innerHTML = "Connecté"; ui.connect.style.color = "#ff4d4d"; ui.print.disabled = false;
        addLog("✅ Connecté au port série"); 
        readSerial(); 
    } catch (e) { addLog("Erreur: " + e); }
};

ui.home.onclick = async () => {
    arduinoReady = false;
    await sendLine("$X"); 
    setTimeout(async () => { 
        await sendLine("$H"); 
        addLog("🏠 Lancement du Homing ($H)...");
    }, 200);
};

ui.print.onclick = async () => {
    if (!port || !arduinoReady) {
        addLog("⚠️ Erreur : Machine non connectée ou non prête !");
        return;
    }
    isPrinting = true;
    addLog("▶️ Début du dessin...");
    let startTime = Date.now();
    
    for (let i = 0; i < gcodeData.length; i++) {
        if (!isPrinting) break;
        while (!arduinoReady) await new Promise(r => setTimeout(r, 5));
        arduinoReady = false;
        await sendLine(gcodeData[i]);
        
        if (i % 5 === 0 || i === gcodeData.length - 1) {
            let pct = Math.floor(((i + 1) / gcodeData.length) * 100);
            ui.prog.style.width = pct + "%";
            ui.pct.innerText = pct + "%";
            let elapsed = (Date.now() - startTime) / 1000;
            let remSec = Math.floor((elapsed / (i+1)) * (gcodeData.length - (i+1)));
            ui.time.innerText = `Reste: ${Math.floor(remSec/60)}m ${remSec%60 < 10 ? '0' : ''}${remSec%60}s`;
        }
    }
    if (isPrinting) { ui.prog.style.width = "100%"; ui.pct.innerText = "100%"; ui.time.innerText = "✅ Impression terminée !"; }
    isPrinting = false;
};

ui.stop.onclick = async () => { 
    isPrinting = false; 
    ui.time.innerText = "🛑 Impression arrêtée."; ui.time.style.color = "#ff003c";
    addLog("🛑 ARRÊT D'URGENCE ACTIVÉ !"); 
    if (port && port.writable) {
        try {
            const writer = port.writable.getWriter();
            await writer.write(new TextEncoder().encode("\x18")); 
            writer.releaseLock();
            addLog("Commande de Reset envoyée à la machine.");
            setTimeout(async () => { 
                await sendLine(`${CMD_PEN_UP}\nG0 X0 Y0`); 
            }, 500);
        } catch (e) { addLog("Erreur lors de l'arrêt : " + e); }
    }
};

async function sendLine(line) {
    if (!port || !port.writable) return;
    const writer = port.writable.getWriter();
    await writer.write(new TextEncoder().encode(line + "\n"));
    writer.releaseLock();
}

async function readSerial() {
    while (port.readable) {
        reader = port.readable.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                serialBuffer += new TextDecoder().decode(value);
                if (serialBuffer.includes("\n")) {
                    let lines = serialBuffer.split(/\r?\n/);
                    for (let i = 0; i < lines.length - 1; i++) {
                        let l = lines[i].trim();
                        if (l && !l.includes("ok")) addLog("CNC: " + l); 
                        if (l.includes("ok") || l.includes("Unlock") || l.includes("Grbl")) { 
                            arduinoReady = true; 
                            ui.print.disabled = false; 
                        }
                    }
                    serialBuffer = lines[lines.length - 1];
                }
            }
        } catch (e) { break; } finally { reader.releaseLock(); }
    }
}