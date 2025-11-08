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
- ✅ **NEW: One-time admin registration & authentication**
- ✅ **NEW: Tags/categories system with autocomplete**
- ✅ **NEW: Full-text search functionality**
- ✅ **NEW: Live preview mode in editor**

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
- `GET /api/tags` - List all tags
- `GET /api/posts/[id]/tags` - Get tags for a post
- `PUT /api/posts/[id]/tags` - Set tags for a post
- `GET /api/search?q=query` - Search posts by title, description, or content

### Tags & Categories

The blog includes a flexible tagging system:

- **Add tags in the editor**: While creating/editing a post, use the tag input field
- **Autocomplete**: As you type, existing tags will be suggested
- **Tag management**: Tags are automatically saved when you save the post
- **Multi-tag support**: Add as many tags as you want (comma or Enter to add)
- **Tag filtering**: Tags are stored in a separate table for efficient querying

Tags are displayed in the editor and can be used for:
- Organizing posts by topic
- Creating category pages
- Filtering search results
- Building tag clouds

### Search Functionality

A live search feature is included on the blog index page:

- **Real-time search**: Search updates as you type (300ms debounce)
- **Full-text search**: Searches across title, description, and content
- **Results dropdown**: Click any result to navigate to that post
- **Published posts only**: Only searches published posts (not drafts)

The search box appears at the top of `/blog` and provides instant feedback with matching posts.

### Preview Mode

The editor includes a built-in preview mode:

- **Toggle preview**: Click the "👁 Preview" button in the editor toolbar
- **Live preview**: See how your post will look before publishing
- **Switch back**: Click "✏️ Edit" to return to editing
- **No save required**: Preview updates instantly from editor content

The preview renders BlockNote content as HTML, showing headings, paragraphs, lists, and other formatted content.

### Production Deployment

When deploying to production, you'll need to create the D1 database:

```bash
# Create production database
wrangler d1 create astro-blog-db

# Update wrangler.json with the database_id from the output above

# Apply migrations
wrangler d1 migrations apply astro-blog-db --remote
```

### Authentication & Security

✅ **One-Time Admin Registration** is now implemented!

The blog includes a simple but secure authentication system:

- **First-time setup**: The first user to register becomes the admin
- **Registration closes** after the first account is created
- **Session-based auth**: Secure cookie-based sessions (30-day expiry)
- **Protected routes**: Middleware automatically protects `/admin` and `/api` endpoints
- **Password hashing**: SHA-256 password hashing via Web Crypto API

#### First Run

1. Navigate to `/admin`
2. You'll see a registration form (only shown if no users exist)
3. Create your admin account with email and password (min 8 characters)
4. After registration, you'll be prompted to log in
5. Registration is now closed - only the admin can access the dashboard

#### Logging Out

Currently, there's no logout button in the UI, but you can log out via:
```bash
curl -X POST http://localhost:4321/api/auth/logout
```

Or clear your session cookie manually.

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
