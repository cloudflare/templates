export default {
    canary: true,
    weight: 15, // 15 will send 15% of traffic to the canaryBackend, set from 0-100
    canaryBackend: "https://canary-backend.com",
    defaultBackend: "https://default-backend.com",
    salt: "canary-abc-123", // this should be unique for each release
    setCookie: true // default is false, if true proxy will set _vq cookie (for consistent assignment)
};
