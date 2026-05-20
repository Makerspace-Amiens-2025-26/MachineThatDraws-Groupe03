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
let topoPaths = []; 
let port, writer;
let isPrinting = false;
let arduinoReady = true;
let viewZoom = 1.0;
let viewOffsetX = 0;
let viewOffsetY = 0;
let baseScale = 1.0;
let printIndex = 0;

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
    valGcode: document.getElementById('valGcodeLines'), valStatus: document.getElementById('valStatus'), cons: document.getElementById('console'),
    startLineInput: document.getElementById('startLineInput'),
    btnImport: document.getElementById('btnImportGcode'),
    gcodeFile: document.getElementById('gcodeFileInput')
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
    
    ui.btnImport.addEventListener('click', () => ui.gcodeFile.click());
    ui.gcodeFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            gcodeData = ev.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            parseGcodeToPreview();
            ui.valGcode.innerText = gcodeData.length;
            ui.time.innerText = "Calculé via G-Code";
            ui.startLineInput.value = 0; printIndex = 0;
            if(ui.print.disabled && port) ui.print.disabled = false;
            redraw();
        };
        reader.readAsText(file);
    });

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
    let scaleX = (width - margin) / CONFIG.bedW;
    let scaleY = (height - margin) / CONFIG.bedH;
    baseScale = min(scaleX, scaleY);
    viewZoom = 1.0;
    viewOffsetX = (width - CONFIG.bedW * baseScale) / 2;
    viewOffsetY = (height - CONFIG.bedH * baseScale) / 2;
}

