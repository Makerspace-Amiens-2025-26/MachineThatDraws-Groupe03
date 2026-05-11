const BED_W = 170; 
const BED_H = 140; 

const SERVO_UP = 33;   
const SERVO_DOWN = 0;  
const SERVO_DELAY = 0.2; 
const MOVE_SPEED = 1500; 

const FONT_CORRECTION = 1.35; 
const MM_TO_PX = 4; // Facteur d'échelle pour l'écran

let textLayers = [
    { id: 1, text: "TITRE", font: "ARIALBD.TTF", size: 25, x: 10, y: 10 },
    { id: 2, text: "Sous-texte", font: "ARIAL.TTF", size: 10, x: 10, y: 45 }
];

let fontsCache = {}; 
let gcodeData = [];
let previewPaths = []; // Vide = Mode Aperçu, Rempli = Mode Tracé

let port, writer;
let isPrinting = false;
let arduinoReady = true;
let previewTimeout = null;

// === MODES D'AFFICHAGE ===
let isTraceMode = false;
let corsError = false; 

// === SYSTÈME DE NAVIGATION (ZOOM & PAN) ===
let viewZoom = 1.0;
let viewOffsetX = 0;
let viewOffsetY = 0;
let baseScale = 1.0;

const ui = {
    angle: document.getElementById('angleSelect'),
    spacing: document.getElementById('inpSpacing'),
    valSpacing: document.getElementById('valSpacing'),
    generate: document.getElementById('btnGenerate'),
    clear: document.getElementById('btnClear'),
    conn: document.getElementById('btnConnect'),
    home: document.getElementById('btnHome'),
    print: document.getElementById('btnPrint'),
    stop: document.getElementById('btnStop'),
    dl: document.getElementById('btnDownload'),
    prog: document.getElementById('progressBar'),
    pct: document.getElementById('progressText'),
    time: document.getElementById('timeText'),
    cons: document.getElementById('console'),
    resetView: document.getElementById('btnResetView')
};

function logConsole(msg) {
    ui.cons.innerHTML += `<div>> ${msg}</div>`;
    ui.cons.scrollTop = ui.cons.scrollHeight;
}

function renderLayersUI() {
    const container = document.getElementById('layers-container');
    container.innerHTML = "";
    
    textLayers.forEach((layer) => {
        let html = `
        <div style="background: #0a0a0a; padding: 10px; border: 1px solid #330011; border-left: 2px solid #ff003c; border-radius: 2px; position: relative; margin-bottom:10px;">
            <button onclick="removeLayer(${layer.id})" style="position:absolute; top:5px; right:5px; background: transparent; color: #ff003c; border: none; font-weight:bold; cursor: pointer; font-size:14px; width:auto; padding:0; clip-path:none;" title="Supprimer">✖</button>
            
            <textarea oninput="updateLayer(${layer.id}, 'text', this.value)" style="width:85%; height:45px; background:#000; color:#ff4d4d; border:1px solid #8a0020; margin-bottom:8px; border-radius:0; resize:none; font-family:'Rajdhani', sans-serif; font-size:1rem; padding:4px; font-weight:bold;">${layer.text}</textarea>
            
            <div style="display:flex; gap:5px; margin-bottom:8px;">
                <select onchange="updateLayer(${layer.id}, 'font', this.value)" style="flex:1; background:#000; color:#ff4d4d; border:1px solid #8a0020; border-radius:0; padding:4px; font-family:'Rajdhani', sans-serif; font-weight:bold;">
                    <option value="ARIAL.TTF" ${layer.font==='ARIAL.TTF'?'selected':''}>Arial</option>
                    <option value="ARIALBD.TTF" ${layer.font==='ARIALBD.TTF'?'selected':''}>Arial Gras</option>
                    <option value="ARIALI.TTF" ${layer.font==='ARIALI.TTF'?'selected':''}>Arial Italique</option>
                    <option value="ARIALBI.TTF" ${layer.font==='ARIALBI.TTF'?'selected':''}>Arial Gras It</option>
                    <option value="ARIBLK.TTF" ${layer.font==='ARIBLK.TTF'?'selected':''}>Arial Black</option>
                    <option value="ARIALN.TTF" ${layer.font==='ARIALN.TTF'?'selected':''}>Arial Narrow</option>
                </select>
                
                <div style="display:flex; align-items:center; background:#000; border:1px solid #8a0020; padding:0 5px;">
                    <span style="color:#ff003c; font-size:12px; margin-right:3px; font-family:'Orbitron', sans-serif;">T</span>
                    <input type="number" value="${layer.size}" oninput="updateLayer(${layer.id}, 'size', this.value)" style="width:40px; background:transparent; color:#ff4d4d; border:none; outline:none; font-family:'Rajdhani', sans-serif; font-weight:bold; padding:0; margin:0;">
                </div>
            </div>
            
            <div style="display:flex; gap:10px;">
                <div style="display:flex; align-items:center; background:#000; border:1px solid #8a0020; padding:0 5px; flex:1;">
                    <span style="color:#aaa; font-size:12px; margin-right:5px; font-family:'Orbitron', sans-serif;">X:</span>
                    <input type="number" value="${layer.x}" oninput="updateLayer(${layer.id}, 'x', this.value)" style="width:100%; background:transparent; color:#ff4d4d; border:none; outline:none; font-family:'Rajdhani', sans-serif; font-weight:bold; padding:0; margin:0;">
                </div>
                <div style="display:flex; align-items:center; background:#000; border:1px solid #8a0020; padding:0 5px; flex:1;">
                    <span style="color:#aaa; font-size:12px; margin-right:5px; font-family:'Orbitron', sans-serif;">Y:</span>
                    <input type="number" value="${layer.y}" oninput="updateLayer(${layer.id}, 'y', this.value)" style="width:100%; background:transparent; color:#ff4d4d; border:none; outline:none; font-family:'Rajdhani', sans-serif; font-weight:bold; padding:0; margin:0;">
                </div>
            </div>
        </div>
        `;
        container.innerHTML += html;
    });
}

