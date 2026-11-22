type LoadArt = (progress: (complete: number, total: number) => void) => Promise<string[]>;

export async function preloadScreens(loadArt: LoadArt, loadEssentialSound: () => Promise<void>): Promise<string[]> {
  const bar = document.querySelector<HTMLProgressElement>("#preload")!;
  const essentialSound = loadEssentialSound();
  const art = await loadArt((complete, total) => {
    bar.max = total + 1;
    bar.value = complete;
  });
  await essentialSound;
  bar.value = bar.max;
  return art;
}
