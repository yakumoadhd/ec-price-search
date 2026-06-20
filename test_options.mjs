import https from 'https';
const options = {
  hostname: 'ec-search-api-826846133648.asia-northeast1.run.app',
  port: 443,
  path: '/search',
  method: 'OPTIONS',
};
const req = https.request(options, res => {
  let body = "";
  res.on("data", d => body += d);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Headers:", res.headers);
    console.log("Body:", body.substring(0, 100));
  });
});
req.on("error", console.error);
req.end();