function switchToPreviewMode() {
    isTraceMode = false;
    corsError = false;
    previewPaths = [];
    gcodeData = [];
    ui.time.innerText = "Mode Aperçu - Modifiez votre texte";
    ui.time.style.color = "#aaa";
    
    if (previewTimeout) clearTimeout(previewTimeout);
    previewTimeout = setTimeout(() => {
        refreshFontsAndPreview();
    }, 100); 
}

document.getElementById('btnAddLayer').addEventListener('click', () => {
    textLayers.push({ id: Date.now(), text: "Nouveau texte", font: "ARIAL.TTF", size: 10, x: 10, y: 70 });
    renderLayersUI();
    switchToPreviewMode();
});

window.updateLayer = function(id, field, value) {
    let layer = textLayers.find(l => l.id === id);
    if (layer) {
        if (field === 'size' || field === 'x' || field === 'y') layer[field] = parseFloat(value) || 0;
        else layer[field] = value;
        switchToPreviewMode();
    }
}

window.removeLayer = function(id) {
    textLayers = textLayers.filter(l => l.id !== id);
    renderLayersUI();
    switchToPreviewMode();
}

function setup() {
    let container = document.getElementById('canvas-container');
    let cnv = createCanvas(container.clientWidth, container.clientHeight);
    cnv.parent('canvas-container');
    
    container.addEventListener('contextmenu', e => e.preventDefault());
    noLoop(); 
    
    ui.spacing.addEventListener('input', () => { ui.valSpacing.innerText = ui.spacing.value; switchToPreviewMode(); });
    ui.angle.addEventListener('change', switchToPreviewMode);
    ui.resetView.addEventListener('click', resetViewParams);
    
    ui.generate.addEventListener('click', processAndGenerate);
    ui.clear.addEventListener('click', switchToPreviewMode);

    renderLayersUI();
    resetViewParams();
    switchToPreviewMode(); 
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
    let scaleX = (width - margin) / BED_W;
    let scaleY = (height - margin) / BED_H;
    baseScale = min(scaleX, scaleY);
    viewZoom = 1.0;
    viewOffsetX = (width - BED_W * baseScale) / 2;
    viewOffsetY = (height - BED_H * baseScale) / 2;
    redraw();
}

function refreshFontsAndPreview() {
    let neededFonts = [...new Set(textLayers.map(l => l.font))];
    let toLoad = neededFonts.filter(f => !fontsCache[f]);
    
    if (toLoad.length === 0) {
        redraw(); 
    } else {
        let loaded = 0;
        toLoad.forEach(f => {
            loadFont(f, (fontObj) => {
                fontsCache[f] = fontObj;
                loaded++;
                if (loaded === toLoad.length) redraw();
            }, () => { 
                console.warn("Erreur de chargement d'une police : " + f); 
            });
        });
    }
}

function processAndGenerate() {
    isTraceMode = true;
    corsError = false;
    let neededFonts = [...new Set(textLayers.map(l => l.font))];
    let toLoad = neededFonts.filter(f => !fontsCache[f]);
    
    if (toLoad.length === 0) {
        generateMachinePaths();
    } else {
        let loaded = 0;
        let hasError = false;
        toLoad.forEach(f => {
            loadFont(f, (fontObj) => {
                fontsCache[f] = fontObj;
                loaded++;
                if (loaded === toLoad.length && !hasError) generateMachinePaths();
            }, () => { 
                hasError = true;
                corsError = true;
                previewPaths = [];
                gcodeData = ["$X", "G92 X0 Y0", "G21", "G90", `M3 S${SERVO_UP}`, "G4 P0.5", `M3 S${SERVO_UP}`, "G4 P0.5", "G0 X0 Y0"];
                ui.time.innerText = "ERREUR: Impossible de lire .TTF";
                ui.time.style.color = "#ff003c";
                redraw();
            });
        });
    }
}

