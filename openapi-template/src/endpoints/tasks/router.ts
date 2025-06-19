import { Hono } from "hono";
import { fromHono } from "chanfana";
import { TaskList } from "./taskList";
import { TaskCreate } from "./taskCreate";
import { TaskRead } from "./taskRead";
import { TaskUpdate } from "./taskUpdate";
import { TaskDelete } from "./taskDelete";

export const tasksRouter = fromHono(new Hono());

tasksRouter.get("/", TaskList);
tasksRouter.post("/", TaskCreate);
tasksRouter.get("/:id", TaskRead);
tasksRouter.put("/:id", TaskUpdate);
tasksRouter.delete("/:id", TaskDelete);
