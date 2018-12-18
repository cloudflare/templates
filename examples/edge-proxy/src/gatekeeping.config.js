export default {
    JWT_SECRET_KEY: process.env["JWT_SECRET_KEY"],
    setGatekeepingCookie: true // default is false, if true will set a 1 day cookie with the JWT
    /* can be used in conjuction with any other config */
};
