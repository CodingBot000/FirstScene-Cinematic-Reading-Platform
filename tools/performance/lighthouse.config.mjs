export default {
  extends: "lighthouse:default",
  settings: {
    onlyCategories: ["performance"],
    locale: "ko-KR",
    formFactor: "mobile",
    screenEmulation: {
      mobile: true,
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      disabled: false,
    },
    throttlingMethod: "devtools",
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      requestLatencyMs: 150,
      downloadThroughputKbps: 1638.4,
      uploadThroughputKbps: 750,
      cpuSlowdownMultiplier: 4,
    },
    disableFullPageScreenshot: true,
  },
};
