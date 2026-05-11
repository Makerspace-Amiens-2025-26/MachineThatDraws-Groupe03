/* --- CONFIGURATION MACHINE CORE XY --- */
const CONFIG = {
    feedRate: 4000,       
    travelSpeed: 5000,    
    acceleration: 1000,
    penUp: 33,            // Valeur pour lever le stylo
    penDown: 0,           // Valeur pour baisser le stylo
    penDelay: 0.2,        
    bedW: 170.0,          
    bedH: 140.0           
};

/* --- VARIABLES GLOBALES --- */
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

/* --- UI ELEMENTS --- */
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
    btns: {
        gen: document.getElementById('btnGenerate'), clear: document.getElementById('btnClearTrace'), 
        dl: document.getElementById('btnDownload'), conn: document.getElementById('btnConnect'),
        print: document.getElementById('btnPrint'), stop: document.getElementById('btnStop'), home: document.getElementById('btnHome')
    }
};

/* --- P5.JS SETUP & DRAW --- */
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
    // On vérifie si la souris est bien au-dessus du canvas
    if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
        
        // On calcule un facteur de sensibilité (plus petit = plus lent)
        // 0.001 est une bonne valeur pour un contrôle précis
        let sensitivity = 0.0005;
        
        // On ajuste le zoom de manière progressive
        zoom -= event.delta * sensitivity;
        
        // On limite le zoom pour éviter de disparaître (min: 0.1, max: 20)
        zoom = constrain(zoom, 0.1, 20);
        
        redraw(); 
        return false; // Empêche la page web de défiler en même temps
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

    // Fond blanc du plateau
    fill(255); noStroke(); rect(0, 0, bedW * screenScale, bedH * screenScale);

    // --- QUADRILLAGE SIMPLIFIÉ ---
    
    // 1. Lignes de 5 mm (Subdivisions)
    stroke(220); strokeWeight(0.7);
    for(let x=0; x<=bedW; x+=5) line(x*screenScale, 0, x*screenScale, bedH*screenScale);
    for(let y=0; y<=bedH; y+=5) line(0, y*screenScale, bedW*screenScale, y*screenScale);

    // 2. Lignes de 10 mm (Repères principaux)
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

                if (sMaxX < 0 || sMinX > width || sMaxY < 0 || sMinY > height) {
                    continue; 
                }
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

