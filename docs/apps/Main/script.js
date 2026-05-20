const CONFIG = {
    feedRate: 1500,       
    travelSpeed: 2000,    
    penUpCmd: "G53 G0 Z0",        
    penDownCmd: "G53 G0 Z-1",  
    penDelay: 0.2,        
    bedW: 170.0,          
    bedH: 140.0         
};

let imgOriginal, imgProcessed, pg;
let gcodeData = [];
let previewPaths = []; 
let imgRatio = 1.0; 
let zoom = 1.0;
let panX = 0, panY = 0; 
let port, writer;
let isPrinting = false;
let arduinoReady = true;
let printIndex = 0; 
let wasPausedByColor = false;

const ui = {
    file: document.getElementById('fileInput'),
    threshDark: document.getElementById('threshDark'),
    threshLight: document.getElementById('threshLight'),
    valDark: document.getElementById('valDark'),
    valLight: document.getElementById('valLight'),
    blurSlider: document.getElementById('blurSlider'),
    blurVal: document.getElementById('blurVal'),
    density: document.getElementById('densityInput'),
    densityVal: document.getElementById('densityVal'),
    pasSlider: document.getElementById('pasSlider'),
    pasVal: document.getElementById('pasVal'),
    width: document.getElementById('widthInput'),
    height: document.getElementById('heightInput'),
    offsetX: document.getElementById('offsetXInput'),
    offsetY: document.getElementById('offsetYInput'),
    checkRatio: document.getElementById('checkRatio'), 
    invertX: document.getElementById('checkInvertX'),
    invertY: document.getElementById('checkInvertY'),
    minPath: document.getElementById('minPathInput'),
    checkContours: document.getElementById('checkContours'),
    checkHatches: document.getElementById('checkHatches'),
    status: document.getElementById('status'),
    progress: document.getElementById('progressBar'),
    pctText: document.getElementById('progressText'),
    timeText: document.getElementById('timeText'),
    lineCount: document.getElementById('lineCount'),
    estimatedTime: document.getElementById('estimatedTime'),
    startLineInput: document.getElementById('startLineInput'),
    btnImport: document.getElementById('btnImportGcode'),
    gcodeFile: document.getElementById('gcodeFileInput'),
    btns: {
        gen: document.getElementById('btnGenerate'), clear: document.getElementById('btnClearTrace'), 
        dl: document.getElementById('btnDownload'), conn: document.getElementById('btnConnect'),
        print: document.getElementById('btnPrint'), stop: document.getElementById('btnStop'), home: document.getElementById('btnHome')
    }
};

function setup() {
    let container = document.getElementById('canvas-container');
    let cnv = createCanvas(container.clientWidth, container.clientHeight);
    cnv.parent('canvas-container');
    pixelDensity(1); background(50); noLoop(); 
}

function windowResized() {
    let container = document.getElementById('canvas-container');
    resizeCanvas(container.clientWidth, container.clientHeight);
    redraw();
}

function mouseWheel(event) {
    if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
        let sensitivity = 0.0005;
        zoom -= event.delta * sensitivity;
        zoom = constrain(zoom, 0.1, 20);
        redraw(); 
        return false; 
    }
}

function mouseDragged() {
    if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
        panX += movedX; panY += movedY; redraw(); return false;
    }
}

