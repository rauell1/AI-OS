const http = require('http');

async function test() {
  console.time('fetch');
  const req = http.request('http://localhost:3000/', {
    headers: {
      'Cookie': 'rauell_session=TEST'
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.timeEnd('fetch');
      console.log('Status:', res.statusCode);
      // It might return 307 because the JWT is invalid, but let's see.
    });
  });
  req.end();
}
test();
