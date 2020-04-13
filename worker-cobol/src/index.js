import EM from "../build/out.js"

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  globalThis.response = {
    status: 200,
    body: "",
  };

  const load = new Promise((resolve, reject) => {
    EM({
      instantiateWasm(info, receive) {
        let instance = new WebAssembly.Instance(wasm, info)
        receive(instance)
        return instance.exports
      },
    }).then(module => {
      delete module.then;
      resolve(module);
    });
  })

  try {
    const instance = (await load);
    try {
      instance._entry();
    } catch (e) {
      // emscripten throws an exception when the program terminates, even with 0
      if (e.name !== "ExitStatus") {
        throw e;
      }
    }

    return new Response(globalThis.response.body, {
      status: globalThis.response.status
    });
  } catch (e) {
    console.log(e);
    return new Response(e.stack, { status: 500 });
  }
}
