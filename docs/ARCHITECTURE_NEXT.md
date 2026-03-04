# Architecture: Step Toward AGI

> From hardcoded workflows to self-assembling expert systems.

This document describes the architectural evolution of Garage Factory from a chat-with-tools MVP to a system where offices autonomously create skills, process documents, and produce expert conclusions.

---

## Current State (MVP)

```
User -> Chat -> Agent (OpenClaw) -> tool_call -> Workflow (hardcoded) -> result
```

What works:
- Offices (domains) with system prompts
- Scenarios (tools) linked to manually-built workflows
- Chat with tool-calling loop (up to 3 iterations)
- Sync executor for blocking workflow runs
- File upload to case (recently added)

What doesn't scale:
- Every skill requires a human to build a workflow in the visual editor
- Workflows use monolithic custom nodes (e.g., `excel-bik-sum` = read + filter + sum in one blob)
- No intermediate artifacts -- results exist only in chat
- No final deliverable -- a case is a conversation, not an expert conclusion
- No reuse across domains -- each office is isolated

---

## Target Architecture

```
Office (Domain)
  |
  +-- Agent (LLM with system prompt + domain knowledge)
  |     |
  |     +-- Skill Library (auto-generated or hand-crafted)
  |     |     |
  |     |     +-- Skill = Workflow composed from atomic nodes
  |     |     +-- Skill Generator Agent can create new skills on demand
  |     |
  |     +-- Document Processing Pipeline
  |     |     |
  |     |     +-- Extractors: read-excel, parse-pdf, ocr-image
  |     |     +-- Transformers: filter-rows, group-by, sort, join, calculate
  |     |     +-- Analyzers: check-rules, llm-analyze, pattern-match
  |     |     +-- Generators: write-excel, write-docx, generate-report
  |     |
  |     +-- Case Workspace
  |           |
  |           +-- uploads/      (user-provided files)
  |           +-- artifacts/    (skill outputs, intermediate results)
  |           +-- report/       (final expert conclusion)
  |           +-- chat history  (conversation log)
  |
  +-- Cross-case memory (RAG over past cases and domain knowledge)
```

---

## Layer 1: Atomic Document Nodes

### Problem

Current nodes are monolithic. `excel-bik-sum` reads an Excel file, filters by BIK column, and sums amounts -- all in one function. To add "filter by date range" you have to write a completely new node.

### Solution: Composable Atomic Nodes

Build a library of small, reusable nodes that each do one thing. Workflows chain them into pipelines.

#### Extraction Nodes

| Node | Input | Output | Description |
|------|-------|--------|-------------|
| `read-excel` | filePath, sheetName? | rows[] | Parse Excel/CSV into array of objects. Already exists, needs generalization |
| `read-pdf` | filePath | { text, pages[], tables[] } | Extract text and tables from PDF |
| `read-image` | filePath | { text, objects[] } | OCR + object detection |
| `read-json` | filePath | object | Parse JSON file |

#### Transformation Nodes

| Node | Input | Output | Description |
|------|-------|--------|-------------|
| `filter-rows` | rows[], condition | rows[] | Filter by column condition (eq, gt, lt, contains, regex, in) |
| `group-by` | rows[], column, aggregations[] | groups[] | Group rows and apply aggregations (sum, count, avg, min, max) |
| `sort-rows` | rows[], column, direction | rows[] | Sort ascending or descending |
| `select-columns` | rows[], columns[], rename? | rows[] | Pick/rename/reorder columns |
| `join-tables` | leftRows[], rightRows[], on | rows[] | SQL-like join (inner, left, right) |
| `calculate` | rows[], expression, outputColumn | rows[] | Add computed column (arithmetic, string ops, date ops) |
| `deduplicate` | rows[], columns[] | rows[] | Remove duplicate rows by key columns |
| `pivot` | rows[], rowKey, colKey, valueKey, aggFn | rows[] | Pivot table transformation |

