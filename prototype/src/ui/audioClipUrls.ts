export const urls = import.meta.glob<string>("../../assets/audio/chud_*.ogg", {
  eager: true,
  import: "default",
  query: "?url",
});
