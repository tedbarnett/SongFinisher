export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { headers: {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST","Access-Control-Allow-Headers":"*"} });
  }
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({error: "POST required"}), {status:405, headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
  }

  const env = context.env;
  const token = env.REPLICATE_API_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({error: "REPLICATE_API_TOKEN not configured"}), {status:500, headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
  }

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({error: "Invalid JSON body"}), {status:400, headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
  }

  const { audioBase64, audioType, analysis, vibe } = body;
  if (!audioBase64) {
    return new Response(JSON.stringify({error: "No audio data provided"}), {status:400, headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
  }

  const key = (analysis && analysis.estimatedKey) || "C major";
  const tempo = (analysis && analysis.estimatedTempo) || "120 BPM";
  const present = (analysis && analysis.present) || [];
  const mood = vibe || "melodic";
  const leadInstrument = present.length > 0 ? present[0] : "melody";

  const introPrompt = "instrumental intro, " + key + ", " + tempo + ", " + mood + ", building anticipation, leading into " + leadInstrument + ", warm and inviting opening";
  const outroPrompt = "instrumental outro, " + key + ", " + tempo + ", " + mood + ", fading resolution, gentle ending, satisfying conclusion";

  const mimeType = audioType || "audio/mpeg";
  const audioDataUri = "data:" + mimeType + ";base64," + audioBase64;

  try {
    // Launch both intro and outro generations in parallel
    const [introResult, outroResult] = await Promise.all([
      runMusicGen(token, introPrompt, audioDataUri, 10),
      runMusicGen(token, outroPrompt, audioDataUri, 10)
    ]);

    return new Response(JSON.stringify({
      intro: introResult,
      outro: outroResult
    }), {
      headers: {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}
    });
  } catch (e) {
    return new Response(JSON.stringify({error: e.message || "Generation failed"}), {status:500, headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
  }
}

async function runMusicGen(token, prompt, audioDataUri, duration) {
  // Create prediction
  const createResp = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Prefer": "wait"
    },
    body: JSON.stringify({
      version: "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
      input: {
        model_version: "stereo-melody-large",
        prompt: prompt,
        input_audio: audioDataUri,
        duration: duration,
        output_format: "mp3",
        normalization_strategy: "peak"
      }
    })
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error("Replicate API error: " + createResp.status + " - " + errText.substring(0, 300));
  }

  let prediction = await createResp.json();

  // If using Prefer: wait, the prediction may already be complete
  // Otherwise poll until done
  const maxPolls = 120; // 10 minutes max
  let polls = 0;
  while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
    if (polls >= maxPolls) {
      throw new Error("Generation timed out after " + maxPolls + " polls");
    }
    // Wait 5 seconds between polls
    await new Promise(function(resolve) { setTimeout(resolve, 5000); });

    const pollResp = await fetch("https://api.replicate.com/v1/predictions/" + prediction.id, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!pollResp.ok) {
      throw new Error("Poll error: " + pollResp.status);
    }
    prediction = await pollResp.json();
    polls++;
  }

  if (prediction.status === "failed") {
    throw new Error("Generation failed: " + (prediction.error || "unknown error"));
  }
  if (prediction.status === "canceled") {
    throw new Error("Generation was canceled");
  }

  return {
    url: prediction.output,
    status: prediction.status
  };
}
