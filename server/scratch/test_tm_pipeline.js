const http = require("http");

async function makeRequest(data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request(
      "http://localhost:5000/api/v1/translate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "vb_live_my_super_secret_api_key_123"
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function runTest() {
  console.log("--- 1. First Translation (Should call AI and save to TM) ---");
  const t0 = Date.now();
  const res1 = await makeRequest({
    items: ["Fast worldwide shipping guaranteed.", "Why Choose Us?"],
    source_lang: "en",
    target_langs: ["es", "hi"]
  });
  console.log("Response 1 (" + (Date.now() - t0) + "ms):", JSON.stringify(res1.data.translations, null, 2));

  console.log("\n--- 2. Second Translation (Should HIT Translation Memory instantly in <100ms) ---");
  const t1 = Date.now();
  const res2 = await makeRequest({
    items: ["Fast worldwide shipping guaranteed.", "Why Choose Us?"],
    source_lang: "en",
    target_langs: ["es", "hi"]
  });
  console.log("Response 2 (" + (Date.now() - t1) + "ms):", JSON.stringify(res2.data.translations, null, 2));
}

runTest().catch(console.error);