function generateMachinePaths() {
    const angleDeg = parseFloat(ui.angle.value) || 0;
    let angleRad = angleDeg * Math.PI / 180;
    let cosA = Math.cos(angleRad);
    let sinA = Math.sin(angleRad);

    previewPaths = []; 
    let rawPaths = []; 

    textLayers.forEach(layer => {
        if (!layer.text || layer.text.trim() === "") return;
        let myFont = fontsCache[layer.font];
        if (!myFont) return;

        let actualSize = layer.size * FONT_CORRECTION;
        let fontSizePX = actualSize * MM_TO_PX;
        
        let pivotX = layer.x * MM_TO_PX;
        let pivotY = (BED_H - layer.y) * MM_TO_PX; 
        let lineHeightPX = fontSizePX * 1.1;
        
        let lines = layer.text.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() !== "") {
                let currentYPX = pivotY + (i * lineHeightPX);
                
                // On génère des points serrés pour une très belle qualité
                let pts = myFont.textToPoints(lines[i], pivotX, currentYPX, fontSizePX, {
                    sampleFactor: 0.5, 
                    simplifyThreshold: 0
                });

                let currentPath = [];
                let lastP = null;
                
                for (let p of pts) {
                    let rx = (p.x - pivotX) * cosA - (p.y - pivotY) * sinA + pivotX;
                    let ry = (p.x - pivotX) * sinA + (p.y - pivotY) * cosA + pivotY;
                    let machinePt = { x: rx / MM_TO_PX, y: ry / MM_TO_PX };

                    // CORRECTION ICI : Tolérance augmentée à 2.0 mm
                    if (lastP && dist(lastP.x, lastP.y, machinePt.x, machinePt.y) > 2.0) {
                        if (currentPath.length > 0) rawPaths.push(currentPath);
                        currentPath = [];
                    }
                    currentPath.push(machinePt);
                    lastP = machinePt;
                }
                if (currentPath.length > 0) rawPaths.push(currentPath);
            }
        }
    });

    let spacingRule = parseFloat(ui.spacing.value) || 0.15;
    for(let path of rawPaths) {
        let optPath = [path[0]]; 
        for(let j = 1; j < path.length - 1; j++) {
            let lastOpt = optPath[optPath.length - 1];
            if (dist(lastOpt.x, lastOpt.y, path[j].x, path[j].y) > spacingRule) {
                optPath.push(path[j]);
            }
        }
        if (path.length > 1) optPath.push(path[path.length - 1]); 
        if (optPath.length > 1) previewPaths.push(optPath);
    }

    generateGCode();
    redraw();
}

function draw() {
    background(50); 
    
    push();
    translate(viewOffsetX, viewOffsetY);
    scale(baseScale * viewZoom);

    // --- PLATEAU (BLANC) ---
    fill(255); 
    stroke(200); 
    strokeWeight(1 / (baseScale * viewZoom));
    rect(0, 0, BED_W, BED_H);
    
    // --- GRILLE (GRIS CLAIR) ---
    stroke(220); 
    strokeWeight(0.5 / (baseScale * viewZoom));
    for (let x = 0; x <= BED_W; x += 10) line(x, 0, x, BED_H);
    for (let y = 0; y <= BED_H; y += 10) line(0, y, BED_W, y);

    if (corsError) {
        fill(255, 0, 0); noStroke();
        textSize(10); textAlign(CENTER, CENTER);
        text("ERREUR : Impossible de lire la police ARIAL.TTF.\nVérifiez que le fichier est bien présent.", BED_W/2, BED_H/2);
    } 
    else if (isTraceMode) {
        // TRACÉ ROUGE
        if (previewPaths.length > 0) {
            stroke(255, 0, 0); 
            strokeWeight(1.5 / (baseScale * viewZoom)); 
            noFill();
            for (let path of previewPaths) {
                beginShape();
                for (let pt of path) { vertex(pt.x, pt.y); }
                endShape();
            }

            strokeWeight(3 / (baseScale * viewZoom));
            beginShape(POINTS);
            for (let path of previewPaths) {
                for (let pt of path) { vertex(pt.x, pt.y); }
            }
            endShape();
        }
    } 
    else {
        // APERÇU BLEU NATIF
        const angleDeg = parseFloat(ui.angle.value) || 0;
        let angleRad = angleDeg * Math.PI / 180;

        textLayers.forEach(layer => {
            if (!layer.text || layer.text.trim() === "") return;
            let myFont = fontsCache[layer.font];
            
            if (myFont) textFont(myFont);
            else textFont('sans-serif'); 

            let actualSize = layer.size * FONT_CORRECTION;
            let fontSizePX = actualSize * MM_TO_PX;
            let pivotX = layer.x * MM_TO_PX;
            let pivotY = (BED_H - layer.y) * MM_TO_PX; 

            push();
            translate(pivotX / MM_TO_PX, pivotY / MM_TO_PX);
            rotate(angleRad);
            
            fill(0, 150, 255, 150); 
            noStroke();
            textSize(fontSizePX / MM_TO_PX);
            textAlign(LEFT, BASELINE);
            
            let lines = layer.text.split('\n');
            let lineHeightPX = fontSizePX * 1.1;
            for (let i = 0; i < lines.length; i++) {
                text(lines[i], 0, (i * lineHeightPX) / MM_TO_PX);
            }
            pop();
        });
    }

    // Point d'origine
    fill(255, 0, 0); noStroke(); 
    circle(0, BED_H, 5 / (baseScale * viewZoom));

    pop();
}

