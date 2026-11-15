export const CATALOG_CHANGED = 'guesstrack:catalog-changed';
export const notifyCatalogChanged = (): void => { window.dispatchEvent(new Event(CATALOG_CHANGED)); };
