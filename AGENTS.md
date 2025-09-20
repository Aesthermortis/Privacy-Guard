# Project Development Guidelines

These are the rules and practices Codex agents must follow when editing, generating or testing code in this repository.

---

## 1. Philosophy & Core Principles

- **DRY**: Never duplicate logic. Extract reusable functions, constants or classes.
- **KISS**: Prefer simple and readable solutions over clever tricks.
- **YAGNI**: Do not implement features unless explicitly required.
- **SoC**: Separate responsibilities into clear modules (config, core, api, utils, ui).
- **Readability over Cleverness**: Prioritize clarity for future maintainers.
- **Incremental Evolution**: Small, atomic, reversible changes.

---

## 2. Architecture & Design

- Follow **SOLID** principles.
- Use **immutable data structures** when possible.
- Apply **known design patterns** only when justified (e.g., MVC, MVVM, Hexagonal).
- Respect **Law of Demeter** (avoid chained calls).
- Design with change in mind: APIs and interfaces should be extensible.

---

## 3. Code Quality & Performance

- Always consider algorithmic complexity (Big O).
- Optimize only after profiling.
- Fail fast: detect errors early, do not let state become corrupted.
- Ensure **idempotence**: repeated operations yield the same result.

---

## 4. Modification Guidelines

- Only edit code directly relevant to the task (“surgical changes”).
- Do not refactor unrelated parts in the same commit.
- Prefer reuse over writing new code.
- Preserve existing functionality.
- Keep scope minimal and provide context for changes.

---

## 5. Style & Conventions

- **Language**: All code, comments, commits, and variables must be in **English**.
- **Consistency**: Uniform formatting and syntax across the repo.
- **Naming**: Expressive, intention-revealing names.
- **Curly braces `{}`** required for all control blocks (if/for/while).
- Must be **ESLint compliant** (especially `curly` rule).
- Principle of Least Surprise: code should behave intuitively.

---

## 6. Repository Structure

- Entry point must be clear (`main`, `index`).
- Config separated from code. Load configs from env vars or config files.
- Namespacing to avoid collisions in large projects.
- Follow **12-Factor App** principles when relevant.

---

## 7. Documentation

- Code should be mostly self-explanatory.
- Comments explain the _why_, not the _what_.
- Required docs:
  - `README.md` (purpose, install, usage)
  - `SECURITY.md` (vulnerability reporting)
  - Troubleshooting guides
- Apply the **Boy Scout Rule**: leave code cleaner than you found it.

---

## 8. Testing & QA

- **Test-first mindset (TDD)** when possible.
- Cover happy path, edge cases, and error handling.
- Run smoke tests after each build.
- Ensure integration between modules.
- Multi-environment testing (different OS, Node/Python versions).
- Focus on the 20% of code causing 80% of bugs.

---

## 9. Error Handling & Resilience

- Never fail silently.
- Provide descriptive errors.
- Use structured logging (include trace_id, user_id where possible).
- Add **kill switches** for critical features.
- Observability: include logs, metrics, traces by design.
- Consider **Chaos Engineering** for resilience.

---

## 10. Versioning & Deployment

- Use atomic, conventional commits: `type(scope): description`.
- Semantic Versioning (MAJOR.MINOR.PATCH).
- Reproducible builds only.
- Maintain a `CHANGELOG.md`.
- Infrastructure as Code (IaC).
- CI/CD pipelines for reliable, fast delivery.

---

## 11. Security & Ethics

- **Principle of Least Privilege**: request only necessary permissions.
- Strong access control and authentication.
- No telemetry by default (if needed: opt-in, anonymous, disableable).
- Input must be validated and sanitized.
- Dependencies must be audited for vulnerabilities.
- Use encryption and secure storage for sensitive data.
- Apply **Defense in Depth** and **Zero Trust** principles.
- Secure by default: no manual hardening required post-deploy.

---

## 12. Tools & Automation

- **Formatting**: Prettier (JS), Black (Python), gofmt (Go).
- **Linting**: ESLint, Pylint.
- **Pre-commit hooks**: enforce formatting and linting.
- **Style guides**: Airbnb JS Style Guide, PEP 8 (Python).

---

## 13. Commands

- **Build**: `npm run build`
- **Test**: `npm test`
- **Lint**: `npm run lint`
- **Format**: `npm run format` (if configured)

Agents must run linting and tests after making changes.
Never commit code that fails linting, tests, or breaks style conventions.
