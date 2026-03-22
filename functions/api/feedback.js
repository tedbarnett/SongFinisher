export async function onRequestPost(context) {
  try {
    var body = await context.request.json();
    var name = (body.name || "").trim();
    var email = (body.email || "").trim();
    var feedback = (body.feedback || "").trim();

    if (!feedback) {
      return new Response(JSON.stringify({ error: "Feedback is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    var timestamp = new Date().toISOString();
    var key = "feedback_" + Date.now();
    var value = JSON.stringify({ name: name, email: email, feedback: feedback, timestamp: timestamp });

    await context.env.SONG_KV.put(key, value);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestGet(context) {
  try {
    var list = await context.env.SONG_KV.list({ prefix: "feedback_" });
    var entries = [];

    for (var i = 0; i < list.keys.length; i++) {
      var val = await context.env.SONG_KV.get(list.keys[i].name);
      if (val) {
        try {
          entries.push(JSON.parse(val));
        } catch (e) {
          // skip malformed entries
        }
      }
    }

    // Sort newest first
    entries.sort(function (a, b) {
      return b.timestamp > a.timestamp ? 1 : -1;
    });

    return new Response(JSON.stringify({ entries: entries }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
