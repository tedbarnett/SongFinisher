export async function onRequest(context) {
  var env = context.env;
  var hasKey = !!env.ANTHROPIC_API_KEY;
  var keyLen = env.ANTHROPIC_API_KEY ? env.ANTHROPIC_API_KEY.length : 0;
  return new Response(JSON.stringify({ hasKey: hasKey, keyLen: keyLen }), {
    headers: { "Content-Type": "application/json" }
  });
}