#### Analysis Nodes

| Node | Input | Output | Description |
|------|-------|--------|-------------|
| `check-rules` | data, rules[] | { passed[], failed[], warnings[] } | Apply declarative rules (threshold checks, required fields, cross-references) |
| `llm-analyze` | data, prompt, model? | { analysis, structured? } | Send data to LLM with prompt, get analysis back |
| `pattern-match` | rows[], patterns[] | { matches[] } | Find rows matching named patterns (anomaly detection, known fraud signatures) |
| `compare` | dataA, dataB, keys[] | { added[], removed[], changed[] } | Diff two datasets |

#### Generation Nodes

| Node | Input | Output | Description |
|------|-------|--------|-------------|
| `write-excel` | rows[], filePath, sheetName? | { filePath, rowCount } | Write data to Excel file |
| `write-docx` | template, data, filePath | { filePath } | Generate Word document from template + data |
| `write-pdf` | content, filePath | { filePath } | Generate PDF report |
| `format-output` | data, format (table/summary/markdown/json) | string | Format data for human consumption |

### Node Interface Contract

Every node follows the same interface:

```typescript
interface NodeManifest {
  type: string;                    // e.g. "filter-rows"
  name: string;                    // Human-readable: "Filter Rows"
  category: "extraction" | "transformation" | "analysis" | "generation";
  description: string;
  inputs: ParameterDefinition[];   // Typed, with defaults and expressions support
  outputs: ParameterDefinition[];
}
```

Inputs support expressions (`{{$input.bridgeInputs.column}}`, `{{$node["read-excel"].rows}}`), enabling dynamic configuration from workflow trigger data or upstream node outputs.

### Implementation Strategy

These nodes are implemented as **Custom Nodes** (already supported by the engine). Each is a JavaScript function registered in the node plugin system. No engine changes needed -- just new node manifests + handler code.

Priority order for first useful pipeline:
1. `read-excel` (generalize existing)
2. `filter-rows`
3. `group-by`
4. `format-output`
5. `write-excel`

This alone enables: "Read bank statement -> filter transactions > 1M -> group by counterparty -> export summary".

---

## Layer 2: Case Artifacts

### Problem

Currently a case is just a chat log. Skill results exist only as JSON in `tool_result` case steps. There's no way to:
- List all files produced during a case
- Pass output of Skill A as input to Skill B
- Build a final deliverable from intermediate results

### Solution: Case Artifact Model

```
cases
  +-- case_artifacts (new table)
        id, caseId, type, name, filePath, mimeType, size,
        sourceType (upload | skill_output | generated),
        sourceStepId? (links to case_step that produced it),
        metadata (JSON: column names, row count, etc.),
        createdAt
```

#### Artifact Lifecycle

```
1. User uploads file
   -> saved to uploads/{caseId}/
   -> case_artifact created (sourceType: "upload")
   -> file_upload case_step created (already implemented)

2. Skill produces output file
   -> saved to artifacts/{caseId}/
   -> case_artifact created (sourceType: "skill_output", sourceStepId: tool_result step)

3. Agent generates final report
   -> saved to artifacts/{caseId}/report/
   -> case_artifact created (sourceType: "generated")
```

#### Agent File Awareness

When building tool context for the agent, include the list of available artifacts:

```
Available case files:
1. [upload] bank_statement_2024.xlsx (384 KB) - uploaded by user
2. [skill_output] filtered_transactions.xlsx (12 KB) - from "Filter Transactions" skill
3. [skill_output] counterparty_summary.json (3 KB) - from "Group by Counterparty" skill
```

The agent can then reference artifacts by name when calling skills:
```json
{
  "tool_call": {
    "tool_name": "analyze_anomalies",
    "inputs": {
      "dataFile": "filtered_transactions.xlsx"
    }
  }
}
```

The bridge resolves artifact names to file paths before workflow execution.

#### UI: Artifact Panel

