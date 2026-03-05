import { D1ReadEndpoint } from "chanfana";
import { HandleArgs } from "../../types";
import { TaskModel } from "./base";

export class TaskRead extends D1ReadEndpoint<HandleArgs> {
	_meta = {
		model: TaskModel,
	};
}
