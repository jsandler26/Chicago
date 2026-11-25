export function website(value) {
  try {
    const url = new URL(value)
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href
  } catch {}
  return ''
}

function comparable(title) {
  return title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .replace(/^the /, '').replace(/^chicago | chicago$/g, '')
}

async function wikimedia(origin, params, signal) {
  const url = new URL('/w/api.php', origin)
  url.search = new URLSearchParams({ ...params, format: 'json', formatversion: '2' })
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ChicagoShortlist/1.0 (chicago activity website suggestions)' },
    signal,
  })
  if (!response.ok) throw new Error('Website lookup failed')
  return response.json()
}

export async function suggestWebsite(title) {
  const signal = AbortSignal.timeout(6500)
  const result = await wikimedia('https://en.wikipedia.org', {
    action: 'query', generator: 'search', gsrsearch: title + ' Chicago',
    gsrnamespace: '0', gsrlimit: '8', prop: 'pageprops', ppprop: 'wikibase_item',
  }, signal)

  const normalized = comparable(title)
  const match = result.query?.pages?.filter(page =>
    /^[Q][1-9]\d*$/.test(page.pageprops?.wikibase_item ?? '') && comparable(page.title) === normalized,
  ).sort((a, b) => a.index - b.index)[0]
  if (!match) return null

  const data = await wikimedia('https://www.wikidata.org', {
    action: 'wbgetclaims', entity: match.pageprops.wikibase_item, property: 'P856',
  }, signal)
  const claims = data.claims?.P856 ?? []
  const url = [...claims.filter(claim => claim.rank === 'preferred'), ...claims.filter(claim => claim.rank === 'normal')]
    .map(claim => website(claim.mainsnak?.datavalue?.value))
    .find(value => value && value.length <= 1000)
  return url ? { url, title: match.title } : null
}