/* --- LOGIQUE DE COULEURS & INTENSITÉS --- */
function autoAdjustThresholds(img) {
    img.loadPixels();
    let hist = new Array(256).fill(0);
    let totalPixels = img.width * img.height;

    for (let i = 0; i < img.pixels.length; i += 4) {
        let r = img.pixels[i], g = img.pixels[i+1], b = img.pixels[i+2];
        let brightness = Math.floor((r + g + b) / 3);
        hist[brightness]++;
    }

    let sum = 0, darkThresh = -1, lightThresh = -1;
    let pDark = totalPixels * 0.25, pLight = totalPixels * 0.75;

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
    let B = (r + g + b) / 3;
    let Sat = Math.max(r, g, b) - Math.min(r, g, b);
    
    let tD = parseInt(ui.threshDark.value) / 255.0;
    let tL = parseInt(ui.threshLight.value) / 255.0;
    
    let pen = 'none';
    let diags = 0;
    
    if (Sat < 40) {
        pen = 'black'; 
        if (B < 255 * tD) diags = 2;       
        else if (B < 255 * tL) diags = 1;  
    } else {
        let dRed = (r-255)**2 + g**2 + b**2;
        let dGreen = r**2 + (g-255)**2 + b**2;
        let dBlue = r**2 + g**2 + (b-255)**2;

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

/* --- ÉVÈNEMENTS UI --- */
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
    
    pg.pixelDensity(1); 
    pg.background(255); // CORRECTION : Force le blanc pour les PNG transparents
    pg.image(imgOriginal, 0, 0);
    
    let blurAmt = parseInt(ui.blurSlider.value) || 0;
    if (blurAmt > 0) pg.filter(BLUR, blurAmt); 
    
    let tempPg = createGraphics(pg.width, pg.height);
    tempPg.pixelDensity(1); tempPg.image(pg, 0, 0); tempPg.loadPixels();
    
    for (let i = 0; i < tempPg.pixels.length; i += 4) {
        let cat = categorizePixel(tempPg.pixels[i], tempPg.pixels[i+1], tempPg.pixels[i+2]);
        let r=255, g=255, b=255; 
        
        if (cat.pen === 'black') { 
            if(cat.diags === 2) { r=0; g=0; b=0; } else { r=130; g=130; b=130; } 
        }
        else if (cat.pen === 'red') { 
            if(cat.diags === 2) { r=180; g=0; b=0; } else { r=255; g=100; b=100; } 
        }
        else if (cat.pen === 'green') { 
            if(cat.diags === 2) { r=0; g=150; b=0; } else { r=100; g=255; b=100; } 
        }
        else if (cat.pen === 'blue') { 
            if(cat.diags === 2) { r=0; g=0; b=180; } else { r=100; g=100; b=255; } 
        }
        
        tempPg.pixels[i]=r; tempPg.pixels[i+1]=g; tempPg.pixels[i+2]=b;
    }
    tempPg.updatePixels(); imgProcessed = tempPg.get(); tempPg.remove(); redraw();
}

/* --- BOUTONS D'ACTIONS --- */
const yieldThread = () => new Promise(resolve => setTimeout(resolve, 10));

ui.btns.gen.addEventListener('click', async () => {
    if (!imgProcessed) return alert("Chargez une image !");
    
    ui.btns.gen.disabled = true;
    ui.btns.gen.innerText = "⏳ GÉNÉRATION...";
    
    const setProgress = async (pct, text) => {
        ui.progress.style.width = pct + "%";
        ui.pctText.innerText = text;
        await yieldThread();
    };

    await setProgress(5, "Initialisation (5%)...");
    
    gcodeData = []; previewPaths = [];
    printIndex = 0; 
    ui.btns.print.innerText = "▶ LANCER"; 

    let pathsByColor = { black: [], blue: [], green: [], red: [] }; 

    if (ui.checkContours.checked) {
        await setProgress(15, "Calcul des contours (15%)...");
        pathsByColor.black.push(...getContourPaths());
    }
    
    if (ui.checkHatches.checked) {
        await setProgress(35, "Calcul des hachures (35%)...");
        let hatchPaths = getColoredHatchingPaths();
        hatchPaths.forEach(p => pathsByColor[p.color].push(p.path));
    }

    let exportGroups = [];
    let pasDistance = parseFloat(ui.pasSlider.value) || 1.0;
    let minLen = parseFloat(ui.minPath.value) || 0;
    
    let colors = ['black', 'blue', 'green', 'red'];
    let baseProgression = 50;
    let stepProgression = 40 / colors.length;

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
            for(let i=1; i<seg.length; i++) totalLen += dist(seg[i-1].x, seg[i-1].y, seg[i].x, seg[i].y);
            return totalLen >= minLen;
        });

        let optimized = optimizePathOrder(filteredSegments);
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
                previewPaths.push({ 
                    color: color, 
                    path: path,
                    bounds: { minX, maxX, minY, maxY } 
                });
            });
        }
    }

    await setProgress(95, "Génération G-Code (95%)...");
    generateGCodeFromPaths(exportGroups); 
    
    await setProgress(100, "Terminé ! (100%)");
    
    setTimeout(() => {
        if (!isPrinting) {
            ui.progress.style.width = "0%";
            ui.pctText.innerText = "0%";
        }
    }, 2000);

    ui.btns.gen.disabled = false;
    ui.btns.gen.innerText = "🔄 ACTUALISER LE TRACÉ";
    
    redraw();
});

ui.btns.clear.addEventListener('click', () => {
    previewPaths = []; gcodeData = []; printIndex = 0;
    ui.btns.print.innerText = "▶ LANCER";
    ui.lineCount.innerText = "0"; ui.estimatedTime.innerText = "00:00"; redraw(); 
});

