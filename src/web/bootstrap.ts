const motionLabPath = /\/(?:motion-lab|tools\/motion-generator)\/?$/;

if (motionLabPath.test(window.location.pathname) || new URLSearchParams(window.location.search).has("motion-lab")) {
  void import("./motion-lab/main.js");
} else {
  void import("./main.js");
  void import("./home-floating-ux.js");
  void import("./missionUi.js");
}
