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
let isPlaying = false;
let arduinoReady = true;
let gcodeSong = [];
let parsedMidi = null;
let printIndex = 0;

const ui = {
    preset: document.getElementById('presetMidi'),
    file: document.getElementById('midiInput'),
    selectors: document.getElementById('selectors'),
    trackSelectX: document.getElementById('trackSelectX'),
    trackSelectY: document.getElementById('trackSelectY'),
    info: document.getElementById('trackInfo'),
    conn: document.getElementById('btnConnect'),
    home: document.getElementById('btnHome'),
    playButtons: document.getElementById('playButtons'),
    play: document.getElementById('btnPlay'),
    draw: document.getElementById('btnDraw'),
    stop: document.getElementById('btnStop'),
    status: document.getElementById('status'),
    progContainer: document.getElementById('progressContainer'),
    progBar: document.getElementById('progressBar'),
    console: document.getElementById('console'),
    btnImport: document.getElementById('btnImportGcode'),
    gcodeFile: document.getElementById('gcodeFileInput'),
    startLineInput: document.getElementById('startLineInput'),
    dl: document.getElementById('btnDownload')
};

function log(msg) {
    ui.console.innerHTML += `<div>> ${msg}</div>`;
    ui.console.scrollTop = ui.console.scrollHeight;
}

function processMidiBuffer(arrayBuffer) {
    try {
        parsedMidi = new Midi(arrayBuffer);
        ui.trackSelectX.innerHTML = "";
        ui.trackSelectY.innerHTML = "<option value='-1'>🤫 Moteur Y Muet</option><option value='-2'>🎸 Unisson (Copier X)</option>";
        let hasTracks = false;
        
        parsedMidi.tracks.forEach((t, i) => {
            if (t.notes.length > 0 && t.channel !== 9) {
                hasTracks = true;
                let instr = t.instrument.name || `Piste ${i+1}`;
                let text = `${instr} (${t.notes.length} notes)`;
                ui.trackSelectX.add(new Option(text, i));
                ui.trackSelectY.add(new Option(text, i));
            }
        });

        if (!hasTracks) {
            ui.info.innerHTML = "<span style='color:#ff003c'>❌ Aucune mélodie exploitable trouvée.</span>";
            return;
        }

        ui.trackSelectY.value = "-2"; 
        ui.selectors.style.display = "block";
        recalculateDuo();
    } catch (err) {
        ui.info.innerHTML = "<span style='color:#ff003c'>❌ Erreur de lecture du fichier MIDI.</span>";
        console.error(err);
    }
}

ui.preset.addEventListener('change', async (e) => {
    const filename = e.target.value;
    if (!filename) return;
    ui.file.value = ""; 
    ui.info.innerHTML = `<span style='color:#17a2b8'>⏳ Téléchargement de ${filename}...</span>`;
    
    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const buffer = await response.arrayBuffer();
        processMidiBuffer(buffer);
    } catch (err) {
        ui.info.innerHTML = "<span style='color:#ff003c'>❌ Échec. Assurez-vous d'utiliser un serveur web local.</span>";
        console.error("Fetch error:", err);
    }
});

ui.file.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    ui.preset.value = ""; 
    ui.info.innerHTML = "<span style='color:#17a2b8'>⏳ Analyse du fichier importé...</span>";
    const reader = new FileReader();
    reader.onload = function(evt) { processMidiBuffer(evt.target.result); };
    reader.readAsArrayBuffer(file);
});

ui.trackSelectX.addEventListener('change', recalculateDuo);
ui.trackSelectY.addEventListener('change', recalculateDuo);

