# Astro Starter Kit: Blog

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/astro-blog-starter-template)

![Astro Template Preview](https://github.com/withastro/astro/assets/2244813/ff10799f-a816-4703-b967-c78997e8323d)

<!-- dash-content-start -->

Create a blog with Astro and deploy it on Cloudflare Workers as a [static website](https://developers.cloudflare.com/workers/static-assets/).

Features:

- ✅ Minimal styling (make it your own!)
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and OpenGraph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support
- ✅ Built-in Observability logging
- ✅ **NEW: Web-based blog post editor with BlockNote**
- ✅ **NEW: D1 database for dynamic posts**
- ✅ **NEW: KV-powered auto-save drafts**

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/astro-blog-starter-template
```

A live public deployment of this template is available at [https://astro-blog-starter-template.templates.workers.dev](https://astro-blog-starter-template.templates.workers.dev)

## ✍️ Blog Post Editor

This template now includes a powerful web-based blog post editor powered by [BlockNote](https://www.blocknotejs.org/), the open-source Notion-style editor.

### Features

- **Notion-style editing**: Rich text editor with blocks, slash commands, and drag-and-drop
- **Auto-save**: Drafts automatically saved to Cloudflare KV every 2 seconds
- **D1 database storage**: Published posts stored in Cloudflare D1 for dynamic rendering
- **Dual-mode blog**: Supports both static markdown posts and dynamic database posts
- **Full CRUD**: Create, read, update, and delete posts through the web interface

### Setup

1. **Initialize the database**:
   ```bash
   npm run db:init
   ```

2. **Start development**:
   ```bash
   npm run dev
   ```

3. **Access the admin panel**:
   Navigate to `http://localhost:4321/admin` to create and manage posts.

### Admin Interface

The admin interface (`/admin`) provides:
- Post list with status indicators (draft/published)
- Create new posts with BlockNote editor
- Edit existing posts
- Delete posts with confirmation
- Auto-save functionality (drafts saved to KV)
- Publish/unpublish toggle

### Database Schema

The blog uses Cloudflare D1 with the following schema:

```sql
CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    content TEXT NOT NULL,        -- BlockNote JSON
    slug TEXT UNIQUE NOT NULL,
    hero_image TEXT,
    pub_date TEXT NOT NULL,
    updated_date TEXT,
    status TEXT NOT NULL,          -- 'draft' or 'published'
    author TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

### API Endpoints

- `GET /api/posts` - List all posts
- `POST /api/posts` - Create a new post
- `GET /api/posts/[id]` - Get a specific post
- `PUT /api/posts/[id]` - Update a post
- `DELETE /api/posts/[id]` - Delete a post
- `POST /api/drafts/[postId]` - Save draft (auto-save)
- `GET /api/drafts/[postId]` - Retrieve draft

### Production Deployment

When deploying to production, you'll need to create the D1 database:

```bash
# Create production database
wrangler d1 create astro-blog-db

# Update wrangler.json with the database_id from the output above

# Apply migrations
wrangler d1 migrations apply astro-blog-db --remote
```

### Security Note

⚠️ **IMPORTANT**: The `/admin` route is currently **not protected** by authentication. Before deploying to production, you should:

1. Add authentication using [BetterAuth](https://www.better-auth.com/) or another auth solution
2. Protect the `/admin` route and API endpoints
3. Add user roles and permissions as needed

Example using middleware to protect routes:

```typescript
// src/middleware.ts
export function onRequest({ request, locals }, next) {
  const url = new URL(request.url);

  // Protect admin routes
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api')) {
    // TODO: Add authentication check here
    // if (!isAuthenticated) {
    //   return Response.redirect('/login');
    // }
  }

  return next();
}
```

## 🚀 Project Structure

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

The `src/content/` directory contains "collections" of related Markdown and MDX documents. Use `getCollection()` to retrieve posts from `src/content/blog/`, and type-check your frontmatter using an optional schema. See [Astro's Content Collections docs](https://docs.astro.build/en/guides/content-collections/) to learn more.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                           | Action                                           |
| :-------------------------------- | :----------------------------------------------- |
| `npm install`                     | Installs dependencies                            |
| `npm run dev`                     | Starts local dev server at `localhost:4321`      |
| `npm run build`                   | Build your production site to `./dist/`          |
| `npm run preview`                 | Preview your build locally, before deploying     |
| `npm run astro ...`               | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help`         | Get help using the Astro CLI                     |
| `npm run build && npm run deploy` | Deploy your production site to Cloudflare        |
| `npm wrangler tail`               | View real-time logs for all Workers              |

## 👀 Want to learn more?

Check out [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## Credit

This theme is based off of the lovely [Bear Blog](https://github.com/HermanMartinus/bearblog/).
