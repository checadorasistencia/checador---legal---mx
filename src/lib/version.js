/* Versión del contenido de la aplicación.

   Es la que viaja en los reportes de falla y la que se compara contra el
   manifiesto de actualizaciones. Al empaquetar, el proceso principal puede
   sobreescribirla con la del instalador; mientras tanto manda esta. */
export const VERSION = '30.15.0';
export const CANAL = 'estable';

export const versionInstalada = () => {
  try { return window.actualizador?.version ?? VERSION; } catch { return VERSION; }
};