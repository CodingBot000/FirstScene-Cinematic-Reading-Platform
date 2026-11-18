// Generated from contracts/story.schema.json.
export const storySchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://firstscene.invalid/schema/story-v1.json",
  title: "FirstScene Story v1",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "version",
    "title",
    "summary",
    "genre",
    "tags",
    "language",
    "coverAssetId",
    "characters",
    "scenes",
    "contentHash",
  ],
  properties: {
    schemaVersion: {
      const: 1,
    },
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9-]{1,63}$",
    },
    version: {
      type: "integer",
      minimum: 1,
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 80,
    },
    summary: {
      type: "string",
      minLength: 10,
      maxLength: 500,
    },
    genre: {
      type: "string",
      minLength: 1,
      maxLength: 40,
    },
    tags: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
      items: {
        type: "string",
        maxLength: 20,
      },
    },
    language: {
      const: "ko",
    },
    coverAssetId: {
      type: "string",
      pattern: "^[a-z][a-z0-9-]{1,63}$",
    },
    characters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name"],
        properties: {
          id: {
            type: "string",
            pattern: "^[a-z][a-z0-9-]{1,63}$",
          },
          name: {
            type: "string",
            minLength: 1,
            maxLength: 30,
          },
        },
      },
    },
    scenes: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        $ref: "#/$defs/scene",
      },
    },
    contentHash: {
      type: "string",
      pattern: "^[a-f0-9]{64}$",
    },
  },
  $defs: {
    beat: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "speaker", "text", "mood", "effect"],
      properties: {
        id: {
          type: "string",
          pattern: "^[a-z][a-z0-9-]{1,63}$",
        },
        kind: {
          enum: ["narration", "dialogue"],
        },
        speaker: {
          anyOf: [
            {
              type: "string",
              pattern: "^[a-z][a-z0-9-]{1,63}$",
            },
            {
              type: "null",
            },
          ],
        },
        text: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
        },
        mood: {
          enum: ["calm", "memory", "tension", "climax", "relief"],
        },
        effect: {
          enum: ["none", "reveal", "typewriter"],
        },
      },
      allOf: [
        {
          if: {
            properties: {
              kind: {
                const: "dialogue",
              },
            },
          },
          then: {
            properties: {
              speaker: {
                type: "string",
                pattern: "^[a-z][a-z0-9-]{1,63}$",
              },
            },
          },
        },
      ],
    },
    scene: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "title",
        "backgroundAssetId",
        "portraitAssetId",
        "mood",
        "beats",
      ],
      properties: {
        id: {
          type: "string",
          pattern: "^[a-z][a-z0-9-]{1,63}$",
        },
        title: {
          type: "string",
          minLength: 1,
          maxLength: 80,
        },
        backgroundAssetId: {
          type: "string",
          pattern: "^[a-z][a-z0-9-]{1,63}$",
        },
        portraitAssetId: {
          anyOf: [
            {
              type: "string",
              pattern: "^[a-z][a-z0-9-]{1,63}$",
            },
            {
              type: "null",
            },
          ],
        },
        mood: {
          enum: ["calm", "memory", "tension", "climax", "relief"],
        },
        beats: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            $ref: "#/$defs/beat",
          },
        },
      },
    },
  },
} as const;
