---
name: json-canvas
description: Create and edit JSON Canvas files (.canvas) with nodes, edges, groups, and connections. Use when working with .canvas files, creating visual canvases, mind maps, flowcharts, or when the user mentions Canvas files in Obsidian.
---

# JSON Canvas Skill

Create and edit JSON Canvas files following the JSON Canvas Spec 1.0. Used by Obsidian for `.canvas` files.

## Core Structure

```json
{
  "nodes": [],
  "edges": []
}
```

## Node Types

### Text Node
```json
{
  "id": "abc123def456abcd",
  "type": "text",
  "x": 0,
  "y": 0,
  "width": 250,
  "height": 100,
  "text": "Content in **Markdown**"
}
```

### File Node (internal Obsidian file)
```json
{
  "id": "abc123def456abcd",
  "type": "file",
  "x": 300,
  "y": 0,
  "width": 250,
  "height": 100,
  "file": "path/to/note.md"
}
```

### Link Node (external URL)
```json
{
  "id": "abc123def456abcd",
  "type": "link",
  "x": 0,
  "y": 200,
  "width": 300,
  "height": 150,
  "url": "https://example.com"
}
```

### Group Node (visual container)
```json
{
  "id": "abc123def456abcd",
  "type": "group",
  "x": -50,
  "y": -50,
  "width": 400,
  "height": 300,
  "label": "Group Label",
  "background": "path/to/image.png",
  "backgroundStyle": "cover | ratio | repeat"
}
```

## Edges

```json
{
  "id": "edge123456789abc",
  "fromNode": "abc123def456abcd",
  "fromSide": "right",
  "fromEnd": "none",
  "toNode": "def456abc123defg",
  "toSide": "left",
  "toEnd": "arrow",
  "color": "1",
  "label": "Edge label"
}
```

- **fromSide / toSide**: `top`, `right`, `bottom`, `left`
- **fromEnd / toEnd**: `none`, `arrow`

## Required Fields

**All nodes require:** `id` (16-char hex), `type`, `x`, `y`, `width`, `height`

**Edges require:** `id`, `fromNode`, `toNode`

## Color System

Presets: `"1"` Red, `"2"` Orange, `"3"` Yellow, `"4"` Green, `"5"` Cyan, `"6"` Purple

Custom: `"#FF0000"` (hex value)

## Layout Guidelines

- Space nodes 50–100px apart
- 20–50px padding inside groups
- Coordinates support negative values
- Typical node sizes: 200–400px wide, 60–200px tall

## Validation Checklist

- [ ] All IDs are unique across nodes and edges
- [ ] All edge `fromNode`/`toNode` reference existing node IDs
- [ ] All required fields present on every node and edge
- [ ] Valid JSON (no trailing commas, proper quoting)
- [ ] IDs are exactly 16 hex characters

## Complete Example

```json
{
  "nodes": [
    {
      "id": "a1b2c3d4e5f6a1b2",
      "type": "text",
      "x": 0,
      "y": 0,
      "width": 250,
      "height": 80,
      "text": "# Start\nEntry point",
      "color": "4"
    },
    {
      "id": "b2c3d4e5f6a1b2c3",
      "type": "file",
      "x": 350,
      "y": 0,
      "width": 250,
      "height": 80,
      "file": "projects/solutto/state.md"
    },
    {
      "id": "c3d4e5f6a1b2c3d4",
      "type": "group",
      "x": -20,
      "y": -20,
      "width": 650,
      "height": 150,
      "label": "Phase 1"
    }
  ],
  "edges": [
    {
      "id": "d4e5f6a1b2c3d4e5",
      "fromNode": "a1b2c3d4e5f6a1b2",
      "fromSide": "right",
      "toNode": "b2c3d4e5f6a1b2c3",
      "toSide": "left",
      "toEnd": "arrow",
      "label": "leads to"
    }
  ]
}
```

## References

- [JSON Canvas Spec](https://jsoncanvas.org)
- [Source skill](https://github.com/kepano/obsidian-skills/blob/main/skills/json-canvas/SKILL.md)