function draw() {
    background(50); 
    fill(200); noStroke(); textSize(14); textAlign(LEFT, TOP);
    text("⚙️ 4-Stylos (1 & 2 passages) | Ordre: Noir > Bleu > Vert > Rouge", 15, 60);

    let bedW = CONFIG.bedW, bedH = CONFIG.bedH, margin = 40;
    let baseScale = min((width - margin) / bedW, (height - margin) / bedH);
    let screenScale = baseScale * zoom;

    let tx = ((width - bedW * screenScale) / 2) + panX;
    let ty = ((height - bedH * screenScale) / 2) + panY;

    push();
    translate(tx, ty);

    fill(255); noStroke(); rect(0, 0, bedW * screenScale, bedH * screenScale);

    stroke(220); strokeWeight(0.7);
    for(let x=0; x<=bedW; x+=5) line(x*screenScale, 0, x*screenScale, bedH*screenScale);
    for(let y=0; y<=bedH; y+=5) line(0, y*screenScale, bedW*screenScale, y*screenScale);

    stroke(180); strokeWeight(1.2);
    for(let x=0; x<=bedW; x+=10) line(x*screenScale, 0, x*screenScale, bedH*screenScale);
    for(let y=0; y<=bedH; y+=10) line(0, y*screenScale, bedW*screenScale, y*screenScale);

    if (imgProcessed) {
        let targetW = parseFloat(ui.width.value) || 100, targetH = parseFloat(ui.height.value) || 100;
        let offX = parseFloat(ui.offsetX.value) || 0, offY = parseFloat(ui.offsetY.value) || 0;
        let drawX = offX * screenScale, drawY = (bedH - targetH - offY) * screenScale;
        
        push();
        tint(255, 60); 
        let scX = ui.invertX.checked ? -1 : 1, scY = ui.invertY.checked ? -1 : 1;
        translate(drawX + (targetW * screenScale)/2, drawY + (targetH * screenScale)/2);
        scale(scX, scY); imageMode(CENTER);
        image(imgProcessed, 0, 0, targetW * screenScale, targetH * screenScale);
        imageMode(CORNER); noTint(); pop();
    }

    if (previewPaths.length > 0) {
        noFill(); strokeWeight(1.2);
        
        for (let pathObj of previewPaths) {
            if (pathObj.bounds) {
                let sMinX = pathObj.bounds.minX * screenScale + tx;
                let sMaxX = pathObj.bounds.maxX * screenScale + tx;
                let sMinY = (bedH - pathObj.bounds.maxY) * screenScale + ty; 
                let sMaxY = (bedH - pathObj.bounds.minY) * screenScale + ty;
                if (sMaxX < 0 || sMinX > width || sMaxY < 0 || sMinY > height) continue; 
            }

            if (pathObj.color === 'black') stroke(10, 10, 10, 220);
            else if (pathObj.color === 'red') stroke(230, 0, 0, 200);
            else if (pathObj.color === 'green') stroke(0, 200, 0, 200);
            else if (pathObj.color === 'blue') stroke(0, 50, 255, 200);

            beginShape();
            for (let pt of pathObj.path) vertex(pt.x * screenScale, (bedH - pt.y) * screenScale);
            endShape();
        }
    }
    pop();
}

function autoAdjustThresholds(img) {
    img.loadPixels();
    const hist = new Uint32Array(256);
    const totalPixels = img.width * img.height;
    const pixels = img.pixels;

    for (let i = 0, len = pixels.length; i < len; i += 4) {
        const brightness = Math.floor((pixels[i] + pixels[i+1] + pixels[i+2]) / 3);
        hist[brightness]++;
    }

    let sum = 0, darkThresh = -1, lightThresh = -1;
    const pDark = totalPixels * 0.25, pLight = totalPixels * 0.75;

    for (let i = 0; i < 256; i++) {
        sum += hist[i];
        if (sum >= pDark && darkThresh === -1) darkThresh = i;
        if (sum >= pLight && lightThresh === -1) lightThresh = i;
    }

    if (darkThresh === -1) darkThresh = 85;
    if (lightThresh === -1) lightThresh = 170;
    if (lightThresh <= darkThresh + 20) lightThresh = Math.min(255, darkThresh + 40);

    ui.threshDark.value = darkThresh; ui.valDark.innerText = darkThresh;
    ui.threshLight.value = lightThresh; ui.valLight.innerText = lightThresh;
}

function categorizePixel(r, g, b) {
    const B = (r + g + b) / 3;
    const Sat = Math.max(r, g, b) - Math.min(r, g, b);
    const tD = parseInt(ui.threshDark.value) / 255.0;
    const tL = parseInt(ui.threshLight.value) / 255.0;
    
    let pen = 'none';
    let diags = 0;
    
    if (Sat < 40) {
        pen = 'black'; 
        if (B < 255 * tD) diags = 2;       
        else if (B < 255 * tL) diags = 1;  
    } else {
        const rInv = r-255, gInv = g-255, bInv = b-255;
        const rSq = r*r, gSq = g*g, bSq = b*b;
        const dRed = rInv*rInv + gSq + bSq;
        const dGreen = rSq + gInv*gInv + bSq;
        const dBlue = rSq + gSq + bInv*bInv;

        let minD = dRed; 
        pen = 'red';
        if (dGreen < minD) { minD = dGreen; pen = 'green'; }
        if (dBlue < minD) { minD = dBlue; pen = 'blue'; }
        
        if (B < 255 * tD) diags = 2;       
        else if (B < 255 * tL) diags = 1;  
    }
    if (diags === 0) pen = 'none'; 
    return { pen: pen, diags: diags };
}

ui.file.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        loadImage(URL.createObjectURL(file), (loadedImg) => {
            imgOriginal = loadedImg; imgRatio = loadedImg.width / loadedImg.height;
            if (ui.checkRatio.checked) ui.height.value = ((parseFloat(ui.width.value) || 100) / imgRatio).toFixed(1);
            zoom = 1; panX = 0; panY = 0; checkDimensions(); 
            autoAdjustThresholds(imgOriginal); applyFilters(); 
        });
    }
});

