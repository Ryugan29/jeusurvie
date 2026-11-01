// FIXTURE DE LINT — cible d'imports interdits (src/spike n'est importé par personne).
// ATTENTION : ce dossier SURVIT à la suppression du spike avant S1. Supprimer le code jetable de src/spike/,
// mais garder src/spike/__lint_fixtures__/ : il prouve que « personne n'importe src/spike » reste vérifié.
export const spike = 1;
