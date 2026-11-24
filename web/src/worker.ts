export default {
  async fetch(): Promise<Response> {
    return new Response("Claudimix arrive bientôt.", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