ui.threshDark.addEventListener('input', () => { ui.valDark.innerText = ui.threshDark.value; applyFilters(); });
ui.threshLight.addEventListener('input', () => { ui.valLight.innerText = ui.threshLight.value; applyFilters(); });
ui.blurSlider.addEventListener('input', () => { ui.blurVal.innerText = ui.blurSlider.value; applyFilters(); });
ui.density.addEventListener('input', () => { ui.densityVal.innerText = ui.density.value; });
ui.pasSlider.addEventListener('input', () => { ui.pasVal.innerText = ui.pasSlider.value; });
ui.invertX.addEventListener('change', () => { redraw(); });
ui.invertY.addEventListener('change', () => { redraw(); });
ui.width.addEventListener('input', () => { if (ui.checkRatio.checked && imgOriginal) ui.height.value = (parseFloat(ui.width.value) / imgRatio).toFixed(1); checkDimensions(); redraw(); });
ui.height.addEventListener('input', () => { if (ui.checkRatio.checked && imgOriginal) ui.width.value = (parseFloat(ui.height.value) * imgRatio).toFixed(1); checkDimensions(); redraw(); });
ui.offsetX.addEventListener('input', () => { checkDimensions(); redraw(); });
ui.offsetY.addEventListener('input', () => { checkDimensions(); redraw(); });

function checkDimensions() {
    let w = parseFloat(ui.width.value) || 100, h = parseFloat(ui.height.value) || 100;
    ui.width.value = Math.max(1, w).toFixed(1); ui.height.value = Math.max(1, h).toFixed(1);
}

function applyFilters() {
    if (!imgOriginal) return;
    if (!pg) pg = createGraphics(imgOriginal.width, imgOriginal.height);
    else pg.resizeCanvas(imgOriginal.width, imgOriginal.height);
    
    pg.pixelDensity(1); pg.background(255); pg.image(imgOriginal, 0, 0);
    let blurAmt = parseInt(ui.blurSlider.value) || 0;
    if (blurAmt > 0) pg.filter(BLUR, blurAmt); 
    
    let tempPg = createGraphics(pg.width, pg.height);
    tempPg.pixelDensity(1); tempPg.image(pg, 0, 0); tempPg.loadPixels();
    
    const pixels = tempPg.pixels;
    for (let i = 0, len = pixels.length; i < len; i += 4) {
        let cat = categorizePixel(pixels[i], pixels[i+1], pixels[i+2]);
        let r=255, g=255, b=255; 
        if (cat.pen === 'black') { if(cat.diags === 2) { r=0; g=0; b=0; } else { r=130; g=130; b=130; } }
        else if (cat.pen === 'red') { if(cat.diags === 2) { r=180; g=0; b=0; } else { r=255; g=100; b=100; } }
        else if (cat.pen === 'green') { if(cat.diags === 2) { r=0; g=150; b=0; } else { r=100; g=255; b=100; } }
        else if (cat.pen === 'blue') { if(cat.diags === 2) { r=0; g=0; b=180; } else { r=100; g=100; b=255; } }
        pixels[i]=r; pixels[i+1]=g; pixels[i+2]=b;
    }
    tempPg.updatePixels(); imgProcessed = tempPg.get(); tempPg.remove(); redraw();
}

const yieldThread = () => new Promise(resolve => setTimeout(resolve, 5));

ui.btns.gen.addEventListener('click', async () => {
    if (!imgProcessed) return alert("Chargez une image !");
    
    ui.btns.gen.disabled = true; ui.btns.gen.innerText = "⏳ GÉNÉRATION...";
    const setProgress = async (pct, text) => { ui.progress.style.width = pct + "%"; ui.pctText.innerText = text; await yieldThread(); };
    await setProgress(5, "Initialisation (5%)...");
    
    gcodeData = []; previewPaths = []; printIndex = 0; ui.startLineInput.value = 0; ui.btns.print.innerText = "▶ LANCER"; 
    let pathsByColor = { black: [], blue: [], green: [], red: [] }; 

    if (ui.checkContours.checked) {
        await setProgress(15, "Calcul des contours (15%)...");
        pathsByColor.black.push(...getContourPaths());
    }
    
    if (ui.checkHatches.checked) {
        await setProgress(35, "Calcul des hachures (35%)...");
        let hatchPaths = getColoredHatchingPaths();
        for (let i=0; i<hatchPaths.length; i++) pathsByColor[hatchPaths[i].color].push(hatchPaths[i].path);
    }

    let exportGroups = [];
    let pasDistance = parseFloat(ui.pasSlider.value) || 1.0;
    let minLen = parseFloat(ui.minPath.value) || 0;
    let colors = ['black', 'blue', 'green', 'red'];
    let baseProgression = 50, stepProgression = 40 / colors.length;

    for (let i = 0; i < colors.length; i++) {
        let color = colors[i];
        if (pathsByColor[color].length === 0) continue;
        await setProgress(baseProgression + (i * stepProgression), `Optimisation : ${color}...`);

        let transformed = transformPathsToMachineSpace(pathsByColor[color]);
        if (color === 'black') applyBorderIfExceeding(transformed);
        let clippedSegments = clipPaths(transformed);
        let resampledSegments = [];
        
        clippedSegments.forEach(segment => {
            let resampled = resamplePath(segment, pasDistance);
            if (resampled.length > 1) resampledSegments.push(resampled);
        });
        
        let filteredSegments = resampledSegments.filter(seg => {
            let totalLen = 0;
            for(let j=1; j<seg.length; j++) totalLen += dist(seg[j-1].x, seg[j-1].y, seg[j].x, seg[j].y);
            return totalLen >= minLen;
        });

        let optimized = await optimizePathOrder(filteredSegments);
        if (optimized.length > 0) {
            exportGroups.push({ color: color, paths: optimized });
            optimized.forEach(path => {
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                for (let pt of path) {
                    if (pt.x < minX) minX = pt.x;
                    if (pt.x > maxX) maxX = pt.x;
                    if (pt.y < minY) minY = pt.y;
                    if (pt.y > maxY) maxY = pt.y;
                }
                previewPaths.push({ color: color, path: path, bounds: { minX, maxX, minY, maxY } });
            });
        }
    }

    await setProgress(95, "Génération G-Code (95%)...");
    generateGCodeFromPaths(exportGroups); 
    await setProgress(100, "Terminé ! (100%)");
    
    setTimeout(() => { if (!isPrinting) { ui.progress.style.width = "0%"; ui.pctText.innerText = "0%"; } }, 2000);
    ui.btns.gen.disabled = false; ui.btns.gen.innerText = "🔄 ACTUALISER LE TRACÉ";
    redraw();
});