/* --- GENERATION DES HACHURES ET CONTOURS --- */
function getColoredHatchingPaths() {
    let targetW = parseFloat(ui.width.value) || 100, targetH = parseFloat(ui.height.value) || 100;
    let scale = Math.min(targetW / imgOriginal.width, targetH / imgOriginal.height);
    let densityPx = (parseFloat(ui.density.value) || 1.0) / scale;
    
    let tempPg = createGraphics(imgOriginal.width, imgOriginal.height);
    tempPg.pixelDensity(1); 
    tempPg.background(255); // CORRECTION : Fond blanc sécurisé
    tempPg.image(imgOriginal, 0, 0); 
    tempPg.loadPixels();
    
    let w = tempPg.width, h = tempPg.height;
    let paths = []; 

    let commit = (arr, color) => {
        if (arr.length > 1) paths.push({ color, path: [arr[0], arr[arr.length - 1]] });
        else if (arr.length === 1) paths.push({ color, path: [...arr] });
    };

    for (let c = -h; c < w; c += densityPx) {
        let lines = { 'black': [], 'red': [], 'green': [], 'blue': [] };
        for (let x = 0; x < w; x++) {
            let y = Math.floor(x - c);
            if (y >= 0 && y < h) {
                let i = (y * w + x) * 4;
                let cat = categorizePixel(tempPg.pixels[i], tempPg.pixels[i+1], tempPg.pixels[i+2]);
                
                if (cat.diags >= 1) {
                    ['black', 'red', 'green', 'blue'].forEach(t => {
                        if (t === cat.pen) lines[t].push({x, y});
                        else { commit(lines[t], t); lines[t] = []; }
                    });
                } else {
                    ['black', 'red', 'green', 'blue'].forEach(t => { commit(lines[t], t); lines[t] = []; });
                }
            }
        }
        ['black', 'red', 'green', 'blue'].forEach(t => commit(lines[t], t));
    }

    for (let c = 0; c < w + h; c += densityPx) {
        let lines = { 'black': [], 'red': [], 'green': [], 'blue': [] };
        for (let x = 0; x < w; x++) {
            let y = Math.floor(c - x);
            if (y >= 0 && y < h) {
                let i = (y * w + x) * 4;
                let cat = categorizePixel(tempPg.pixels[i], tempPg.pixels[i+1], tempPg.pixels[i+2]);
                
                if (cat.diags === 2) {
                    ['black', 'red', 'green', 'blue'].forEach(t => {
                        if (t === cat.pen) lines[t].push({x, y});
                        else { commit(lines[t], t); lines[t] = []; }
                    });
                } else {
                    ['black', 'red', 'green', 'blue'].forEach(t => { commit(lines[t], t); lines[t] = []; });
                }
            }
        }
        ['black', 'red', 'green', 'blue'].forEach(t => commit(lines[t], t));
    }
    
    tempPg.remove();
    return paths;
}

// CORRECTION MAJEURE : Le contour se base exactement sur les hachures
function getContourPaths() {
    let tr_pg = createGraphics(imgOriginal.width, imgOriginal.height);
    tr_pg.pixelDensity(1); 
    tr_pg.background(255); 
    tr_pg.image(imgOriginal, 0, 0);
    
    let blurAmt = parseInt(ui.blurSlider.value) || 0;
    if (blurAmt > 0) tr_pg.filter(BLUR, blurAmt); 
    
    tr_pg.loadPixels();
    
    let ctx = tr_pg.canvas.getContext('2d');
    let imgData = ctx.createImageData(tr_pg.width, tr_pg.height);
    
    // Génère une matrice strictement synchronisée avec le filtre de hachure
    for (let i = 0; i < tr_pg.pixels.length; i += 4) {
        let cat = categorizePixel(tr_pg.pixels[i], tr_pg.pixels[i+1], tr_pg.pixels[i+2]);
        
        // Si c'est hachuré, on le met en noir pur pour le traceur de bordure
        if (cat.diags >= 1) {
            imgData.data[i] = 0; imgData.data[i+1] = 0; imgData.data[i+2] = 0; imgData.data[i+3] = 255;
        } else {
            imgData.data[i] = 255; imgData.data[i+1] = 255; imgData.data[i+2] = 255; imgData.data[i+3] = 255;
        }
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
                    // CORRECTION : Plus de points générés pour avoir des courbes douces (* 0.5 au lieu de * 0.05)
                    let steps = Math.max(5, Math.ceil((dist(seg.x1, seg.y1, seg.x2, seg.y2) + dist(seg.x2, seg.y2, seg.x3, seg.y3)) * 0.5)); 
                    for (let t = 1; t <= steps; t++) currentPath.push(getQBezier({x: seg.x1, y: seg.y1}, {x: seg.x2, y: seg.y2}, {x: seg.x3, y: seg.y3}, t / steps));
                }
            }
            paths.push(currentPath);
        }
    }
    return paths;
}