function draw() {
    background(50);
    push();
    translate(viewOffsetX, viewOffsetY);
    scale(baseScale * viewZoom);
    fill(255); 
    stroke(200);
    strokeWeight(1 / (baseScale * viewZoom));
    rect(0, 0, CONFIG.bedW, CONFIG.bedH);
    
    stroke(220); 
    strokeWeight(0.5 / (baseScale * viewZoom));
    for (let x = 0; x <= CONFIG.bedW; x += 10) line(x, 0, x, CONFIG.bedH);
    for (let y = 0; y <= CONFIG.bedH; y += 10) line(0, y, CONFIG.bedW, y);

    if (topoPaths.length > 0) {
        stroke(255, 0, 0); 
        strokeWeight(1.5 / (baseScale * viewZoom)); 
        noFill();
        for (let path of topoPaths) {
            beginShape();
            for (let pt of path) { vertex(pt.x, CONFIG.bedH - pt.y); }
            endShape();
        }
        strokeWeight(3 / (baseScale * viewZoom));
        beginShape(POINTS);
        for (let path of topoPaths) {
            for (let pt of path) { vertex(pt.x, CONFIG.bedH - pt.y); }
        }
        endShape();
    }
    fill(255, 0, 0); noStroke(); 
    circle(0, CONFIG.bedH, 5 / (baseScale * viewZoom));
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
    printIndex = 0;
    ui.startLineInput.value = 0;
    let startY = -amplitude; 
    let reverseDirection = false;

    for (let y = startY; y <= heightMM; y += spacing) {
        let currentLine = []; 
        let isLineVisible = false;
        for (let x = 0; x <= widthMM; x += 1) {
            let n = noise(x * 0.02, y * 0.02) * amplitude;
            let rawX = x + offsetX; 
            let rawY = y + n + offsetY; 
            let mX = Math.max(0, Math.min(CONFIG.bedW, rawX)); 
            let mY = Math.max(0, Math.min(CONFIG.bedH, rawY));
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
    gcodeData = ["$X", "G92 X0 Y0", "G21", "G90", CONFIG.penUpCmd, "G4 P0.5"];            
    let distT = 0; let lastX = 0, lastY = 0;
    if (topoPaths.length > 0) {
        for (let path of topoPaths) {
            let mX_start = path[0].x; let mY_start = path[0].y; 
            distT += dist(lastX, lastY, mX_start, mY_start);
            lastX = mX_start; lastY = mY_start;
            gcodeData.push(CONFIG.penUpCmd, `G4 P${CONFIG.penDelay}`, `G0 X${mX_start.toFixed(2)} Y${mY_start.toFixed(2)} F${CONFIG.travelSpeed}`, CONFIG.penDownCmd, `G4 P${CONFIG.penDelay}`);
            for (let i = 1; i < path.length; i++) {
                let mX = path[i].x; let mY = path[i].y; 
                distT += dist(lastX, lastY, mX, mY); lastX = mX; lastY = mY;
                gcodeData.push(`G1 X${mX.toFixed(2)} Y${mY.toFixed(2)} F${CONFIG.feedRate}`);
            }
        }
    }
    gcodeData.push(CONFIG.penUpCmd, "G4 P0.5", `G0 X0 Y0 F${CONFIG.travelSpeed}`);        
    let estSeconds = (distT / (CONFIG.feedRate / 60)) + (topoPaths.length * CONFIG.penDelay * 2);
    let min = Math.floor(estSeconds / 60); let sec = Math.floor(estSeconds % 60);
    ui.valGcode.innerText = gcodeData.length;
    ui.time.innerText = `Temps Est: ${min < 10 ? '0' : ''}${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function parseGcodeToPreview() {
    topoPaths = [];
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
            if (currentPath.length > 1) topoPaths.push([...currentPath]);
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
    if (currentPath.length > 1) topoPaths.push(currentPath);
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
    ui.valStatus.innerText = `Arrêt ligne ${printIndex}`; ui.valStatus.style.color = "#ff003c";
    ui.print.innerText = "▶ LANCER"; ui.print.disabled = false;
    if (writer) { await writer.write("\x18\n"); setTimeout(async () => { await sendLine(`${CONFIG.penUpCmd}\nG0 X0 Y0`); }, 500); }
});

ui.print.addEventListener('click', async () => {
    if (!port || !gcodeData.length) return;
    
    let requestedStart = parseInt(ui.startLineInput.value) || 0;
    if (requestedStart !== printIndex && requestedStart < gcodeData.length) {
        printIndex = requestedStart;
    }

    isPrinting = true; ui.print.disabled = true; ui.print.innerText = "▶ EN COURS...";
    logConsole(`DÉBUT DESSIN à ligne ${printIndex}...`);
    ui.valStatus.innerText = "Impression..."; 
    
    if (printIndex === 0) {
        await writer.write("\r\n");
    } else {
        let lastX = 0, lastY = 0;
        for(let i = 0; i < printIndex; i++) {
            let parts = gcodeData[i].toUpperCase().split(" ");
            parts.forEach(p => {
                if (p.startsWith("X")) lastX = parseFloat(p.substring(1));
                if (p.startsWith("Y")) lastY = parseFloat(p.substring(1));
            });
        }
        arduinoReady = false;
        await writer.write(`${CONFIG.penUpCmd}\n`);
        while(!arduinoReady) await new Promise(r => setTimeout(r, 10));
        arduinoReady = false;
        await writer.write(`G0 X${lastX.toFixed(3)} Y${lastY.toFixed(3)} F${CONFIG.travelSpeed}\n`);
        while(!arduinoReady) await new Promise(r => setTimeout(r, 10));
    }
    
    let startTime = Date.now();
    for (; printIndex < gcodeData.length; printIndex++) {
        if (!isPrinting) break;
        ui.startLineInput.value = printIndex;
        arduinoReady = false; await writer.write(gcodeData[printIndex] + "\n");
        while(!arduinoReady && isPrinting) await new Promise(r => setTimeout(r, 2)); 
        
        if (printIndex % 10 === 0 || printIndex === gcodeData.length - 1) {
            let pct = Math.floor(((printIndex+1) / gcodeData.length) * 100);
            ui.prog.style.width = pct + "%"; ui.pct.innerText = pct + "%";
            let elapsed = (Date.now() - startTime) / 1000;
            let remSec = Math.floor((elapsed / (printIndex+1)) * (gcodeData.length - (printIndex+1)));
            ui.time.innerText = `Reste: ${Math.floor(remSec/60)}m ${remSec%60 < 10 ? '0' : ''}${remSec%60}s`;
        }
    }
    if (isPrinting && printIndex >= gcodeData.length) { 
        ui.prog.style.width = "100%"; ui.pct.innerText = "100%"; 
        ui.valStatus.innerText = "Terminé ✅"; 
        ui.print.innerText = "▶ LANCER"; printIndex = 0; ui.startLineInput.value = 0;
    }
    isPrinting = false; ui.print.disabled = false;
});