function recalculateDuo() {
    if (!parsedMidi) return;
    let trackX = parsedMidi.tracks[ui.trackSelectX.value];
    let trackY = null;
    let valY = parseInt(ui.trackSelectY.value);
    
    if (valY === -2) trackY = trackX; 
    else if (valY >= 0) trackY = parsedMidi.tracks[valY];

    let times = new Set();
    if (trackX) trackX.notes.forEach(n => { times.add(n.time); times.add(n.time + n.duration); });
    if (trackY) trackY.notes.forEach(n => { times.add(n.time); times.add(n.time + n.duration); });
    let timeArr = Array.from(times).sort((a,b) => a - b);

    gcodeSong = [];
    gcodeSong.push("$X");         
    gcodeSong.push("G92 X0 Y0"); 
    gcodeSong.push("G21");        
    gcodeSong.push("G90");        
    gcodeSong.push(CONFIG.penUpCmd);     
    gcodeSong.push(`G4 P${CONFIG.penDelay}`);      
    gcodeSong.push(`G0 X0 Y0 F${CONFIG.travelSpeed}`);

    let currentX = 0, currentY = 0; 
    let dirX = 1, dirY = 1; 
    
    const MAX_X = CONFIG.bedW, MIN_X = 0.0;
    const MAX_Y = CONFIG.bedH, MIN_Y = 0.0;

    for (let i = 0; i < timeArr.length - 1; i++) {
        let t1 = timeArr[i];
        let t2 = timeArr[i+1];
        let intervalT = t2 - t1;
        
        if (intervalT < 0.005) continue; 
        let midTime = t1 + (intervalT / 2);
        let noteX = trackX ? trackX.notes.find(n => n.time <= midTime && (n.time + n.duration) >= midTime) : null;
        let noteY = trackY ? trackY.notes.find(n => n.time <= midTime && (n.time + n.duration) >= midTime) : null;
        let freqX = noteX ? 440 * Math.pow(2, (noteX.midi - 69) / 12) : 0;
        let freqY = noteY ? 440 * Math.pow(2, (noteY.midi - 69) / 12) : 0;

        while(freqX > 800) freqX /= 2;
        while(freqX > 0 && freqX < 100) freqX *= 2;
        while(freqY > 400) freqY /= 2;
        while(freqY > 0 && freqY < 80) freqY *= 2;

        let v_x = freqX / 40.0;
        let v_y = freqY / 21.053;
        let remainingT = intervalT;
        
        while (remainingT > 0.001) {
            let availX = (dirX === 1) ? (MAX_X - currentX) : (currentX - MIN_X);
            let availY = (dirY === 1) ? (MAX_Y - currentY) : (currentY - MIN_Y);
            let timeToWallX = (freqX > 0) ? availX / v_x : Infinity;
            let timeToWallY = (freqY > 0) ? availY / v_y : Infinity;
            let stepT = Math.min(remainingT, timeToWallX, timeToWallY);

            if (freqX === 0 && freqY === 0) {
                gcodeSong.push(`G4 P${remainingT.toFixed(3)}`);
                remainingT = 0; continue;
            }

            if (stepT < 0.001) {
                if (timeToWallX < 0.001) { dirX *= -1; currentX += dirX * 0.001; }
                if (timeToWallY < 0.001) { dirY *= -1; currentY += dirY * 0.001; }
                continue;
            }

            let dx = (freqX > 0) ? v_x * stepT * dirX : 0;
            let dy = (freqY > 0) ? v_y * stepT * dirY : 0;
            currentX += dx; currentY += dy;

            if (currentX > MAX_X) currentX = MAX_X;
            if (currentX < MIN_X) currentX = MIN_X;
            if (currentY > MAX_Y) currentY = MAX_Y;
            if (currentY < MIN_Y) currentY = MIN_Y;

            let distTotal = Math.sqrt((dx*dx) + (dy*dy));
            let feedRate = (distTotal / stepT) * 60.0;

            if (distTotal > 0.001) {
                gcodeSong.push(`G1 X${currentX.toFixed(3)} Y${currentY.toFixed(3)} F${feedRate.toFixed(1)}`);
            }
            remainingT -= stepT;

            if (Math.abs(currentX - MAX_X) < 0.002 || Math.abs(currentX - MIN_X) < 0.002) dirX *= -1;
            if (Math.abs(currentY - MAX_Y) < 0.002 || Math.abs(currentY - MIN_Y) < 0.002) dirY *= -1;
        }
    }

    gcodeSong.push(CONFIG.penUpCmd);     
    gcodeSong.push("G4 P0.5");    
    gcodeSong.push(`G0 X0 Y0 F${CONFIG.travelSpeed}`);   
    
    ui.info.innerHTML = `<span style='color:#28a745'>✅ G-Code généré : <b>${gcodeSong.length}</b> commandes.</span>`;
    printIndex = 0; ui.startLineInput.value = 0;
    if (port) { ui.play.disabled = false; ui.draw.disabled = false; }
}

ui.btnImport.addEventListener('click', () => ui.gcodeFile.click());
ui.gcodeFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        gcodeSong = ev.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        ui.info.innerHTML = `<span style='color:#00ffcc'>✅ G-Code chargé : <b>${gcodeSong.length}</b> lignes.</span>`;
        printIndex = 0; ui.startLineInput.value = 0;
        if (port) { ui.play.disabled = false; ui.draw.disabled = false; }
    };
    reader.readAsText(file);
});

ui.dl.addEventListener('click', () => {
    if (gcodeSong.length < 10) return;
    let blob = new Blob([gcodeSong.join('\n')], {type: "text/plain"});
    let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = "musique.gcode"; a.click();
});

ui.conn.addEventListener('click', async () => {
    if (!navigator.serial) return alert("Chrome requis !");
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        
        const dec = new TextDecoderStream(); port.readable.pipeTo(dec.writable);
        const reader = dec.readable.getReader();
        const enc = new TextEncoderStream(); enc.readable.pipeTo(port.writable);
        writer = enc.writable.getWriter();
        
        ui.status.innerText = "Machine Connectée ✅";
        ui.status.style.color = "#00ffcc";
        ui.conn.style.display = "none";
        ui.home.style.display = "block";
        ui.playButtons.style.display = "flex";
        ui.stop.style.display = "block";
        
        if (gcodeSong.length > 0) { ui.play.disabled = false; ui.draw.disabled = false; }

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
                        let cleanLine = line.trim().toLowerCase();
                        if(cleanLine) log("👈 " + cleanLine);
                        if(cleanLine === "ok" || cleanLine.startsWith("error") || cleanLine.includes("grbl") || cleanLine.startsWith("alarm")) {
                            arduinoReady = true; 
                        }
                    }
                } 
            } 
        })();
    } catch (e) { alert("Erreur USB : " + e); }
});

