Here is the refactored, DRY (Don't Repeat Yourself) version of your OpenAPI 3.1.0 specification.
It extracts the Task, Error400, Error404, and CreateUpdateTaskInput objects into reusable $ref components inside components/schemas.
{
  "openapi": "3.1.0",
  "info": {
    "title": "My Awesome API",
    "version": "2.0.0",
    "description": "This is the documentation for my awesome API."
  },
  "components": {
    "schemas": {
      "Task": {
        "type": "object",
        "properties": {
          "id": { "type": "integer" },
          "name": { "type": "string" },
          "slug": { "type": "string" },
          "description": { "type": "string" },
          "completed": { "type": "boolean" },
          "due_date": {
            "type": "string",
            "format": "date-time"
          }
        },
        "required": [
          "id",
          "name",
          "slug",
          "description",
          "completed",
          "due_date"
        ]
      },
      "CreateUpdateTaskInput": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "slug": { "type": "string" },
          "description": { "type": "string" },
          "completed": { "type": "boolean" },
          "due_date": {
            "type": "string",
            "format": "date-time"
          }
        },
        "required": ["name", "slug", "description", "completed", "due_date"]
      },
      "Error400": {
        "type": "object",
        "properties": {
          "success": {
            "type": "boolean",
            "enum": [false]
          },
          "errors": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "code": {
                  "type": "number",
                  "example": 7001
                },
                "message": {
                  "type": "string",
                  "example": "Input Validation Error"
                },
                "path": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "example": "body"
                  }
                }
              },
              "required": ["code", "message", "path"]
            }
          }
        },
        "required": ["success", "errors"]
      },
      "Error404": {
        "type": "object",
        "properties": {
          "success": {
            "type": "boolean",
            "enum": [false]
          },
          "errors": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "code": {
                  "type": "number",
                  "example": 7002
                },
                "message": {
                  "type": "string",
                  "example": "Not Found"
                }
              },
              "required": ["code", "message"]
            }
          }
        },
        "required": ["success", "errors"]
      }
    },
    "parameters": {
      "TaskId": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "integer"
        }
      }
    }
  },
  "paths": {
    "/tasks": {
      "get": {
        "operationId": "get_TaskList",
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "default": 1
            }
          },
          {
            "name": "per_page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100,
              "default": 20
            }
          },
          {
            "name": "search",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "description": "Search by name, slug, description"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List objects",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "result": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/Task"
                      }
                    }
                  },
                  "required": ["success", "result"]
                }
              }
            }
          }
        }
      },
      "post": {
        "operationId": "post_TaskCreate",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateUpdateTaskInput"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Returns the created Object",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "result": {
                      "$ref": "#/components/schemas/Task"
                    }
                  },
                  "required": ["success", "result"]
                }
              }
            }
          },
          "400": {
            "description": "Input Validation Error",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error400"
                }
              }
            }
          }
        }
      }
    },
    "/tasks/{id}": {
      "get": {
        "operationId": "get_TaskRead",
        "parameters": [
          {
            "$ref": "#/components/parameters/TaskId"
          }
        ],
        "responses": {
          "200": {
            "description": "Returns a single object if found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "result": {
                      "$ref": "#/components/schemas/Task"
                    }
                  },
                  "required": ["success", "result"]
                }
              }
            }
          },
          "404": {
            "description": "Not Found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error404"
                }
              }
            }
          }
        }
      },
      "put": {
        "operationId": "put_TaskUpdate",
        "parameters": [
          {
            "$ref": "#/components/parameters/TaskId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateUpdateTaskInput"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Returns the updated Object",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "result": {
                      "$ref": "#/components/schemas/Task"
                    }
                  },
                  "required": ["success", "result"]
                }
              }
            }
          },
          "400": {
            "description": "Input Validation Error",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error400"
                }
              }
            }
          },
          "404": {
            "description": "Not Found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error404"
                }
              }
            }
          }
        }
      },
      "delete": {
        "operationId": "delete_TaskDelete",
        "parameters": [
          {
            "$ref": "#/components/parameters/TaskId"
          }
        ],
        "responses": {
          "200": {
            "description": "Returns the Object if it was successfully deleted",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "result": {
                      "$ref": "#/components/schemas/Task"
                    }
                  },
                  "required": ["success", "result"]
                }
              }
            }
          },
          "404": {
            "description": "Not Found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error404"
                }
              }
            }
          }
        }
      }
    },
    "/dummy/{slug}": {
      "post": {
        "tags": ["Dummy"],
        "summary": "this endpoint is an example",
        "operationId": "example-endpoint",
        "parameters": [
          {
            "name": "slug",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": { "type": "string" }
                },
                "required": ["name"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Returns the log details",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "result": {
                      "type": "object",
                      "properties": {
                        "msg": { "type": "string" },
                        "slug": { "type": "string" },
                        "name": { "type": "string" }
                      },
                      "required": ["msg", "slug", "name"]
                    }
                  },
                  "required": ["success", "result"]
                }
              }
            }
          }
        }
      }
    }
  },
  "webhooks": {}
}