function generateGCode() {
    gcodeData = [];
    gcodeData.push("$X", "G92 X0 Y0", "G21", "G90", `M3 S${SERVO_UP}`, "G4 P0.5");            

    if (previewPaths.length > 0) {
        for (let path of previewPaths) {
            let mX_start = path[0].x;
            let mY_start = BED_H - path[0].y; 

            gcodeData.push(`M3 S${SERVO_UP}`, `G4 P${SERVO_DELAY}`, `G0 X${mX_start.toFixed(3)} Y${mY_start.toFixed(3)}`, `M3 S${SERVO_DOWN}`, `G4 P${SERVO_DELAY}`);

            for (let i = 1; i < path.length; i++) {
                let mX = path[i].x;
                let mY = BED_H - path[i].y; 
                gcodeData.push(`G1 X${mX.toFixed(3)} Y${mY.toFixed(3)} F${MOVE_SPEED}`);
            }
        }
    }
    gcodeData.push(`M3 S${SERVO_UP}`, "G4 P0.5", "G0 X0 Y0");        

    ui.time.innerText = `Tracé généré ! (${gcodeData.length} lignes)`;
    ui.time.style.color = "#28a745";
}

ui.dl.addEventListener('click', () => {
    if (gcodeData.length < 10) return;
    let blob = new Blob([gcodeData.join('\n')], {type: "text/plain"});
    let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = "calques_texte.gcode"; a.click();
});

ui.conn.addEventListener('click', async () => {
    if (!navigator.serial) return alert("Chrome/Edge requis.");
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 }); 
        const enc = new TextEncoderStream(); enc.readable.pipeTo(port.writable);
        writer = enc.writable.getWriter();
        
        ui.conn.innerHTML = "Connecté"; ui.conn.style.color = "#ff4d4d"; ui.print.disabled = false;
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
    if (!writer) return; logConsole("Homing ($H)..."); await sendLine("$X"); setTimeout(async () => { await sendLine("$H"); }, 100);
});

ui.stop.addEventListener('click', async () => {
    isPrinting = false; arduinoReady = true;
    ui.time.innerText = "🛑 Impression arrêtée."; ui.time.style.color = "#ff003c";
    if (writer) { await writer.write("\x18\n"); setTimeout(async () => { await sendLine(`M3 S${SERVO_UP}\nG0 X0 Y0`); }, 500); }
});

ui.print.addEventListener('click', async () => {
    if (!port || !gcodeData.length) return;
    isPrinting = true; ui.print.disabled = true;
    await writer.write("\r\n"); let startTime = Date.now(); logConsole("DÉBUT DESSIN...");
    
    for (let i = 0; i < gcodeData.length; i++) {
        if (!isPrinting) break;
        arduinoReady = false; await writer.write(gcodeData[i] + "\n");
        while(!arduinoReady && isPrinting) await new Promise(r => setTimeout(r, 2)); 
        
        if (i % 5 === 0 || i === gcodeData.length - 1) {
            let pct = Math.floor(((i+1) / gcodeData.length) * 100);
            ui.prog.style.width = pct + "%"; ui.pct.innerText = pct + "%";
            let elapsed = (Date.now() - startTime) / 1000;
            let remSec = Math.floor((elapsed / (i+1)) * (gcodeData.length - (i+1)));
            ui.time.innerText = `Reste: ${Math.floor(remSec/60)}m ${remSec%60 < 10 ? '0' : ''}${remSec%60}s`;
        }
    }
    if (isPrinting) { ui.prog.style.width = "100%"; ui.pct.innerText = "100%"; ui.time.innerText = "✅ Impression terminée !"; }
    isPrinting = false; ui.print.disabled = false;
});