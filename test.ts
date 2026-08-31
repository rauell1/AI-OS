import { createSession } from "./src/lib/auth";
import http from "http";

async function run() {
  const token = await createSession({
    id: "usr_123",
    email: "royokola3@gmail.com",
    name: "Roy",
    role: "owner"
  });
  
  console.time('fetch homepage');
  const req = http.request('http://localhost:3000/', {
    headers: {
      'Cookie': `rauell_session=${token}`
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.timeEnd('fetch homepage');
      console.log('Status:', res.statusCode);
      if (res.statusCode !== 200) {
        console.log('Redirected to:', res.headers.location);
      }
    });
  });
  req.end();
}
run();
