// Make multiple requests, 
// aggregate the responses and 
// send it back as a single response

addEventListener('fetch', event => {
    event.respondWith(fetchAndLog(event.request))
})
  
/**
 * Fetch and log a given request object
 * @param {Request} request
 */
async function fetchAndLog(request) {
    const init = {
      method: 'GET',
      headers: new Headers({'Authorization': 'XXXXXX', 'Content-Type': 'text/plain'})
    }
    const [btcResp, ethResp, ltcResp] = await Promise.all([
      fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot',init),
      fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot',init),
      fetch('https://api.coinbase.com/v2/prices/LTC-USD/spot',init)
    ])
  
    const btc = await btcResp.json()
    const eth = await ethResp.json()
    const ltc = await ltcResp.json()
  
    let combined = {}
    combined['btc'] = btc['data'].amount
    combined['ltc'] = ltc['data'].amount
    combined['eth'] = eth['data'].amount
  
    const responseInit = {
      status: 200,
      headers: new Headers({'Content-Type': 'application/json'})
    }
    return new Response(JSON.stringify(combined), responseInit)
}