ui.home.addEventListener('click', async () => {
    if (!writer || isPlaying) return;
    try {
        await writer.write("$X\n");
        setTimeout(async () => { 
            await writer.write("$H\n"); 
            log("👉 Envoi commande Homing ($H)");
            ui.status.innerText = "🏠 Recherche de l'origine...";
            ui.status.style.color = "#17a2b8";
        }, 100);
    } catch (e) { log("Erreur Homing: " + e); }
});

async function startPerformance(isDrawing) {
    if (!writer || gcodeSong.length === 0 || isPlaying) return;
    let requestedStart = parseInt(ui.startLineInput.value) || 0;
    if (requestedStart !== printIndex && requestedStart < gcodeSong.length) {
        printIndex = requestedStart;
    }

    isPlaying = true;
    ui.play.disabled = true; ui.draw.disabled = true; ui.home.disabled = true;
    ui.progContainer.style.display = "block";
    
    if (gcodeSong.length > 4 && (gcodeSong[4] === CONFIG.penUpCmd || gcodeSong[4] === CONFIG.penDownCmd)) {
        gcodeSong[4] = isDrawing ? CONFIG.penDownCmd : CONFIG.penUpCmd;
    }
    
    if (printIndex === 0) {
        await writer.write("\r\n");
        await new Promise(r => setTimeout(r, 100));
    } else {
        let lastX = 0, lastY = 0;
        for(let i = 0; i < printIndex; i++) {
            let parts = gcodeSong[i].toUpperCase().split(" ");
            parts.forEach(p => {
                if (p.startsWith("X")) lastX = parseFloat(p.substring(1));
                if (p.startsWith("Y")) lastY = parseFloat(p.substring(1));
            });
        }
        arduinoReady = false; await writer.write(`${CONFIG.penUpCmd}\n`);
        while(!arduinoReady) await new Promise(r => setTimeout(r, 10));
        arduinoReady = false; await writer.write(`G0 X${lastX.toFixed(3)} Y${lastY.toFixed(3)} F${CONFIG.travelSpeed}\n`);
        while(!arduinoReady) await new Promise(r => setTimeout(r, 10));
        if (isDrawing) {
            arduinoReady = false; await writer.write(`${CONFIG.penDownCmd}\n`);
            while(!arduinoReady) await new Promise(r => setTimeout(r, 10));
        }
    }

    for (; printIndex < gcodeSong.length; printIndex++) {
        if (!isPlaying) break; 
        ui.startLineInput.value = printIndex;
        
        arduinoReady = false;
        let cmd = gcodeSong[printIndex];
        log("👉 " + cmd);
        
        if (isDrawing) {
            ui.status.innerHTML = `🖍️ Dessin musical en cours...`;
            ui.status.style.color = "#ff9800";
        } else {
            ui.status.innerHTML = `🎵 Concert en cours...`;
            ui.status.style.color = "#28a745";
        }
        
        await writer.write(cmd + "\n");
        let timeout = 0;
        let isPause = cmd.startsWith("G4");
        let maxWait = isPause ? 30000 : 5000; 

        while(!arduinoReady && isPlaying) { 
            await new Promise(r => setTimeout(r, 5)); 
            timeout += 5;
            if (timeout > maxWait) {
                log("⚠️ Arduino occupée, forçage Timeout");
                arduinoReady = true;
            }
        }
        ui.progBar.style.width = ((printIndex+1) / gcodeSong.length * 100) + "%";
    }

    if (isPlaying && printIndex >= gcodeSong.length) {
        ui.status.innerText = isDrawing ? "✅ Dessin terminé !" : "✅ Musique terminée !";
        ui.status.style.color = "#00ffcc";
        ui.progBar.style.width = "100%";
        setTimeout(() => { ui.progContainer.style.display = "none"; ui.progBar.style.width = "0%"; }, 2000);
        printIndex = 0;
        ui.startLineInput.value = 0;
    }
    
    isPlaying = false;
    ui.play.disabled = false;
    ui.draw.disabled = false;
    ui.home.disabled = false;
}

ui.play.addEventListener('click', () => startPerformance(false));
ui.draw.addEventListener('click', () => startPerformance(true));

ui.stop.addEventListener('click', async () => {
    isPlaying = false;
    arduinoReady = true;
    ui.status.innerText = `🛑 Arrêt ligne ${printIndex}`;
    ui.status.style.color = "#ff4444";
    if(writer) { 
        await writer.write("\x18\n"); 
        setTimeout(async () => { try { await writer.write(`${CONFIG.penUpCmd}\nG90\nG0 X0 Y0\n`); } catch(e){} }, 500); 
    }
    ui.play.disabled = false;
    ui.draw.disabled = false;
    ui.home.disabled = false;
});