const byId = id => document.getElementById(id)
const board = byId('board')
const nameField = byId('name')
const notice = byId('notice')
const summary = byId('summary')
const dialog = byId('idea-dialog')
const ideaForm = byId('idea-form')
const submitIdea = byId('submit-idea')
const storage = {
  get(key) { try { return localStorage.getItem(key) } catch { return null } },
  set(key, value) { try { localStorage.setItem(key, value) } catch {} },
}
const visitorKey = 'chicago-shortlist-visitor'
const nameKey = 'chicago-shortlist-name'
const visitor = storage.get(visitorKey) || crypto.randomUUID()
storage.set(visitorKey, visitor)
nameField.value = storage.get(nameKey) || ''
let activities = []
let loaded = false
let writing = false
let reading = false
let revision = 0
let ideaId

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function count(number, singular, plural = singular + 's') {
  return number + ' ' + (number === 1 ? singular : plural)
}

function render() {
  const focusedId = document.activeElement?.dataset.activity
  let focusTarget
  const ordered = [...activities]
  if (byId('sort').value === 'popular') ordered.sort((a, b) => b.names.length - a.names.length)
  const total = activities.reduce((sum, activity) => sum + activity.names.length, 0)
  summary.textContent = count(activities.length, 'idea') + ' · ' + count(total, 'like')
  const cards = ordered.map(activity => {
    const card = element('article', 'card')
    const link = element('a', '', 'Visit website')
    link.href = activity.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.setAttribute('aria-label', 'Visit website for ' + activity.title + ' (opens in a new tab)')
    card.append(element('div', 'category', activity.category), element('h3', '', activity.title))
    if (activity.description) card.append(element('p', 'description', activity.description))
    card.append(link)
    if (activity.added_by) card.append(element('p', 'attribution', 'Suggested by ' + activity.added_by))

    const bottom = element('div', 'card-bottom')
    const voting = element('div', 'voting')
    const button = element('button', 'like', activity.liked ? '♥ Liked' : '♡ Like')
    button.type = 'button'
    button.dataset.activity = activity.id
    button.setAttribute('aria-pressed', activity.liked)
    button.setAttribute('aria-label', 'Like ' + activity.title)
    button.addEventListener('click', () => toggleLike(activity))
    if (focusedId === activity.id) focusTarget = button
    voting.append(button, element('span', 'count', count(activity.names.length, 'like')))
    bottom.append(voting)
    if (activity.names.length) bottom.append(element('p', 'names', 'Liked by ' + activity.names.join(', ')))
    card.append(bottom)
    return card
  })
  board.replaceChildren(...cards)
  focusTarget?.focus({ preventScroll: true })
}

async function api(data) {
  const headers = { 'X-Visitor': visitor }
  const options = { headers, signal: AbortSignal.timeout(12000) }
  if (data) {
    options.method = 'POST'
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(data)
  }
  const response = await fetch('/api/board', options)
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !Array.isArray(result.activities)) {
    throw new Error(result.error || 'The board could not sync. Please try again.')
  }
  return result.activities
}

async function refresh() {
  if (writing || reading) return
  reading = true
  const startedAt = revision
  try {
    const next = await api()
    if (startedAt !== revision) return
    if (!loaded || JSON.stringify(next) !== JSON.stringify(activities)) {
      activities = next
      loaded = true
      render()
    }
  } catch {
    if (!loaded) summary.textContent = 'Could not load the board. Retrying…'
  } finally {
    reading = false
  }
}

function saveName() {
  const name = nameField.value.trim().replace(/\s+/g, ' ')
  if (!name) {
    notice.textContent = 'Enter your name to like an activity or add an idea.'
    nameField.focus()
    return ''
  }
  nameField.value = name
  storage.set(nameKey, name)
  return name
}

async function change(data) {
  writing = true
  revision += 1
  try {
    activities = await api(data)
    loaded = true
    render()
  } finally {
    writing = false
  }
}

async function toggleLike(activity) {
  if (writing) return
  const name = saveName()
  if (!name) return
  notice.textContent = ''
  try {
    await change({ action: 'like', id: activity.id, liked: !activity.liked, name })
    notice.textContent = activity.liked ? 'Like removed.' : 'Like added.'
  } catch (error) {
    notice.textContent = error.message
  }
}

byId('profile').addEventListener('submit', event => {
  event.preventDefault()
  if (saveName()) notice.textContent = 'Name saved for this browser.'
})
byId('share').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.origin + '/')
    notice.textContent = 'Board link copied.'
    byId('share').textContent = 'Link copied'
    setTimeout(() => { byId('share').textContent = 'Copy board link' }, 1800)
  } catch {
    notice.textContent = 'Copy the board link from your browser’s address bar.'
  }
})
byId('sort').addEventListener('change', () => { if (loaded) render() })
byId('add').addEventListener('click', () => {
  if (!saveName()) return
  ideaId = crypto.randomUUID()
  notice.textContent = ''
  byId('idea-error').textContent = ''
  dialog.showModal()
})
byId('close').addEventListener('click', () => { if (!submitIdea.disabled) dialog.close() })
dialog.addEventListener('cancel', event => { if (submitIdea.disabled) event.preventDefault() })
ideaForm.addEventListener('submit', async event => {
  event.preventDefault()
  if (writing) return
  const name = saveName()
  if (!name) return
  submitIdea.disabled = true
  const errorField = byId('idea-error')
  errorField.textContent = ''
  try {
    const fields = Object.fromEntries(new FormData(ideaForm))
    await change({ ...fields, action: 'add', id: ideaId, name })
    ideaForm.reset()
    dialog.close()
    notice.textContent = 'Your idea was added to the board.'
  } catch (error) {
    errorField.textContent = error.message
  } finally {
    submitIdea.disabled = false
  }
})

refresh()
setInterval(() => { if (!document.hidden) refresh() }, 12000)
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
