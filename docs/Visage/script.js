const CONFIG = {
    feedRate: 1500,       
    travelSpeed: 2000,    
    penUpCmd: "G53 G0 Z0",        
    penDownCmd: "G53 G0 Z-1",  
    penDelay: 0.2,        
    bedW: 170.0,          
    bedH: 140.0    
};

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

const ESP_MM = 1.2;       
const AMP_MAX = 0.55;     
const FREQ_BASE = 0.5;    
const FREQ_DETAIL = 6.0;  

let viewZoom = 1.0;
let viewOffsetX = 0;
let viewOffsetY = 0;
let baseScale = 1.0;
let printIndex = 0;
let isTraceMode = false;

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
    continuousLines: document.getElementById('chkContinuousLines'),
    btnImport: document.getElementById('btnImportGcode'),
    gcodeFile: document.getElementById('gcodeFileInput'),
    startLineInput: document.getElementById('startLineInput')
};

function addLog(msg) {
    if(!ui.console) return;
    ui.console.innerHTML += `<div>> ${msg}</div>`;
    ui.console.scrollTop = ui.console.scrollHeight;
}

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
                cvs.width = img.width; cvs.height = img.height;
                let ctx = cvs.getContext('2d');
                ctx.drawImage(img, 0, 0);
                rawImageData = ctx.getImageData(0, 0, img.width, img.height).data;
                imgWidth = img.width; imgHeight = img.height;
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

    ui.btnImport.addEventListener('click', () => ui.gcodeFile.click());
    ui.gcodeFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fileReader = new FileReader();
        fileReader.onload = (ev) => {
            gcodeData = ev.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            parseGcodeToPreview();
            isTraceMode = true;
            ui.time.innerText = `G-Code chargé (${gcodeData.length} lignes)`;
            ui.time.style.color = "#00ffcc";
            ui.startLineInput.value = 0; printIndex = 0;
            if(ui.print.disabled && port) ui.print.disabled = false;
            redraw();
        };
        fileReader.readAsText(file);
    });
}

function parseGcodeToPreview() {
    previewPaths = [];
    let currentPath = [];
    let cx = 0, cy = 0;
    let isPenDown = false;
    for (let line of gcodeData) {
        let l = line.toUpperCase();
        let nx = cx, ny = cy;
        let hasMove = false;
        if (l.startsWith("G0") || l.startsWith("G1") || l.startsWith("G53 G0")) {
            let parts = l.split(" ");
            parts.forEach(p => {
                if (p.startsWith("X")) nx = parseFloat(p.substring(1));
                if (p.startsWith("Y")) ny = parseFloat(p.substring(1));
            });
            if (nx !== cx || ny !== cy) hasMove = true;
        }
        if (l.includes("Z-1")) isPenDown = true;
        if (l.includes("Z0")) {
            isPenDown = false;
            if (currentPath.length > 1) previewPaths.push([...currentPath]);
            currentPath = [];
        }
        if (hasMove) {
            cx = nx; cy = ny;
            if (isPenDown) {
                if (currentPath.length === 0) currentPath.push({x: cx, y: cy});
                currentPath.push({x: nx, y: ny});
            }
        }
    }
    if (currentPath.length > 1) previewPaths.push(currentPath);
}

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
    let scaleX = (width - margin) / CONFIG.bedW;
    let scaleY = (height - margin) / CONFIG.bedH;
    baseScale = min(scaleX, scaleY);
    viewZoom = 1.0;
    viewOffsetX = (width - CONFIG.bedW * baseScale) / 2;
    viewOffsetY = (height - CONFIG.bedH * baseScale) / 2;
    redraw();
}