In CaseChat, add an **Artifacts** panel (collapsible, alongside the chat):
- List of all case artifacts grouped by source
- Download links
- Preview for known types (table preview for Excel, text preview for JSON)
- "Generate Report" button that triggers the conclusion skill

---

## Layer 3: Skill Generation

### Problem

Creating a skill requires:
1. Build a workflow in the visual editor (drag nodes, connect, configure)
2. Register it as a scenario (set toolName, description, inputSchema)
3. Test it manually

This is too slow. A forensic expert who needs "find all transactions to a specific counterparty" shouldn't have to learn workflow editors.

### Solution: Skill Generator Agent

A meta-agent that creates skills from natural language descriptions.

#### How It Works

```
Expert: "I need a skill that reads an Excel bank statement,
         filters transactions where amount > 1,000,000,
         groups them by counterparty BIK,
         and outputs a summary Excel file"

Skill Generator:
  1. Parses intent -> identifies needed atomic nodes
  2. Designs workflow: read-excel -> filter-rows -> group-by -> write-excel
  3. Configures each node (column names, conditions, aggregations)
  4. Creates workflow via API
  5. Registers as scenario with generated toolName, description, inputSchema
  6. Returns: "Created skill 'filter_large_transactions_by_bik' with 4 steps"
```

#### Complexity Tiers

| Tier | Description | Approach | Example |
|------|-------------|----------|---------|
| Simple | Linear pipeline of 2-4 atomic nodes | Fully automated. LLM selects nodes and configs | "Sum all transactions by BIK" |
| Medium | Pipeline with conditions or branches | LLM generates workflow, human reviews | "If amount > threshold, flag as suspicious" |
| Complex | Multi-step with domain rules, document templates | LLM generates draft, human edits in visual editor | "Generate forensic report per GOST template" |

#### Skill Generator Architecture

```
POST /api/skills/generate
  { description: string, domainId: string, sampleFile?: string }

1. Build prompt with:
   - Available atomic nodes catalog (names, inputs, outputs)
   - Domain context (what this office does)
   - Sample file structure (if provided: column names, first 5 rows)

2. LLM generates workflow definition:
   {
     "name": "filter_large_transactions_by_bik",
     "nodes": [
       { "type": "read-excel", "config": { "sheetName": "Sheet1" } },
       { "type": "filter-rows", "config": { "column": "amount", "operator": "gt", "value": "{{$input.bridgeInputs.threshold}}" } },
       { "type": "group-by", "config": { "column": "bik", "aggregations": [{"column": "amount", "fn": "sum"}] } },
       { "type": "write-excel", "config": { "fileName": "summary.xlsx" } }
     ],
     "connections": [[0,1], [1,2], [2,3]],
     "inputSchema": {
       "filePath": { "type": "string", "description": "Path to Excel file" },
       "threshold": { "type": "number", "description": "Minimum transaction amount", "default": 1000000 }
     }
   }

3. Validate: all node types exist, connections valid, configs match node schemas

4. Create workflow via existing API (same as visual editor would)

5. Register as scenario with auto-generated metadata

6. Return skill ID + test instructions
```

#### Skill Testing

After generation, the system can auto-test:
1. If sample file was provided, run the skill against it
2. Check workflow completes without errors
3. Verify output has expected structure
4. Report results to user: "Skill tested successfully. Processed 1,247 rows, output 15 groups."

---

## Layer 4: Expert Conclusion (Case Deliverable)

### Problem

A forensic case involves multiple steps: analyze bank statements, check counterparties, find anomalies, cross-reference with known fraud patterns. Each skill produces an intermediate result. But the final deliverable is a **forensic conclusion document** -- not a chat transcript.

### Solution: Two-Level Result Model

```
Case Result = Conclusion Document
  assembled from:
    Artifact 1: filtered_transactions.xlsx (from skill "Filter Transactions")
    Artifact 2: anomaly_report.json (from skill "Detect Anomalies")
    Artifact 3: counterparty_analysis.xlsx (from skill "Analyze Counterparties")
    + Agent's reasoning from chat history
    + Domain-specific template
```

