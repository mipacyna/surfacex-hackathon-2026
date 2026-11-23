---
name: infrastructure-documentation
description: Creates and maintains accurate architecture, operations, security, deployment, backup, and platform documentation for this project. Use when writing README content, architecture diagrams, runbooks, ADRs, deployment instructions, threat models, or documentation affected by infrastructure changes.
---

# Infrastructure Documentation

## Source of truth

Before writing, inspect the implementation and the relevant existing documents:

- `README.md`;
- `docs/architecture.md`;
- Compose files and Dockerfiles;
- scripts referenced by the document.

Implementation wins over stale prose. If code and documentation conflict, report the conflict and update the document only when the intended behavior is clear.

## Language and style

- Write project-facing documentation in English unless the user requests another language.
- Keep identifiers, commands, paths and protocol names in their original technical form.
- Lead with purpose and outcome.
- Prefer short sections, lists and executable examples.
- Distinguish implemented behavior, planned behavior and known limitations.
- Never describe planned functionality as already working.
- Avoid marketing language and unverifiable claims.

## Required documentation set

Maintain these documents as the project grows:

- `README.md`: prerequisites, quick start and documentation index;
- `docs/architecture.md`: components, networks, data flow and trust boundaries;
- `docs/data-model.md`: observations, history and manual overrides;
- `docs/api.md`: API conventions and OpenAPI reference;
- `docs/scanning-policy.md`: authorization, allowlists, limits and safe scanning;
- `docs/signatures.md`: signature schema, examples and safety constraints;
- `docs/import-export.md`: versioned CSV/JSON formats;
- `docs/security.md`: roles, authentication, encryption, threat model and residual risks;
- `docs/operations.md`: healthchecks, logs, scaling, backup and restore, supported platforms, troubleshooting.

Create a document only when it has real content. Do not add empty placeholder pages.

## Architecture diagrams

Use Mermaid for component, sequence and data-flow diagrams.

- Use stable camelCase IDs and explicit quoted labels when punctuation is present.
- Do not add hardcoded colors or styles.
- Show trust boundaries and network separation when relevant.
- Mark optional integrations with dashed edges.
- Keep diagrams consistent with service names in Compose.
- Follow diagrams with concise prose explaining responsibilities and constraints.

## Operational procedure format

Every runbook must include:

1. purpose;
2. prerequisites;
3. exact commands;
4. expected healthy result;
5. verification steps;
6. rollback or recovery;
7. destructive-impact warning where applicable;
8. architecture-specific differences.

Do not include real secrets, private addresses, private keys or production tokens. Use obvious placeholders.

## Decision records

For significant architecture choices, use:

```markdown
# ADR-NNN: Decision title

## Status
Accepted

## Context
Why a decision is needed.

## Decision
What was selected.

## Consequences
Benefits, costs and limitations.
```

Important current decisions:

- Docker Compose instead of Terraform, Ansible or Kubernetes;
- local-first operation;
- native amd64 and arm64 images;
- adaptive nmap SYN/TCP connect mode;
- nmap discovery followed by ProjectDiscovery httpx and custom declarative signatures;
- immutable scanner observations plus persistent manual overrides;
- application-level AES-256-GCM for sensitive fields.

## Review checklist

Before finishing:

- verify every command and path against the repository;
- verify service and network names against Compose;
- verify architecture claims against build/test configuration;
- verify security statements against actual capabilities and mounts;
- ensure no secrets or credentials are present;
- confirm links are relative and valid;
- ensure diagrams render syntactically;
- list known limitations instead of hiding them;
- update the README documentation index when adding a durable document.

## Expected output

Summarize:

- documents added or updated;
- implementation evidence used;
- assumptions and unresolved discrepancies;
- commands or links that still require validation.
