# 👷 `worker-emscripten-template`

A template for kick starting a Cloudflare worker project with emscripten

[`index.js`](index.js) is the content of the Workers script.  
[`main.c`](src/main.c) is the c source code that calls into the stb image resizer library.  
[`build.js`](build.js) holds the command we use to call emscripten.  
[`webpack.config.js`](webpack.config.js) holds the webpack config we use to bundle the emscripten output together with your script.

This template requires [Docker](https://docs.docker.com/install/) for providing the emscripten build environment. While we believe this provides the best developer experience, if you wish to not use Docker you can delete the check for docker and the docker parts of the build command in `build.js`. Note this means you must have emscripten installed on your machine.

## Wrangler

This template requires version >=1.6.0 of [Wrangler](https://github.com/cloudflare/wrangler)

```console
$ wrangler generate myapp https://github.com/cloudflare/worker-emscripten-template
🔧   Creating project called `myapp`...
✨   Done! New project created /path/to/myapp
```

To demo you can use [`wrangler dev`](https://developers.cloudflare.com/workers/tooling/wrangler/commands/#dev-(alpha))

```console
$ wrangler dev
👂 Listening on http://localhost:8787
```

```console
$ curl http://localhost:8787/600*400.jpg?width=100
```

Shoutout to [Surma](https://twitter.com/dassurma) for his [webpack-emscripten-wasm](https://gist.github.com/surma/b2705b6cca29357ebea1c9e6e15684cc) gist that was instrumental in getting this working!