#### Conclusion Generation Skill

Each office can have a special skill: **"Generate Conclusion"**. This skill:

1. Collects all case artifacts
2. Collects key findings from chat history (assistant_message steps)
3. Applies a domain-specific document template
4. Uses LLM to synthesize findings into a structured report
5. Outputs a Word/PDF document

The conclusion skill is a workflow like any other, composed from atomic nodes:
```
collect-artifacts -> llm-analyze (synthesize findings) -> write-docx (from template)
```

#### Domain Templates

Each office defines templates for its deliverables:

```
domains
  +-- domain_templates (new table)
        id, domainId, name, type (conclusion | memo | letter),
        templatePath, requiredArtifacts[], structure (JSON),
        createdAt
```

Example template structure for a forensic conclusion:
```json
{
  "sections": [
    { "name": "header", "type": "metadata", "fields": ["caseNumber", "date", "expert"] },
    { "name": "introduction", "type": "static", "content": "On the basis of..." },
    { "name": "materials", "type": "artifact_list", "source": "all_uploads" },
    { "name": "research", "type": "llm_generated", "prompt": "Describe the research methodology..." },
    { "name": "findings", "type": "artifact_analysis", "source": "skill_outputs" },
    { "name": "conclusion", "type": "llm_generated", "prompt": "Based on all findings, provide expert conclusion..." },
    { "name": "attachments", "type": "artifact_references" }
  ]
}
```

---

## Layer 5: Cross-Domain Skill Reuse

### Problem

Forensic office and Financial Crime office both need "read Excel bank statement" and "filter transactions". Skills are currently domain-scoped.

### Solution: Skill Library with Shared + Domain-Specific Layers

```
Skill Library
  |
  +-- Shared Skills (available to all offices)
  |     +-- read-bank-statement
  |     +-- filter-transactions
  |     +-- group-by-counterparty
  |     +-- detect-anomalies
  |
  +-- Domain Skills (office-specific)
        +-- [Forensic] generate-forensic-conclusion
        +-- [Forensic] check-against-blacklist
        +-- [FinCrime] calculate-risk-score
        +-- [FinCrime] generate-sar-report
```

Implementation: add `scope` field to scenarios table:
- `scope: "shared"` -- visible to all offices
- `scope: "domain"` -- visible only to parent office

When building tool context for agent, merge shared + domain skills.

---

## Layer 6: Agent-Designed Scenarios

### Problem (Future)

Currently skills are individual tools. Complex expert work requires **orchestrating multiple skills in sequence** with decision points. For example:

```
"Forensic Analysis of Bank Account" scenario:
  1. Read all uploaded statements
  2. For each statement: filter suspicious transactions
  3. Group findings by counterparty
  4. Cross-reference counterparties with blacklists
  5. If matches found: deep-dive analysis
  6. If no matches: flag for manual review
  7. Generate conclusion document
```

This is not one skill -- it's a **scenario plan** that the agent executes step by step.

### Solution: Agent as Scenario Planner

Instead of hardcoding the sequence, the agent itself plans the execution:

1. User describes the task: "Analyze bank statements for fraud indicators"
2. Agent reviews available skills and artifacts
3. Agent creates an execution plan (visible in UI as a checklist)
4. Agent executes skills one by one, reviewing results between steps
5. Agent adjusts plan based on intermediate findings
6. Agent produces final deliverable

This is what the current tool-calling loop already does implicitly (agent decides which tool to call next). The evolution is:
- **Make the plan explicit** -- agent writes a plan before executing
- **Make the plan persistent** -- stored as case metadata, visible in UI
- **Make the plan adjustable** -- agent can revise based on findings, user can intervene

No new architecture needed -- this is a **system prompt engineering** task + UI for displaying the plan.

---

## Implementation Roadmap

