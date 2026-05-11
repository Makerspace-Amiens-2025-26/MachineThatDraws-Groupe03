# 🤖 MachineThatDraws

**MachineThatDraws** est un traceur vectoriel automatisé (stylo sur papier) conçu de A à Z par le Groupe 3 constituer de Loïc Islam Louis Tom. Capable de dessiner sur une surface utile de **170x140 mm**, cette machine se distingue par une indépendance logicielle totale : **toute la chaîne de contrôle et de génération de G-Code est gérée directement depuis un navigateur Web**, sans nécessiter l'installation de logiciels tiers.

---

##  Fonctionnalités Principales

-  **100% Web & Plug-and-Play :** Contrôle direct de la machine via le navigateur Chrome grâce à l'API **Web Serial**.
-  **Électronique Sur-Mesure :** Remplacement des solutions génériques par un microcontrôleur **ESP32 UNO** couplé à un **PCB "Fait Maison"** pour la puissance.
-  **Tête Hybride & Dessin Multicouleur :** Mouvement vertical (Axe Z) géré par un servomoteur et un système d'élastiques pour une pression constante. Supporte l'utilisation d'un stylo 4 couleurs (pauses automatiques pour changement manuel).
-  **Mécanique Fluide :** Guidage par tiges en acier de 6mm et bagues imprimées en **PETG-PTFE** (auto-lubrifiantes) pour un silence et une fluidité absolus.

---

##  Matériel & Ingénierie (Hardware)

### Architecture Cartésienne
La machine utilise une architecture en H (Axes X et Y indépendants) pour maximiser la rigidité, la précision géométrique et simplifier les calculs du firmware.
- **Moteurs :** NEMA 17 pour les axes X et Y (couple élevé, zéro perte de pas).
- **Axe Z :** Servomoteur ultra-léger (levée de 7 mm).
- **Transmission :** Courroies GT2 avec tendeurs micrométriques intégrés aux pièces 3D.
- **Impression 3D :** Pièces mécaniques imprimées en **PETG-CF** et **PLA-CF** (chargés en fibre de carbone) pour la rigidité structurelle. Assemblage robuste via des inserts filetés M3 en laiton.

### Électronique
- **Cerveau :** ESP32 UNO flashé avec le firmware **FluidNC** (évolution de GRBL).
- **Shield Maison :** PCB double couche routé spécifiquement pour le projet. Séparation stricte de la logique (5V/USB) et de la puissance (12V externe).
- **Sécurité :** Bouton d'Arrêt d'Urgence (BAU) et capteurs de fin de course (Endstops) mécaniques matériels avec offset de sécurité (5mm).

---

##  Suite Logicielle (Software)

L'équipe a fait le choix radical de coder ses propres "Slicers" et interfaces en **HTML, CSS et JavaScript pur**. La suite est divisée en 5 modules distincts :

### 1. Slicer Traceur (Reproduction d'Images)
Convertit n'importe quelle image matricielle (JPEG/PNG) en G-Code vectoriel. 
- Algorithme à **3 zones (Noir/Gris/Blanc)** : hachures croisées pour les zones sombres, lignes simples pour les zones grises, et épargne du papier pour les zones claires.
- Optimisation du chemin via l'algorithme du voyageur de commerce (TSP nearest neighbor).

### 2. Générateur Topographique (Art Génératif)
Crée des paysages uniques en temps réel en utilisant le **bruit de Perlin** (via `p5.js`).
- Tracé optimisé en zigzag pour éviter de lever le stylo.
- Filtrage intelligent des points superflus pour alléger le fichier G-Code.

### 3. Studio Texte CNC (Word Vectoriel)
Transforme la CNC en machine à écrire. Un véritable éditeur multi-calques qui utilise la fonction `textToPoints` pour convertir des polices TTF en coordonnées (X, Y) traçables par le stylo. Gère l'inclinaison par rotation trigonométrique.

### 4. Slicer Visage (Algorithme "Squiggle")
Un algorithme spécifique pour le portrait. Simule les ombres d'un visage en modulant l'amplitude et la fréquence d'une **onde sinusoïdale** continue, créant un effet de gravure organique.

### 5. Studio Musique CNC (Lecteur MIDI)
Détourne la fonction première de la machine pour lui faire jouer de la musique ! Convertit des fichiers `.mid` en fréquences de rotation pour faire "chanter" les moteurs pas-à-pas tout en gérant un algorithme de rebond balistique pour rester dans les limites du plateau.

---

##  Comment l'utiliser ?

1. **Branchement :** Reliez l'alimentation 12V au boîtier et connectez le câble USB à votre PC.
2. **Interface :** Ouvrez l'interface Web (fichiers HTML) dans un navigateur compatible Web Serial (ex: Google Chrome).
3. **Connexion :** Cliquez sur "Connecter USB" et sélectionnez le port série de l'ESP32 (BaudRate : 115200).
4. **Initialisation :** Lancez la procédure de *Homing* (`$H`) pour que la machine trouve son point 0,0 via les endstops.
5. **Génération & Dessin :** Choisissez un des 5 modules, paramétrez votre création en temps réel sur le canvas, puis cliquez sur "Lancer l'impression" !

---

## 👥 Équipe & Crédits

- Projet réalisé par le **Groupe 3** dans le cadre des projets académiques du **MakerSpace d'UniLaSalle Amiens**.
- **Librairies utilisées :** `p5.js` (rendu canvas et mathématiques), `imagetracer.js` (vectorisation), `@tonejs/midi` (parsing musical).
