# v3 插件操作目录

此页由 npm run docs:operations 从 Core 操作目录生成，请勿手改。表中列出工具链支持的操作；桌面是否触发还取决于宿主版本及对应入口。

| 操作 | 拦截权限 | 完成事件权限 | 可取消 | 处理器时限 | 默认执行位置 | 提示用户 | 主动调用权限 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `player.play` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 是 | player.control |
| `queue.add` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 是 | player.control |
| `queue.remove` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 是 | player.control |
| `queue.clear` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 是 | player.control |
| `queue.shuffle` | `player.intercept` | `player.read` | 否 | 800 ms | `renderer` | 否 | 宿主入口 |
| `player.pause` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 是 | player.control |
| `player.resume` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 是 | player.control |
| `player.previous` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 是 | player.control |
| `player.next` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 是 | player.control |
| `player.error` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 否 | 宿主入口 |
| `player.queueEnded` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 否 | 宿主入口 |
| `player.setMode` | `player.intercept` | `player.read` | 是 | 800 ms | `renderer` | 是 | player.control |
| `player.seek` | `player.intercept` | `player.read` | 否 | 800 ms | `renderer` | 是 | player.control |
| `player.setVolume` | `player.intercept` | `player.read` | 否 | 800 ms | `renderer` | 是 | player.control |
| `player.resolve` | `player.intercept` | `player.read` | 否 | 800 ms | `main` | 否 | 宿主入口 |
| `account.switch` | `account.intercept` | `account.profile` | 是 | 3000 ms | `main` | 否 | 宿主入口 |
| `search.query` | `search.intercept` | `search.read` | 是 | 800 ms | `renderer` | 否 | 宿主入口 |
| `search.suggest` | `search.intercept` | `search.read` | 否 | 800 ms | `renderer` | 否 | 宿主入口 |
| `search.results` | `search.intercept` | `search.read` | 否 | 800 ms | `renderer` | 否 | 宿主入口 |
| `track.like` | `library.intercept` | `library.read` | 是 | 800 ms | `renderer` | 是 | library.write |
| `playlist.create` | `library.intercept` | `library.read` | 是 | 3000 ms | `renderer` | 是 | library.write |
| `playlist.delete` | `library.intercept` | `library.read` | 是 | 3000 ms | `renderer` | 是 | library.delete |
| `playlist.addTracks` | `library.intercept` | `library.read` | 是 | 3000 ms | `renderer` | 是 | library.write |
| `playlist.removeTracks` | `library.intercept` | `library.read` | 是 | 3000 ms | `renderer` | 是 | library.delete |
| `playlist.export` | `library.intercept` | `library.read` | 是 | 3000 ms | `renderer` | 是 | library.read |
| `playlist.import` | `library.intercept` | `library.read` | 是 | 3000 ms | `renderer` | 是 | library.write |
| `window.close` | `window.intercept` | `window.read` | 是 | 800 ms | `renderer` | 是 | window.control |
| `lyrics.load` | `lyrics.intercept` | `player.read` | 否 | 3000 ms | `main` | 否 | 宿主入口 |
| `lyrics.transform` | `lyrics.intercept` | `player.read` | 否 | 3000 ms | `main` | 否 | 宿主入口 |
| `download.create` | `downloads.intercept` | `downloads.manage` | 是 | 3000 ms | `main` | 是 | downloads.create |
| `download.filename` | `downloads.intercept` | `downloads.manage` | 否 | 3000 ms | `main` | 否 | 宿主入口 |
| `share.create` | `sharing.intercept` | `music.read` | 是 | 3000 ms | `renderer` | 是 | sharing.publish |
| `link.open` | `links.intercept` | `links.read` | 是 | 3000 ms | `renderer` | 是 | external.open |
| `notification.show` | `notifications.intercept` | `notifications.read` | 是 | 3000 ms | `renderer` | 否 | 无需额外权限 |

开发、离线测试与桌面调试请见[播放与队列拦截指南](HOOKS-AND-EVENTS.md)。

