import { D1ListEndpoint } from "chanfana";
import { HandleArgs } from "../../types";
import { TaskModel } from "./base";

export class TaskList extends D1ListEndpoint<HandleArgs> {
  _meta = {
    model: TaskModel,
  };

  searchFields = ["name", "slug", "description"];
  defaultOrderBy = "id DESC";
}
