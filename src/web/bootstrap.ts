import "./update-notice.css";
import "./adminEntryCompact.css";

const motionLabPath = /\/(?:motion-lab|tools\/motion-generator)\/?$/;

if (motionLabPath.test(window.location.pathname) || new URLSearchParams(window.location.search).has("motion-lab")) {
  void import("./motion-lab/main.js");
} else {
  void import("./main.js");
  void import("./missionUi.js");
  void import("./rewardAcquisitionFx.js");
  void import("./noticeUi.js");
  void import("./adminPanel.js");
}
