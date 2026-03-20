const catalogListeners = new Set<() => void>();

export function subscribeCatalogOptionsChanged(listener: () => void): () => void {
  catalogListeners.add(listener);

  return () => {
    catalogListeners.delete(listener);
  };
}

export function emitCatalogOptionsChanged(): void {
  for (const listener of catalogListeners) {
    listener();
  }
}
