// // Redirect based on custom request headers
addEventListener('fetch', event => {
    event.respondWith(fetchAndApply(event.request))
})
  
async function fetchAndApply(request) {
    const suffix = ''
    //Assuming that the client is sending a custom header
    const cryptoCurrency = request.headers.get('X-Crypto-Currency')
    if (cryptoCurrency === 'BTC') {
      suffix = '/btc'
    } else if (cryptoCurrency === 'XRP') {
      suffix = '/xrp'
    } else if (cryptoCurrency === 'ETH') {
      suffix = '/eth'
    }
  
    const init = {
      method: request.method,
      headers: request.headers
    }
    const modifiedRequest = new Request(request.url + suffix, init)
    return fetch(modifiedRequest)
}
