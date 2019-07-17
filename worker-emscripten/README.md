# 👷 `worker-emscripten-template`

A template for kick starting a Cloudflare worker project with emscripten

[`index.js`](index.js) is the content of the Workers script.  
[`main.c`](src/main.c) is the c source code that calls into the stb image resizer library.  
[`build.js`](build.js) holds the command we use to call emscripten.  
[`webpack.config.js`](webpack.config.js) holds the webpack config we use to bundle the emscripten output together with your script.

This template requires [docker](https://docs.docker.com/install/) for providing the emscripten build environment. While we believe this provides the best developer experience, if you wish to not use docker you can delete the check for docker and the docker parts of the build command in `build.js`. Note this means you must have emscripten installed on your machine.

#### Wrangler

This template requires the ^1.1.0 version of [wrangler](https://github.com/cloudflare/wrangler)

```
wrangler generate myapp https://github.com/ashleygwilliams/worker-emscripten-template
```

To demo

```
wrangler preview
```

then change the url to `https://placehold.co/600x400.jpg?width=100`
