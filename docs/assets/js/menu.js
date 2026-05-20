(() => {
    const currentUrlStr = window.location.href.toLowerCase();
    let p = '';

    if (currentUrlStr.includes('/apps/')) {
        p = '../../';
    } else if (currentUrlStr.includes('/pages/')) {
        p = '../';
    } else {
        p = './';
    }

    const menuCode = `
    <nav class="sidebar">
        <div class="logo">
            <h2>Machine That Draws</h2>
            <p>Documentation v3.4</p>
        </div>
        <ul class="nav-links">
            <details>
                <summary>Introduction</summary>
                <ul class="sub-menu">
                    <li><a href="${p}index.html">Présentation générale</a></li>
                    <li><a href="${p}pages/objectif.html">Objectifs du projet</a></li>
                    <li><a href="${p}pages/etude.html">Étude et choix technique</a></li>
                    <li><a href="${p}pages/prototypage.html">Conception & Prototypage</a></li>
                </ul>
            </details>
            <details>
                <summary>Étapes de fabrication</summary>
                <ul class="sub-menu">
                    <li><a href="${p}pages/fab_3d.html">1. Impression 3D</a></li>
                    <li><a href="${p}pages/fab_meca.html">2. La Mécanique</a></li>
                    <li><a href="${p}pages/fab_elec.html">3. Électronique & Câblage</a></li>
                    <li><a href="${p}pages/fab_logiciel.html">4. Logiciel & Slicer</a></li>
                </ul>
            </details>
            <details>
                <summary>Électronique & Shield</summary>
                <ul class="sub-menu">
                    <li><a href="${p}pages/elec_schema.html">1. Schéma électronique</a></li>
                    <li><a href="${p}pages/elec_routage.html">2. Routage du PCB</a></li>
                    <li><a href="${p}pages/elec_fab.html">3. Fabrication de la carte</a></li>
                </ul>
            </details>
            <details>
                <summary>Conception CAO</summary>
                <ul class="sub-menu">
                    <li><a href="${p}pages/feuille.html">La feuille</a></li>
                    <li><a href="${p}pages/base.html">La base et l'axe Y</a></li>
                    <li><a href="${p}pages/axe_x.html">L'axe X</a></li>
                    <li><a href="${p}pages/axe_y.html">L'entrainement de l'axe Y</a></li>
                    <li><a href="${p}pages/tete.html">La tête de dessin</a></li>
                    <li><a href="${p}pages/boitier.html">Le boîtier électronique</a></li>
                    <li><a href="${p}pages/tendeur.html">Le tendeur de courroie</a></li>
                    <li><a href="${p}pages/bau.html">Le BAU (Arrêt d'urgence)</a></li>
                    <li><a href="${p}pages/capteurs.html">Les capteurs (Endstops)</a></li>
                    <li><a href="${p}pages/autres.html">Autres composants</a></li>
                </ul>
            </details>
            <details>
                <summary>Fonctionnement des logiciels</summary>
                <ul class="sub-menu">
                    <li><a href="${p}pages/slicer1.html">1. Slicer d'Images</a></li>
                    <li><a href="${p}pages/slicer2.html">2. Générateur Topographique</a></li>
                    <li><a href="${p}pages/slicer3.html">3. Machine a écrire</a></li>
                    <li><a href="${p}pages/slicer4.html">4. Slicer Portraits (V2)</a></li>
                    <li><a href="${p}pages/slicer5.html">5. Lecteur MIDI (Musique)</a></li>
                </ul>
            </details>
            <details>
                <summary>Ouvrir les Logiciels & Slicers</summary>
                <ul class="sub-menu">
                    <li><a href="${p}apps/Main/index.html">1. Slicer d'Images</a></li>
                    <li><a href="${p}apps/Topo/index.html">2. Générateur Topographique</a></li>
                    <li><a href="${p}apps/Word/index.html">3. Machine a écrire</a></li>
                    <li><a href="${p}apps/Visage/index.html">4. Slicer Portraits</a></li>
                    <li><a href="${p}apps/Musique/index.html">5. Lecteur MIDI (Musique)</a></li>
                    <li><a href="${p}apps/Manuel/index.html">6. Manuel</a></li>
                </ul>
            </details>
        </ul>
    </nav>
    `;

    const placeholder = document.getElementById('nav-placeholder');
    if (placeholder) {
        placeholder.innerHTML = menuCode;

        const navLinks = placeholder.querySelectorAll('.nav-links a');
        let currentUrl = new URL(window.location.href);
        let currentPath = currentUrl.pathname.toLowerCase();
        
        if (currentPath.endsWith('/')) {
            currentPath += 'index.html';
        }

        navLinks.forEach(link => {
            let linkUrl = new URL(link.href);
            let linkPath = linkUrl.pathname.toLowerCase();
            
            if (currentPath === linkPath) {
                link.classList.add('active'); 
                const parentDetails = link.closest('details');
                if (parentDetails) {
                    parentDetails.open = true;
                }
            }
        });
    }
})();