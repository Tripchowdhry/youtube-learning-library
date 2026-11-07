// Remembers, on this device, how far someone is through the getting-started guide.
// Kept in the browser (not the database) so it needs no SQL; the worst case on a new
// device is seeing the tour once more.

const key = (name: string, userEmail: string) => `brainshelf:${name}:${userEmail || "me"}`;

function read(name: string, userEmail: string) {
  try {
    return localStorage.getItem(key(name, userEmail)) === "1";
  } catch {
    return false;
  }
}

function write(name: string, userEmail: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key(name, userEmail), "1");
    else localStorage.removeItem(key(name, userEmail));
  } catch {
    // Private windows can block storage; the guide just shows again next time.
  }
}

export const onboarding = {
  tourDone: (email: string) => read("tour-done", email),
  setTourDone: (email: string, done: boolean) => write("tour-done", email, done),
  checklistHidden: (email: string) => read("checklist-hidden", email),
  hideChecklist: (email: string) => write("checklist-hidden", email, true),
  // Ask AI runs on the study page, which doesn't know the email, so this one is per device.
  triedAi: () => read("tried-ai", ""),
  markTriedAi: () => write("tried-ai", "", true),
};

// A short, well-known lesson new users can add with one tap to see how things work.
export const SAMPLE_VIDEO = {
  link: "https://www.youtube.com/watch?v=aircAruvnKk",
  label: "But what is a neural network? (3Blue1Brown)",
};
