export default {
    abtest: true,
    origins: [
        { url: "https://a.com" },
        { url: "https://b.com" },
        { url: "https://c.com" }
        // any number of origins may be tested
    ],
    salt: "test-abc-123", // this salt should be unique for each test so that users get randomized independently across tests
    setCookie: true // default is false, if true proxy will set _vq cookie (for consistent assignment)
};
