import { OpenAPIRouter } from '@cloudflare/itty-router-openapi';
import { TaskCreate, TaskDelete, TaskFetch, TaskList } from './tasks';

const router = OpenAPIRouter();
router.get('/api/tasks/', TaskList);
router.post('/api/tasks/', TaskCreate);
router.get('/api/tasks/:taskSlug/', TaskFetch);
router.delete('/api/tasks/:taskSlug/', TaskDelete);

// 404 for everything else
router.all('*', () => new Response('Not Found.', { status: 404 }));

export default {
	fetch: router.handle,
};
