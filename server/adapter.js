// Connects our route handlers to Cloudflare Pages Functions.
// Cloudflare passes the environment variables in with each request.
export function wrap(handler) {
  return (context) => {
    globalThis.__GG_ENV = context.env;
    return handler(context.request);
  };
}