ui.btns.clear.addEventListener('click', () => {
    previewPaths = []; gcodeData = []; printIndex = 0; ui.startLineInput.value = 0;
    ui.btns.print.innerText = "▶ LANCER"; ui.lineCount.innerText = "0"; ui.estimatedTime.innerText = "00:00"; redraw(); 
});

ui.btnImport.addEventListener('click', () => ui.gcodeFile.click());
ui.gcodeFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        gcodeData = ev.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        parseGcodeToPreview();
        ui.lineCount.innerText = gcodeData.length;
        ui.estimatedTime.innerText = "Calculé via G-Code";
        ui.startLineInput.value = 0; printIndex = 0; wasPausedByColor = false;
        ui.btns.print.innerText = "▶ LANCER";
        if(ui.btns.print.disabled && port) ui.btns.print.disabled = false;
        redraw();
    };
    reader.readAsText(file);
});

function parseGcodeToPreview() {
    previewPaths = [];
    let currentColor = 'black';
    let currentPath = [];
    let cx = 0, cy = 0;
    let isPenDown = false;

    for (let line of gcodeData) {
        let l = line.toUpperCase();
        if (l.includes("PAUSE COULEUR")) {
            if (l.includes("ROUGE")) currentColor = 'red';
            else if (l.includes("VERT")) currentColor = 'green';
            else if (l.includes("BLEU")) currentColor = 'blue';
            else currentColor = 'black';
        }
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
            if (currentPath.length > 1) previewPaths.push({ color: currentColor, path: [...currentPath], bounds: null });
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
    if (currentPath.length > 1) previewPaths.push({ color: currentColor, path: currentPath, bounds: null });
}

function getColoredHatchingPaths() {
    let targetW = parseFloat(ui.width.value) || 100, targetH = parseFloat(ui.height.value) || 100;
    let scale = Math.min(targetW / imgOriginal.width, targetH / imgOriginal.height);
    let densityPx = Math.max(0.5, (parseFloat(ui.density.value) || 1.0) / scale);
    
    let tempPg = createGraphics(imgOriginal.width, imgOriginal.height);
    tempPg.pixelDensity(1); tempPg.background(255); tempPg.image(imgOriginal, 0, 0); tempPg.loadPixels();
    
    let w = tempPg.width, h = tempPg.height, paths = []; 
    const pixels = tempPg.pixels;
    let commit = (arr, color) => {
        if (arr.length > 1) paths.push({ color, path: [arr[0], arr[arr.length - 1]] });
        else if (arr.length === 1) paths.push({ color, path: [...arr] });
    };
    const colorKeys = ['black', 'red', 'green', 'blue'];

    for (let c = -h; c < w; c += densityPx) {
        let lines = { 'black': [], 'red': [], 'green': [], 'blue': [] };
        for (let x = 0; x < w; x++) {
            let y = Math.floor(x - c);
            if (y >= 0 && y < h) {
                let i = (y * w + x) * 4;
                let cat = categorizePixel(pixels[i], pixels[i+1], pixels[i+2]);
                if (cat.diags >= 1) {
                    for(let j=0; j<4; j++) {
                        let t = colorKeys[j];
                        if (t === cat.pen) lines[t].push({x, y});
                        else { commit(lines[t], t); lines[t] = []; }
                    }
                } else {
                    for(let j=0; j<4; j++) { commit(lines[colorKeys[j]], colorKeys[j]); lines[colorKeys[j]] = []; }
                }
            }
        }
        for(let j=0; j<4; j++) commit(lines[colorKeys[j]], colorKeys[j]);
    }

    for (let c = 0; c < w + h; c += densityPx) {
        let lines = { 'black': [], 'red': [], 'green': [], 'blue': [] };
        for (let x = 0; x < w; x++) {
            let y = Math.floor(c - x);
            if (y >= 0 && y < h) {
                let i = (y * w + x) * 4;
                let cat = categorizePixel(pixels[i], pixels[i+1], pixels[i+2]);
                if (cat.diags === 2) {
                    for(let j=0; j<4; j++) {
                        let t = colorKeys[j];
                        if (t === cat.pen) lines[t].push({x, y});
                        else { commit(lines[t], t); lines[t] = []; }
                    }
                } else {
                    for(let j=0; j<4; j++) { commit(lines[colorKeys[j]], colorKeys[j]); lines[colorKeys[j]] = []; }
                }
            }
        }
        for(let j=0; j<4; j++) commit(lines[colorKeys[j]], colorKeys[j]);
    }
    tempPg.remove(); return paths;
}

function getContourPaths() {
    let tr_pg = createGraphics(imgOriginal.width, imgOriginal.height);
    tr_pg.pixelDensity(1); tr_pg.background(255); tr_pg.image(imgOriginal, 0, 0);
    
    let blurAmt = parseInt(ui.blurSlider.value) || 0;
    if (blurAmt > 0) tr_pg.filter(BLUR, blurAmt); 
    tr_pg.loadPixels();
    const pixels = tr_pg.pixels;
    let ctx = tr_pg.canvas.getContext('2d');
    let imgData = ctx.createImageData(tr_pg.width, tr_pg.height);
    
    for (let i = 0, len = pixels.length; i < len; i += 4) {
        let cat = categorizePixel(pixels[i], pixels[i+1], pixels[i+2]);
        if (cat.diags >= 1) { imgData.data[i] = 0; imgData.data[i+1] = 0; imgData.data[i+2] = 0; imgData.data[i+3] = 255; } 
        else { imgData.data[i] = 255; imgData.data[i+1] = 255; imgData.data[i+2] = 255; imgData.data[i+3] = 255; }
    }
    
    let tracedata = ImageTracer.imagedataToTracedata(imgData, { 
        ltres: 1, qtres: 1, pathomit: 2, rightangleenhance: false, colorsampling: 0, 
        numberofcolors: 2, mincolorratio: 0, blurradius: 0, blurdelta: 0 
    });
    tr_pg.remove();
    let paths = [];
    
    for (let i = 0; i < tracedata.layers.length; i++) {
        let color = tracedata.palette[i];
        if ((color.r + color.g + color.b) / 3 > 127) continue; 
        for (let p = 0; p < tracedata.layers[i].length; p++) {
            let path = tracedata.layers[i][p];
            if (!path.segments || path.segments.length === 0) continue;
            let currentPath = [{x: path.segments[0].x1, y: path.segments[0].y1}];
            for (let s = 0; s < path.segments.length; s++) {
                let seg = path.segments[s];
                if (seg.type === 'L') currentPath.push({x: seg.x2, y: seg.y2});
                else if (seg.type === 'Q') {
                    let steps = Math.max(5, Math.ceil((dist(seg.x1, seg.y1, seg.x2, seg.y2) + dist(seg.x2, seg.y2, seg.x3, seg.y3)) * 0.5)); 
                    for (let t = 1; t <= steps; t++) currentPath.push(getQBezier({x: seg.x1, y: seg.y1}, {x: seg.x2, y: seg.y2}, {x: seg.x3, y: seg.y3}, t / steps));
                }
            }
            paths.push(currentPath);
        }
    }
    return paths;
}

function getQBezier(p0, p1, p2, t) {
    const mt = 1 - t, mt2 = mt * mt, t2 = t * t;
    const x = mt2*p0.x + 2*mt*t*p1.x + t2*p2.x;
    const y = mt2*p0.y + 2*mt*t*p1.y + t2*p2.y;
    return {x, y};
}

function resamplePath(path, step) {
    if (path.length < 2) return path;
    let newPath = [path[0]], d = 0; 
    for (let i = 1; i < path.length; i++) {
        let p0 = path[i-1], p1 = path[i], segmentDist = dist(p0.x, p0.y, p1.x, p1.y);
        if (segmentDist === 0) continue;
        while (d + step <= segmentDist) {
            d += step; let ratio = d / segmentDist;
            newPath.push({x: Number((p0.x + (p1.x - p0.x) * ratio).toFixed(3)), y: Number((p0.y + (p1.y - p0.y) * ratio).toFixed(3))});
        }
        d -= segmentDist; 
    }
    newPath.push(path[path.length-1]); return newPath;
}

const dist = (x1, y1, x2, y2) => Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));

