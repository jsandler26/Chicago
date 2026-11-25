const byId = id => document.getElementById(id)
const board = byId('board')
const nameField = byId('name')
const notice = byId('notice')
const summary = byId('summary')
const dialog = byId('idea-dialog')
const ideaForm = byId('idea-form')
const submitIdea = byId('submit-idea')
const deleteIdea = byId('delete-idea')
const ideaTitle = ideaForm.elements.namedItem('title')
const ideaUrl = ideaForm.elements.namedItem('url')
const websiteStatus = byId('website-status')
const suggestionBox = byId('website-suggestion')
const suggestedLink = byId('suggested-link')
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
let editing
let lookup

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
    const details = element('div', 'card-details')
    details.append(element('div', 'category', activity.category), element('h3', '', activity.title))
    if (activity.description) details.append(element('p', 'description', activity.description))
    const edit = element('button', 'secondary', 'Edit')
    edit.type = 'button'
    edit.dataset.activity = activity.id + '-edit'
    edit.setAttribute('aria-label', 'Edit ' + activity.title)
    edit.addEventListener('click', () => openIdea(activity))
    if (focusedId === edit.dataset.activity) focusTarget = edit
    const links = element('div', 'card-links')
    if (activity.url) {
      const link = element('a', '', 'Visit website')
      link.href = activity.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.setAttribute('aria-label', 'Visit website for ' + activity.title + ' (opens in a new tab)')
      links.append(link)
    }
    links.append(edit)
    details.append(links)
    if (activity.added_by) details.append(element('p', 'attribution', 'Suggested by ' + activity.added_by))

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
    card.append(details, bottom)
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
    notice.textContent = 'Enter your name to like, add, or edit an activity.'
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
function clearSuggestion() {
  lookup?.abort()
  lookup = undefined
  suggestionBox.hidden = true
  websiteStatus.textContent = ''
}

async function findWebsite() {
  const title = ideaTitle.value.trim()
  if (lookup) return
  clearSuggestion()
  if (title.length < 3) {
    websiteStatus.textContent = 'Enter an activity name first.'
    return
  }
  const controller = new AbortController()
  lookup = controller
  websiteStatus.textContent = 'Looking for a website…'
  try {
    const response = await fetch('/api/board?' + new URLSearchParams({ suggest: title }), {
      headers: { 'X-Visitor': visitor },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(9000)]),
    })
    if (!response.ok) throw new Error('Lookup failed')
    const { suggestion } = await response.json()
    if (lookup !== controller) return
    if (!suggestion) {
      websiteStatus.textContent = 'No matching website found. You can enter a link or leave it blank.'
      return
    }
    suggestedLink.href = suggestion.url
    suggestedLink.textContent = suggestion.url
    websiteStatus.textContent = 'Suggested website for ' + suggestion.title
    suggestionBox.hidden = false
  } catch {
    if (lookup === controller) websiteStatus.textContent = 'Website lookup is unavailable. You can enter a link or leave it blank.'
  } finally {
    if (lookup === controller) lookup = undefined
  }
}

function openIdea(activity) {
  if (!saveName()) return
  editing = activity
  ideaId = activity?.id ?? crypto.randomUUID()
  ideaForm.reset()
  clearSuggestion()
  if (activity) {
    ideaTitle.value = activity.title
    ideaUrl.value = activity.url
    ideaForm.elements.namedItem('category').value = activity.category
    ideaForm.elements.namedItem('description').value = activity.description
  }
  byId('idea-heading').textContent = activity ? 'Edit activity' : 'Add an idea'
  submitIdea.textContent = activity ? 'Save changes' : 'Add to the board'
  deleteIdea.hidden = !activity
  notice.textContent = ''
  byId('idea-error').textContent = ''
  dialog.showModal()
}

byId('add').addEventListener('click', () => openIdea())
ideaTitle.addEventListener('input', clearSuggestion)
ideaTitle.addEventListener('change', () => {
  if (!ideaUrl.value.trim() && ideaTitle.value.trim().length >= 3) findWebsite()
})
byId('find-website').addEventListener('click', findWebsite)
byId('use-website').addEventListener('click', () => {
  ideaUrl.value = suggestedLink.href
  clearSuggestion()
  ideaUrl.focus()
})
dialog.addEventListener('close', clearSuggestion)
byId('close').addEventListener('click', () => { if (!submitIdea.disabled) dialog.close() })
dialog.addEventListener('cancel', event => { if (submitIdea.disabled) event.preventDefault() })
async function submitActivity(action, name, fields = {}) {
  submitIdea.disabled = true
  deleteIdea.disabled = true
  const errorField = byId('idea-error')
  errorField.textContent = ''
  try {
    await change({ ...fields, action, id: ideaId, version: editing?.version, name })
    ideaForm.reset()
    dialog.close()
    const messages = { add: 'Your idea was added to the board.', edit: 'Activity updated.', delete: 'Activity removed from the board.' }
    notice.textContent = messages[action]
    if (action === 'delete') byId('add').focus()
  } catch (error) {
    errorField.textContent = error.message
  } finally {
    submitIdea.disabled = false
    deleteIdea.disabled = false
  }
}

ideaForm.addEventListener('submit', event => {
  event.preventDefault()
  if (writing) return
  const name = saveName()
  if (!name) return
  submitActivity(editing ? 'edit' : 'add', name, Object.fromEntries(new FormData(ideaForm)))
})

deleteIdea.addEventListener('click', () => {
  if (!editing || writing) return
  const name = saveName()
  if (!name || !confirm('Delete “' + editing.title + '” from the shared board?')) return
  submitActivity('delete', name)
})

refresh()
setInterval(() => { if (!document.hidden) refresh() }, 12000)
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