## 输入和结果的 JSON Schema

以下描述可序列化字段。跨字段约束、原操作身份、公开链接安全检查和撤权检查继续由宿主运行时执行。`private` 歌曲引用是短期句柄，主动调用工具只接受公开歌曲。

### `player.play`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "track": {
        "type": "object",
        "properties": {
          "ref": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "title": {
            "type": "string",
            "minLength": 0,
            "maxLength": 512
          },
          "metadata": {
            "type": "object",
            "properties": {
              "artists": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 256
                },
                "maxItems": 32
              }
            },
            "required": [
              "artists"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "ref",
          "title",
          "metadata"
        ],
        "additionalProperties": false
      },
      "queueIndex": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      }
    },
    "required": [
      "track"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `queue.add`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "tracks": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "ref": {
              "type": "object",
              "properties": {
                "kind": {
                  "const": "track"
                },
                "providerId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._-]+$"
                },
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 512
                }
              },
              "required": [
                "kind",
                "providerId",
                "id"
              ],
              "additionalProperties": false
            },
            "title": {
              "type": "string",
              "minLength": 0,
              "maxLength": 512
            },
            "metadata": {
              "type": "object",
              "properties": {
                "artists": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 0,
                    "maxLength": 256
                  },
                  "maxItems": 32
                }
              },
              "required": [
                "artists"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "ref",
            "title",
            "metadata"
          ],
          "additionalProperties": false
        },
        "maxItems": 1000,
        "minItems": 1
      },
      "position": {
        "type": "string",
        "enum": [
          "next",
          "end"
        ]
      }
    },
    "required": [
      "tracks",
      "position"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `queue.remove`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "tracks": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "ref": {
              "type": "object",
              "properties": {
                "kind": {
                  "const": "track"
                },
                "providerId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._-]+$"
                },
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 512
                }
              },
              "required": [
                "kind",
                "providerId",
                "id"
              ],
              "additionalProperties": false
            },
            "title": {
              "type": "string",
              "minLength": 0,
              "maxLength": 512
            },
            "metadata": {
              "type": "object",
              "properties": {
                "artists": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 0,
                    "maxLength": 256
                  },
                  "maxItems": 32
                }
              },
              "required": [
                "artists"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "ref",
            "title",
            "metadata"
          ],
          "additionalProperties": false
        },
        "maxItems": 1000
      }
    },
    "required": [
      "tracks"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `queue.clear`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "tracks": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "ref": {
              "type": "object",
              "properties": {
                "kind": {
                  "const": "track"
                },
                "providerId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._-]+$"
                },
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 512
                }
              },
              "required": [
                "kind",
                "providerId",
                "id"
              ],
              "additionalProperties": false
            },
            "title": {
              "type": "string",
              "minLength": 0,
              "maxLength": 512
            },
            "metadata": {
              "type": "object",
              "properties": {
                "artists": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 0,
                    "maxLength": 256
                  },
                  "maxItems": 32
                }
              },
              "required": [
                "artists"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "ref",
            "title",
            "metadata"
          ],
          "additionalProperties": false
        },
        "maxItems": 1000
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `queue.shuffle`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "ref": {
              "type": "object",
              "properties": {
                "kind": {
                  "const": "track"
                },
                "providerId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._-]+$"
                },
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 512
                }
              },
              "required": [
                "kind",
                "providerId",
                "id"
              ],
              "additionalProperties": false
            },
            "title": {
              "type": "string",
              "minLength": 0,
              "maxLength": 512
            },
            "metadata": {
              "type": "object",
              "properties": {
                "artists": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 0,
                    "maxLength": 256
                  },
                  "maxItems": 32
                }
              },
              "required": [
                "artists"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "ref",
            "title",
            "metadata"
          ],
          "additionalProperties": false
        },
        "maxItems": 1000
      }
    },
    "required": [
      "items"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `player.pause`

```json
{
  "input": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `player.resume`

```json
{
  "input": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `player.previous`

```json
{
  "input": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `player.next`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "enum": [
          "user",
          "ended",
          "error"
        ]
      },
      "track": {
        "type": "object",
        "properties": {
          "ref": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "title": {
            "type": "string",
            "minLength": 0,
            "maxLength": 512
          },
          "metadata": {
            "type": "object",
            "properties": {
              "artists": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 256
                },
                "maxItems": 32
              }
            },
            "required": [
              "artists"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "ref",
          "title",
          "metadata"
        ],
        "additionalProperties": false
      }
    },
    "required": [
      "reason"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `player.error`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "track": {
        "type": "object",
        "properties": {
          "ref": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "title": {
            "type": "string",
            "minLength": 0,
            "maxLength": 512
          },
          "metadata": {
            "type": "object",
            "properties": {
              "artists": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 256
                },
                "maxItems": 32
              }
            },
            "required": [
              "artists"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "ref",
          "title",
          "metadata"
        ],
        "additionalProperties": false
      },
      "error": {
        "type": "string",
        "enum": [
          "resolve",
          "start",
          "media",
          "playback"
        ]
      }
    },
    "required": [
      "track",
      "error"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `player.queueEnded`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "tracks": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "ref": {
              "type": "object",
              "properties": {
                "kind": {
                  "const": "track"
                },
                "providerId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._-]+$"
                },
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 512
                }
              },
              "required": [
                "kind",
                "providerId",
                "id"
              ],
              "additionalProperties": false
            },
            "title": {
              "type": "string",
              "minLength": 0,
              "maxLength": 512
            },
            "metadata": {
              "type": "object",
              "properties": {
                "artists": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 0,
                    "maxLength": 256
                  },
                  "maxItems": 32
                }
              },
              "required": [
                "artists"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "ref",
            "title",
            "metadata"
          ],
          "additionalProperties": false
        },
        "maxItems": 1000
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `player.setMode`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "mode": {
        "type": "string",
        "enum": [
          "sequence",
          "single",
          "random"
        ]
      }
    },
    "required": [
      "mode"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `player.seek`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "positionMs": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      }
    },
    "required": [
      "positionMs"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `player.setVolume`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "volume": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      }
    },
    "required": [
      "volume"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `player.resolve`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "track": {
        "type": "object",
        "properties": {
          "ref": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "title": {
            "type": "string",
            "minLength": 0,
            "maxLength": 512
          },
          "metadata": {
            "type": "object",
            "properties": {
              "artists": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 256
                },
                "maxItems": 32
              }
            },
            "required": [
              "artists"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "ref",
          "title",
          "metadata"
        ],
        "additionalProperties": false
      },
      "quality": {
        "type": "string",
        "minLength": 0,
        "maxLength": 64,
        "pattern": "^[\\w.-]*$"
      }
    },
    "required": [
      "track",
      "quality"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "object",
    "properties": {
      "ok": {
        "type": "boolean"
      }
    },
    "required": [
      "ok"
    ],
    "additionalProperties": false
  }
}
```

### `account.switch`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "pluginId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128
      },
      "accountId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128
      },
      "fromConnectionId": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1,
            "maxLength": 128
          },
          {
            "type": "null"
          }
        ]
      },
      "connectionId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128
      }
    },
    "required": [
      "pluginId",
      "accountId",
      "fromConnectionId",
      "connectionId"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `search.query`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "minLength": 1,
        "maxLength": 4096
      },
      "sourceId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "pattern": "^[\\w.-]+$"
      },
      "kinds": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64
        },
        "maxItems": 32,
        "minItems": 1
      }
    },
    "required": [
      "query",
      "sourceId",
      "kinds"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `search.suggest`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "minLength": 1,
        "maxLength": 4096
      },
      "items": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 512
        },
        "maxItems": 100
      }
    },
    "required": [
      "query",
      "items"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `search.results`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "minLength": 1,
        "maxLength": 4096
      },
      "sourceId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128
      },
      "page": {
        "type": "object",
        "properties": {
          "kind": {
            "type": "string",
            "enum": [
              "track",
              "playlist"
            ]
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "ref": {
                  "type": "object",
                  "properties": {
                    "kind": {
                      "type": "string",
                      "enum": [
                        "track",
                        "playlist"
                      ]
                    },
                    "providerId": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    },
                    "id": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 256
                    }
                  },
                  "required": [
                    "kind",
                    "providerId",
                    "id"
                  ],
                  "additionalProperties": false
                },
                "title": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 512
                },
                "subtitle": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 512
                },
                "metadata": {
                  "type": "object",
                  "properties": {
                    "artists": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 256
                      },
                      "maxItems": 32
                    }
                  },
                  "required": [
                    "artists"
                  ],
                  "additionalProperties": false
                }
              },
              "required": [
                "ref",
                "title"
              ],
              "additionalProperties": false
            },
            "maxItems": 500
          }
        },
        "required": [
          "kind",
          "items"
        ],
        "additionalProperties": false
      }
    },
    "required": [
      "query",
      "sourceId",
      "page"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `track.like`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "track": {
        "type": "object",
        "properties": {
          "ref": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "title": {
            "type": "string",
            "minLength": 0,
            "maxLength": 512
          },
          "metadata": {
            "type": "object",
            "properties": {
              "artists": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 256
                },
                "maxItems": 32
              }
            },
            "required": [
              "artists"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "ref",
          "title",
          "metadata"
        ],
        "additionalProperties": false
      },
      "liked": {
        "type": "boolean"
      }
    },
    "required": [
      "track",
      "liked"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `playlist.create`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 512
      },
      "location": {
        "type": "string",
        "enum": [
          "local",
          "cloud"
        ]
      }
    },
    "required": [
      "name",
      "location"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `playlist.delete`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "playlist": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 512
          },
          "location": {
            "type": "string",
            "enum": [
              "local",
              "cloud",
              "both"
            ]
          }
        },
        "required": [
          "id",
          "name",
          "location"
        ],
        "additionalProperties": false
      }
    },
    "required": [
      "playlist"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `playlist.addTracks`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "playlist": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 512
          },
          "location": {
            "type": "string",
            "enum": [
              "local",
              "cloud",
              "both"
            ]
          }
        },
        "required": [
          "id",
          "name",
          "location"
        ],
        "additionalProperties": false
      },
      "tracks": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "ref": {
              "type": "object",
              "properties": {
                "kind": {
                  "const": "track"
                },
                "providerId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._-]+$"
                },
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 512
                }
              },
              "required": [
                "kind",
                "providerId",
                "id"
              ],
              "additionalProperties": false
            },
            "title": {
              "type": "string",
              "minLength": 0,
              "maxLength": 512
            },
            "metadata": {
              "type": "object",
              "properties": {
                "artists": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 0,
                    "maxLength": 256
                  },
                  "maxItems": 32
                }
              },
              "required": [
                "artists"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "ref",
            "title",
            "metadata"
          ],
          "additionalProperties": false
        },
        "maxItems": 1000
      }
    },
    "required": [
      "playlist",
      "tracks"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `playlist.removeTracks`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "playlist": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 512
          },
          "location": {
            "type": "string",
            "enum": [
              "local",
              "cloud",
              "both"
            ]
          }
        },
        "required": [
          "id",
          "name",
          "location"
        ],
        "additionalProperties": false
      },
      "tracks": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "ref": {
              "type": "object",
              "properties": {
                "kind": {
                  "const": "track"
                },
                "providerId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._-]+$"
                },
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 512
                }
              },
              "required": [
                "kind",
                "providerId",
                "id"
              ],
              "additionalProperties": false
            },
            "title": {
              "type": "string",
              "minLength": 0,
              "maxLength": 512
            },
            "metadata": {
              "type": "object",
              "properties": {
                "artists": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 0,
                    "maxLength": 256
                  },
                  "maxItems": 32
                }
              },
              "required": [
                "artists"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "ref",
            "title",
            "metadata"
          ],
          "additionalProperties": false
        },
        "maxItems": 1000
      }
    },
    "required": [
      "playlist",
      "tracks"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `playlist.export`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "playlist": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 512
          },
          "location": {
            "type": "string",
            "enum": [
              "local",
              "cloud",
              "both"
            ]
          }
        },
        "required": [
          "id",
          "name",
          "location"
        ],
        "additionalProperties": false
      },
      "format": {
        "type": "string",
        "enum": [
          "cmpl",
          "cpl"
        ]
      }
    },
    "required": [
      "playlist",
      "format"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `playlist.import`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "value": {
        "type": "string",
        "minLength": 1,
        "maxLength": 4096
      },
      "importerId": {
        "type": "string",
        "minLength": 3,
        "maxLength": 257,
        "pattern": "^[\\w.-]{1,128}:[\\w.-]{1,128}$"
      }
    },
    "required": [
      "value"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `window.close`

```json
{
  "input": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `lyrics.load`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "track": {
        "type": "object",
        "properties": {
          "ref": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "title": {
            "type": "string",
            "minLength": 0,
            "maxLength": 512
          },
          "metadata": {
            "type": "object",
            "properties": {
              "artists": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 256
                },
                "maxItems": 32
              }
            },
            "required": [
              "artists"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "ref",
          "title",
          "metadata"
        ],
        "additionalProperties": false
      }
    },
    "required": [
      "track"
    ],
    "additionalProperties": false
  },
  "output": {
    "anyOf": [
      {
        "type": "object",
        "properties": {
          "format": {
            "const": "crlyric"
          },
          "version": {
            "const": 1
          },
          "track": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "offsetMs": {
            "type": "number"
          },
          "plainText": {
            "type": "string",
            "minLength": 0,
            "maxLength": 1048576
          },
          "lines": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "startTimeMs": {
                  "type": "number",
                  "minimum": 0
                },
                "endTimeMs": {
                  "type": "number",
                  "minimum": 0
                },
                "text": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 65536
                },
                "translation": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 65536
                },
                "romanization": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 65536
                },
                "translations": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "text": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 65536
                      },
                      "language": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 128
                      },
                      "words": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "startTimeMs": {
                              "type": "number",
                              "minimum": 0
                            },
                            "endTimeMs": {
                              "type": "number",
                              "minimum": 0
                            },
                            "text": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            },
                            "translation": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            },
                            "romanization": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            }
                          },
                          "required": [
                            "startTimeMs",
                            "endTimeMs",
                            "text"
                          ],
                          "additionalProperties": false
                        },
                        "maxItems": 10000
                      }
                    },
                    "required": [
                      "text"
                    ],
                    "additionalProperties": false
                  },
                  "maxItems": 16
                },
                "romanizations": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "text": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 65536
                      },
                      "language": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 128
                      },
                      "words": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "startTimeMs": {
                              "type": "number",
                              "minimum": 0
                            },
                            "endTimeMs": {
                              "type": "number",
                              "minimum": 0
                            },
                            "text": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            },
                            "translation": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            },
                            "romanization": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            }
                          },
                          "required": [
                            "startTimeMs",
                            "endTimeMs",
                            "text"
                          ],
                          "additionalProperties": false
                        },
                        "maxItems": 10000
                      }
                    },
                    "required": [
                      "text"
                    ],
                    "additionalProperties": false
                  },
                  "maxItems": 16
                },
                "words": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "startTimeMs": {
                        "type": "number",
                        "minimum": 0
                      },
                      "endTimeMs": {
                        "type": "number",
                        "minimum": 0
                      },
                      "text": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 65536
                      },
                      "translation": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 65536
                      },
                      "romanization": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 65536
                      }
                    },
                    "required": [
                      "startTimeMs",
                      "endTimeMs",
                      "text"
                    ],
                    "additionalProperties": false
                  },
                  "maxItems": 10000
                },
                "isBackground": {
                  "type": "boolean"
                },
                "isDuet": {
                  "type": "boolean"
                }
              },
              "required": [
                "startTimeMs",
                "text"
              ],
              "additionalProperties": false
            },
            "maxItems": 20000
          }
        },
        "required": [
          "format",
          "version",
          "track",
          "offsetMs",
          "lines"
        ],
        "additionalProperties": false
      },
      {
        "type": "null"
      }
    ]
  }
}
```

### `lyrics.transform`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "track": {
        "type": "object",
        "properties": {
          "ref": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "title": {
            "type": "string",
            "minLength": 0,
            "maxLength": 512
          },
          "metadata": {
            "type": "object",
            "properties": {
              "artists": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 256
                },
                "maxItems": 32
              }
            },
            "required": [
              "artists"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "ref",
          "title",
          "metadata"
        ],
        "additionalProperties": false
      },
      "lyric": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "format": {
                "const": "crlyric"
              },
              "version": {
                "const": 1
              },
              "track": {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "track"
                  },
                  "providerId": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128,
                    "pattern": "^[A-Za-z0-9._-]+$"
                  },
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 512
                  }
                },
                "required": [
                  "kind",
                  "providerId",
                  "id"
                ],
                "additionalProperties": false
              },
              "offsetMs": {
                "type": "number"
              },
              "plainText": {
                "type": "string",
                "minLength": 0,
                "maxLength": 1048576
              },
              "lines": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "startTimeMs": {
                      "type": "number",
                      "minimum": 0
                    },
                    "endTimeMs": {
                      "type": "number",
                      "minimum": 0
                    },
                    "text": {
                      "type": "string",
                      "minLength": 0,
                      "maxLength": 65536
                    },
                    "translation": {
                      "type": "string",
                      "minLength": 0,
                      "maxLength": 65536
                    },
                    "romanization": {
                      "type": "string",
                      "minLength": 0,
                      "maxLength": 65536
                    },
                    "translations": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "text": {
                            "type": "string",
                            "minLength": 0,
                            "maxLength": 65536
                          },
                          "language": {
                            "type": "string",
                            "minLength": 0,
                            "maxLength": 128
                          },
                          "words": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "properties": {
                                "startTimeMs": {
                                  "type": "number",
                                  "minimum": 0
                                },
                                "endTimeMs": {
                                  "type": "number",
                                  "minimum": 0
                                },
                                "text": {
                                  "type": "string",
                                  "minLength": 0,
                                  "maxLength": 65536
                                },
                                "translation": {
                                  "type": "string",
                                  "minLength": 0,
                                  "maxLength": 65536
                                },
                                "romanization": {
                                  "type": "string",
                                  "minLength": 0,
                                  "maxLength": 65536
                                }
                              },
                              "required": [
                                "startTimeMs",
                                "endTimeMs",
                                "text"
                              ],
                              "additionalProperties": false
                            },
                            "maxItems": 10000
                          }
                        },
                        "required": [
                          "text"
                        ],
                        "additionalProperties": false
                      },
                      "maxItems": 16
                    },
                    "romanizations": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "text": {
                            "type": "string",
                            "minLength": 0,
                            "maxLength": 65536
                          },
                          "language": {
                            "type": "string",
                            "minLength": 0,
                            "maxLength": 128
                          },
                          "words": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "properties": {
                                "startTimeMs": {
                                  "type": "number",
                                  "minimum": 0
                                },
                                "endTimeMs": {
                                  "type": "number",
                                  "minimum": 0
                                },
                                "text": {
                                  "type": "string",
                                  "minLength": 0,
                                  "maxLength": 65536
                                },
                                "translation": {
                                  "type": "string",
                                  "minLength": 0,
                                  "maxLength": 65536
                                },
                                "romanization": {
                                  "type": "string",
                                  "minLength": 0,
                                  "maxLength": 65536
                                }
                              },
                              "required": [
                                "startTimeMs",
                                "endTimeMs",
                                "text"
                              ],
                              "additionalProperties": false
                            },
                            "maxItems": 10000
                          }
                        },
                        "required": [
                          "text"
                        ],
                        "additionalProperties": false
                      },
                      "maxItems": 16
                    },
                    "words": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "startTimeMs": {
                            "type": "number",
                            "minimum": 0
                          },
                          "endTimeMs": {
                            "type": "number",
                            "minimum": 0
                          },
                          "text": {
                            "type": "string",
                            "minLength": 0,
                            "maxLength": 65536
                          },
                          "translation": {
                            "type": "string",
                            "minLength": 0,
                            "maxLength": 65536
                          },
                          "romanization": {
                            "type": "string",
                            "minLength": 0,
                            "maxLength": 65536
                          }
                        },
                        "required": [
                          "startTimeMs",
                          "endTimeMs",
                          "text"
                        ],
                        "additionalProperties": false
                      },
                      "maxItems": 10000
                    },
                    "isBackground": {
                      "type": "boolean"
                    },
                    "isDuet": {
                      "type": "boolean"
                    }
                  },
                  "required": [
                    "startTimeMs",
                    "text"
                  ],
                  "additionalProperties": false
                },
                "maxItems": 20000
              }
            },
            "required": [
              "format",
              "version",
              "track",
              "offsetMs",
              "lines"
            ],
            "additionalProperties": false
          },
          {
            "type": "null"
          }
        ]
      }
    },
    "required": [
      "track",
      "lyric"
    ],
    "additionalProperties": false
  },
  "output": {
    "anyOf": [
      {
        "type": "object",
        "properties": {
          "format": {
            "const": "crlyric"
          },
          "version": {
            "const": 1
          },
          "track": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "offsetMs": {
            "type": "number"
          },
          "plainText": {
            "type": "string",
            "minLength": 0,
            "maxLength": 1048576
          },
          "lines": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "startTimeMs": {
                  "type": "number",
                  "minimum": 0
                },
                "endTimeMs": {
                  "type": "number",
                  "minimum": 0
                },
                "text": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 65536
                },
                "translation": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 65536
                },
                "romanization": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 65536
                },
                "translations": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "text": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 65536
                      },
                      "language": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 128
                      },
                      "words": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "startTimeMs": {
                              "type": "number",
                              "minimum": 0
                            },
                            "endTimeMs": {
                              "type": "number",
                              "minimum": 0
                            },
                            "text": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            },
                            "translation": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            },
                            "romanization": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            }
                          },
                          "required": [
                            "startTimeMs",
                            "endTimeMs",
                            "text"
                          ],
                          "additionalProperties": false
                        },
                        "maxItems": 10000
                      }
                    },
                    "required": [
                      "text"
                    ],
                    "additionalProperties": false
                  },
                  "maxItems": 16
                },
                "romanizations": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "text": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 65536
                      },
                      "language": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 128
                      },
                      "words": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "startTimeMs": {
                              "type": "number",
                              "minimum": 0
                            },
                            "endTimeMs": {
                              "type": "number",
                              "minimum": 0
                            },
                            "text": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            },
                            "translation": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            },
                            "romanization": {
                              "type": "string",
                              "minLength": 0,
                              "maxLength": 65536
                            }
                          },
                          "required": [
                            "startTimeMs",
                            "endTimeMs",
                            "text"
                          ],
                          "additionalProperties": false
                        },
                        "maxItems": 10000
                      }
                    },
                    "required": [
                      "text"
                    ],
                    "additionalProperties": false
                  },
                  "maxItems": 16
                },
                "words": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "startTimeMs": {
                        "type": "number",
                        "minimum": 0
                      },
                      "endTimeMs": {
                        "type": "number",
                        "minimum": 0
                      },
                      "text": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 65536
                      },
                      "translation": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 65536
                      },
                      "romanization": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 65536
                      }
                    },
                    "required": [
                      "startTimeMs",
                      "endTimeMs",
                      "text"
                    ],
                    "additionalProperties": false
                  },
                  "maxItems": 10000
                },
                "isBackground": {
                  "type": "boolean"
                },
                "isDuet": {
                  "type": "boolean"
                }
              },
              "required": [
                "startTimeMs",
                "text"
              ],
              "additionalProperties": false
            },
            "maxItems": 20000
          }
        },
        "required": [
          "format",
          "version",
          "track",
          "offsetMs",
          "lines"
        ],
        "additionalProperties": false
      },
      {
        "type": "null"
      }
    ]
  }
}
```

### `download.create`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "tracks": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "ref": {
              "type": "object",
              "properties": {
                "kind": {
                  "const": "track"
                },
                "providerId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[A-Za-z0-9._-]+$"
                },
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 512
                }
              },
              "required": [
                "kind",
                "providerId",
                "id"
              ],
              "additionalProperties": false
            },
            "title": {
              "type": "string",
              "minLength": 0,
              "maxLength": 512
            },
            "metadata": {
              "type": "object",
              "properties": {
                "artists": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 0,
                    "maxLength": 256
                  },
                  "maxItems": 32
                }
              },
              "required": [
                "artists"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "ref",
            "title",
            "metadata"
          ],
          "additionalProperties": false
        },
        "maxItems": 1000
      },
      "quality": {
        "type": "string",
        "minLength": 1,
        "maxLength": 64,
        "pattern": "^[\\w.-]+$"
      },
      "directory": {
        "type": "string",
        "pattern": "^[a-f0-9-]{36}$"
      }
    },
    "required": [
      "tracks",
      "quality"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `download.filename`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "track": {
        "type": "object",
        "properties": {
          "ref": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "title": {
            "type": "string",
            "minLength": 0,
            "maxLength": 512
          },
          "metadata": {
            "type": "object",
            "properties": {
              "artists": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 256
                },
                "maxItems": 32
              }
            },
            "required": [
              "artists"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "ref",
          "title",
          "metadata"
        ],
        "additionalProperties": false
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 255
      }
    },
    "required": [
      "track",
      "name"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `share.create`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "track": {
        "type": "object",
        "properties": {
          "ref": {
            "type": "object",
            "properties": {
              "kind": {
                "const": "track"
              },
              "providerId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[A-Za-z0-9._-]+$"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 512
              }
            },
            "required": [
              "kind",
              "providerId",
              "id"
            ],
            "additionalProperties": false
          },
          "title": {
            "type": "string",
            "minLength": 0,
            "maxLength": 512
          },
          "metadata": {
            "type": "object",
            "properties": {
              "artists": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 0,
                  "maxLength": 256
                },
                "maxItems": 32
              }
            },
            "required": [
              "artists"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "ref",
          "title",
          "metadata"
        ],
        "additionalProperties": false
      }
    },
    "required": [
      "track"
    ],
    "additionalProperties": false
  },
  "output": {
    "anyOf": [
      {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 4096
          },
          "url": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8192,
            "format": "uri"
          },
          "template": {
            "type": "string",
            "minLength": 0,
            "maxLength": 16384
          }
        },
        "required": [
          "id",
          "url"
        ],
        "additionalProperties": false
      },
      {
        "type": "null"
      }
    ]
  }
}
```

### `link.open`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "minLength": 1,
        "maxLength": 8192,
        "format": "uri"
      },
      "from": {
        "type": "string",
        "enum": [
          "paste",
          "drop",
          "deeplink"
        ]
      }
    },
    "required": [
      "url",
      "from"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```

### `notification.show`

```json
{
  "input": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "minLength": 0,
        "maxLength": 512
      },
      "body": {
        "type": "string",
        "minLength": 0,
        "maxLength": 8192
      },
      "level": {
        "type": "string",
        "enum": [
          "info",
          "success",
          "warning",
          "error"
        ]
      }
    },
    "required": [
      "title",
      "body",
      "level"
    ],
    "additionalProperties": false
  },
  "output": {
    "type": "null"
  }
}
```