function transformPathsToMachineSpace(rawPaths) {
    let targetW = parseFloat(ui.width.value) || 100, targetH = parseFloat(ui.height.value) || 100;
    let offX = parseFloat(ui.offsetX.value) || 0, offY = parseFloat(ui.offsetY.value) || 0;
    let scale = Math.min(targetW / imgOriginal.width, targetH / imgOriginal.height);
    let finalW = imgOriginal.width * scale, finalH = imgOriginal.height * scale;
    return rawPaths.map(path => path.map(pt => {
        let nx = pt.x * scale, ny = pt.y * scale;
        if (ui.invertX.checked) nx = finalW - nx;
        if (!ui.invertY.checked) ny = finalH - ny; 
        return {x: nx + offX, y: ny + offY};
    }));
}

function applyBorderIfExceeding(pathsArray) {
    let targetW = parseFloat(ui.width.value) || 100, targetH = parseFloat(ui.height.value) || 100;
    let offX = parseFloat(ui.offsetX.value) || 0, offY = parseFloat(ui.offsetY.value) || 0;
    let scale = Math.min(targetW / imgOriginal.width, targetH / imgOriginal.height);
    let finalW = imgOriginal.width * scale, finalH = imgOriginal.height * scale;
    if (offX < 0 || offX + finalW > CONFIG.bedW || offY < 0 || offY + finalH > CONFIG.bedH) {
        let minX = Math.max(0, offX), maxX = Math.min(CONFIG.bedW, offX + finalW);
        let minY = Math.max(0, offY), maxY = Math.min(CONFIG.bedH, offY + finalH);
        if (minX < maxX && minY < maxY) pathsArray.push([{x: minX, y: minY}, {x: maxX, y: minY}, {x: maxX, y: maxY}, {x: minX, y: maxY}, {x: minX, y: minY}]);
    }
}