function draw() {
    background(50); 
    push();
    translate(viewOffsetX, viewOffsetY);
    scale(baseScale * viewZoom);

    fill(255); stroke(200); strokeWeight(1 / (baseScale * viewZoom));
    rect(0, 0, CONFIG.bedW, CONFIG.bedH);
    
    stroke(220); strokeWeight(0.5 / (baseScale * viewZoom));
    for (let x = 0; x <= CONFIG.bedW; x += 10) line(x, 0, x, CONFIG.bedH);
    for (let y = 0; y <= CONFIG.bedH; y += 10) line(0, y, CONFIG.bedW, y);

    if (p5ImageObj && ui.showBackground.checked) {
        push();
        tint(255, 80); 
        let W_mm = parseInt(ui.w.value) || 100;
        let H_mm = parseInt(ui.h.value) || 100;
        let offX = parseInt(ui.offX.value) || 0;
        let offY = parseInt(ui.offY.value) || 0;
        image(p5ImageObj, offX, CONFIG.bedH - (offY + H_mm), W_mm, H_mm);
        pop();
    }

    if (isTraceMode && previewPaths.length > 0) {
        stroke(255, 0, 0); strokeWeight(1.5 / (baseScale * viewZoom)); noFill();
        for (let path of previewPaths) {
            beginShape();
            for (let pt of path) { vertex(pt.x, CONFIG.bedH - pt.y); }
            endShape();
        }
        strokeWeight(3 / (baseScale * viewZoom));
        beginShape(POINTS);
        for (let path of previewPaths) {
            for (let pt of path) { vertex(pt.x, CONFIG.bedH - pt.y); }
        }
        endShape();
    }

    fill(255, 0, 0); noStroke(); circle(0, CONFIG.bedH, 5 / (baseScale * viewZoom));
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

function generateArt() {
    if (!rawImageData) return;
    isTraceMode = true;
    let W_mm = parseInt(ui.w.value) || 100;
    let H_mm = parseInt(ui.h.value) || 100;
    let offsetX_mm = parseInt(ui.offX.value) || 0; 
    let offsetY_mm = parseInt(ui.offY.value) || 0; 
    
    previewPaths = [];

    for (let y_mm = 0; y_mm <= H_mm; y_mm += ESP_MM) {
        let active = false;
        let currentPolyline = [];
        let phase = 0;
        for (let x_mm = 0; x_mm <= W_mm; x_mm += 0.25) {
            let darkness = getDarkness(x_mm, (H_mm - y_mm), W_mm, H_mm); 
            let skip = (darkness < 0.05) && !ui.continuousLines.checked;
            let amp_factor = Math.pow(darkness, 1.2);
            let current_amp = amp_factor * AMP_MAX;
            let freq_factor = constrain(map(darkness, 0.20, 0.65, 0, 1), 0, 1);
            let current_freq = FREQ_BASE + (freq_factor * (FREQ_DETAIL - FREQ_BASE));
            phase += current_freq * 0.25;
            let final_y_mm = y_mm + Math.sin(phase) * current_amp;
            let cx = x_mm + offsetX_mm; 
            let cy = final_y_mm + offsetY_mm; 
            
            let inBounds = (final_y_mm >= 0 && final_y_mm <= H_mm && cx >= 0 && cx <= CONFIG.bedW && cy >= 0 && cy <= CONFIG.bedH);
            
            if (!skip && inBounds) {
                if (!active) { currentPolyline = []; active = true; }
                currentPolyline.push({x: cx, y: cy});
            } else if (active) {
                if (currentPolyline.length > 1) previewPaths.push(currentPolyline);
                active = false;
            }
        }
        if (active && currentPolyline.length > 1) previewPaths.push(currentPolyline);
    }

    gcodeData = ["$X", "G92 X0 Y0", "G21", "G90", CONFIG.penUpCmd, "G4 P0.5"];
    let currentX = 0; let currentY = 0; 
    let pathsCopy = [...previewPaths];

    while (pathsCopy.length > 0) {
        let bestDist = Infinity; let bestIndex = -1; let reverseBest = false;
        for (let i = 0; i < pathsCopy.length; i++) {
            let pl = pathsCopy[i];
            let start = pl[0]; let end = pl[pl.length - 1];
            let dStart = dist(currentX, currentY, start.x, start.y);
            let dEnd = dist(currentX, currentY, end.x, end.y);
            if (dStart < bestDist) { bestDist = dStart; bestIndex = i; reverseBest = false; }
            if (dEnd < bestDist) { bestDist = dEnd; bestIndex = i; reverseBest = true; }
        }
        let bestPl = pathsCopy.splice(bestIndex, 1)[0];
        if (reverseBest) bestPl.reverse();
        let firstPt = bestPl[0];
        
        gcodeData.push(CONFIG.penUpCmd);
        gcodeData.push(`G4 P${CONFIG.penDelay}`);
        gcodeData.push(`G0 X${firstPt.x.toFixed(3)} Y${firstPt.y.toFixed(3)} F${CONFIG.travelSpeed}`);
        gcodeData.push(CONFIG.penDownCmd);
        gcodeData.push(`G4 P${CONFIG.penDelay}`);
        
        for (let pt of bestPl) {
            gcodeData.push(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F${CONFIG.feedRate}`);
        }
        currentX = bestPl[bestPl.length - 1].x;
        currentY = bestPl[bestPl.length - 1].y;
    }
    
    let frameMinX = constrain(offsetX_mm, 0, CONFIG.bedW);
    let frameMaxX = constrain(offsetX_mm + W_mm, 0, CONFIG.bedW);
    let frameMinY = constrain(offsetY_mm, 0, CONFIG.bedH);
    let frameMaxY = constrain(offsetY_mm + H_mm, 0, CONFIG.bedH);

    gcodeData.push(
        CONFIG.penUpCmd,
        `G4 P${CONFIG.penDelay}`,
        `G0 X${frameMinX.toFixed(3)} Y${frameMinY.toFixed(3)} F${CONFIG.travelSpeed}`,
        CONFIG.penDownCmd,
        `G4 P${CONFIG.penDelay}`,
        `G1 X${frameMaxX.toFixed(3)} Y${frameMinY.toFixed(3)} F${CONFIG.feedRate}`,
        `G1 X${frameMaxX.toFixed(3)} Y${frameMaxY.toFixed(3)} F${CONFIG.feedRate}`,
        `G1 X${frameMinX.toFixed(3)} Y${frameMaxY.toFixed(3)} F${CONFIG.feedRate}`,
        `G1 X${frameMinX.toFixed(3)} Y${frameMinY.toFixed(3)} F${CONFIG.feedRate}`,
        CONFIG.penUpCmd,
        "G4 P0.5",
        `G0 X0 Y0 F${CONFIG.travelSpeed}`
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
    
    let requestedStart = parseInt(ui.startLineInput.value) || 0;
    if (requestedStart !== printIndex && requestedStart < gcodeData.length) printIndex = requestedStart;

    isPrinting = true;
    addLog(`▶️ Début du dessin à la ligne ${printIndex}...`);
    
    if (printIndex === 0) {
        await sendLine("\r\n");
    } else {
        let lastX = 0, lastY = 0;
        for(let i = 0; i < printIndex; i++) {
            let parts = gcodeData[i].toUpperCase().split(" ");
            parts.forEach(p => {
                if (p.startsWith("X")) lastX = parseFloat(p.substring(1));
                if (p.startsWith("Y")) lastY = parseFloat(p.substring(1));
            });
        }
        arduinoReady = false; await sendLine(`${CONFIG.penUpCmd}`);
        while(!arduinoReady) await new Promise(r => setTimeout(r, 10));
        arduinoReady = false; await sendLine(`G0 X${lastX.toFixed(3)} Y${lastY.toFixed(3)} F${CONFIG.travelSpeed}`);
        while(!arduinoReady) await new Promise(r => setTimeout(r, 10));
    }

    let startTime = Date.now();
    for (; printIndex < gcodeData.length; printIndex++) {
        if (!isPrinting) break;
        ui.startLineInput.value = printIndex;
        while (!arduinoReady) await new Promise(r => setTimeout(r, 5));
        arduinoReady = false;
        await sendLine(gcodeData[printIndex]);
        
        if (printIndex % 5 === 0 || printIndex === gcodeData.length - 1) {
            let pct = Math.floor(((printIndex + 1) / gcodeData.length) * 100);
            ui.prog.style.width = pct + "%";
            ui.pct.innerText = pct + "%";
            let elapsed = (Date.now() - startTime) / 1000;
            let sessionDone = printIndex - requestedStart + 1;
            let sessionTotal = gcodeData.length - requestedStart;
            let remSec = Math.floor((elapsed / sessionDone) * (sessionTotal - sessionDone));
            ui.time.innerText = `Reste: ${Math.floor(remSec/60)}m ${remSec%60 < 10 ? '0' : ''}${remSec%60}s`;
        }
    }
    if (isPrinting) { ui.prog.style.width = "100%"; ui.pct.innerText = "100%"; ui.time.innerText = "✅ Impression terminée !"; printIndex = 0; ui.startLineInput.value = 0; }
    isPrinting = false;
};

ui.stop.onclick = async () => { 
    isPrinting = false; 
    ui.time.innerText = `🛑 Arrêt ligne ${printIndex}`; ui.time.style.color = "#ff003c";
    addLog("🛑 ARRÊT D'URGENCE ACTIVÉ !"); 
    if (port && port.writable) {
        try {
            const writer = port.writable.getWriter();
            await writer.write(new TextEncoder().encode("\x18")); 
            writer.releaseLock();
            addLog("Commande de Reset envoyée à la machine.");
            setTimeout(async () => { 
                await sendLine(`${CONFIG.penUpCmd}\nG0 X0 Y0`); 
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

const dist = (x1, y1, x2, y2) => Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));