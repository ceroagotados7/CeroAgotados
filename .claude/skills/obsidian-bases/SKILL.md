---
name: obsidian-bases
description: Create and edit Obsidian Bases (.base files) with views, filters, formulas, and summaries. Use when working with .base files, creating database-like views of notes, or when the user mentions Bases, table views, card views, filters, or formulas in Obsidian.
---

# Obsidian Bases Skill

## Workflow

1. **Create the file**: Create a `.base` file in the vault with valid YAML content
2. **Define scope**: Add `filters` to select which notes appear (by tag, folder, property, or date)
3. **Add formulas** (optional): Define computed properties in the `formulas` section
4. **Configure views**: Add one or more views (`table`, `cards`, `list`, or `map`) with `order` specifying which properties to display
5. **Validate**: Verify the file is valid YAML with no syntax errors
6. **Test in Obsidian**: Open the `.base` file in Obsidian to confirm the view renders correctly

## Schema

```yaml
# Global filters apply to ALL views in the base
filters:
  and:
    - 'status == "active"'
    - not:
        - 'file.hasTag("archived")'

# Define formula properties
formulas:
  formula_name: 'expression'

# Configure display names
properties:
  property_name:
    displayName: "Display Name"
  formula.formula_name:
    displayName: "Formula Display Name"

# Custom summary formulas
summaries:
  custom_summary_name: 'values.mean().round(3)'

# One or more views
views:
  - type: table | cards | list | map
    name: "View Name"
    limit: 10
    groupBy:
      property: property_name
      direction: ASC | DESC
    filters:
      and:
        - 'status == "active"'
    order:
      - file.name
      - property_name
      - formula.formula_name
    summaries:
      property_name: Average
```

## Filter Syntax

```yaml
# Single filter
filters: 'status == "done"'

# AND
filters:
  and:
    - 'status == "done"'
    - 'priority > 3'

# OR
filters:
  or:
    - 'file.hasTag("book")'
    - 'file.hasTag("article")'

# NOT
filters:
  not:
    - 'file.hasTag("archived")'

# Nested
filters:
  or:
    - file.hasTag("tag")
    - and:
        - file.hasTag("book")
        - file.hasLink("Textbook")
```

## File Properties Reference

| Property | Type | Description |
|----------|------|-------------|
| `file.name` | String | File name |
| `file.basename` | String | File name without extension |
| `file.path` | String | Full path |
| `file.folder` | String | Parent folder path |
| `file.ext` | String | Extension |
| `file.size` | Number | Size in bytes |
| `file.ctime` | Date | Created time |
| `file.mtime` | Date | Modified time |
| `file.tags` | List | All tags |
| `file.links` | List | Internal links |
| `file.backlinks` | List | Files linking to this |

## Formula Syntax

```yaml
formulas:
  total: "price * quantity"
  status_icon: 'if(done, "✅", "⏳")'
  created: 'file.ctime.format("YYYY-MM-DD")'
  days_old: '(now() - file.ctime).days'
  days_until_due: 'if(due_date, (date(due_date) - today()).days, "")'
```

**Duration note**: Subtracting two dates returns a Duration type. Always access `.days`, `.hours`, etc. before applying number functions.

```yaml
# CORRECT
"(now() - file.ctime).days.round(0)"

# WRONG - Duration does not support .round() directly
"(now() - file.ctime).round(0)"
```

## Key Functions

| Function | Description |
|----------|-------------|
| `date(string)` | Parse string to date |
| `now()` | Current date and time |
| `today()` | Current date |
| `if(condition, trueResult, falseResult?)` | Conditional |
| `file(path)` | Get file object |
| `link(path, display?)` | Create a link |

## YAML Quoting Rules

- Use single quotes for formulas containing double quotes: `'if(done, "Yes", "No")'`
- Use double quotes for simple strings: `"My View Name"`
- Strings containing `:`, `{`, `}`, `[`, `]`, etc. must be quoted

## Embedding Bases

```markdown
![[MyBase.base]]
![[MyBase.base#View Name]]
```

## References

- [Bases Syntax](https://help.obsidian.md/bases/syntax)
- [Source skill](https://github.com/kepano/obsidian-skills/blob/main/skills/obsidian-bases/SKILL.md)
