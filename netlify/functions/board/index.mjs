import { getDatabase } from '@netlify/database'
import { suggestWebsite, website } from './website.mjs'

export const config = { path: '/api/board' }

const categories = new Set(['Sightseeing', 'Arts & culture', 'Food & drink', 'Outdoors', 'Other'])
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i

function respond(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function clean(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export default async function handler(request) {
  const visitor = request.headers.get('X-Visitor')
  if (!uuid.test(visitor ?? '')) return respond({ error: 'The board could not identify this browser.' }, 400)
  const query = new URL(request.url).searchParams
  if (request.method === 'GET' && query.has('suggest')) {
    const title = clean(query.get('suggest'))
    if (title.length < 3 || title.length > 90) return respond({ suggestion: null })
    try {
      return respond({ suggestion: await suggestWebsite(title) })
    } catch {
      return respond({ error: 'Website lookup is unavailable. You can enter a link or leave it blank.' }, 503)
    }
  }

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
      if (['edit', 'delete'].includes(data.action) &&
        (!Number.isInteger(data.version) || data.version < 0 || data.version > 2147483647)) {
        return respond({ error: 'Close and reopen the edit form to load the latest activity.' }, 400)
      }
      if (data.action === 'like' && typeof data.liked === 'boolean') {
        if (data.liked) {
          const rows = await sql`
            INSERT INTO likes (activity_id, visitor_id, name)
            SELECT id, ${visitor}, ${name} FROM activities WHERE id = ${data.id} AND deleted_at IS NULL
            ON CONFLICT (activity_id, visitor_id) DO UPDATE SET name = EXCLUDED.name
            RETURNING activity_id
          `
          if (!rows.length) return respond({ error: 'This activity is no longer available.' }, 404)
        } else {
          await sql`
            DELETE FROM likes USING activities
            WHERE activity_id = activities.id AND activity_id = ${data.id}
              AND visitor_id = ${visitor} AND activities.deleted_at IS NULL
          `
        }
      } else if (data.action === 'delete') {
        const rows = await sql`
          UPDATE activities SET deleted_at = now(), version = version + 1
          WHERE id = ${data.id} AND version = ${data.version} AND deleted_at IS NULL
          RETURNING id
        `
        if (!rows.length) {
          const [activity] = await sql`SELECT deleted_at FROM activities WHERE id = ${data.id}`
          if (!activity?.deleted_at) {
            return respond({ error: 'This activity changed. Close and reopen the form to see the latest version.' }, 409)
          }
        }
      } else if (data.action === 'add' || data.action === 'edit') {
        const title = clean(data.title)
        const inputUrl = clean(data.url)
        const url = website(inputUrl)
        const description = clean(data.description)
        if (!title || title.length > 90 || description.length > 220 || !categories.has(data.category)) {
          return respond({ error: 'Enter an activity title, select a category, and keep the description under 220 characters.' }, 400)
        }
        if ((inputUrl && !url) || url.length > 1000) {
          return respond({ error: 'Enter a valid website address or leave it blank.' }, 400)
        }
        if (data.action === 'edit') {
          const rows = await sql`
            UPDATE activities SET title = ${title}, url = ${url}, category = ${data.category},
              description = ${description}, version = version + 1
            WHERE id = ${data.id} AND version = ${data.version} AND deleted_at IS NULL
            RETURNING id
          `
          if (!rows.length) {
            return respond({ error: 'This activity changed. Close and reopen the form to see the latest version.' }, 409)
          }
        } else {
          await sql`
            INSERT INTO activities (id, title, url, category, description, added_by)
            VALUES (${data.id}, ${title}, ${url}, ${data.category}, ${description}, ${name})
            ON CONFLICT (id) DO NOTHING
          `
        }
      } else {
        return respond({ error: 'Invalid action.' }, 400)
      }
    } else if (request.method !== 'GET') {
      return respond({ error: 'Method not supported.' }, 405)
    }

    const activities = await sql`
      SELECT a.id, a.title, a.url, a.category, a.description, a.added_by, a.version,
        COALESCE(array_agg(l.name ORDER BY l.created_at, l.visitor_id)
          FILTER (WHERE l.visitor_id IS NOT NULL), ARRAY[]::text[]) AS names,
        COALESCE(bool_or(l.visitor_id = ${visitor}), false) AS liked
      FROM activities a LEFT JOIN likes l ON a.id = l.activity_id
      WHERE a.deleted_at IS NULL
      GROUP BY a.id ORDER BY a.position, a.created_at DESC, a.id
    `
    return respond({ activities })
  } catch (error) {
    console.error(error)
    return respond({ error: 'The board could not sync. Please try again.' }, 503)
  }
}