### Phase A: Foundation (Atomic Nodes + Artifacts)

1. **Generalize `read-excel` node** -- accept any file path, return rows with column detection
2. **Build core transformation nodes** -- `filter-rows`, `group-by`, `sort-rows`, `select-columns`
3. **Build `write-excel` node** -- output results to file
4. **Add `case_artifacts` table** -- track uploads and skill outputs
5. **Modify bridge to save skill outputs as artifacts** -- file outputs -> artifacts dir + DB record
6. **Add artifact context to agent** -- agent sees available files when choosing tools
7. **Add Artifacts panel to CaseChat UI**

### Phase B: Skill Generation

8. **Build node catalog API** -- `GET /api/nodes/catalog` returns available atomic nodes with schemas
9. **Build skill generator service** -- LLM takes description + catalog -> workflow definition
10. **Build `POST /api/skills/generate` endpoint**
11. **Add "Create Skill" UI in office settings** -- text area for description + generate button
12. **Skill testing** -- auto-run generated skill against sample data

### Phase C: Expert Conclusions

13. **Add `domain_templates` table and CRUD**
14. **Build `collect-artifacts` node** -- gathers all case artifacts
15. **Build `write-docx` node** -- template-based document generation
16. **Build "Generate Conclusion" meta-skill**
17. **Add "Generate Report" button in CaseChat UI**

### Phase D: Intelligence

18. **Explicit execution plans** -- agent writes visible plan before acting
19. **Cross-domain skill sharing** -- shared scope for common skills
20. **Agent memory (RAG)** -- learn from past cases
21. **Skill evolution** -- agent suggests improvements to existing skills based on usage patterns

---

## Example: Forensic Office E2E

To ground all of the above, here's how a complete forensic case would work with the target architecture:

```
1. Expert opens "Forensic Analysis" office, creates new case

2. Expert uploads 3 bank statements (Excel files)
   -> 3 artifacts created (type: upload)

3. Expert: "Analyze these statements for suspicious activity"

4. Agent plans:
   "I'll analyze each statement for suspicious transactions.
    Plan:
    a) Read and merge all three statements
    b) Filter transactions above 5M RUB
    c) Group by counterparty
    d) Check counterparties against blacklist
    e) Generate preliminary findings"

5. Agent calls skill: "merge-excel-files"
   -> reads 3 files, outputs merged.xlsx (artifact: skill_output)

6. Agent calls skill: "filter-transactions"
   -> filters amount > 5M, outputs filtered.xlsx (artifact: skill_output)
   -> "Found 47 transactions above threshold"

7. Agent calls skill: "group-by-counterparty"
   -> groups by BIK, outputs groups.json (artifact: skill_output)
   -> "12 unique counterparties identified"

8. Agent calls skill: "check-blacklist"
   -> cross-references with known entities
   -> "3 counterparties match watchlist entries"

9. Agent: "Found 3 suspicious counterparties. 23 transactions totaling
   847M RUB to entities on the watchlist. Should I generate the
   forensic conclusion document?"

10. Expert: "Yes, use the standard forensic report template"

11. Agent calls skill: "generate-conclusion"
    -> collects all artifacts + chat findings
    -> applies forensic report template
    -> outputs expert-conclusion.docx (artifact: generated)

12. Expert downloads conclusion, reviews, signs, submits
```

Steps 5-8 use skills that were **auto-generated** by the Skill Generator from descriptions like "Read multiple Excel files and merge them into one". The expert never touched the workflow editor.

---

## Design Principles

1. **Atomic over monolithic** -- small reusable nodes over big custom blobs
2. **Generate over build** -- LLM creates workflows from descriptions when possible
3. **Artifacts over chat** -- persistent file outputs over ephemeral chat messages
4. **Plans over impulse** -- agent makes explicit plans before acting
5. **Shared over siloed** -- common skills available across offices
6. **Templates over freeform** -- domain templates ensure consistent deliverables
