// Make multiple requests, aggregate the responses and
// send it back as a single response.

addEventListener('fetch', event => {
  event.respondWith(fetchPrices(event.request))
})

async function fetchPrices(request) {
  // Fetch all responses in parallel
  const responses = await Promise.all([
    fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
    fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot'),
    fetch('https://api.coinbase.com/v2/prices/LTC-USD/spot')
  ])

  // Extract the desired data from the received responses in parallel
  const [btc, eth, ltc] = await Promise.all(
    responses.map(async res => {
      const {
        data: {amount}
      } = await res.json()

      return amount
    })
  )

  const prices = {btc, eth, ltc}

  return new Response(JSON.stringify(prices), {
    status: 200,
    headers: {'Content-Type': 'text/plain'}
  })
}
