// On enferme tout le code dans une fonction isolée pour éviter les conflits de variables
(() => {
    // On détecte automatiquement si on est dans un sous-dossier (j'ai rajouté Main, Word et Manuel)
    const inSubFolder = window.location.href.includes('/Slicer/') || 
                        window.location.href.includes('/Topo/') || 
                        window.location.href.includes('/Visage/') || 
                        window.location.href.includes('/Musique/') ||
                        window.location.href.includes('/Main/') ||
                        window.location.href.includes('/Word/') ||
                        window.location.href.includes('/Manuel/');

    // Si oui, on ajoute les "../" pour reculer, sinon on ne met rien
    const p = inSubFolder ? '../' : '';

    const menuCode = `
    <nav class="sidebar">
        <div class="logo">
            <h2>Machine That Draws</h2>
            <p>Documentation v3.2</p>
        </div>
        <ul class="nav-links">

            <details>
                <summary>Introduction</summary>
                <ul class="sub-menu">
                    <li><a href="${p}index.html">Présentation générale</a></li>
                    <li><a href="${p}objectif.html">Objectifs du projet</a></li>
                    <li><a href="${p}etude.html">Étude et choix technique</a></li>
                    <li><a href="${p}prototypage.html">Conception & Prototypage</a></li>
                </ul>
            </details>

            <details>
                <summary>Étapes de fabrication</summary>
                <ul class="sub-menu">
                    <li><a href="${p}fab_3d.html">1. Impression 3D</a></li>
                    <li><a href="${p}fab_meca.html">2. La Mécanique</a></li>
                    <li><a href="${p}fab_elec.html">3. Électronique & Câblage</a></li>
                    <li><a href="${p}fab_logiciel.html">4. Logiciel & Slicer</a></li>
                </ul>
            </details>
            
            <details>
                <summary>Électronique & Shield</summary>
                <ul class="sub-menu">
                    <li><a href="${p}elec_schema.html">1. Schéma électronique</a></li>
                    <li><a href="${p}elec_routage.html">2. Routage du PCB</a></li>
                    <li><a href="${p}elec_fab.html">3. Fabrication de la carte</a></li>
                </ul>
            </details>
            
            <details>
                <summary>Conception CAO</summary>
                <ul class="sub-menu">
                    <li><a href="${p}feuille.html">La feuille</a></li>
                    <li><a href="${p}base.html">La base et l'axe Y</a></li>
                    <li><a href="${p}axe_x.html">L'axe X</a></li>
                    <li><a href="${p}axe_y.html">L'entrainement de l'axe Y</a></li>
                    <li><a href="${p}tete.html">La tête de dessin</a></li>
                    <li><a href="${p}boitier.html">Le boîtier électronique</a></li>
                    <li><a href="${p}tendeur.html">Le tendeur de courroie</a></li>
                    <li><a href="${p}bau.html">Le BAU (Arrêt d'urgence)</a></li>
                    <li><a href="${p}capteurs.html">Les capteurs (Endstops)</a></li>
                    <li><a href="${p}autres.html">Autres composants</a></li>
                </ul>
            </details>
            
            <details>
                <summary>Fonctionnement des logiciels</summary>
                <ul class="sub-menu">
                    <li><a href="${p}slicer1.html">1. Slicer d'Images</a></li>
                    <li><a href="${p}slicer2.html">2. Générateur Topographique</a></li>
                    <li><a href="${p}slicer3.html">3. Machine a écrire</a></li>
                    <li><a href="${p}slicer4.html">4. Slicer Portraits (V2)</a></li>
                    <li><a href="${p}slicer5.html">5. Lecteur MIDI (Musique)</a></li>
                </ul>
            </details>

            <details>
                <summary>Ouvrir les Logiciels & Slicers</summary>
                <ul class="sub-menu">
                    <li><a href="${p}Main/index.html">1. Slicer d'Images</a></li>
                    <li><a href="${p}Topo/index.html">2. Générateur Topographique</a></li>
                    <li><a href="${p}Word/index.html">3. Machine a écrire</a></li>
                    <li><a href="${p}Visage/index.html">4. Slicer Portraits (V2)</a></li>
                    <li><a href="${p}Musique/index.html">5. Lecteur MIDI (Musique)</a></li>
                    <li><a href="${p}Manuel/index.html">6. Manuel</a></li>
                </ul>
            </details>
        </ul>
    </nav>
    `;

    // On injecte ce gros bloc de code dans la page HTML
    const placeholder = document.getElementById('nav-placeholder');
    if (placeholder) {
        placeholder.innerHTML = menuCode;
    }
})();