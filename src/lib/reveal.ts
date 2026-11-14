// After the AI adds something, scroll to where it starts and give it a short violet glow,
// so it's clear what was added. The glow is an animation only: nothing is saved with it.
export function revealAdded(elements: Element[]) {
  const [first] = elements;
  if (!first) return;
  first.scrollIntoView({ behavior: "smooth", block: "center" });
  for (const el of elements) {
    el.animate([{ backgroundColor: "#ede9fe" }, { backgroundColor: "#ede9fe", offset: 0.6 }, { backgroundColor: "transparent" }], {
      duration: 4000,
      easing: "ease-out",
    });
  }
}

// The same, for an element found by id once the page has shown it.
export function revealById(id: string) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) revealAdded([el]);
  }, 60);
}