function clipLine(x0,y0,x1,y1,xmin,ymin,xmax,ymax) {
    let INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;
    let computeCode = (x, y) => (x < xmin ? LEFT : x > xmax ? RIGHT : INSIDE) | (y < ymin ? BOTTOM : y > ymax ? TOP : INSIDE);
    let outcode0 = computeCode(x0, y0), outcode1 = computeCode(x1, y1), accept = false;
    while (true) {
        if (!(outcode0 | outcode1)) { accept = true; break; }
        else if (outcode0 & outcode1) break;
        else {
            let x, y, outcodeOut = outcode0 ? outcode0 : outcode1;
            if (outcodeOut & TOP) { x = x0 + (x1 - x0) * (ymax - y0) / (y1 - y0); y = ymax; }
            else if (outcodeOut & BOTTOM) { x = x0 + (x1 - x0) * (ymin - y0) / (y1 - y0); y = ymin; }
            else if (outcodeOut & RIGHT) { y = y0 + (y1 - y0) * (xmax - x0) / (x1 - x0); x = xmax; }
            else if (outcodeOut & LEFT) { y = y0 + (y1 - y0) * (xmin - x0) / (x1 - x0); x = xmin; }
            if (outcodeOut == outcode0) { x0 = x; y0 = y; outcode0 = computeCode(x0, y0); }
            else { x1 = x; y1 = y; outcode1 = computeCode(x1, y1); }
        }
    }
    return accept ? {x0, y0, x1, y1} : null;
}

function clipPaths(rawPaths) {
    let clippedSegments = [];
    rawPaths.forEach(path => {
        let currentSeg = [];
        for (let i = 0; i < path.length - 1; i++) {
            let p1 = path[i], p2 = path[i+1];
            let clipped = clipLine(p1.x, p1.y, p2.x, p2.y, 0, 0, CONFIG.bedW, CONFIG.bedH);
            if (clipped) {
                if (currentSeg.length === 0) currentSeg.push({x: Number(clipped.x0.toFixed(3)), y: Number(clipped.y0.toFixed(3))});
                currentSeg.push({x: Number(clipped.x1.toFixed(3)), y: Number(clipped.y1.toFixed(3))});
            } else if (currentSeg.length > 1) { clippedSegments.push(currentSeg); currentSeg = []; }
        }
        if (currentSeg.length > 1) clippedSegments.push(currentSeg);
    });
    return clippedSegments;
}

