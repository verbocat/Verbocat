const http = require("http");

const data = JSON.stringify({
  title: "Testing post",
  content: "My name is divyanshu",
  source_lang: "en",
  target_langs: ["es", "hi", "fr"]
});

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
    res.on("end", () => {
      console.log("STATUS:", res.statusCode);
      console.log("RESPONSE:", body);
    });
  }
);

req.on("error", (err) => console.error("REQUEST ERROR:", err));
req.write(data);
req.end();
