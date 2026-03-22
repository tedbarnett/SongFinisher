export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { headers: {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST","Access-Control-Allow-Headers":"*"} });
  }
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({method: context.request.method, hasKey: !!context.env.ANTHROPIC_API_KEY}), {headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
  }

  var env = context.env;
  var body = await context.request.json();
  var files = body.files || [];
  var description = body.description || "";

  var fileList = files.map(function(f, i) {
    return (i+1) + ". " + f.name + " (" + (f.duration ? f.duration.toFixed(1) + "s" : "?") + ", " + (f.size/1024).toFixed(0) + "KB)";
  }).join("\n");

  var prompt = "You are an expert music producer and arranger. Analyze these uploaded audio file sketches and create a complete production plan.\n\nFiles:\n" + fileList + (description ? "\n\nArtist's description: " + description : "") + "\n\nReturn a JSON object with this exact structure:\n{\n  \"fileAnalysis\": [{\"filename\":\"...\",\"instrument\":\"...\",\"role\":\"verse/chorus/bridge/loop\",\"notes\":\"...\"}],\n  \"songAssessment\": {\"estimatedKey\":\"...\",\"estimatedTempo\":\"... BPM\",\"present\":[\"guitar\",\"chords\"],\"missing\":[\"drums\",\"bass\",\"vocals\"],\"structureGaps\":[\"intro\",\"bridge\",\"outro\"]},\n  \"productionPlan\": {\"sections\":[{\"name\":\"Intro\",\"bars\":8,\"description\":\"...\",\"userFiles\":[\"file1.m4a\"],\"toGenerate\":[\"ambient pad\",\"reversed guitar\"]}],\"productionNotes\":\"...\",\"mixingNotes\":\"...\"},\n  \"summary\":\"One paragraph describing the creative vision.\"\n}\nReturn ONLY valid JSON.";

  try {
    var resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!resp.ok) {
      var errText = await resp.text();
      return new Response(JSON.stringify({error: "API error: " + resp.status, detail: errText.substring(0,200)}), {status:500, headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
    }

    var data = await resp.json();
    var text = data.content && data.content[0] ? data.content[0].text : "";
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    var analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };

    return new Response(JSON.stringify({ analysis: analysis }), {
      headers: {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}
    });
  } catch(e) {
    return new Response(JSON.stringify({error: e.message}), {status:500, headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
  }
}