async function optimizePathOrder(paths) {
    if (paths.length === 0) return [];
    const optimized = [];
    const remaining = paths.map(p => ({ path: p, start: p[0], end: p[p.length - 1] }));
    let current = remaining.shift();
    optimized.push(current.path);
    let currentPos = current.end, linkDistSq = 0.01, loopCount = 0;

    while (remaining.length > 0) {
        if (++loopCount % 200 === 0) await yieldThread(); 
        let bestIdx = -1, bestDistSq = Infinity, reverseBest = false;
        
        for (let i = 0, len = remaining.length; i < len; i++) {
            const p = remaining[i];
            const dx1 = currentPos.x - p.start.x, dy1 = currentPos.y - p.start.y;
            const d1Sq = dx1*dx1 + dy1*dy1;
            const dx2 = currentPos.x - p.end.x, dy2 = currentPos.y - p.end.y;
            const d2Sq = dx2*dx2 + dy2*dy2;
            if (d1Sq < bestDistSq) { bestDistSq = d1Sq; bestIdx = i; reverseBest = false; }
            if (d2Sq < bestDistSq) { bestDistSq = d2Sq; bestIdx = i; reverseBest = true; }
        }
        
        const bestItem = remaining.splice(bestIdx, 1)[0];
        let bestPath = bestItem.path;
        if (reverseBest) bestPath.reverse();
        
        if (bestDistSq <= linkDistSq) {
            bestPath.shift(); 
            if (bestPath.length > 0) {
                optimized[optimized.length - 1].push(...bestPath);
                currentPos = bestPath[bestPath.length - 1];
            }
        } else {
            optimized.push(bestPath);
            currentPos = bestPath[bestPath.length - 1];
        }
    }
    return optimized;
}

