import jwttoken from "jsonwebtoken";

const devtoken = jwttoken.sign(
    {
        url: "https://example.com"
    },
    process.env["JWT_SECRET_KEY"]
);

console.log(devtoken);
