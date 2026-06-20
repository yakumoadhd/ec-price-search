import https from 'https';
const options = {
  hostname: 'ec-search-api-826846133648.asia-northeast1.run.app',
  port: 443,
  path: '/openapi.json',
  method: 'GET',
};
const req = https.request(options, res => {
  let body = "";
  res.on("data", d => body += d);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    if(res.statusCode === 200) console.log("Body:", body);
  });
});
req.on("error", console.error);
req.end();
