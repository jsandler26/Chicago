import { getDatabase } from '@netlify/database'

export const config = { path: '/api/board' }

const categories = new Set(['Sightseeing', 'Arts & culture', 'Food & drink', 'Outdoors', 'Other'])
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i

function respond(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function clean(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function website(value) {
  try {
    const url = new URL(value)
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href
  } catch {}
  return ''
}

export default async function handler(request) {
  const visitor = request.headers.get('X-Visitor')
  if (!uuid.test(visitor ?? '')) return respond({ error: 'The board could not identify this browser.' }, 400)
  try {
    const sql = getDatabase().sql
    if (request.method === 'POST') {
      const raw = await request.text()
      if (raw.length > 8192) return respond({ error: 'This submission is too long.' }, 413)
      let data
      try { data = JSON.parse(raw) } catch { return respond({ error: 'Invalid submission.' }, 400) }
      const name = clean(data?.name)
      if (!name || name.length > 40 || !uuid.test(data?.id ?? '')) {
        return respond({ error: 'Enter a name between 1 and 40 characters.' }, 400)
      }
      if (data.action === 'like' && typeof data.liked === 'boolean') {
        if (data.liked) {
          const rows = await sql`
            INSERT INTO likes (activity_id, visitor_id, name)
            SELECT id, ${visitor}, ${name} FROM activities WHERE id = ${data.id}
            ON CONFLICT (activity_id, visitor_id) DO UPDATE SET name = EXCLUDED.name
            RETURNING activity_id
          `
          if (!rows.length) return respond({ error: 'This activity is no longer available.' }, 404)
        } else {
          await sql`DELETE FROM likes WHERE activity_id = ${data.id} AND visitor_id = ${visitor}`
        }
      } else if (data.action === 'add') {
        const title = clean(data.title)
        const inputUrl = clean(data.url)
        const url = website(inputUrl)
        const description = clean(data.description)
        if (!title || title.length > 90 || !url || url.length > 1000 || description.length > 220 || !categories.has(data.category)) {
          return respond({ error: 'Enter an activity title and a valid website address. Keep the description under 220 characters.' }, 400)
        }
        await sql`
          INSERT INTO activities (id, title, url, category, description, added_by)
          VALUES (${data.id}, ${title}, ${url}, ${data.category}, ${description}, ${name})
          ON CONFLICT (id) DO NOTHING
        `
      } else {
        return respond({ error: 'Invalid action.' }, 400)
      }
    } else if (request.method !== 'GET') {
      return respond({ error: 'Method not supported.' }, 405)
    }

    const activities = await sql`
      SELECT a.id, a.title, a.url, a.category, a.description, a.added_by,
        COALESCE(array_agg(l.name ORDER BY l.created_at, l.visitor_id)
          FILTER (WHERE l.visitor_id IS NOT NULL), ARRAY[]::text[]) AS names,
        COALESCE(bool_or(l.visitor_id = ${visitor}), false) AS liked
      FROM activities a LEFT JOIN likes l ON a.id = l.activity_id
      GROUP BY a.id ORDER BY a.position, a.created_at DESC, a.id
    `
    return respond({ activities })
  } catch (error) {
    console.error(error)
    return respond({ error: 'The board could not sync. Please try again.' }, 503)
  }
}
