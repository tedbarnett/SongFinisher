export async function onRequestPost(context) {
  var env = context.env;
  var request = context.request;

  var corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    var body = await request.json();
    var files = body.files || [];
    var description = body.description || "";
    var fileCount = files.length;

    if (fileCount < 1 || fileCount > 8) {
      return new Response(
        JSON.stringify({ error: "Please upload between 1 and 8 audio files." }),
        { status: 400, headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders) }
      );
    }

    var fileList = files.map(function (f, i) {
      return (
        (i + 1) +
        ". " +
        f.name +
        " — " +
        formatDuration(f.duration) +
        ", " +
        formatSize(f.size)
      );
    }).join("\n");

    var vibeSection = description
      ? '\n\nThe artist describes the vibe as: "' + description + '"'
      : "";

    var prompt =
      "You are a world-class music producer and arranger. A songwriter has uploaded " +
      fileCount +
      " audio files as rough sketches for a song. Analyze what they likely contain and create a professional production plan to complete the song.\n\n" +
      "## Uploaded Files\n" +
      fileList +
      vibeSection +
      "\n\n" +
      "## Your Task\n\n" +
      "### 1. File Analysis\n" +
      "For each file, infer from the filename, duration, and file type:\n" +
      "- What instrument/element it likely contains\n" +
      "- Estimated role in the song (verse, chorus, bridge, loop, etc.)\n" +
      "- Any clues about key, tempo, or style from the filename\n\n" +
      "### 2. Song Assessment\n" +
      "Based on all files together:\n" +
      "- Estimated key and tempo (infer from filenames or typical ranges)\n" +
      "- What instruments/elements ARE present\n" +
      "- What instruments/elements are MISSING for a complete song\n" +
      "- Current song structure gaps (missing intro? outro? bridge?)\n\n" +
      "### 3. Production Plan\n" +
      "Create a detailed, bar-by-bar arrangement plan:\n" +
      "- Full song structure with section lengths (in bars)\n" +
      "- For each section: which uploaded files to use + what needs to be generated\n" +
      "- Specific instrument recommendations for missing parts (e.g., 'fingerstyle bass, brush kit drums')\n" +
      "- Production notes: effects, transitions, dynamics\n" +
      "- Mixing notes: volume balance, panning, EQ suggestions\n\n" +
      "### 4. Summary\n" +
      "A 2-3 sentence summary a musician could hand to a session player or use as a brief.\n\n" +
      "Format your response as JSON with this structure:\n" +
      '{\n  "fileAnalysis": [\n    { "filename": "...", "instrument": "...", "role": "...", "notes": "..." }\n  ],\n' +
      '  "songAssessment": {\n    "estimatedKey": "...",\n    "estimatedTempo": "... BPM",\n    "present": ["..."],\n    "missing": ["..."],\n    "structureGaps": ["..."]\n  },\n' +
      '  "productionPlan": {\n    "sections": [\n      { "name": "...", "bars": 8, "description": "...", "userFiles": ["..."], "toGenerate": ["..."] }\n    ],\n    "productionNotes": "...",\n    "mixingNotes": "..."\n  },\n' +
      '  "summary": "..."\n}';

    var apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!apiResponse.ok) {
      var errText = await apiResponse.text();
      console.error("Anthropic API error:", apiResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "AI analysis failed. Please try again." }),
        { status: 502, headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders) }
      );
    }

    var apiData = await apiResponse.json();
    var content = apiData.content[0].text;

    // Extract JSON from the response (Claude may wrap it in markdown code blocks)
    var jsonMatch = content.match(/\{[\s\S]*\}/);
    var analysis;
    if (jsonMatch) {
      try {
        analysis = JSON.parse(jsonMatch[0]);
      } catch (e) {
        analysis = { raw: content };
      }
    } else {
      analysis = { raw: content };
    }

    return new Response(JSON.stringify({ analysis: analysis }), {
      status: 200,
      headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders),
    });
  } catch (err) {
    console.error("Worker error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong. " + err.message }),
      { status: 500, headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders) }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "unknown duration";
  var m = Math.floor(seconds / 60);
  var s = Math.round(seconds % 60);
  if (m > 0) return m + "m " + (s < 10 ? "0" : "") + s + "s";
  return s + "s";
}

function formatSize(bytes) {
  if (!bytes) return "unknown size";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}
