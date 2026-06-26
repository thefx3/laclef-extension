# La CLEF Assistant

Extension Chrome locale pour automatiser des taches ANIAPPS et billetterie La CLEF.

## Fonctions incluses

- ANIAPPS paniers en attente : ajoute les activites et recalcule le prix total avec cache local.
- ANIAPPS paiements famille : bouton `Generer SEPA` pour creer une serie de mensualites.
- ANIAPPS programmations : panneau `Auto programmations` pour coller un tableau JSON et lancer la duplication/remplissage.
- ANIAPPS exports : bouton `Exporter + tarifs` pour exporter les programmations avec code inscription, type tarif et tarif.
- ANIAPPS soldes familles : onglet `Soldes familles` pour coller une liste de mails, retrouver les familles, verifier justificatif, souscriptions actives et solde de la saison.
- ANIAPPS contacts -> billetterie : bouton `Copier billetterie`, puis bouton `Remplir depuis ANIAPPS` sur la billetterie.
- Popup Chrome : affiche le dernier client copie et propose des raccourcis vers les deux outils.

## Installation dans Chrome

1. Ouvre Chrome et va sur `chrome://extensions`.
2. Active `Mode developpeur` en haut a droite.
3. Clique sur `Charger l'extension non empaquetee`.
4. Selectionne le dossier `C:\projects\laclef-extension`.
5. Epingle l'extension si tu veux acceder rapidement au popup.

Apres une modification du code, retourne sur `chrome://extensions` puis clique sur l'icone `Actualiser` de l'extension.

## Utilisation

### Paniers ANIAPPS

Va sur `https://laclef.aniapp.fr/admin/pending_checkouts`.
L'extension ajoute une colonne `Activites`, remplace `Souscriptions` par `Prix total panier`, et ajoute un bouton `Actualiser cache`.

### Paiements SEPA

Va sur une page famille ANIAPPS, onglet paiements.
Le bouton `Generer SEPA` apparait a cote du bouton de creation/mise a jour du paiement, ou a cote du bouton d'ajout sur la liste.
Clique dessus, puis renseigne la fenetre integree :

- montant total ;
- nombre de mensualites ;
- date de premiere mensualite au format `AAAA-MM-JJ` ;
- jour d'encaissement `1` ou `15`.

L'extension remplit, enregistre, duplique, puis avance jusqu'a la derniere mensualite.

### Programmations

Va sur une page d'edition de programmation ANIAPPS.
Clique sur `Auto programmations`, colle un tableau JSON, puis `Demarrer`.
Cela remplace l'ancien usage console/Tampermonkey : l'extension enregistre elle-meme `aniapps_programmations`, remet l'index a `0`, passe le mode en `fill`, puis lance l'automatisation.

Format attendu :

```json
[
  {
    "label": "Atelier exemple",
    "debut": "18:00",
    "fin": "19:30",
    "duree": "1:30",
    "jour": "1",
    "salle": "12",
    "prof": "34",
    "places": "15",
    "tarif": "300"
  }
]
```

Le champ `Lien de duplication a utiliser` vaut `/clone/7` par defaut, comme dans ton script Tampermonkey.

Cycle automatique :

1. `fill` : l'extension remplit la fiche actuelle avec la programmation de l'index courant.
2. Elle clique sur `Modifier la programmation`.
3. `clone` : elle passe a l'index suivant et clique sur le lien de duplication.
4. Elle valide la duplication, puis recommence en `fill` sur la nouvelle fiche.
5. Quand toutes les lignes sont traitees, elle arrete l'automatisation.

### Export programmations avec tarifs

Va sur `https://laclef.aniapp.fr/admin/ani_exports`.
Dans le bloc `Programmations (Offre)`, choisis la saison puis clique sur `Exporter + tarifs`.

L'extension :

1. recupere le CSV ANIAPPS de la saison choisie ;
2. lit chaque `ID Programmation` ;
3. ouvre en arriere-plan la page d'edition correspondante ;
4. ajoute `Code inscription`, `Type tarif` et `Tarif` a la ligne correspondante ;
5. telecharge un CSV final limite aux colonnes utiles.

### Soldes familles

Va sur ANIAPPS admin puis clique sur `Soldes familles` dans le menu lateral.
Colle une selection Google Sheets contenant des mails, choisis la saison, puis clique sur `Chercher familles`.

L'extension regroupe les mails par famille et affiche :

- le nom de la famille ;
- le justificatif de domicile valide pour la saison ;
- les souscriptions actives de chaque adherent, adhesion comprise ;
- le solde global a payer, ou l'avoir si le solde est negatif.

Les souscriptions arretees, annulees ou avec date d'arret sont ignorees. Le bouton `Copier export` produit un TSV recollable dans Google Sheets.

### Billetterie

Sur les contacts d'une famille ANIAPPS, clique sur `Copier billetterie` sur la ligne du contact.
Sur `https://billetterie.laclef.asso.fr`, clique sur `Remplir depuis ANIAPPS`, place dans l'en-tete du formulaire client a cote de `Creer un compte`.

## Notes

Cette premiere version garde les scripts simples et lisibles : pas de compilation, pas de dependances npm, pas de publication Chrome Web Store. Elle est pensee pour un usage local sur ton poste.

Les scripts ANIAPPS sont charges sur tout `/admin/*` pour rester actifs quand ANIAPPS change de page sans rechargement complet. Apres une modification du code source, il faut quand meme cliquer sur `Actualiser` dans `chrome://extensions`, puis recharger l'onglet une fois.
