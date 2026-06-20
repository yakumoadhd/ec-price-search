const https = require('https');
https.get("https://ec-search-api-826846133648.asia-northeast1.run.app/search?keyword=test", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Headers:", res.headers);
    console.log("Body:", data.substring(0, 100));
  });
}).on("error", (err) => console.log("Error:", err));