/* --- OUTILS MATHÉMATIQUES & GEOMETRIQUES --- */
function getQBezier(p0, p1, p2, t) {
    let x = Math.pow(1-t,2)*p0.x + 2*(1-t)*t*p1.x + Math.pow(t,2)*p2.x;
    let y = Math.pow(1-t,2)*p0.y + 2*(1-t)*t*p1.y + Math.pow(t,2)*p2.y;
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
function dist(x1, y1, x2, y2) { return Math.sqrt((x2-x1)**2 + (y2-y1)**2); }

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

// --- OPTIMISATION ZIGZAG DES HACHURES ---
function optimizePathOrder(paths) {
    if (paths.length === 0) return [];
    let optimized = [], remaining = [...paths], currentPos = {x: 0, y: 0};
    
    let currentPath = remaining.splice(0, 1)[0];
    optimized.push(currentPath); currentPos = currentPath[currentPath.length - 1];

    let linkDist = 0.1; 

    while (remaining.length > 0) {
        let bestIdx = -1, bestDist = Infinity, reverseBest = false;
        for (let i = 0; i < remaining.length; i++) {
            let p = remaining[i];
            let d1 = dist(currentPos.x, currentPos.y, p[0].x, p[0].y);
            let d2 = dist(currentPos.x, currentPos.y, p[p.length-1].x, p[p.length-1].y);
            if (d1 < bestDist) { bestDist = d1; bestIdx = i; reverseBest = false; }
            if (d2 < bestDist) { bestDist = d2; bestIdx = i; reverseBest = true; }
        }
        let bestPath = remaining.splice(bestIdx, 1)[0];
        if (reverseBest) bestPath.reverse();
        
        if (bestDist <= linkDist) {
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

/* --- GÉNÉRATION GCODE AVEC RETOUR ZERO ET PAUSE --- */
function generateGCodeFromPaths(exportGroups) {
    gcodeData = [
        `$110=${CONFIG.travelSpeed}`, `$111=${CONFIG.travelSpeed}`, 
        `$120=${CONFIG.acceleration}`, `$121=${CONFIG.acceleration}`, 
        "$X", "G92 X0 Y0", "G21", "G90"
    ];
    
    let totalDraw=0, totalTravel=0, lastPos = {x:0, y:0};
    const colorNames = { 'black': 'NOIR', 'blue': 'BLEU', 'green': 'VERT', 'red': 'ROUGE' };
    const toolNum = { 'black': 'T0', 'blue': 'T1', 'green': 'T2', 'red': 'T3' };

    exportGroups.forEach((group, index) => {
        let col = group.color;
        
        gcodeData.push(`; --- DÉBUT COUCHE COULEUR : ${colorNames[col]} ---`);
        
        gcodeData.push(`M3 S${CONFIG.penUp}`); 
        gcodeData.push("G0 X0 Y0"); 
        gcodeData.push(`; --- PAUSE COULEUR --- : ${colorNames[col]}`); 

        gcodeData.push(`${toolNum[col]} ; Sélection Outil ${colorNames[col]}`);
        gcodeData.push(`G4 P0.5`);
        
        let yAmorceStart = 5 + (index * 15);
        let yAmorceEnd = yAmorceStart + 10; 
        
        gcodeData.push(`; Trait de purge pour amorcer l'encre`);
        gcodeData.push(`G0 X2 Y${yAmorceStart}`);              
        gcodeData.push(`M3 S${CONFIG.penDown}`);               
        gcodeData.push(`G4 P${CONFIG.penDelay}`);
        gcodeData.push(`G1 X2 Y${yAmorceEnd} F${CONFIG.feedRate}`); 
        gcodeData.push(`M3 S${CONFIG.penUp}`);                 
        gcodeData.push(`G4 P${CONFIG.penDelay}`);

        group.paths.forEach(path => {
            let start = path[0];
            totalTravel += dist(lastPos.x, lastPos.y, start.x, start.y);
            
            gcodeData.push(`M3 S${CONFIG.penUp}`); 
            gcodeData.push(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)}`);
            gcodeData.push(`M3 S${CONFIG.penDown}`);     
            gcodeData.push(`G4 P${CONFIG.penDelay}`);
            
            for(let i=1; i<path.length; i++) {
                gcodeData.push(`G1 X${path[i].x.toFixed(3)} Y${path[i].y.toFixed(3)} F${CONFIG.feedRate}`);
                totalDraw += dist(path[i-1].x, path[i-1].y, path[i].x, path[i].y);
            }
            gcodeData.push(`M3 S${CONFIG.penUp}`); 
            gcodeData.push(`G4 P${CONFIG.penDelay}`);
            lastPos = path[path.length-1];
        });
    });

    gcodeData.push(`M3 S${CONFIG.penUp}`, "G0 X0 Y0"); 

    let pathCount = exportGroups.reduce((acc, g) => acc + g.paths.length, 0);
    let t = (totalDraw/(CONFIG.feedRate*0.5)) + (totalTravel/CONFIG.travelSpeed) + ((pathCount * CONFIG.penDelay * 2)/60) + ((gcodeData.length * 0.002)/60);
    t = t * (25.0 / 14.0);
    ui.lineCount.innerText = gcodeData.length;
    ui.estimatedTime.innerText = `${Math.floor(t)}m ${Math.floor((t%1)*60)}s`;
}

/* --- COMMUNICATION USB & BOUCLE D'IMPRESSION --- */
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
                        if(line === "ok" || line.startsWith("error") || line.includes("grbl")) arduinoReady = true; 
                    }
                } 
            } 
        })();
    } catch (e) { alert("Erreur USB : " + e); }
});

ui.btns.print.addEventListener('click', async () => {
    if (!port || !gcodeData.length) return;
    
    isPrinting = true; 
    ui.btns.print.disabled = true;
    ui.btns.print.innerText = "▶ EN COURS...";
    
    if (printIndex === 0) {
        await writer.write("\r\n");
    }
    
    let startTime = Date.now(); 
    
    for (; printIndex < gcodeData.length; printIndex++) {
        if (!isPrinting) break;
        
        let ligneAEnvoyer = gcodeData[printIndex];

        if(ligneAEnvoyer.includes("; --- PAUSE COULEUR ---")) {
            isPrinting = false; 
            ui.btns.print.disabled = false;
            ui.btns.print.innerText = "▶ REPRENDRE";
            
            let colorNext = ligneAEnvoyer.split(":")[1].trim();
            ui.timeText.innerText = `⏸️ Attente : Mettez le stylo ${colorNext} puis REPRENDRE`;
            ui.timeText.style.color = "#ff9800";
            
            printIndex++; 
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
        isPrinting = false; 
        ui.btns.print.disabled = false; 
    }
});

ui.btns.stop.addEventListener('click', async () => {
    isPrinting = false; arduinoReady = true;
    printIndex = 0; 
    ui.btns.print.innerText = "▶ LANCER";
    ui.btns.print.disabled = false;
    ui.timeText.innerText = "🛑 Impression arrêtée."; ui.timeText.style.color = "#ff4444";
    if(writer) { await writer.write("\x18\n"); setTimeout(async () => { try { await writer.write(`M3 S${CONFIG.penUp}\nG0 X0 Y0\n`); } catch(e){} }, 500); }
});