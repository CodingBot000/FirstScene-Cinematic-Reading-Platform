// Generated from contracts/api.openapi.yaml.
export const apiSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://firstscene.invalid/schema/api-v1.json",
  $defs: {
    Empty: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
    Session: {
      type: "object",
      additionalProperties: false,
      properties: {
        epoch: {
          type: "string",
          format: "uuid",
        },
        expiresAt: {
          type: "string",
          format: "date-time",
        },
      },
      required: ["epoch", "expiresAt"],
    },
    Preferences: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: {
          enum: ["cinematic", "plain"],
        },
        effects: {
          enum: ["full", "reduced"],
        },
        fontSize: {
          enum: [18, 20, 22, 24],
        },
        theme: {
          enum: ["dark", "light"],
        },
        revision: {
          type: "integer",
          minimum: 0,
        },
      },
      required: ["mode", "effects", "fontSize", "theme", "revision"],
    },
    PreferencesWrite: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: {
          enum: ["cinematic", "plain"],
        },
        effects: {
          enum: ["full", "reduced"],
        },
        fontSize: {
          enum: [18, 20, 22, 24],
        },
        theme: {
          enum: ["dark", "light"],
        },
        expectedRevision: {
          type: "integer",
          minimum: 0,
        },
        operationId: {
          type: "string",
          format: "uuid",
        },
      },
      required: [
        "mode",
        "effects",
        "fontSize",
        "theme",
        "expectedRevision",
        "operationId",
      ],
    },
    Progress: {
      type: "object",
      additionalProperties: false,
      properties: {
        storyId: {
          type: "string",
          pattern: "^[a-z][a-z0-9-]{1,63}$",
        },
        contentVersion: {
          type: "integer",
          minimum: 1,
        },
        contentHash: {
          type: "string",
          pattern: "^[a-f0-9]{64}$",
        },
        sceneId: {
          type: "string",
          pattern: "^[a-z][a-z0-9-]{1,63}$",
        },
        beatId: {
          type: "string",
          pattern: "^[a-z][a-z0-9-]{1,63}$",
        },
        fraction: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        furthestOrdinal: {
          type: "integer",
          minimum: 0,
        },
        completed: {
          type: "boolean",
        },
        revision: {
          type: "integer",
          minimum: 0,
        },
        updatedAt: {
          type: "string",
          format: "date-time",
        },
      },
      required: [
        "storyId",
        "contentVersion",
        "contentHash",
        "sceneId",
        "beatId",
        "fraction",
        "furthestOrdinal",
        "completed",
        "revision",
        "updatedAt",
      ],
    },
    ProgressWrite: {
      type: "object",
      additionalProperties: false,
      properties: {
        contentVersion: {
          type: "integer",
          minimum: 1,
        },
        contentHash: {
          type: "string",
          pattern: "^[a-f0-9]{64}$",
        },
        sceneId: {
          type: "string",
          pattern: "^[a-z][a-z0-9-]{1,63}$",
        },
        beatId: {
          type: "string",
          pattern: "^[a-z][a-z0-9-]{1,63}$",
        },
        furthestOrdinal: {
          type: "integer",
          minimum: 0,
          maximum: 35,
        },
        fraction: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        completed: {
          type: "boolean",
        },
        expectedRevision: {
          type: "integer",
          minimum: 0,
        },
        operationId: {
          type: "string",
          format: "uuid",
        },
      },
      required: [
        "contentVersion",
        "contentHash",
        "sceneId",
        "beatId",
        "fraction",
        "completed",
        "expectedRevision",
        "operationId",
      ],
    },
    Bookmark: {
      type: "object",
      additionalProperties: false,
      properties: {
        storyId: {
          type: "string",
          pattern: "^[a-z][a-z0-9-]{1,63}$",
        },
        targetId: {
          type: "string",
          pattern: "^(__story__|[a-z][a-z0-9-]{1,63})$",
        },
        contentVersion: {
          type: "integer",
          minimum: 1,
        },
        createdAt: {
          type: "string",
          format: "date-time",
        },
      },
      required: ["storyId", "targetId", "contentVersion", "createdAt"],
    },
    BookmarkWrite: {
      type: "object",
      additionalProperties: false,
      properties: {
        contentVersion: {
          type: "integer",
          minimum: 1,
        },
        operationId: {
          type: "string",
          format: "uuid",
        },
      },
      required: ["contentVersion", "operationId"],
    },
    Mutation: {
      type: "object",
      additionalProperties: false,
      properties: {
        operationId: {
          type: "string",
          format: "uuid",
        },
      },
      required: ["operationId"],
    },
    FeedbackWrite: {
      type: "object",
      additionalProperties: false,
      properties: {
        storyId: {
          type: "string",
          pattern: "^[a-z][a-z0-9-]{1,63}$",
        },
        operationId: {
          type: "string",
          format: "uuid",
        },
        code: {
          enum: ["helpful", "distracting", "too_fast", "comfortable"],
        },
      },
      required: ["storyId", "operationId", "code"],
    },
    FeedbackAccepted: {
      type: "object",
      additionalProperties: false,
      properties: {
        accepted: {
          const: true,
        },
      },
      required: ["accepted"],
    },
    Health: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          enum: ["ok", "unavailable"],
        },
      },
      required: ["status"],
    },
    Me: {
      type: "object",
      additionalProperties: false,
      properties: {
        session: {
          $ref: "#/$defs/Session",
        },
        preferences: {
          $ref: "#/$defs/Preferences",
        },
        progress: {
          type: "array",
          items: {
            $ref: "#/$defs/Progress",
          },
        },
        bookmarks: {
          type: "array",
          items: {
            $ref: "#/$defs/Bookmark",
          },
        },
        serverPersistence: {
          const: true,
        },
      },
      required: [
        "session",
        "preferences",
        "progress",
        "bookmarks",
        "serverPersistence",
      ],
    },
    Error: {
      type: "object",
      additionalProperties: false,
      properties: {
        error: {
          type: "object",
          additionalProperties: false,
          properties: {
            code: {
              type: "string",
              pattern: "^[A-Z_]+$",
            },
            message: {
              type: "string",
            },
            requestId: {
              type: "string",
              format: "uuid",
            },
            details: {
              type: "object",
              additionalProperties: false,
              properties: {
                currentRevision: {
                  type: "integer",
                  minimum: 0,
                },
                currentProgress: {
                  $ref: "#/$defs/Progress",
                },
              },
              required: [],
            },
          },
          required: ["code", "message", "requestId"],
        },
      },
      required: ["error"],
    },
  },
} as const;
