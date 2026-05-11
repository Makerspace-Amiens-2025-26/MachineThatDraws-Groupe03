function highlightMenu() {
    const navLinks = document.querySelectorAll('.nav-links a');
    
    // Si le menu n'est pas encore apparu sur la page, on attend 50ms et on réessaie !
    if (navLinks.length === 0) {
        setTimeout(highlightMenu, 50);
        return;
    }

    // On récupère l'URL exacte en minuscule, sans les "#" ou "?"
    let currentUrl = window.location.href.split(/[?#]/)[0].toLowerCase();
    
    if (currentUrl.endsWith('/')) {
        currentUrl += 'index.html';
    }

    navLinks.forEach(link => {
        let linkUrl = link.href.split(/[?#]/)[0].toLowerCase();
        
        // Si les liens correspondent, on allume en rouge
        if (currentUrl === linkUrl) {
            link.classList.add('active'); 
            
            const parentDetails = link.closest('details');
            if (parentDetails) {
                parentDetails.setAttribute('open', '');
            }
        }
    });
}

// On lance la fonction dès que le fichier est lu
highlightMenu();