function generateGCodeFromPaths(exportGroups) {
    gcodeData = ["$X", "G21", "G90", "G92 X0 Y0"];
    let totalDraw=0, totalTravel=0, lastPos = {x:0, y:0};
    const colorNames = { 'black': 'NOIR', 'blue': 'BLEU', 'green': 'VERT', 'red': 'ROUGE' };

    exportGroups.forEach((group, index) => {
        let col = group.color;
        gcodeData.push(`; --- DÉBUT COUCHE COULEUR : ${colorNames[col]} ---`);
        gcodeData.push(CONFIG.penUpCmd); 
        gcodeData.push(`G0 X0 Y0 F${CONFIG.travelSpeed}`); 
        gcodeData.push(`; --- PAUSE COULEUR --- : ${colorNames[col]}`); 
        gcodeData.push(`G4 P0.5`);
        let yAmorceStart = 5 + (index * 15), yAmorceEnd = yAmorceStart + 10; 
        gcodeData.push(`; Trait de purge pour amorcer l'encre`);
        gcodeData.push(`G0 X2 Y${yAmorceStart} F${CONFIG.travelSpeed}`);              
        gcodeData.push(CONFIG.penDownCmd);               
        gcodeData.push(`G4 P${CONFIG.penDelay}`);
        gcodeData.push(`G1 X2 Y${yAmorceEnd} F${CONFIG.feedRate}`); 
        gcodeData.push(CONFIG.penUpCmd);                 
        gcodeData.push(`G4 P${CONFIG.penDelay}`);

        group.paths.forEach(path => {
            let start = path[0];
            totalTravel += dist(lastPos.x, lastPos.y, start.x, start.y);
            gcodeData.push(CONFIG.penUpCmd); 
            gcodeData.push(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} F${CONFIG.travelSpeed}`);
            gcodeData.push(CONFIG.penDownCmd);     
            gcodeData.push(`G4 P${CONFIG.penDelay}`);
            for(let i=1; i<path.length; i++) {
                gcodeData.push(`G1 X${path[i].x.toFixed(3)} Y${path[i].y.toFixed(3)} F${CONFIG.feedRate}`);
                totalDraw += dist(path[i-1].x, path[i-1].y, path[i].x, path[i].y);
            }
            gcodeData.push(CONFIG.penUpCmd); 
            gcodeData.push(`G4 P${CONFIG.penDelay}`);
            lastPos = path[path.length-1];
        });
    });

    gcodeData.push(CONFIG.penUpCmd); 
    gcodeData.push(`G0 X0 Y0 F${CONFIG.travelSpeed}`); 
    let pathCount = exportGroups.reduce((acc, g) => acc + g.paths.length, 0);
    let t = (totalDraw/(CONFIG.feedRate*0.5)) + (totalTravel/CONFIG.travelSpeed) + ((pathCount * CONFIG.penDelay * 2)/60) + ((gcodeData.length * 0.002)/60);
    t = t * (25.0 / 14.0);
    ui.lineCount.innerText = gcodeData.length;
    ui.estimatedTime.innerText = `${Math.floor(t)}m ${Math.floor((t%1)*60)}s`;
}

if(ui.btns.home) ui.btns.home.addEventListener('click', async () => {
    if (!port || !writer) return alert("Connectez la machine !");
    await writer.write("$X\n"); setTimeout(async () => { await writer.write("$H\n"); }, 100);
});

ui.btns.dl.addEventListener('click', () => { 
    if(gcodeData.length) {
        let b = new Blob([gcodeData.join('\n')], {type: "text/plain"});
        let a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = "corexy_4colors.gcode"; a.click();
    }
});

ui.btns.conn.addEventListener('click', async () => {
    if (!navigator.serial) return alert("Chrome requis pour le Web Serial");
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        ui.status.innerText = "Connecté ✅"; ui.status.style.color="#00ffcc";
        ui.btns.conn.style.display="none"; ui.btns.print.disabled=false;
        
        const dec = new TextDecoderStream(); port.readable.pipeTo(dec.writable);
        const reader = dec.readable.getReader();
        const enc = new TextEncoderStream(); enc.readable.pipeTo(port.writable);
        writer = enc.writable.getWriter();
        
        let serialBuffer = "";
        (async () => { 
            while(true) { 
                const {value, done} = await reader.read(); 
                if(done) break; 
                if(value) {
                    serialBuffer += value;
                    let lines = serialBuffer.split('\n');
                    serialBuffer = lines.pop(); 
                    for (let line of lines) {
                        line = line.trim().toLowerCase();
                        if(line === "ok" || line.startsWith("error") || line.includes("grbl") || line.includes("[msg:")) arduinoReady = true; 
                    }
                } 
            } 
        })();
    } catch (e) { alert("Erreur USB : " + e); }
});

ui.btns.print.addEventListener('click', async () => {
    if (!port || !gcodeData.length) return;
    
    let requestedStart = parseInt(ui.startLineInput.value) || 0;
    if (requestedStart !== printIndex && requestedStart < gcodeData.length) {
        printIndex = requestedStart;
        wasPausedByColor = false;
    }

    isPrinting = true; 
    ui.btns.print.disabled = true;
    ui.btns.print.innerText = "▶ EN COURS...";
    
    if (printIndex === 0) {
        await writer.write("\r\n");
    } else if (!wasPausedByColor) {
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
        while(!arduinoReady) await yieldThread();
        arduinoReady = false;
        await writer.write(`G0 X${lastX.toFixed(3)} Y${lastY.toFixed(3)} F${CONFIG.travelSpeed}\n`);
        while(!arduinoReady) await yieldThread();
    }
    
    wasPausedByColor = false;
    let startTime = Date.now(); 
    
    for (; printIndex < gcodeData.length; printIndex++) {
        if (!isPrinting) break;
        ui.startLineInput.value = printIndex;
        let ligneAEnvoyer = gcodeData[printIndex];

        if(ligneAEnvoyer.includes("; --- PAUSE COULEUR ---")) {
            isPrinting = false; 
            ui.btns.print.disabled = false;
            ui.btns.print.innerText = "▶ REPRENDRE";
            let colorNext = ligneAEnvoyer.split(":")[1].trim();
            ui.timeText.innerText = `⏸️ Attente : Mettez le stylo ${colorNext} puis REPRENDRE`;
            ui.timeText.style.color = "#ff9800";
            printIndex++;
            wasPausedByColor = true;
            return; 
        }
        
        arduinoReady = false;
        await writer.write(ligneAEnvoyer + "\n");
        while(!arduinoReady && isPrinting) await new Promise(r => setTimeout(r, 2)); 
        
        ui.progress.style.width = ((printIndex+1)/gcodeData.length*100)+"%";
        ui.pctText.innerText = Math.floor((printIndex+1)/gcodeData.length*100)+"%";
        
        let elapsedSec = (Date.now() - startTime) / 1000, linesDone = printIndex + 1, linesTotal = gcodeData.length;
        if (linesDone > 5) {
            let remSec = Math.floor((elapsedSec / linesDone) * (linesTotal - linesDone));
            ui.timeText.innerText = `⏳ Temps restant : ${Math.floor(remSec/60)}m ${remSec%60 < 10 ? '0':''}${remSec%60}s`;
            ui.timeText.style.color = "#ffc107";
        } else ui.timeText.innerText = "⏳ Calcul...";
    }
    
    if (isPrinting && printIndex >= gcodeData.length) { 
        ui.timeText.innerText = "✅ Impression terminée !"; 
        ui.timeText.style.color = "#00ffcc"; 
        ui.btns.print.innerText = "▶ LANCER";
        printIndex = 0; 
        ui.startLineInput.value = 0;
        isPrinting = false; 
        ui.btns.print.disabled = false; 
    }
});

ui.btns.stop.addEventListener('click', async () => {
    isPrinting = false; arduinoReady = true;
    ui.btns.print.innerText = "▶ LANCER";
    ui.btns.print.disabled = false;
    ui.timeText.innerText = `🛑 Arrêt à la ligne ${printIndex}`; ui.timeText.style.color = "#ff4444";
    if(writer) { 
        await writer.write("\x18\n"); 
        setTimeout(async () => { 
            try { await writer.write(`${CONFIG.penUpCmd}\nG0 X0 Y0\n`); } catch(e){} 
        }, 500); 
    }
});