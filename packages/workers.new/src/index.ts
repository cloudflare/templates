const worker: ExportedHandler = {
  async fetch(req) {
    return new Response(`request method: ${req.method}`);
  },
};

export default worker;
