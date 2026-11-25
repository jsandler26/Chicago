# The Chicago Shortlist

A shared Chicago activity board. Visitors can enter a display name, add activities with website links, and vote for each activity or remove their vote. The board shows vote totals and voter names.

## Deploy to Netlify

In Netlify, select **Add new project → Import an existing project → GitHub**, then select this repository and deploy the main branch. The publish directory is already set to `public` in `netlify.toml`. The deploy needs Netlify Database, which uses the migration in `netlify/database/migrations` to create the tables and add six starter ideas.

When the deploy succeeds, share its production URL. Visitors can open the board and vote without accounts. Each browser can hold one vote per activity.
